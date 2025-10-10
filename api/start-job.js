// /api/start-job.js
const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');

// IMPORTANT: Replace with your Vercel production URL
const WEBHOOK_URL = 'https://photo-ai-proxy.vercel.app/api/complete-job';

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 1. Get data from your SwiftUI client
        const { imageUrl, userId, deviceToken, jobId, apiParams } = req.body;
        if (!imageUrl || !userId || !jobId) {
            return res.status(400).send('Missing required parameters.');
        }

        // 2. Create a job document in Firestore to track progress
        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        await jobRef.set({
            userId,
            deviceToken,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            originalImageUrl: imageUrl
        });

        // 3. Call the AI service asynchronously with a webhook
        const FAL_API_URL = 'https://fal.run/fal-ai/topaz/upscale/image'; // Example
        const asyncUrl = `${FAL_API_URL}?fal_webhook=${WEBHOOK_URL}`;

        await fetch(asyncUrl, {
            method: 'POST',
            headers: { /* Your Auth Headers */ },
            // CRITICAL: Pass the jobId so the webhook knows which job to complete
            body: JSON.stringify({
                image_url: imageUrl,
                ...apiParams,
                // We add our own metadata that fal.ai will pass back to our webhook
                _internal_job_id: jobId
            })
        });

        // 4. Respond to the client immediately
        res.status(202).json({ message: 'Job started successfully', jobId });

    } catch (error) {
        console.error('Error starting job:', error);
        // If it fails here, update the Firestore job doc to 'failed'
        if (req.body.jobId) {
            await admin.firestore().collection('jobs').doc(req.body.jobId).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send('Failed to start job.');
    }
};
