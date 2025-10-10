// /api/complete-job.js
const admin = require('../lib/firebase-admin');

module.exports = async (req, res) => {
    try {
        const falResult = req.body;
        const jobId = falResult._internal_job_id;

        if (!jobId) {
            return res.status(400).send('Missing internal job ID from webhook.');
        }

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            console.error(`Job with ID ${jobId} not found in Firestore.`);
            return res.status(404).send('Job not found.');
        }

        const { deviceToken, userId } = jobDoc.data();

        // Handle different possible response structures from Fal.ai
        const resultUrl = falResult.image?.url ||
                          (falResult.images && falResult.images[0]?.url);

        if (!resultUrl) {
            throw new Error("Could not find image URL in the webhook response.");
        }
        
        // --- This is where you would download from resultUrl and re-upload to your own storage ---
        // For simplicity, we'll assume the resultUrl is sufficient for now and pass it directly.
        // In production, you should save it to your permanent storage first.
        const permanentUrl = resultUrl; // In a real app, this would be your Firebase Storage URL.

        await jobRef.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalImageUrl: permanentUrl
        });

        // --- SEND PUSH NOTIFICATION ---
        if (deviceToken) {
            const message = {
                notification: {
                    title: 'Your Photo is Ready!',
                    body: 'The AI processing for your image has finished.'
                },
                // The 'data' payload is silent and delivered to your app's handlers.
                // It's the best place to put information your app can use to react.
                data: {
                    jobId: jobId,
                    finalImageUrl: permanentUrl,
                    // You can add any other relevant info here
                },
                // APNs-specific config for better presentation on iOS
                apns: {
                    payload: {
                        aps: {
                            'content-available': 1,
                            sound: 'default'
                        }
                    }
                },
                token: deviceToken
            };

            await admin.messaging().send(message);
            console.log(`Successfully sent notification for job ${jobId} to device ${deviceToken}`);
        }
        
        res.status(200).send('Webhook processed successfully.');

    } catch (error) {
        console.error('Error in /api/complete-job:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
