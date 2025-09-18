// api/restore.js

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_data_uri } = req.body;
        if (!image_data_uri) {
            return res.status(400).json({ error: 'Missing image_data_uri in request body' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key is not configured on the server' });
        }

        // const FAL_API_URL = 'https://fal.ai/api/v1/run/fal-ai/nano-banana/edit';
        const FAL_API_URL = 'https://fal.run/fal-ai/nano-banana/edit';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: { /* ... */ },
            body: JSON.stringify({
                // Use the fixed, high-quality prompt
                prompt: "Restore and enhance this old photo. Improve clarity, fix colors, and correct lighting.",
                image_urls: [image_data_uri],
                // Tell the API to generate two results
                num_images: 2 
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
