// api/restore.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_data_uri } = req.body;
        if (!image_data_uri) {
            return res.status(400).json({ error: 'Missing image_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const FAL_API_URL = 'https://fal.run/fal-ai/nano-banana';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: "Restore and enhance this old photo. Improve clarity, fix colors, and correct lighting.",
                image_urls: [image_data_uri],
                num_images: 2
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (restore):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
