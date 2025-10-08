// File: api/retouch_flux_fill.js
// Uses Flux Fill which is a true inpainting model that respects masks
const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { image_url, mask_url, prompt, user_id } = req.body;
        
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ 
                error: 'Missing required parameters: image_url, mask_url, or user_id' 
            });
        }
        
        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        
        console.log("=== Flux Fill Inpainting Request ===");
        console.log("Image URL:", image_url);
        console.log("Mask URL:", mask_url);
        
        // Flux Fill uses a prompt to describe what should REPLACE the masked area
        // For removal, we want to fill with background
        const effectivePrompt = prompt || 
            "natural background, seamless fill, match surrounding environment";
        
        console.log("Prompt:", effectivePrompt);
        
        // Flux Fill Pro endpoint - TRUE inpainting that respects masks
        const FAL_API_URL = 'https://fal.run/fal-ai/flux-pro/v1.1/fill';
        
        const falPayload = {
            image_url: image_url,
            mask_url: mask_url,
            prompt: effectivePrompt,
            num_inference_steps: 25,
            guidance_scale: 3.5,  // Lower guidance for more natural results
            strength: 0.95,       // High strength to fully replace masked area
            safety_tolerance: 2,
            sync_mode: true
        };
        
        console.log("Calling Fal.ai Flux Fill API...");
        
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
            console.error("Fal.ai API Error:", errorText);
            return res.status(falResponse.status).json({ 
                error: 'Error from Fal.ai API', 
                details: errorText 
            });
        }
        
        const falResult = await falResponse.json();
        console.log("Fal.ai Response received");
        
        // Flux Fill returns 'image' (singular) not 'images'
        const resultImage = falResult.image;
        
        if (!resultImage || !resultImage.url) {
            console.error("No image in response:", JSON.stringify(falResult));
            return res.status(500).json({ 
                error: 'No image returned from Fal.ai',
                details: falResult 
            });
        }
        
        console.log("Result image URL:", resultImage.url);
        
        // Download the result
        const resultUrl = resultImage.url;
        let resultBuffer;
        
        if (resultUrl.startsWith('data:')) {
            console.log("Decoding data URL");
            const base64Data = resultUrl.split(',')[1];
            resultBuffer = Buffer.from(base64Data, 'base64');
        } else {
            console.log("Downloading from URL");
            const resultResponse = await fetch(resultUrl);
            if (!resultResponse.ok) {
                throw new Error(`Failed to download result: ${resultResponse.statusText}`);
            }
            resultBuffer = await resultResponse.buffer();
        }
        
        console.log("Result size:", resultBuffer.length, "bytes");
        
        // Upload to Firebase
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        
        await file.save(resultBuffer, {
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
        
        console.log("=== Request Complete ===");
        
        // Return in format expected by Swift (as an array for consistency)
        res.status(200).json({ 
            images: [{ 
                url: permanentUrl,
                width: resultImage.width,
                height: resultImage.height,
                content_type: resultImage.content_type || 'image/jpeg'
            }],
            timings: falResult.timings || {},
            seed: falResult.seed
        });
        
    } catch (error) {
        console.error('=== Server Error ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message
        });
    }
};
