// File: api/retouch_sdxl.js

const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin'); // Correct path from /api folder
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS AND PARAMS FROM CLIENT
        const { image_url, mask_url, prompt, negative_prompt, user_id } = req.body; // Added negative_prompt to destructuring
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const FAL_API_KEY = process.env.FAL_API_KEY;
        if (!FAL_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. CALL FAL.AI API WITH THE URLS
        // --- NEW MODEL ENDPOINT ---
        const FAL_API_URL = 'https://fal.run/fal-ai/sdxl-controlnet-union/inpainting/api';

        // Robust default prompt for object removal and background reconstruction
        const effectivePrompt = prompt || "Seamlessly remove the masked subject. Reconstruct the background by extending the existing street, concrete wall, and metal gate. Focus on matching textures, colors, and lighting to create an empty, unpopulated street scene. Realistic photography style.";

        // Robust default negative prompt to prevent unwanted generations, especially human elements
        const effectiveNegativePrompt = negative_prompt || "new person, face, human, human form, body, limb, head, crowd, blurry face, distinct object, text, watermark, bad quality, low resolution, ugly, distorted, noise, cropped, error, abstract, painting, drawing, cartoon, illustration, signature, frame, border";
        
        console.log("Using Prompt:", effectivePrompt);
        console.log("Using Negative Prompt:", effectiveNegativePrompt);

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
                negative_prompt: effectiveNegativePrompt, // Pass the dedicated negative prompt
                sync_mode: true, // Recommended for Fal.ai's immediate responses for development/simpler flows
                // Optional parameters you might want to experiment with for SDXL inpainting:
                // strength: 0.9, // How much to change the image (0.0-1.0, 1.0 means completely redraw)
                               // For inpainting, often managed internally, but good to know
                // guidance_scale: 10, // How strongly the model adheres to the prompt (default often around 7-12)
                // seed: Math.floor(Math.random() * 1000000), // For reproducibility
                // num_inference_steps: 30, // Number of steps for generation, more steps = better quality but slower
            })
        });

        if (!falResponse.ok) {
            const errorText = await falResponse.text();
            console.error("Error from fal.ai (sdxl-inpainting):", errorText);
            try {
                const errorJson = JSON.parse(errorText);
                return res.status(falResponse.status).json({ error: 'Error from Fal.ai API', details: errorJson });
            } catch {
                return res.status(falResponse.status).json({ error: 'Error from Fal.ai API', details: errorText });
            }
        }

        const falResult = await falResponse.json();
        // SDXL ControlNet Union inpainting typically returns the result directly in 'image' field
        const tempResultUrl = falResult.image.url; 

        // 3. DOWNLOAD THE PROCESSED IMAGE FROM FAL.AI
        const imageResponse = await fetch(tempResultUrl);
        const imageBuffer = await imageResponse.buffer();

        // 4. UPLOAD THE FINAL IMAGE TO YOUR FIREBASE STORAGE
        const bucket = admin.storage().bucket();
        const fileName = `processed/${user_id}/${uuidv4()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' }
        });

        // 5. GET THE PERMANENT, SIGNED URL AND RESPOND TO THE CLIENT
        const [permanentUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491' // Far-future expiration
        });
        
        // Respond with a structure that mirrors the original Fal response, but with the new permanent URL
        res.status(200).json({ 
            images: [{ url: permanentUrl }], // Wrapping in 'images' array for consistency with your client
            timings: falResult.timings // Fal.ai usually includes timings
        });

    } catch (error) {
        console.error('Server error in /api/retouch_sdxl:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
