// In: /api/start-job.js

const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

// Helper function for making synchronous Fal.ai calls
const fetchFromFal = async (url, body) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fal.ai API call failed with status ${response.status}: ${errorText}`);
    }
    return response.json();
};


module.exports = async (req, res) => {
    const { userId, deviceToken, jobId, jobType, apiParams } = req.body;
    console.log(`[${jobId}] START-JOB: Received request for jobType: ${jobType}`);

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        if (!userId || !jobId || !jobType || !apiParams) {
            return res.status(400).send('Missing required job parameters.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        await jobRef.set({
            userId, deviceToken, jobType, status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(), apiParams
        });

        // ======================= NEW LOGIC FOR GENERIC RESTORE =======================
        if (jobType === 'generic_restore') {
            console.log(`[${jobId}] Handling special multi-model case for generic_restore.`);
            
            // Immediately respond to the client so it doesn't time out.
            // The rest of this function will continue to run on the server.
            res.status(202).json({ message: 'Multi-model job started successfully', jobId });
            
            try {
                const { image_url, banana_prompt, seedream_prompt } = apiParams;
                
                console.log(`[${jobId}] Calling nano-banana and seedream concurrently...`);
                
                // Use Promise.all to run both API calls at the same time
                const [bananaResult, seedreamResult] = await Promise.all([
                    fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', {
                        image_urls: [image_url],
                        prompt: banana_prompt
                    }),
                    fetchFromFal('https://fal.run/fal-ai/bytedance/seedream/v4/edit', {
                        image_urls: [image_url],
                        prompt: seedream_prompt
                    })
                ]);
                
                console.log(`[${jobId}] Both models completed.`);
                
                const finalImageUrls = [
                    bananaResult.images[0]?.url,
                    seedreamResult.images[0]?.url
                ].filter(Boolean); // .filter(Boolean) removes any null/undefined entries if a call failed

                if (finalImageUrls.length === 0) {
                    throw new Error("Both AI models failed to return an image.");
                }

                console.log(`[${jobId}] Updating Firestore with final URLs:`, finalImageUrls);
                await jobRef.update({
                    status: 'completed',
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    finalImageUrls: finalImageUrls // Storing an array of URLs
                });
                
                // Send notification
                if (deviceToken) {
                    await admin.messaging().send({ token: deviceToken, notification: { title: 'Your Photo is Ready!', body: 'View the restored options for your image.' }, data: { jobId } });
                    console.log(`[${jobId}] Sent completion notification.`);
                }
                
            } catch (jobError) {
                console.error(`[${jobId}] CRITICAL ERROR during multi-model job:`, jobError);
                await jobRef.update({ status: 'failed', errorMessage: jobError.message });
            }
            
            return; // End the function here for the generic_restore case.
        }
        
        // ======================= EXISTING LOGIC FOR ALL OTHER JOB TYPES =======================
        else {
            console.log(`[${jobId}] Handling standard webhook-based job.`);
            let falApiUrl;
            let requestBody;
            
            switch (jobType) {
                case 'bria_removal':
                    falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                    requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url };
                    break;
                case 'colorize':
                    falApiUrl = 'https://fal.run/fal-ai/nano-banana/edit';
                    requestBody = { image_urls: [apiParams.image_url], prompt: "colorize this photo, add natural and realistic colors" };
                    break;
                // ... all other cases ...
                case 'ai_resize':
                    falApiUrl = 'https://fal.run/fal-ai/flux-pro/v1/fill';
                    requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url, prompt: "expand the image..." };
                    break;
                case 'upscale':
                    falApiUrl = 'https://fal.run/fal-ai/topaz/upscale/image';
                    requestBody = { image_url: apiParams.image_url, scale_factor: apiParams.upscale_factor || 2.0 };
                    break;
                default:
                    throw new Error(`Unknown or unsupported job type: ${jobType}`);
            }

            const finalRequestBody = { ...requestBody, _internal_job_id: jobId };
            const asyncUrl = `${falApiUrl}?fal_webhook=${WEBHOOK_URL}`;
            
            const falResponse = await fetch(asyncUrl, {
                method: 'POST',
                headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(finalRequestBody)
            });

            if (!falResponse.ok) {
                const errorText = await falResponse.text();
                throw new Error(`Fal.ai rejected the job request with status ${falResponse.status}: ${errorText}`);
            }

             const initialFalResult = await falResponse.json();
            console.log(`[${jobId}] Fal.ai ACCEPTED the webhook job. Initial Response Body:`, initialFalResult);
            
            console.log(`[${jobId}] START-JOB: Fal.ai ACCEPTED the webhook job.`);
            res.status(202).json({ message: 'Job started successfully', jobId });
        }

    } catch (error) {
        console.error(`[${jobId || 'unknown'}] [CRITICAL ERROR] in /api/start-job:`, error);
        if (jobId) {
            await admin.firestore().collection('jobs').doc(jobId).update({ status: 'failed', errorMessage: error.message });
        }
        res.status(500).send(`Failed to start job: ${error.message}`);
    }
};
