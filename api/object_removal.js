const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE URLS FROM CLIENT (prompt is not needed for this model)
        const { image_url, mask_url, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL THE DEDICATED OBJECT REMOVAL API
        const FAL_API_URL = 'https://fal.run/fal-ai/object-removal/mask';
        console.log("Calling Object Removal API:", FAL_API_URL);

        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            // This model has a simpler body, without prompts
            body: JSON.stringify({
                image_url: image_url,
                mask_url: mask_url,
                sync_mode: true
            })
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (object-removal):", errorText);
            return res.status(falResponse.status).json({ error: 'Error from Fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();
        const resultUrl = falResult.image.url; // This model returns a single 'image' object
        let imageBuffer;

        // 3. HANDLE EITHER A DATA URL OR A STANDARD URL IN THE RESPONSE
        if (resultUrl.startsWith('data:')) {
            const base64Data = resultUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const imageResponse = await fetch(resultUrl);
            imageBuffer = await imageResponse.buffer();
        }

        // 4. UPLOAD THE FINAL IMAGE TO FIREBASE STORAGE
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' }
        });

        // 5. GET THE PERMANENT URL AND RESPOND TO THE CLIENT
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
        
        // Respond with a structure your client expects
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: falResult.timings
        });

    } catch (error) {
        console.error('Server error in /api/object_removal:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
