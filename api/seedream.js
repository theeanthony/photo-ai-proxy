// api/seedream.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt, image_data_uri } = req.body;
        if (!prompt || !image_data_uri) {
            return res.status(400).json({ error: 'Missing prompt or image_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 1. SWITCH TO THE FASTER MODEL
        const FAL_API_URL = 'https://fal.run/fal-ai/fast-sdxl';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            // 2. This model uses 'image_url' (singular) and 'prompt'
            body: JSON.stringify({
                prompt: prompt,
                image_url: image_data_uri
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (fast-sdxl):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        // 3. This model returns an array of images, so we can pass it directly
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
