const admin = require('../lib/firebase-admin');

module.exports = async (req, res) => {
    console.log('[COMPLETE-JOB] Webhook endpoint was hit.');

    try {
        const falResult = req.body;
        
        // =======================================================================
        // MOST IMPORTANT LOG: This shows the entire payload from Fal.ai
        // If this log appears, the connection is working. If _internal_job_id is
        // missing here, that's the problem.
        console.log('[COMPLETE-JOB] [STEP 1] Received incoming webhook body from Fal.ai:');
        console.log(JSON.stringify(falResult, null, 2));
        // =======================================================================

        const jobId = falResult._internal_job_id;

        if (!jobId) {
            console.error('[COMPLETE-JOB] [ERROR] The webhook body is missing the `_internal_job_id` field.');
            return res.status(400).send('Missing internal job ID from webhook.');
        }
        console.log(`[${jobId}] [STEP 2] Extracted job ID from webhook body.`);

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        
        console.log(`[${jobId}] [STEP 3] Fetching job document from Firestore...`);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            console.error(`[${jobId}] [ERROR] Job document with this ID was not found in Firestore.`);
            return res.status(404).send('Job not found.');
        }
        console.log(`[${jobId}] [STEP 4] Found job document in Firestore.`);

        const { deviceToken, userId } = jobDoc.data();
        console.log(`[${jobId}] [STEP 5] Extracted deviceToken (${deviceToken ? 'present' : 'missing'}) and userId.`);

        const resultUrl = falResult.image?.url || (falResult.images && falResult.images[0]?.url);
        
        if (!resultUrl) {
            console.error(`[${jobId}] [ERROR] Webhook body does not contain an image URL in 'image.url' or 'images[0].url'.`);
            throw new Error("Could not find image URL in the webhook response.");
        }
        console.log(`[${jobId}] [STEP 6] Extracted result image URL: ${resultUrl}`);
        
        const permanentUrl = resultUrl;

        console.log(`[${jobId}] [STEP 7] Updating Firestore document status to 'completed'.`);
        await jobRef.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalImageUrl: permanentUrl
        });
        console.log(`[${jobId}] [STEP 8] Firestore document updated successfully.`);

        if (deviceToken) {
            console.log(`[${jobId}] [STEP 9] Preparing to send push notification.`);
            const message = { /* ... your message object ... */ };
            
            await admin.messaging().send(message);
            console.log(`[${jobId}] [STEP 10] Push notification sent successfully.`);
        } else {
            console.warn(`[${jobId}] [WARNING] No deviceToken found for this job. Skipping push notification.`);
        }
        
        console.log(`[${jobId}] [STEP 11] Responding 200 OK to webhook caller (Fal.ai).`);
        res.status(200).send('Webhook processed successfully.');

    } catch (error) {
        console.error('[COMPLETE-JOB] [CRITICAL ERROR]:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
