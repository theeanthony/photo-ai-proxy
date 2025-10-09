const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_url, mask_url, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // SINGLE-STAGE: Finegrain Eraser - Maintains Resolution & Removes Shadows/Reflections
        console.log("Calling Finegrain Eraser API for object removal...");
        const finegrainApiUrl = 'https://fal.run/fal-ai/finegrain-eraser/mask';
        
        const finegrainResponse = await fetch(finegrainApiUrl, {
            method: 'POST',
            headers: { 
                'Authorization': `Key ${FAL_API_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                image_url, 
                mask_url,
                sync_mode: true
            })
        });

        if (!finegrainResponse.ok) {
            const errorText = await finegrainResponse.text();
            console.error("Error from Finegrain Eraser:", errorText);
            return res.status(finegrainResponse.status).json({ 
                error: 'Error from Finegrain Eraser API', 
                details: errorText 
            });
        }

        const finegrainResult = await finegrainResponse.json();
        
        // Handle different response formats
        const resultUrl = finegrainResult.image?.url || 
                         (finegrainResult.images && finegrainResult.images[0]?.url);
        
        if (!resultUrl) {
            throw new Error("Could not find image URL in the API response.");
        }
        
        // Download the result
        const resultBuffer = resultUrl.startsWith('data:')
            ? Buffer.from(resultUrl.split(',')[1], 'base64')
            : await (await fetch(resultUrl)).buffer();

        // Upload to Firebase Storage as PNG (lossless)
        const bucket = admin.storage().bucket();
        const finalFileName = `processed/${user_id}/${uuidv4()}.png`;
        const finalFile = bucket.file(finalFileName);
        
        await finalFile.save(resultBuffer, { 
            metadata: { contentType: 'image/png' }
        });
        
        const [permanentUrl] = await finalFile.getSignedUrl({ 
            action: 'read', 
            expires: '03-09-2491' 
        });
        
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: finegrainResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/finegrain_removal:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
