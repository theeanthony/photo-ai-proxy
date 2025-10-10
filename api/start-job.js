const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

// IMPORTANT: Ensure this points to your production Vercel URL
const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { userId, deviceToken, jobId, jobType, apiParams } = req.body;

    try {
        if (!userId || !jobId || !jobType || !apiParams) {
            return res.status(400).send('Missing required job parameters.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        await jobRef.set({
            userId,
            deviceToken,
            jobType,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            apiParams
        });

        let falApiUrl;
        let requestBody;

        // Route the request based on the jobType from the client
        switch (jobType) {
            case 'bria_removal':
                falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                requestBody = {
                    image_url: apiParams.image_url,
                    mask_url: apiParams.mask_url
                };
                break;
            case 'upscale':
                falApiUrl = 'https://fal.run/fal-ai/esrgan'; // Using a common ESRGAN model
                requestBody = {
                    image_url: apiParams.image_url,
                    scale: apiParams.upscale_factor || 2.0 // Default to 2x
                };
                break;
            case 'ai_resize':
                falApiUrl = 'https://fal.run/fal-ai/fast-sdxl/inpainting'; // Example generative fill model
                requestBody = {
                    image_url: apiParams.image_url,
                    mask_url: apiParams.mask_url,
                    prompt: "expand image with natural background, generative fill"
                };
                break;
            case 'colorize':
                falApiUrl = 'https://fal.run/fal-ai/photocolor'; // Example colorization model
                requestBody = {
                    image_url: apiParams.image_url
                };
                break;
            case 'generic_restore':
                 // This might involve a custom workflow or a specific model
                 // For now, let's use a general purpose image-to-image model
                falApiUrl = 'https://fal.run/fal-ai/sdxl-image-to-image';
                requestBody = {
                    image_url: apiParams.image_url,
                    prompt: "restore photo, fix scratches, improve quality, 4k"
                };
                break;
            default:
                throw new Error(`Unknown or unsupported job type: ${jobType}`);
        }

        // Add our internal job ID to the request so the webhook can identify it
        const finalRequestBody = {
            ...requestBody,
            _internal_job_id: jobId
        };
        
        const asyncUrl = `${falApiUrl}?fal_webhook=${WEBHOOK_URL}`;

        await fetch(asyncUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalRequestBody)
        });

        res.status(202).json({ message: 'Job started successfully', jobId });

    } catch (error) {
        console.error(`Error starting job ${jobId} of type ${jobType}:`, error);
        if (jobId) {
            await admin.firestore().collection('jobs').doc(jobId).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send(`Failed to start job: ${error.message}`);
    }
};
