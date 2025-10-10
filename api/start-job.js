// In: /api/start-job.js

const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

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

        // ... (Firestore document creation code remains the same) ...
        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        await jobRef.set({
            userId, deviceToken, jobType, status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(), apiParams
        });
        
        let falApiUrl;
        let requestBody;

        // ... (your switch statement for jobType remains exactly the same) ...
        switch (jobType) {
            case 'bria_removal':
                falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url };
                break;
            case 'colorize':
                 falApiUrl = 'https://fal.run/fal-ai/nano-banana/edit';
                 requestBody = { image_url: apiParams.image_url };
                 break;
            case 'generic_restore':
                 falApiUrl = 'https://fal.run/fal-ai/sdxl-image-to-image';
                 requestBody = { image_url: apiParams.image_url, prompt: "restore photo, fix scratches, improve quality, 4k" };
                 break;
            // Add your other cases here
            default:
                throw new Error(`Unknown or unsupported job type: ${jobType}`);
        }

        const finalRequestBody = { ...requestBody, _internal_job_id: jobId };
        const asyncUrl = `${falApiUrl}?fal_webhook=${WEBHOOK_URL}`;
        
        console.log(`[${jobId}] START-JOB: Sending request TO Fal.ai.`);

        // ======================= CRITICAL CHANGE IS HERE =======================
        // We now capture the response from Fal.ai to check for errors.
        const falResponse = await fetch(asyncUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalRequestBody)
        });

        // This block will catch errors like 401 Unauthorized or 404 Not Found.
        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error(`[${jobId}] [ERROR] Fal.ai REJECTED the job request with status ${falResponse.status}.`);
            console.error(`[${jobId}] [ERROR] Fal.ai Response:`, errorText);
            // This throws an error that will be caught by the main catch block.
            throw new Error(`Fal.ai rejected the job request with status ${falResponse.status}.`);
        }
        
        console.log(`[${jobId}] START-JOB: Fal.ai ACCEPTED the job.`);
        // ======================= END OF CRITICAL CHANGE =======================

        res.status(202).json({ message: 'Job started successfully', jobId });

    } catch (error) {
        console.error(`[${jobId || 'unknown'}] [CRITICAL ERROR] in /api/start-job:`, error);
        if (jobId) {
            await admin.firestore().collection('jobs').doc(jobId).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send(`Failed to start job: ${error.message}`);
    }
};
