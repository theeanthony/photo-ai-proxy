const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // This API uses an image and a mask to fill the masked areas.
        const { image_data_uri, mask_data_uri } = req.body;
        if (!image_data_uri || !mask_data_uri) {
            return res.status(400).json({ error: 'Missing image_data_uri or mask_data_uri' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // The specific endpoint for AI filling / outpainting
        const FAL_API_URL = 'https://fal.run/fal-ai/flux-pro/v1/fill';

        const response = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: image_data_uri,
                mask_url: mask_data_uri,
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from fal.ai (fill):", errorText);
            return res.status(response.status).json({ error: 'Error from fal.ai API', details: errorText });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
