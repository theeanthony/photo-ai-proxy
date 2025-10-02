// File: /api/trend.js

const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin'); 
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE MULTIPLE IMAGE URLS, PROMPT, AND USER ID
        // Note: We now expect 'image_urls' to be an array.
        const { image_urls, prompt, user_id } = req.body;
        if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0 || !prompt || !user_id) {
            return res.status(400).json({ error: 'Missing or invalid parameters. "image_urls" must be a non-empty array, and "prompt" and "user_id" are required.' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL FAL.AI API (nano-banana)
        const FAL_API_URL = 'https://fal.run/fal-ai/nano-banana/edit';
        
        // The body now dynamically uses the prompt and multiple image_urls from the request.
        const body = {
            prompt: prompt,
            image_urls: image_urls, // Pass the array of URLs directly
            // Optional: You can adjust default width/height if needed
            width: 1024,
            height: 1024
        };

        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (trend):", errorText);
            return res.status(falResponse.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();

        // 3. PROCESS THE RESULT IMAGE
        // We assume the trend model returns one primary image.
        if (!falResult.images || falResult.images.length === 0) {
             return res.status(500).json({ error: 'AI model did not return an image.' });
        }

        const primaryImage = falResult.images[0];
        const imageResponse = await fetch(primaryImage.url);
        const imageBuffer = await imageResponse.buffer();

        // 4. UPLOAD TO FIREBASE STORAGE AND GET PERMANENT URL
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, { metadata: { contentType: 'image/jpeg' } });
        const [permanentUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        // 5. RESPOND TO CLIENT
        res.status(200).json({ 
            images: [{ url: permanentUrl, content_type: primaryImage.content_type }], 
            timings: falResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/trend:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
