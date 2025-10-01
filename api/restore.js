const fetch = require('node-fetch');
const admin = require('../../lib/firebase-admin'); // Adjust path
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS AND PARAMS
        const { image_url, prompt, mask_url, target_width, target_height, num_images = 1, user_id } = req.body;
        if (!image_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL FAL.AI API
        const FAL_API_URL = 'https://fal.run/fal-ai/nano-banana/edit';
        const body = {
            prompt: prompt || "repair photo, remove scratches, dust, noise. colorize if black and white",
            image_urls: [image_url],
            num_images,
            width: target_width || 1024,
            height: target_height || 1024
        };
        if (mask_url) { body.mask_url = mask_url; }

        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            return res.status(falResponse.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const falResult = await falResponse.json();

        // 3. PROCESS ALL RETURNED IMAGES
        const uploadPromises = falResult.images.map(async (image) => {
            const imageResponse = await fetch(image.url);
            const imageBuffer = await imageResponse.buffer();

            const bucket = admin.storage().bucket();
            const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
            const file = bucket.file(fileName);

            await file.save(imageBuffer, { metadata: { contentType: 'image/jpeg' } });
            const [permanentUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
            return { url: permanentUrl, content_type: image.content_type };
        });

        const processedImages = await Promise.all(uploadPromises);

        // 4. RESPOND TO CLIENT WITH NEW PERMANENT URLS
        res.status(200).json({ images: processedImages, timings: falResult.timings });

    } catch (error) {
        console.error('Server error in /api/restore:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
