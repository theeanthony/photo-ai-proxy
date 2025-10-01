const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin'); // Correct path from /api folder
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URL AND PARAMS FROM CLIENT
        const { image_url, user_id, ...otherParams } = req.body; // Separate user_id from other API params
        if (!image_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url or user_id in request body' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key is not configured on the server' });
        }
        
        // 2. CALL FAL.AI API WITH THE URL
        const FAL_API_URL = 'https://fal.run/fal-ai/topaz/upscale/image';

        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            // Pass the original image_url and the rest of the parameters
            body: JSON.stringify({ image_url, ...otherParams })
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (upscale):", errorText);
            return res.status(falResponse.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();
        // Note: The response for this API has a single 'image' object
        const tempResultUrl = falResult.image.url;

        // 3. DOWNLOAD THE PROCESSED IMAGE FROM FAL.AI
        const imageResponse = await fetch(tempResultUrl);
        const imageBuffer = await imageResponse.buffer();

        // 4. UPLOAD THE FINAL IMAGE TO YOUR FIREBASE STORAGE
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' }
        });

        // 5. GET THE PERMANENT, SIGNED URL AND RESPOND TO THE CLIENT
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });

        // Respond with a structure that mirrors the original, but with the new permanent URL
        res.status(200).json({ 
            image: { 
                ...falResult.image, // Keep original metadata like width/height
                url: permanentUrl 
            }
        });

    } catch (error) {
        console.error('Server error in /api/upscale:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
