// api/seedream.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Your proxy still correctly receives prompt and image_data_uri from the app
        const { prompt, image_data_uri } = req.body;
        if (!prompt || !image_data_uri) {
            return res.status(400).json({ error: 'Missing prompt or image_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 1. Set the URL to the Seedream v4/edit endpoint
        const FAL_API_URL = 'https://fal.run/fal-ai/bytedance/seedream/v4/edit';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            // 2. The body now matches what the Seedream API requires
          body: JSON.stringify({
                prompt: "repair this photo (remove dust, scratches, and noise). Colorize this photo only if it is black and white",
                image_urls: [image_data_uri],
                // Add these lines to enforce a consistent size
                width: 1024,
                height: 1024
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
