const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin'); // Correct path from /api
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS (MODIFIED)
        // We no longer need mask_url, as the transparency of the image serves as the mask.
        const { image_url, user_id } = req.body;
        if (!image_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL FAL.AI API (MODIFIED)
        // The body now only contains the image_url. The API will automatically use the
        // alpha channel (transparency) as the mask.
        const FAL_API_URL = 'https://fal.run/fal-ai/flux-pro/v1/fill';
        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image_url }) // Pass only the image_url
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (fill):", errorText);
            return res.status(falResponse.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();
        
        // 3. PROCESS ALL RETURNED IMAGES
        // This part remains the same, as it correctly processes the API's output.
        const uploadPromises = falResult.images.map(async (image) => {
            const imageResponse = await fetch(image.url);
            const imageBuffer = await imageResponse.buffer();

            const bucket = admin.storage().bucket();
            const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
            const file = bucket.file(fileName);

            await file.save(imageBuffer, { metadata: { contentType: 'image/jpeg' } });
            
            const [permanentUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
            
            return { 
                url: permanentUrl, 
                content_type: image.content_type || 'image/jpeg',
            };
        });

        const processedImages = await Promise.all(uploadPromises);

        // 4. RESPOND TO CLIENT
        res.status(200).json({ 
            images: processedImages, 
            timings: falResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/fill:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
