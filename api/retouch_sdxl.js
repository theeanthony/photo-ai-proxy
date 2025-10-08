// File: api/retouch_sdxl.js

const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_url, mask_url, prompt, negative_prompt, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const FAL_API_URL = 'https://fal.run/fal-ai/fast-sdxl/inpainting';

        const effectivePrompt = prompt;
        const effectiveNegativePrompt = negative_prompt;
        
        console.log("Using Prompt:", effectivePrompt);
        console.log("Using Negative Prompt:", effectiveNegativePrompt);

        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: image_url,
                mask_url: mask_url,
                prompt: effectivePrompt,
                negative_prompt: effectiveNegativePrompt,
                sync_mode: true
            })
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (sdxl-inpainting):", errorText);
            try {
                const errorJson = JSON.parse(errorText);
                return res.status(falResponse.status).json({ error: 'Error from Fal.ai API', details: errorJson });
            } catch {
                return res.status(falResponse.status).json({ error: 'Error from Fal.ai API', details: errorText });
            }
        }

        const falResult = await falResponse.json();
        // Add this log to see the structure of the response for future debugging
        console.log("Received Fal.ai Result:", JSON.stringify(falResult, null, 2));

        // --- THIS IS THE FIX ---
        // This model returns an 'images' array, not a single 'image' object.
        const tempResultUrl = falResult.images[0].url;  
        // --- END OF FIX ---

        const imageResponse = await fetch(tempResultUrl);
        const imageBuffer = await imageResponse.buffer();

        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' }
        });

        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
        
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: falResult.timings
        });

    } catch (error) {
        console.error('Server error in /api/retouch_sdxl:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
