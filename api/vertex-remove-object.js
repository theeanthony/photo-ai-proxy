// /api/vertex-remove-object.js - DEBUGGING VERSION

console.log('Debug Probe 1: File loaded. Loading dependencies...');

const fetch = require('node-fetch');
console.log('Debug Probe 2: node-fetch loaded.');

const admin = require('../lib/firebase-admin');
console.log('Debug Probe 3: firebase-admin loaded.');

const { v4: uuidv4 } = require('uuid');
console.log('Debug Probe 4: uuid loaded.');

// This is a likely point of failure if credentials are not set correctly.
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
console.log('Debug Probe 5: @google-cloud/aiplatform loaded.');

// ADD THIS NEW BLOCK
// Explicitly read the credentials from the Vercel environment variable
const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
if (!credentialsJson) {
    // This will give a much clearer error if the variable is missing
    throw new Error("FATAL: The GOOGLE_CREDENTIALS_JSON environment variable was not found.");
}

// Parse the JSON string into an object
const credentials = JSON.parse(credentialsJson);

// Pass the credentials directly to the client
const clientOptions = {
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    credentials, // <-- This is the crucial addition
};

const predictionServiceClient = new PredictionServiceClient(clientOptions);
console.log('Debug Probe 6: Google Cloud client initialized WITH EXPLICIT CREDENTIALS.');

module.exports = async (req, res) => {
    console.log('Debug Probe 7: Function handler started.');
    
    // Add a more detailed catch block for the entire handler
    try {
        if (req.method !== 'POST') {
            console.log('Error: Method was not POST.');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        console.log('Debug Probe 8: Method is POST. Processing request body.');

        const { image_url, mask_url, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            console.log('Error: Missing required parameters in request body.');
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }
        console.log('Debug Probe 9: Parameters received successfully.');

        const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT;
        if (!GCLOUD_PROJECT) {
            console.log('FATAL ERROR: GCLOUD_PROJECT environment variable is not set.');
            return res.status(500).json({ error: 'Google Cloud Project ID is not configured on the server' });
        }
        console.log('Debug Probe 10: Google Cloud Project ID found.');

        // The rest of your function logic...
        const [imageResponse, maskResponse] = await Promise.all([ fetch(image_url), fetch(mask_url) ]);
        console.log('Debug Probe 11: Images downloaded from Firebase URLs.');
        
        const [imageBuffer, maskBuffer] = await Promise.all([ imageResponse.buffer(), maskResponse.buffer() ]);
        console.log('Debug Probe 12: Image data converted to buffers.');

        const endpoint = `projects/${GCLOUD_PROJECT}/locations/us-central1/publishers/google/models/imagegeneration@006`;
        const instance = {
            prompt: 'A person or object was here, please fill in the background seamlessly and photorealistically.',
            image: { bytesBase64Encoded: imageBuffer.toString('base64') },
            mask: { image: { bytesBase64Encoded: maskBuffer.toString('base64') } },
        };
        const parameters = { sampleCount: 1, editMode: 'inpaint-removal' };
        const request = { endpoint, instances: [instance], parameters };
        console.log('Debug Probe 13: Vertex AI request prepared. Making API call...');

        const [vertexResponse] = await predictionServiceClient.predict(request);
        console.log('Debug Probe 14: Vertex AI call successful.');

        // ... Final part of the logic
        const prediction = vertexResponse.predictions[0];
        const finalImageBase64 = prediction.structValue.fields.bytesBase64Encoded.stringValue;
        const finalImageBuffer = Buffer.from(finalImageBase64, 'base64');

        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        await file.save(finalImageBuffer, { metadata: { contentType: 'image/jpeg' } });

        const [permanentUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        console.log('Debug Probe 15: Process complete. Sending final URL to client.');
        res.status(200).json({ images: [{ url: permanentUrl }] });

    } catch (error) {
        // This will now log the detailed error to the Vercel console.
        console.error('FATAL ERROR CAUGHT:', error);
        console.error('ERROR STACK:', error.stack);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
