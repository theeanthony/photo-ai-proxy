// In: /api/start-job.js

const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

// Helper function for making synchronous Fal.ai calls (that wait for the result)
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

        // --- Multi-model or Synchronous-Only jobs are handled here ---
        if (jobType === 'generic_restore' || jobType === 'colorize') {
            console.log(`[${jobId}] Handling long-running job for ${jobType}.`);
            // Immediately respond to the client app so it doesn't time out.
            res.status(202).json({ message: 'Long-running job started', jobId });
            
            try {
                let finalImageUrls = [];

                if (jobType === 'generic_restore') {
                    const { image_url, banana_prompt, seedream_prompt } = apiParams;
                    const [bananaResult, seedreamResult] = await Promise.all([
                        fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { image_urls: [image_url], prompt: banana_prompt }),
                        fetchFromFal('https://fal.run/fal-ai/bytedance/seedream/v4/edit', { image_urls: [image_url], prompt: seedream_prompt })
                    ]);
                    finalImageUrls = [bananaResult.images[0]?.url, seedreamResult.images[0]?.url].filter(Boolean);
                } else if (jobType === 'colorize') {
                    const { image_url } = apiParams;
                    const result = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
                        image_urls: [image_url], 
                        prompt: "colorize this photo, add natural and realistic colors" 
                    });
                    finalImageUrls = [result.images[0]?.url].filter(Boolean);
                }

                if (finalImageUrls.length === 0) { throw new Error("AI models failed to return an image."); }

                await jobRef.update({
                    status: 'completed',
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    // Use correct field name based on single vs multiple images
                    ...(finalImageUrls.length > 1 ? { finalImageUrls: finalImageUrls } : { finalImageUrl: finalImageUrls[0] })
                });
                
                if (deviceToken) {
                    await admin.messaging().send({ token: deviceToken, notification: { title: 'Your Photo is Ready!', body: 'The AI processing for your image has finished.' }, data: { jobId } });
                }
            } catch (jobError) {
                console.error(`[${jobId}] ERROR during long-running job:`, jobError);
                await jobRef.update({ status: 'failed', errorMessage: jobError.message });
            }
            return; // End the function here for these specific job types.
        }
        
        // --- Standard webhook-based jobs are handled here ---
        else {
            console.log(`[${jobId}] Handling standard webhook-based job.`);
            let falApiUrl;
            let requestBody;
            
            switch (jobType) {
                case 'bria_removal':
                    falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                    requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url };
                    break;
                case 'ai_resize':
                    falApiUrl = 'https://fal.run/fal-ai/flux-pro/v1/fill';
                    requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url, prompt: "expand the image..." };
                    break;
                case 'upscale':
                    falApiUrl = 'https://fal.run/fal-ai/topaz/upscale/image';
                    requestBody = { image_url: apiParams.image_url, scale_factor: apiParams.upscale_factor || 2.0 };
                    break;
                default:
                    throw new Error(`Unknown or unsupported webhook job type: ${jobType}`);
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
