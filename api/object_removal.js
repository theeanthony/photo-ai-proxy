const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { image_url, mask_url, user_id, prompt, negative_prompt, width, height } = req.body;
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
        const intermediateUrl = (removalResult.images && removalResult.images[0].url) || (removalResult.image && removalResult.image.url);
        if (!intermediateUrl) throw new Error("Could not find image URL in the Stage 1 API response.");

        const intermediateBuffer = intermediateUrl.startsWith('data:')
            ? Buffer.from(intermediateUrl.split(',')[1], 'base64')
            : await (await fetch(intermediateUrl)).buffer();

        console.log("Uploading intermediate image for Stage 2...");
        const bucket = admin.storage().bucket();
        const tempFileName = `temp/${user_id}/${uuidv4()}.jpg`;
        const tempFile = bucket.file(tempFileName);
        await tempFile.save(intermediateBuffer, { metadata: { contentType: 'image/jpeg' } });
        const [tempPermanentUrl] = await tempFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        // --- STAGE 2: HIGH-QUALITY BACKGROUND RECONSTRUCTION ---
        console.log("Stage 2: Calling Generative Inpainting API with refined parameters...");
        const inpaintingApiUrl = 'https://fal.run/fal-ai/flux-lora/inpainting';
        
        // --- THIS IS THE FIX ---
        // Tweak the prompt to focus on an "unpopulated" scene
        const effectivePrompt = prompt || "A high-quality, sharp, photorealistic image. Reconstruct the background to create an empty, unpopulated scene based on the surrounding textures.";
        
        // A much more aggressive negative prompt to fight contextual bias
        const effectiveNegativePrompt = negative_prompt || "person, people, human, face, body, figure, form, crowd, man, woman, child, head, arm, leg, hair, eyes, skin, portrait, blurry face, artifact, text, watermark";
        // --- END OF FIX ---
        
        const inpaintingResponse = await fetch(inpaintingApiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: tempPermanentUrl,
                mask_url: mask_url,
                prompt: effectivePrompt,
                negative_prompt: effectiveNegativePrompt,
                sync_mode: true,
                image_width: width,
                image_height: height,
                strength: 1.0,
                guidance_scale: 3.5
            })
        });

        await tempFile.delete();

        if (!inpaintingResponse.ok) {
            const errorText = await inpaintingResponse.text();
            console.error("Error from Stage 2 (inpainting):", errorText);
            return res.status(inpaintingResponse.status).json({ error: 'Error from Inpainting API', details: errorText });
        }

        const inpaintingResult = await inpaintingResponse.json();
        const finalUrl = inpaintingResult.images[0].url;
        const finalImageBuffer = finalUrl.startsWith('data:')
            ? Buffer.from(finalUrl.split(',')[1], 'base64')
            : await (await fetch(finalUrl)).buffer();

        // --- FINAL UPLOAD AND RESPONSE ---
        const finalFileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const finalFile = bucket.file(finalFileName);
        await finalFile.save(finalImageBuffer, { metadata: { contentType: 'image/jpeg' } });
        const [permanentUrl] = await finalFile.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        
        res.status(200).json({ 
            images: [{ url: permanentUrl }],
            timings: inpaintingResult.timings 
        });

    } catch (error) {
        console.error('Server error in /api/object_removal (two-stage):', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};

