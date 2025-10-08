// File: api/retouch_stable.js
// Using Flux Pro inpainting which better preserves dimensions
const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { image_url, mask_url, prompt, negative_prompt, user_id, width, height } = req.body;
        
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        
        console.log("Using Flux Pro inpainting");
        console.log("Original dimensions:", { width, height });
        
        // Use Flux Pro which better maintains aspect ratios
        const FAL_API_URL = 'https://fal.run/fal-ai/flux-pro/fill';
        
        const effectivePrompt = prompt || "seamlessly fill the masked area, maintain original style and quality";
        
        const falPayload = {
            image_url: image_url,
            mask_url: mask_url,
            prompt: effectivePrompt,
            sync_mode: true,
            safety_tolerance: 2
        };
        
        console.log("Calling Fal.ai Flux Pro fill model");
        
        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(falPayload)
        });
        
        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai:", errorText);
            return res.status(falResponse.status).json({ 
                error: 'Error from Fal.ai API', 
                details: errorText 
            });
        }
        
        const falResult = await falResponse.json();
        console.log("Fal.ai response received");
        
        // Flux returns 'image' not 'images'
        const resultImage = falResult.image || (falResult.images && falResult.images[0]);
        
        if (!resultImage || !resultImage.url) {
            console.error("No image in response:", JSON.stringify(falResult));
            return res.status(500).json({ error: 'No image returned from Fal.ai' });
        }
        
        const resultUrl = resultImage.url;
        console.log("Downloading result from:", resultUrl.substring(0, 50) + "...");
        
        let imageBuffer;
        
        if (resultUrl.startsWith('data:')) {
            const base64Data = resultUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const imageResponse = await fetch(resultUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch result: ${imageResponse.statusText}`);
            }
            imageBuffer = await imageResponse.buffer();
        }
        
        console.log("Downloaded buffer size:", imageBuffer.length);
        
        // Upload to Firebase
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        
        await file.save(imageBuffer, {
            metadata: { 
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=31536000'
            }
        });
        
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
        
        console.log("Upload complete");
        
        // Return in the format expected by your Swift code
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: falResult.timings || {}
        });
        
    } catch (error) {
        console.error('Server error in /api/retouch_stable:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message
        });
    }
};
