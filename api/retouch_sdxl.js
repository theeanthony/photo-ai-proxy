// File: api/retouch_sdxl.js
const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { image_url, mask_url, prompt, negative_prompt, user_id, width, height } = req.body;
        
        if (!image_url || !mask_url || !user_id || !width || !height) {
            return res.status(400).json({ error: 'Missing required parameters: image_url, mask_url, user_id, width, or height' });
        }
        
        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        
        console.log("Received request:");
        console.log("- Dimensions:", { width, height });
        console.log("- Image URL:", image_url);
        console.log("- Mask URL:", mask_url);
        
        const FAL_API_URL = 'https://fal.run/fal-ai/fast-sdxl/inpainting';
        
        const effectivePrompt = prompt || "seamlessly fill the masked area, maintain original style and quality";
        const effectiveNegativePrompt = negative_prompt || "blurry, low quality, distorted";
        
        // CRITICAL: Ensure dimensions are multiples of 8 (SDXL requirement)
        const adjustedWidth = Math.round(width / 8) * 8;
        const adjustedHeight = Math.round(height / 8) * 8;
        
        console.log("Adjusted dimensions (8x multiple):", { width: adjustedWidth, height: adjustedHeight });
        
        // Build the payload - try different parameter formats
        const falPayload = {
            image_url: image_url,
            mask_url: mask_url,
            prompt: effectivePrompt,
            negative_prompt: effectiveNegativePrompt,
            // Try sending as separate width/height parameters
            image_width: adjustedWidth,
            image_height: adjustedHeight,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            strength: 0.99, // High strength to respect the mask fully
            sync_mode: true
        };
        
        console.log("Sending to Fal.ai:", JSON.stringify(falPayload, null, 2));
        
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
        console.log("Fal.ai response:", JSON.stringify(falResult, null, 2));
        
        if (!falResult.images || !falResult.images[0]) {
            console.error("No images in Fal.ai response");
            return res.status(500).json({ error: 'No images returned from Fal.ai' });
        }
        
        const resultUrl = falResult.images[0].url;
        console.log("Result URL:", resultUrl);
        
        let imageBuffer;
        
        // Handle data URLs or standard URLs
        if (resultUrl.startsWith('data:')) {
            console.log("Handling Data URL directly.");
            const base64Data = resultUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            console.log("Fetching image from standard URL");
            const imageResponse = await fetch(resultUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch result image: ${imageResponse.statusText}`);
            }
            imageBuffer = await imageResponse.buffer();
        }
        
        console.log("Downloaded image buffer size:", imageBuffer.length, "bytes");
        
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
        
        console.log("Uploaded to Firebase:", fileName);
        
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
        
        res.status(200).json({ 
            images: [{ 
                url: permanentUrl,
                width: falResult.images[0].width || adjustedWidth,
                height: falResult.images[0].height || adjustedHeight
            }],
            timings: falResult.timings || {}
        });
        
    } catch (error) {
        console.error('Server error in /api/retouch_sdxl:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
