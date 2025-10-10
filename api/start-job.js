// In: /api/start-job.js

const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

module.exports = async (req, res) => {
    // We get the jobId from the client now, so we can use it in logs immediately
    const { userId, deviceToken, jobId, jobType, apiParams } = req.body;
    console.log(`[${jobId}] START-JOB: Received request for jobType: ${jobType}`);

    if (req.method !== 'POST') {
        console.error(`[${jobId}] START-JOB: Method Not Allowed (${req.method})`);
        return res.status(405).send('Method Not Allowed');
    }

    try {
        if (!userId || !jobId || !jobType || !apiParams) {
            console.error(`[${jobId}] START-JOB: Missing required parameters.`);
            return res.status(400).send('Missing required job parameters.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        
        console.log(`[${jobId}] START-JOB: Creating Firestore document.`);
        await jobRef.set({
            userId, deviceToken, jobType,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            apiParams
        });

        let falApiUrl;
        let requestBody;

        // ... (your switch statement for jobType remains exactly the same)
        switch (jobType) {
            case 'bria_removal':
                falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url };
                break;
            case 'generic_restore':
                falApiUrl = 'https://fal.run/fal-ai/sdxl-image-to-image';
                requestBody = { image_url: apiParams.image_url, prompt: "restore photo, fix scratches, improve quality, 4k" };
                break;
            // Add all your other cases here...
            default:
                throw new Error(`Unknown or unsupported job type: ${jobType}`);
        }

        const finalRequestBody = {
            ...requestBody,
            _internal_job_id: jobId
        };
        
        const asyncUrl = `${falApiUrl}?fal_webhook=${WEBHOOK_URL}`;

        // --- NEW LOGGING & ERROR HANDLING ---
        console.log(`[${jobId}] START-JOB: Sending request TO Fal.ai.`);
        console.log(`[${jobId}] URL: ${asyncUrl}`);
        console.log(`[${jobId}] Body:`, JSON.stringify(finalRequestBody, null, 2));

        const falResponse = await fetch(asyncUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalRequestBody)
        });

        // CRITICAL: Check if Fal.ai accepted the job. If not, fail immediately.
        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error(`[${jobId}] START-JOB: Fal.ai REJECTED the job with status ${falResponse.status}:`, errorText);
            throw new Error(`Fal.ai rejected the job request: ${errorText}`);
        }
        
        const initialFalResult = await falResponse.json();
        console.log(`[${jobId}] START-JOB: Fal.ai ACCEPTED the job. Initial response:`, initialFalResult);
        // --- END OF NEW LOGGING ---

        console.log(`[${jobId}] START-JOB: Responding 202 to client.`);
        res.status(202).json({ message: 'Job started successfully', jobId });

    } catch (error) {
        console.error(`[${jobId}] START-JOB: CRITICAL ERROR starting job:`, error);
        if (jobId) {
            await admin.firestore().collection('jobs').doc(jobId).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send(`Failed to start job: ${error.message}`);
    }
};
