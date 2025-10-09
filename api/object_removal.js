const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Note: This model uses a text 'prompt' (object_to_remove), not a mask_url.
        const { image_url, user_id, prompt } = req.body;
        if (!image_url || !user_id || !prompt) {
            return res.status(400).json({ error: 'Missing image_url, user_id, or prompt' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // --- CORRECTED SINGLE-STAGE API CALL ---
        console.log("Calling Object Removal API...");
        const removalApiUrl = 'https://fal.run/fal-ai/image-apps-v2/object-removal';

        const removalResponse = await fetch(removalApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: image_url,
                object_to_remove: prompt // Use the text prompt here
            })
        });

        if (!removalResponse.ok) {
            const errorText = await removalResponse.text();
            console.error("Error from Object Removal API:", errorText);
            return res.status(removalResponse.status).json({ error: 'Error from Object Removal API', details: errorText });
        }

        const removalResult = await removalResponse.json();
        const finalUrl = removalResult.images[0].url;

        // --- FINAL UPLOAD AND RESPONSE ---
        const finalImageBuffer = await (await fetch(finalUrl)).buffer();
        const finalFileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const bucket = admin.storage().bucket();
        const finalFile = bucket.file(finalFileName);

        await finalFile.save(finalImageBuffer, { metadata: { contentType: 'image/jpeg' } });

        const [permanentUrl] = await finalFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        res.status(200).json({
            images: [{ url: permanentUrl }],
            // The new model may not return timings, adjust as needed.
            // timings: removalResult.timings
        });

    } catch (error) {
        console.error('Server error in /api/object_removal:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
