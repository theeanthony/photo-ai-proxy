// api/seedream.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Seedream primarily uses a prompt. We'll send a fixed one for now.
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // The endpoint for the Seedream 4.0 model
        const FAL_API_URL = 'https://fal.run/fal-ai/bytedance/seedream/v4/edit';
        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (seedream):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        // Seedream returns an array of images, so we can pass it directly
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
