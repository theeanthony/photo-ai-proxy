// File: api/retouch_sdxl.js
const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp'); // Add sharp for image processing

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { image_url, mask_url, prompt, negative_prompt, user_id, width, height } = req.body;
        
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }
        
        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        
        // --- ENHANCED: Verify image dimensions match what was sent ---
        console.log("Received dimensions:", { width, height });
        
        const FAL_API_URL = 'https://fal.run/fal-ai/fast-sdxl/inpainting';
        
        const effectivePrompt = prompt;
        const effectiveNegativePrompt = negative_prompt;
        
        console.log("Using Prompt:", effectivePrompt);
        console.log("Using Negative Prompt:", effectiveNegativePrompt);
        
        // --- ENHANCED: Call Fal.ai with explicit dimensions ---
        const falResponse = await fetch(FAL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: image_url,
                mask_url: mask_url,
                prompt: effectivePrompt,
                negative_prompt: effectiveNegativePrompt,
                image_size: { width, height }, // Try this format first
                sync_mode: true
            })
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
        console.log("Received Fal.ai Result:", JSON.stringify(falResult, null, 2));
        
        const resultUrl = falResult.images[0].url;
        let imageBuffer;
        
        // Handle data URLs or standard URLs
        if (resultUrl.startsWith('data:')) {
            console.log("Handling Data URL directly.");
            const base64Data = resultUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            console.log("Fetching image from standard URL.");
            const imageResponse = await fetch(resultUrl);
            imageBuffer = await imageResponse.buffer();
        }
        
        // --- NEW: Verify and correct image dimensions using sharp ---
        const imageMetadata = await sharp(imageBuffer).metadata();
        console.log("Result image dimensions:", { 
            width: imageMetadata.width, 
            height: imageMetadata.height 
        });
        
        // Check if dimensions are swapped
        if (imageMetadata.width === height && imageMetadata.height === width) {
            console.log("WARNING: Dimensions appear to be swapped. Rotating image...");
            imageBuffer = await sharp(imageBuffer)
                .rotate(90) // or -90 depending on the swap direction
                .toBuffer();
        }
        
        // Ensure image matches expected dimensions
        if (imageMetadata.width !== width || imageMetadata.height !== height) {
            console.log(`Resizing image from ${imageMetadata.width}x${imageMetadata.height} to ${width}x${height}`);
            imageBuffer = await sharp(imageBuffer)
                .resize(width, height, {
                    fit: 'fill',
                    withoutEnlargement: false
                })
                .toBuffer();
        }
        
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
        
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: falResult.timings
        });
        
    } catch (error) {
        console.error('Server error in /api/retouch_sdxl:', error);
        res.status(500).json({ 
            error: 'An unexpected error occurred.', 
            details: error.message 
        });
    }
};
