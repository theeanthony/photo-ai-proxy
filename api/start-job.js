const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';
const FAL_API_KEY = process.env.FAL_API_KEY;

module.exports = async (req, res) => {
    console.log('[START-JOB] Received a request.');

    if (req.method !== 'POST') {
        console.error('[START-JOB] Denied due to incorrect method:', req.method);
        return res.status(405).send('Method Not Allowed');
    }

    // Use a placeholder for jobId in logs until it's extracted
    let jobIdForLogs = 'unknown';

    try {
        console.log('[START-JOB] Parsing request body...');
        const { userId, deviceToken, jobId, jobType, apiParams } = req.body;
        jobIdForLogs = jobId || 'unknown'; // Update jobId for logging

        console.log(`[${jobIdForLogs}] [STEP 1] Extracted data from body.`);
        console.log(`[${jobIdForLogs}]   - userId: ${userId}`);
        console.log(`[${jobIdForLogs}]   - deviceToken: ${deviceToken ? 'present' : 'missing'}`);
        console.log(`[${jobIdForLogs}]   - jobId: ${jobId}`);
        console.log(`[${jobIdForLogs}]   - jobType: ${jobType}`);
        console.log(`[${jobIdForLogs}]   - apiParams:`, JSON.stringify(apiParams));
        
        if (!userId || !jobId || !jobType || !apiParams) {
            console.error(`[${jobIdForLogs}] [ERROR] Missing required job parameters in the request body.`);
            return res.status(400).send('Missing required job parameters.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);

        console.log(`[${jobIdForLogs}] [STEP 2] Preparing to set Firestore document.`);
        await jobRef.set({
            userId,
            deviceToken,
            jobType,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            apiParams
        });
        console.log(`[${jobIdForLogs}] [STEP 3] Successfully set Firestore document.`);

        let falApiUrl;
        let requestBody;

        console.log(`[${jobIdForLogs}] [STEP 4] Routing based on jobType: "${jobType}"`);
        switch (jobType) {
            case 'bria_removal':
                falApiUrl = 'https://fal.run/fal-ai/bria/eraser';
                requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url };
                break;
            case 'upscale':
                falApiUrl = 'https://fal.run/fal-ai/esrgan';
                requestBody = { image_url: apiParams.image_url, scale: apiParams.upscale_factor || 2.0 };
                break;
            case 'ai_resize':
                falApiUrl = 'https://fal.run/fal-ai/fast-sdxl/inpainting';
                requestBody = { image_url: apiParams.image_url, mask_url: apiParams.mask_url, prompt: "expand image with natural background, generative fill" };
                break;
            case 'colorize':
                falApiUrl = 'https://fal.run/fal-ai/photocolor';
                requestBody = { image_url: apiParams.image_url };
                break;
            case 'generic_restore':
                falApiUrl = 'https://fal.run/fal-ai/sdxl-image-to-image';
                requestBody = { image_url: apiParams.image_url, prompt: "restore photo, fix scratches, improve quality, 4k" };
                break;
            default:
                throw new Error(`Unknown or unsupported job type: ${jobType}`);
        }
        console.log(`[${jobIdForLogs}] [STEP 5] Determined Fal API URL: ${falApiUrl}`);

        const finalRequestBody = {
            ...requestBody,
            _internal_job_id: jobId
        };
        
        const asyncUrl = `${falApiUrl}?fal_webhook=${WEBHOOK_URL}`;

        console.log(`[${jobIdForLogs}] [STEP 6] Preparing to send request to Fal.ai.`);
        console.log(`[${jobIdForLogs}]   - Final URL: ${asyncUrl}`);
        console.log(`[${jobIdForLogs}]   - Final Body:`, JSON.stringify(finalRequestBody, null, 2));

        await fetch(asyncUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalRequestBody)
        });
        console.log(`[${jobIdForLogs}] [STEP 7] Request sent to Fal.ai, awaiting their async webhook call.`);

        console.log(`[${jobIdForLogs}] [STEP 8] Responding 202 to the client app.`);
        res.status(202).json({ message: 'Job started successfully', jobId });

    } catch (error) {
        console.error(`[${jobIdForLogs}] [CRITICAL ERROR] in /api/start-job:`, error);
        if (jobId) {
            await admin.firestore().collection('jobs').doc(jobId).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send(`Failed to start job: ${error.message}`);
    }
};
