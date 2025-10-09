const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_url, mask_url, user_id, mask_expansion } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // HIGH-QUALITY REMOVAL: Preserves original resolution, no generative fill
        console.log("Calling Object Removal API with best_quality setting...");
        const removalApiUrl = 'https://fal.run/fal-ai/object-removal/mask';
        
        const removalResponse = await fetch(removalApiUrl, {
            method: 'POST',
            headers: { 
                'Authorization': `Key ${FAL_API_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                image_url, 
                mask_url,
                model: "best_quality", // CRITICAL: Use highest quality setting
                mask_expansion: mask_expansion || 10, // Lower expansion for sharper edges (default 15)
                sync_mode: true
            })
        });

        if (!removalResponse.ok) {
            const errorText = await removalResponse.text();
            console.error("Error from Object Removal:", errorText);
            return res.status(removalResponse.status).json({ 
                error: 'Error from Object Removal API', 
                details: errorText 
            });
        }

        const removalResult = await removalResponse.json();
        
        // The response includes width and height - these match the original image
        console.log("Result dimensions:", removalResult.images[0].width, "x", removalResult.images[0].height);
        
        const resultUrl = removalResult.images[0].url;
        
        if (!resultUrl) {
            throw new Error("Could not find image URL in the API response.");
        }
        
        // Download the result (it's already PNG format from the API)
        const resultBuffer = resultUrl.startsWith('data:')
            ? Buffer.from(resultUrl.split(',')[1], 'base64')
            : await (await fetch(resultUrl)).buffer();

        // CRITICAL: Upload to Firebase Storage as PNG (lossless)
        // Do NOT use JPEG - it will introduce compression artifacts
        const bucket = admin.storage().bucket();
        const finalFileName = `processed/${user_id}/${uuidv4()}.png`;
        const finalFile = bucket.file(finalFileName);
        
        await finalFile.save(resultBuffer, { 
            metadata: { 
                contentType: 'image/png',
                cacheControl: 'public, max-age=31536000' // Cache for 1 year
            }
        });
        
        const [permanentUrl] = await finalFile.getSignedUrl({ 
            action: 'read', 
            expires: '03-09-2491' 
        });
        
        res.status(200).json({ 
            images: [{
                url: permanentUrl,
                width: removalResult.images[0].width,
                height: removalResult.images[0].height,
                file_size: removalResult.images[0].file_size
            }],
            timings: removalResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/simple_removal:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
