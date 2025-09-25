// api/restore.js (consolidated for all nano-banana uses)
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_data_uri, prompt, mask_data_uri, target_width, target_height, num_images = 1 } = req.body;
        if (!image_data_uri) {
            return res.status(400).json({ error: 'Missing image_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const FAL_API_URL = 'https://fal.run/fal-ai/nano-banana/edit';

        // Default prompt based on context (or use provided)
        let effectivePrompt = prompt || "repair this photo (remove dust, scratches, and noise). Colorize this photo only if it is black and white";

        // Customize prompt for specific tools if detected (optional; client can always provide one)
        if (prompt && prompt.includes('remove unwanted')) {
            effectivePrompt = prompt; // For retouch
        } else if (prompt && prompt.includes('expand and fill')) {
            effectivePrompt = prompt; // For resize
        }

        // Build body
        const body = {
            prompt: effectivePrompt,
            image_url: image_data_uri,
            num_images,
            // Default to 1024x1024, but override for resize
            width: target_width || 1024,
            height: target_height || 1024
        };

        // Add mask for retouch if provided
        if (mask_data_uri) {
            body.mask_url = mask_data_uri;
        }

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (nano-banana):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
