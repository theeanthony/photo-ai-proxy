// api/seedream.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. Accept both the prompt and the image URI from the app's request
        const { prompt, image_data_uri } = req.body;
        if (!prompt || !image_data_uri) {
            return res.status(400).json({ error: 'Missing prompt or image_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // Using the /edit endpoint for image-to-image tasks
        const FAL_API_URL = 'https://fal.run/fal-ai/bytedance/seedream/v4/edit';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            // 2. Send both the prompt and the image_urls array to the API
            body: JSON.stringify({
                prompt: prompt,
                image_urls: [image_data_uri]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (seedream):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
