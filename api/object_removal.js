const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // This function now accepts prompts for the second stage
        const { image_url, mask_url, user_id, prompt, negative_prompt } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // --- STAGE 1: CLEAN OBJECT REMOVAL ---
        console.log("Stage 1: Calling Object Removal API...");
        const removalApiUrl = 'https://fal.run/fal-ai/object-removal/mask';
        const removalResponse = await fetch(removalApiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url, mask_url, sync_mode: true })
        });

        if (!removalResponse.ok) {
            const errorText = await removalResponse.text();
            console.error("Error from Stage 1 (object-removal):", errorText);
            return res.status(removalResponse.status).json({ error: 'Error from Object Removal API', details: errorText });
        }

        const removalResult = await removalResponse.json();
        const intermediateUrl = removalResult.image.url;
        let intermediateImageBuffer;

        // Handle the output from stage 1 (could be data URL or HTTP URL)
        if (intermediateUrl.startsWith('data:')) {
            const base64Data = intermediateUrl.split(',')[1];
            intermediateImageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const imageResponse = await fetch(intermediateUrl);
            intermediateImageBuffer = await imageResponse.buffer();
        }

        // --- INTERMEDIATE STEP: UPLOAD BLURRED IMAGE TO GET A URL FOR STAGE 2 ---
        console.log("Uploading intermediate image for Stage 2...");
        const bucket = admin.storage().bucket();
        const tempFileName = `temp/${user_id}/${uuidv4()}.jpg`;
        const tempFile = bucket.file(tempFileName);
        await tempFile.save(intermediateImageBuffer, { metadata: { contentType: 'image/jpeg' } });
        const [tempPermanentUrl] = await tempFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        // --- STAGE 2: HIGH-QUALITY BACKGROUND RECONSTRUCTION ---
        console.log("Stage 2: Calling Generative Inpainting API...");
        const inpaintingApiUrl = 'https://fal.run/fal-ai/fast-sdxl/inpainting';
        const effectivePrompt = prompt || "A high-quality, realistic photograph, seamless background.";
        const effectiveNegativePrompt = negative_prompt || "blurry, low quality, artifact, text, watermark";
        
        const inpaintingResponse = await fetch(inpaintingApiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: tempPermanentUrl, // Use the intermediate image as the new input
                mask_url: mask_url,         // Use the original mask
                prompt: effectivePrompt,
                negative_prompt: effectiveNegativePrompt,
                sync_mode: true
            })
        });

        // (Optional but good practice) Delete the temporary file after the call
        await tempFile.delete();

        if (!inpaintingResponse.ok) {
            const errorText = await inpaintingResponse.text();
            console.error("Error from Stage 2 (inpainting):", errorText);
            return res.status(inpaintingResponse.status).json({ error: 'Error from Inpainting API', details: errorText });
        }

        const inpaintingResult = await inpaintingResponse.json();
        const finalUrl = inpaintingResult.images[0].url;
        let finalImageBuffer;

        // Handle the final output
        if (finalUrl.startsWith('data:')) {
            const base64Data = finalUrl.split(',')[1];
            finalImageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const finalImageResponse = await fetch(finalUrl);
            finalImageBuffer = await finalImageResponse.buffer();
        }

        // --- FINAL UPLOAD AND RESPONSE ---
        const finalFileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const finalFile = bucket.file(finalFileName);
        await finalFile.save(finalImageBuffer, { metadata: { contentType: 'image/jpeg' } });
        const [permanentUrl] = await finalFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        
        // Use timings from the second, longer process for user feedback
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: inpaintingResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/object_removal (two-stage):', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};


