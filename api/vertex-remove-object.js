// /api/vertex-remove-object.js

const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');
const { PredictionServiceClient } = require('@google-cloud/aiplatform');

// This client automatically uses credentials from your Vercel environment variables
const clientOptions = {
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
};
const predictionServiceClient = new PredictionServiceClient(clientOptions);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS AND USER_ID FROM CLIENT
        const { image_url, mask_url, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT;
        if (!GCLOUD_PROJECT) {
            return res.status(500).json({ error: 'Google Cloud Project ID is not configured on the server' });
        }

        // 2. DOWNLOAD IMAGE AND MASK DATA FROM FIREBASE URLS
        const [imageResponse, maskResponse] = await Promise.all([
            fetch(image_url),
            fetch(mask_url)
        ]);
        const [imageBuffer, maskBuffer] = await Promise.all([
            imageResponse.buffer(),
            maskResponse.buffer()
        ]);

        // 3. CALL VERTEX AI API WITH THE IMAGEN MODEL
        const endpoint = `projects/${GCLOUD_PROJECT}/locations/us-central1/publishers/google/models/imagegeneration@006`;

        const instance = {
            prompt: 'A person or object was here, please fill in the background seamlessly and photorealistically.',
            image: { bytesBase64Encoded: imageBuffer.toString('base64') },
            mask: { image: { bytesBase64Encoded: maskBuffer.toString('base64') } },
        };

        const parameters = { sampleCount: 1, editMode: 'inpaint-removal' };
        const request = { endpoint, instances: [instance], parameters };

        const [vertexResponse] = await predictionServiceClient.predict(request);
        const prediction = vertexResponse.predictions[0];
        const finalImageBase64 = prediction.structValue.fields.bytesBase64Encoded.stringValue;
        const finalImageBuffer = Buffer.from(finalImageBase64, 'base64');

        // 4. UPLOAD THE FINAL IMAGE TO YOUR FIREBASE STORAGE
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        await file.save(finalImageBuffer, { metadata: { contentType: 'image/jpeg' } });

        // 5. GET THE PERMANENT URL AND RESPOND TO THE CLIENT
        const [permanentUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        // Respond with a structure your iOS app expects
        res.status(200).json({
            images: [{ url: permanentUrl }]
        });

    } catch (error) {
        console.error('Server error in /api/vertex-remove-object:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
