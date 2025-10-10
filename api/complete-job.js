// In: /api/complete-job.js

const admin = require('../lib/firebase-admin');

module.exports = async (req, res) => {
    console.log('--- COMPLETE-JOB: Webhook received a request. ---');

    try {
        const falResult = req.body;
        // The most important log: See everything Fal.ai sent us.
        console.log('--- COMPLETE-JOB: INCOMING WEBHOOK BODY ---', JSON.stringify(falResult, null, 2));

        const jobId = falResult._internal_job_id;
        console.log(`COMPLETE-JOB: Extracted internal job ID: ${jobId}`);

        if (!jobId) {
            console.error('COMPLETE-JOB: Missing _internal_job_id in the webhook body.');
            return res.status(400).send('Missing internal job ID from webhook.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        
        console.log(`[${jobId}] COMPLETE-JOB: Fetching Firestore document...`);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            console.error(`[${jobId}] COMPLETE-JOB: Job document not found in Firestore!`);
            return res.status(404).send('Job not found.');
        }
        console.log(`[${jobId}] COMPLETE-JOB: Found Firestore document.`);

        const { deviceToken, userId } = jobDoc.data();
        console.log(`[${jobId}] COMPLETE-JOB: Extracted deviceToken and userId.`);

        const resultUrl = falResult.image?.url || (falResult.images && falResult.images[0]?.url);
        console.log(`[${jobId}] COMPLETE-JOB: Extracted result image URL: ${resultUrl}`);

        if (!resultUrl) {
            throw new Error("Could not find image URL in the webhook response.");
        }
        
        const permanentUrl = resultUrl; // In production, you'd re-upload this.
        console.log(`[${jobId}] COMPLETE-JOB: Updating Firestore document to 'completed'.`);

        await jobRef.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalImageUrl: permanentUrl
        });
        console.log(`[${jobId}] COMPLETE-JOB: Firestore document updated.`);

        if (deviceToken) {
            console.log(`[${jobId}] COMPLETE-JOB: Preparing to send push notification...`);
            const message = {
                notification: {
                    title: 'Your Photo is Ready!',
                    body: 'The AI processing for your image has finished.'
                },
                data: {
                    jobId: jobId,
                    finalImageUrl: permanentUrl,
                },
                apns: {
                    payload: {
                        aps: { 'content-available': 1, sound: 'default' }
                    }
                },
                token: deviceToken
            };

            await admin.messaging().send(message);
            console.log(`[${jobId}] COMPLETE-JOB: Successfully sent push notification.`);
        } else {
            console.warn(`[${jobId}] COMPLETE-JOB: No deviceToken found for this job. Cannot send push notification.`);
        }
        
        console.log(`[${jobId}] COMPLETE-JOB: Responding 200 OK to Fal.ai.`);
        res.status(200).send('Webhook processed successfully.');

    } catch (error) {
        console.error('--- COMPLETE-JOB: CRITICAL ERROR processing webhook ---', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
