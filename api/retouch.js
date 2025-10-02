const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin'); // Correct path from /api folder
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS AND PARAMS FROM CLIENT
        const { image_url, mask_url, prompt, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL FAL.AI API WITH THE URLS
        const FAL_API_URL = 'https://fal.run/fal-ai/flux-lora/inpainting';
        const effectivePrompt = prompt || "a high-quality photograph, remove the masked object";
        console.log(effectivePrompt);
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
                num_images: 1,
            })
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (retouch):", errorText);
            return res.status(falResponse.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();
        const tempResultUrl = falResult.images[0].url; // Get the temporary URL from Fal

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
            expires: '03-09-2491' // Far-future expiration
        });
        
        // Respond with a structure that mirrors the original Fal response, but with the new permanent URL
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: falResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/retouch:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
