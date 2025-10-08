// File: api/seedream_v4_removal.js
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
        
        console.log("=== Seedream V4 Object Removal Request ===");
        console.log("Image URL:", image_url);
        console.log("Mask URL:", mask_url);
        
        // Create a composite prompt that instructs the model to remove the masked area
        const effectivePrompt = prompt || 
            "Remove the object shown in the mask completely and seamlessly. " +
            "Fill the area naturally with appropriate background details that match " +
            "the surrounding environment. Maintain the original style, lighting, and quality.";
        
        console.log("Prompt:", effectivePrompt);
        
        // First, we need to download the original image and mask to composite them
        console.log("Downloading original image and mask...");
        
        const [imageResponse, maskResponse] = await Promise.all([
            fetch(image_url),
            fetch(mask_url)
        ]);
        
        if (!imageResponse.ok || !maskResponse.ok) {
            throw new Error('Failed to download input images');
        }
        
        const imageBuffer = await imageResponse.buffer();
        const maskBuffer = await maskResponse.buffer();
        
        console.log("Image size:", imageBuffer.length, "bytes");
        console.log("Mask size:", maskBuffer.length, "bytes");
        
        // Upload both to temporary storage if needed, or use the existing URLs
        // For Seedream V4, we'll use the image_urls parameter
        
        const FAL_API_URL = 'https://fal.run/fal-ai/bytedance/seedream/v4/edit';
        
        // Seedream V4 Edit expects an array of image URLs and a prompt describing the edit
        // We'll construct a prompt that references the mask for object removal
        const falPayload = {
            prompt: `${effectivePrompt} The second image shows the mask indicating which object to remove.`,
            image_urls: [
                image_url,    // Original image
                mask_url      // Mask showing what to remove
            ],
            num_inference_steps: 30,
            guidance_scale: 7.5,
            seed: Math.floor(Math.random() * 1000000),
            sync_mode: true
        };
        
        console.log("Calling Fal.ai Seedream V4 Edit API...");
        console.log("Payload:", JSON.stringify(falPayload, null, 2));
        
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
        console.log("Fal.ai Response Structure:", Object.keys(falResult));
        
        // Check for images in the response
        if (!falResult.images || falResult.images.length === 0) {
            console.error("No images in response:", JSON.stringify(falResult));
            return res.status(500).json({ 
                error: 'No images returned from Fal.ai',
                details: falResult 
            });
        }
        
        console.log("Number of images returned:", falResult.images.length);
        console.log("First image URL:", falResult.images[0].url);
        
        // Download the result image
        const resultUrl = falResult.images[0].url;
        let resultBuffer;
        
        if (resultUrl.startsWith('data:')) {
            console.log("Result is a data URL, decoding base64");
            const base64Data = resultUrl.split(',')[1];
            resultBuffer = Buffer.from(base64Data, 'base64');
        } else {
            console.log("Downloading result from URL");
            const resultResponse = await fetch(resultUrl);
            if (!resultResponse.ok) {
                throw new Error(`Failed to download result: ${resultResponse.statusText}`);
            }
            resultBuffer = await resultResponse.buffer();
        }
        
        console.log("Result image size:", resultBuffer.length, "bytes");
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);
        
        console.log("Uploading to Firebase Storage...");
        
        await file.save(resultBuffer, {
            metadata: { 
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=31536000'
            }
        });
        
        console.log("File uploaded:", fileName);
        
        // Generate signed URL
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });
        
        console.log("Generated permanent URL");
        console.log("=== Request Complete ===");
        
        // Return response in the format expected by Swift
        res.status(200).json({ 
            images: [{ 
                url: permanentUrl,
                width: falResult.images[0].width,
                height: falResult.images[0].height,
                content_type: falResult.images[0].content_type || 'image/jpeg'
            }],
            timings: falResult.timings || {},
            seed: falResult.seed,
            has_nsfw_concepts: falResult.has_nsfw_concepts || []
        });
        
    } catch (error) {
        console.error('=== Server Error ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
