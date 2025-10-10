// /api/complete-job.js
const admin = require('../lib/firebase-admin');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    try {
        // 1. Get the result and our Job ID from the Fal.AI webhook payload
        const falResult = req.body;
        const jobId = falResult._internal_job_id; // The ID we passed earlier
        const tempResultUrl = falResult.image.url;
        
        if (!jobId) return res.status(400).send('Missing job ID.');

        const db = admin.firestore();
        const jobRef = db.collection('jobs').doc(jobId);

        // 2. Download the final image from the AI service
        const imageResponse = await fetch(tempResultUrl);
        const imageBuffer = await imageResponse.buffer();

        // 3. Upload to your permanent Firebase Storage
        const jobDoc = await jobRef.get();
        const userId = jobDoc.data().userId;
        const bucket = admin.storage().bucket();
        const fileName = `processed/${userId}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        await file.save(imageBuffer, { metadata: { contentType: 'image/jpeg' } });

        // 4. Get the permanent URL
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });

        // 5. Update the Firestore job document to 'completed'
        await jobRef.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalImageUrl: permanentUrl
        });

        // 6. Send the Push Notification via FCM
        const deviceToken = jobDoc.data().deviceToken;
        if (deviceToken) {
            const message = {
                notification: {
                    title: 'PhotoAI',
                    body: 'Your photo has been enhanced and is ready!'
                },
                token: deviceToken
            };
            await admin.messaging().send(message);
        }

        // 7. Respond to the webhook service to let it know you're done
        res.status(200).send('Webhook processed successfully.');

    } catch (error) {
        console.error('Error completing job:', error);
        // Try to update Firestore to failed status
        if (req.body._internal_job_id) {
            await admin.firestore().collection('jobs').doc(req.body._internal_job_id).update({
                status: 'failed',
                errorMessage: error.message
            });
        }
        res.status(500).send('Error in webhook.');
    }
};
