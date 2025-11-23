const fetch = require('node-fetch');
const admin = require('../lib/firebase-admin');

const FAL_API_KEY = process.env.FAL_API_KEY;

/**
 * Performs a synchronous (long-waiting) call to a Fal.ai endpoint.
 * @param {string} url - The Fal.ai model endpoint URL.
 * @param {object} body - The request body for the model.
 * @returns {Promise<object>} - The JSON response from Fal.ai.
 */
const fetchFromFal = async (url, body) => {
    console.log(`Calling Fal.ai endpoint: ${url}`);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Authorization': `Key ${FAL_API_KEY}`, 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fal.ai API call to ${url} failed with status ${response.status}: ${errorText}`);
    }
    return response.json();
};
const submitToFalQueue = async (url, body) => {
    console.log(`[QUEUE] Submitting to: ${url}`);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Authorization': `Key ${FAL_API_KEY}`, 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Fal Queue Submit Failed (${response.status}): ${txt}`);
    }
    return response.json(); // Returns { request_id: "..." }
};

const checkFalQueueStatus = async (requestId) => {
    // ✅ FIX: Add '/status' to the end of the URL
    const statusUrl = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}/status`;
    
    console.log(`[QUEUE] Checking status: ${statusUrl}`);
    const response = await fetch(statusUrl, {
        method: 'GET',
        headers: { 
            'Authorization': `Key ${FAL_API_KEY}`, 
            'Content-Type': 'application/json' 
        }
    });

    if (!response.ok) {
        throw new Error(`Fal Status Check Failed: ${response.status}`);
    }
    return response.json();
};


// --- Main Serverless Function Handler ---

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { jobType, apiParams, userId } = req.body;
    console.log(`[PROCESS-IMAGE] Received request for jobType: '${jobType}' for user: ${userId}`);

    try {
        if (!userId || !jobType || !apiParams) {
            return res.status(400).send('Missing required parameters: userId, jobType, apiParams.');
        }

        let falResult;

        switch (jobType) {
    // ADD THIS NEW CASE TO YOUR BACKEND
case 'new_resize': {
    const { image_url, mask_url, expansion_direction } = apiParams;
    
    // Build prompt...
    let contextualPrompt = "A high-quality, realistic photograph. ";
    if (expansion_direction === 'vertical') {
        contextualPrompt += "Naturally extend the sky upward and the ground/floor downward... ";
    } else if (expansion_direction === 'horizontal') {
        contextualPrompt += "Naturally extend the scene to the left and right sides... ";
    } else {
        contextualPrompt += "Extend the scene in all directions naturally... ";
    }
    contextualPrompt += "Match the exact lighting, color palette, and style... ";
    
    const negativePrompt = "repetition, repeating patterns, collage, stacked images, ..."; // Your full negative prompt

    // ✅ ADD LOGGING
    console.log(`[JOB: new_resize] Calling fal-ai/fooocus/inpaint...`);
    console.log(`  - Image URL: ${image_url}`);
    console.log(`  - Mask URL: ${mask_url}`);
    
    falResult = await fetchFromFal('https://fal.run/fal-ai/fooocus/inpaint', { 
        inpaint_image_url: image_url, // 'image_url' -> 'inpaint_image_url'
        mask_image_url: mask_url,     // 'mask_url' -> 'mask_image_url'
        prompt: contextualPrompt,
        negative_prompt: negativePrompt,
        inpaint_mode: "Inpaint or Outpaint (default)" 
    });
    break;
}
case 'generic_restore': {

    // ✅ MODIFIED: Extract width and height
    
    const { image_url, banana_prompt, seedream_prompt, width, height } = apiParams;
    
    
    const [bananaResult, seedreamResult] = await Promise.all([
    
    
    
    fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', {
    
    
    
    image_urls: [image_url],
    
    
    
    prompt: banana_prompt || "repair photo"
    
    
    
    }),
    
    
    
    fetchFromFal('https://fal.run/fal-ai/bytedance/seedream/v4/edit', {
    
    
    
    image_urls: [image_url],
    
    
    
    prompt: seedream_prompt || "repair photo",
    
    image_urls: [image_url],
    
    prompt: seedream_prompt || "repair photo",
    
    image_size: { // <-- Pass an object named "image_size"
    
    width: width,
    
    height: height
    
    }
    
    })
    
    ]);
    
    // 🐞 DEBUG: Log the full results from both models
    console.log('Banana Result:', JSON.stringify(bananaResult, null, 2));
    console.log('Seedream Result:', JSON.stringify(seedreamResult, null, 2));
    
    falResult = {
    
    images: [bananaResult.images[0], seedreamResult.images[0]].filter(Boolean),
    
    timings: {
    
    totalTime: (bananaResult.timings?.totalTime || 0) + (seedreamResult.timings?.totalTime || 0)
    
    }
    
    };
    
    break;
    
    }
            case 'angle_shift': {
                // 1. ✅ FIXED: Destructure using the ACTUAL key names from Swift
                const { 
                    image_urls,
                    prompt,
                    negative_prompt,
                    width,
                    height,
                    rotate_right_left,    // ✅ Changed from 'rotation'
                    move_forward,         // ✅ Changed from 'zoom'
                    vertical_angle,       // ✅ Changed from 'vertical'
                    wide_angle_lens       // ✅ Changed from 'isWideAngle'
                } = apiParams;
            
                console.log("[PROCESS-IMAGE] 'angle_shift'. Using 'multiple-angles' gallery model.");
                console.log(`[PROCESS-IMAGE] Camera params - rotation: ${rotate_right_left}, zoom: ${move_forward}, vertical: ${vertical_angle}, wide: ${wide_angle_lens}`);
            
                // 2. Create the base request body
                let falBody = { 
                    image_urls: image_urls, 
                    
                    // ✅ FIXED: Use the values we just destructured
                    "rotate_right_left": rotate_right_left || 0,
                    "move_forward": move_forward || 0,
                    "vertical_angle": vertical_angle || 0,
                    "wide_angle_lens": wide_angle_lens || false,
            
                    // Optional parameters with good defaults
                    "negative_prompt": negative_prompt || " ",
                    "lora_scale": 1.0,
                    "guidance_scale": 1,
                    "num_inference_steps": 6,
                    "acceleration": "regular",
                    "enable_safety_checker": true,
                    "output_format": "png",
                    "num_images": 1
                };
            
                // 3. Add image_size if provided
                if (width && height) {
                    falBody.image_size = {
                        width: Math.round(width),
                        height: Math.round(height)
                    };
                    console.log(`[PROCESS-IMAGE] Setting image_size: ${Math.round(width)}x${Math.round(height)}`);
                }
                 
                // 4. Make the final API call
                const falEndpoint = 'https://fal.run/fal-ai/qwen-image-edit-plus-lora-gallery/multiple-angles';
                
                console.log(`[PROCESS-IMAGE] Calling Fal at: ${falEndpoint}`);
                console.log("[PROCESS-IMAGE] Body:", JSON.stringify(falBody, null, 2));
                
                falResult = await fetchFromFal(falEndpoint, falBody);
                 
                break;
            }
               
            case 'hair_styler': {
                const { image_url, prompt, width, height } = apiParams;

                console.log("[PROCESS-IMAGE] 'hair_styler'. Using fal-ai/flux-pro/kontext for hair editing.");
                
                // Flux-Pro/Kontext is an instruction-based editor. 
                // We'll instruct it to modify the hair based on the user's prompt
                const instructionPrompt = `Apply the following style and color ONLY to the person's hair: ${prompt}. Preserve the face, background, and body completely.`;

                // We add a default safety negative prompt focused on preservation
                const negativePrompt = "messy, artifacts, distorted face, changed background, changed clothes, extra limbs, incoherent, tiling";

                falResult = await fetchFromFal('https://fal.run/fal-ai/flux-pro/kontext', { 
                    image_url: image_url,
                    prompt: instructionPrompt,
                    negative_prompt: negativePrompt,
                    
                    // We can pass image_size to maintain aspect ratio/quality
                    image_size: {
                        width: width,
                        height: height
                    }
                });
                break;
            }
            case 'colorize': {
                const { image_url, prompt } = apiParams;
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', { 
                    image_urls: [image_url], 
                    prompt: prompt || "colorize this photo, add natural and realistic colors" 
                });
                break;
            }
            case 'studio_glow':
            case 'smart_skin':
            case 'backlight_savior':
            case 'golden_hour':
            case 'vibrant_nature':
            case 'portrait_pop':
            case 'analog_film':
            case 'moody_cinema':
            case 'foodie_fix':
            case 'minimalist_white':
            case 'sharpen_details':
            case 'neon_noir':
            case 'subject_light': {
                console.log(`[PROCESS-IMAGE] AI Filter job: '${jobType}'. Using fal-ai/reve/edit.`);
                
                // 1. Get params from performAIFilter (image_url is singular)
                const { image_url, prompt } = apiParams;

                // 2. Call fal-ai/reve/edit
                // We wrap the singular 'image_url' in an array to match the
                // 'image_urls' (plural) schema that reve/edit expects.
                // falResult = await fetchFromFal('https://fal.run/fal-ai/reve/edit', { 
                //     image_url: image_url,
                //     prompt: prompt
                // });

                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', {
                    image_urls: [image_url],
                    prompt: prompt
                });
                break;
            }
            case 'outfit_transfer': {
                // ✅ FIX: Destructure 'style_urls' (plural array) instead of 'style_url'
                const { image_url, style_urls, prompt, width, height } = apiParams;
        
                console.log("[PROCESS-IMAGE] 'outfit_transfer'. Using seedream/v4/edit. Mask will be ignored.");
                
                const defaultPrompt = "Combine the styles from the clothing images and apply them to the person. " +
                                                "The person's face, skin, hair, and background must be preserved. Maintain consistency of the person, and the direction in which they face. " +
                                                "Do not add new body parts. Do not change the face. Do not enlarge or shrink any body parts of the person" +
                                                 "Do not change the background. Make the clothing fit nicely with the body. Do not change the persons face.";
                                                
                const safetyPrompt = prompt ? prompt + " " + defaultPrompt : defaultPrompt;
                
                // ✅ FIX: Combine the base image URL with the style URLs array
                const allImageUrls = [image_url, ...style_urls];
                
                console.log(`[PROCESS-IMAGE] Sending ${allImageUrls.length} total images to Fal.`);

                falResult = await fetchFromFal('https://fal.run/fal-ai/bytedance/seedream/v4/edit', { 
                    
                    image_urls: allImageUrls, // Pass the combined array
                    
                    prompt: safetyPrompt,
                    
                    image_size: {
                        width: width,
                        height: height
                    }
                });
                
                break;
            }

        case 'textual_edit': {
            // Extract parameters sent from the app
            const { image_url, mask_url, prompt } = apiParams;

            if (mask_url) {
                // --- MASK IS PROVIDED ---
                // Use the 'flux-pro' model, which is much better
                // at precise inpainting (filling masked areas).

                console.log("[PROCESS-IMAGE] Masked 'textual_edit'. Using flux-pro/fill.");
                
                falResult = await fetchFromFal('https://fal.run/fal-ai/flux-pro/v1/fill', { 
                    image_url: image_url,
                    mask_url: mask_url,
                    prompt: prompt, // Use the user's exact prompt
                    negative_prompt: "repetition, repeating patterns, collage, " +
                        "duplicated objects, duplicated subjects, frames, borders, incoherent, " +
                        "disjointed, tiling, artifacts, mirroring"
                });

            } else {
                // --- NO MASK PROVIDED ---
                // Fall back to 'nano-banana' for global, text-only style edits.

                console.log("[PROCESS-IMAGE] Unmasked 'textual_edit'. Using nano-banana.");
                
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', {
                    image_urls: [image_url],
                    prompt: prompt
                });
            }
            break;
        }

// ... continue with case 'video': ...
case 'video': {
                // 1. Get the parameters
                const { 
                    image_urls, 
                    prompt,
                    resolution,
                    aspect_ratio, // Client should now send "auto", "1:1", "9:16", etc.
                    generate_audio 
                } = apiParams;

                // 2. Call the VEO model
                // ⭐️ --- CHANGED: Renamed variable for clarity --- ⭐️
                const falResponse = await fetchFromFal(
                    // ⭐️ --- CHANGED: Updated to the Veo3 endpoint --- ⭐️
                    'https://fal.run/fal-ai/veo3/image-to-video', 
                    { 
                        image_url: image_urls[0],
                        prompt: prompt,
                        
                        // ⭐️ --- CHANGED: Veo uses a fixed string duration --- ⭐️
                        duration: "8s", 
                        
                        // ⭐️ --- CHANGED: Default to "auto" for aspect ratio --- ⭐️
                        aspect_ratio: aspect_ratio || "auto", 
                        
                        // Veo's default is "720p", but "1080p" is a valid option
                        resolution: resolution || "720p", 
                        
                        generate_audio: generate_audio ?? false
                        
                        // ⭐️ --- REMOVED: `fps` is not a Veo parameter --- ⭐️
                    }
                );

                // 3. Format the result - This code is compatible!
                // Your existing mapping works perfectly because Veo3 also
                // returns a `video` object with a `url` inside.
                falResult = {
                    images: [falResponse.video], 
                    timings: falResponse.timings || null, // Veo doesn't return timings, so this will be null
                    description: "Video generated"
                };

                break;
            }

          case 'smart_retouch': {
    const briaResult = await fetchFromFal('https://fal.run/fal-ai/bria/eraser', { 
        image_url: apiParams.image_url,
        mask_url: apiParams.mask_url
    });

    if (briaResult.image) {
        // This is the "translation" step!
        falResult = { 
            images: [briaResult.image], 
            timings: briaResult.timings 
        };
    } else {
        falResult = briaResult;
    }
    break;
}
    case 'train_lora': {
                const { image_urls, character_id } = apiParams;
                
                const WEBHOOK_URL = `https://photo-ai-proxy.vercel.app/api/lora-webhook`;
                const triggerWord = `ohwx_${userId.substring(0, 5)}_${character_id.substring(0, 5)}`;
                
                // --- ✅ START FIX ---
                
                // 1. This is the correct endpoint for an ASYNCHRONOUS job.
                // We are telling the 'queue' system to run the 'fal-ai/sd15-lora-trainer' model.
                const falQueueUrl = 'https://fal.run/queue/fal-ai/sd15-lora-trainer';
                
                console.log(`[PROCESS-IMAGE] Submitting 'train_lora' job for user ${userId} to: ${falQueueUrl}`);

                // 2. This is the correct body schema for THIS training model.
                // It uses 'image_urls' and 'concept_prompt', not 'prompt' or 'model_name'.
                const falBody = {
                    image_urls: image_urls,
                    concept_prompt: `a photo of ${triggerWord} person`,
                    class_prompt: "a photo of a person",
                    webhook_url: `${WEBHOOK_URL}?userId=${userId}&characterId=${character_id}&triggerWord=${triggerWord}`
                };
                
                // --- END FIX ---
                
                const response = await fetch(falQueueUrl, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Key ${FAL_API_KEY}`,
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify(falBody)
                });
                
                // We expect a 202 (Accepted) for a queued job
                if (response.status !== 202) { 
                    const errorText = await response.text();
                    throw new Error(`Failed to submit LoRA training job: ${errorText}`);
                }

                // Return 202 to the app immediately.
                return res.status(202).json({ message: "Training job submitted." });
            }

case 'ai_resize': {
    const { image_url, mask_url, expansion_direction } = apiParams;
    
    // Build a smarter prompt based on expansion direction
    let contextualPrompt = "A high-quality, realistic photograph. ";
    
    if (expansion_direction === 'vertical') {
        contextualPrompt += "Naturally extend the sky upward and the ground/floor downward. " +
            "Maintain the horizon line and perspective. " +
            "Continue existing patterns seamlessly (clouds, terrain, flooring). ";
    } else if (expansion_direction === 'horizontal') {
        contextualPrompt += "Naturally extend the scene to the left and right sides. " +
            "Maintain perspective and scale of existing elements. " +
            "Continue architectural or environmental patterns seamlessly. ";
    } else {
        contextualPrompt += "Extend the scene in all directions naturally. " +
            "Maintain perspective, lighting, and existing scene elements. ";
    }
    
    contextualPrompt += "Match the exact lighting, color palette, and style of the original photo. " +
        "Fill masked areas with contextually appropriate content.";
    
    falResult = await fetchFromFal('https://fal.run/fal-ai/flux-pro/v1/fill', { 
        image_url: image_url,
        mask_url: mask_url,
        prompt: contextualPrompt,
        negative_prompt: "repetition, repeating patterns, collage, stacked images, " +
            "duplicated objects, duplicated subjects, frames, borders, incoherent, " +
            "disjointed, multiple people, tiling, artifacts, mirroring, " +
            "unrelated scenery, random objects, unnatural transitions"
    });
    break;
}

// In process.js

case 'advanced_restore': {
    const { image_url, fix_colors, remove_scratches, enhance_resolution, width, height } = apiParams;
    const aspectRatioObj = getClosestAspectRatio(width, height);

    // 1. Call the API
    falResult = await fetchFromFal('https://fal.run/fal-ai/image-apps-v2/photo-restoration', {
        image_url: image_url,
        fix_colors: fix_colors ?? true,
        remove_scratches: remove_scratches ?? true,
        enhance_resolution: enhance_resolution ?? true,
        aspect_ratio: aspectRatioObj
    });

    // 2. Standardize the Output
    // We force the result to look like a standard FalFile so Swift is happy
    if (falResult.image) {
        falResult = {
            images: [{
                url: falResult.image.url,
                width: falResult.image.width,
                height: falResult.image.height,
                // Inject the missing fields required by Swift:
                content_type: "image/jpeg",
                file_name: `restored_${Date.now()}.jpg`,
                file_size: 0 
            }],
            timings: falResult.timings
        };
    }
    break;
}
// MARK: - Module II: Creative Enhancement/Upscale (PDF Page 8)
// Uses: fal-ai/flux-vision-upscaler
case 'flux_upscale': {
    const { image_url, upscale_factor, creativity, guidance_scale } = apiParams;
    
    console.log(`[PROCESS-IMAGE] 'flux_upscale'. Factor: ${upscale_factor}, Creativity: ${creativity}`);
    
    // According to research, Flux Vision Upscaler is best for "Creative" upscaling
    // and acts as Sharpen/Denoise when factor is 1.0 and creativity is low.
    falResult = await fetchFromFal('https://fal.run/fal-ai/flux-vision-upscaler', {
        image_url: image_url,
        upscale_factor: upscale_factor || 2.0,
        creativity: creativity || 0.35, // Default "Balanced"
        guidance_scale: guidance_scale || 2.0,
        active_tags: ["masterpiece", "high fidelity", "highly detailed"], // Internal prompt helper
        enable_safety_checker: true
    });
    
    if (falResult.image) {
         falResult = { images: [falResult.image], timings: falResult.timings };
    }
    break;
}
case 'creative_upscale_async': {
    const { image_url, prompt } = apiParams;
    
    // Use the QUEUE URL (https://queue.fal.run/...)
    falResult = await submitToFalQueue('https://queue.fal.run/fal-ai/nano-banana-pro/edit', {
        image_urls: [image_url],
        prompt: prompt
    });
    // Expected falResult: { request_id: "123-abc...", ... }
    break;
}

// ✅ NEW STATUS CHECKER
case 'fal_queue_status': {
    const { request_id } = apiParams;
    if (!request_id) throw new Error("Missing request_id for status check");
    
    falResult = await checkFalQueueStatus(request_id);
    // Returns Fal status JSON (status: "IN_QUEUE", "COMPLETED", etc.)
    break;
}


case 'creative_upscale': {
    // 1. Extract the params (Just prompt and image for now)
    const { image_url, prompt } = apiParams;

    console.log(`[PROCESS-IMAGE] 'creative_upscale' using nano-banana.`);
    console.log(`[PROCESS-IMAGE] Prompt: ${prompt}`);

    // 2. Call Nano-Banana (an instruction-based editor)
    // It takes 'image_urls' (plural) and a 'prompt'.
    falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', {
        image_urls: [image_url], 
        prompt: prompt
    });

    // 3. No extra formatting needed, Fal's default response works with your Swift decoder
    break;
}

            case 'upscale':
                console.log("we made it here to upsacle in api")
                falResult = await fetchFromFal('https://fal.run/fal-ai/topaz/upscale/image', {
                    image_url: apiParams.image_url,
                    scale_factor: apiParams.upscale_factor || 2.0,
                    face_enhancement: true
                });
                console.log("after the fetch from fal")
                if (falResult.image) {
                    falResult = { images: [falResult.image], timings: falResult.timings };
                }
                break;
            case 'ai_color_grade':
            case 'trend': {
                const { image_urls, prompt } = apiParams;
                 falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana-pro/edit', { 
                    image_urls: image_urls, 
                    prompt: prompt
                });
                break;
            }

            default:
                throw new Error(`Unknown or unsupported job type: ${jobType}`);
        }
        
        console.log(`[PROCESS-IMAGE] Successfully processed job '${jobType}'. Returning result to client.`);
        res.status(200).json(falResult);

    } catch (error) {
        console.error(`[CRITICAL ERROR] in /api/process for job '${jobType}':`, error);
        res.status(500).json({ error: `Failed to process job: ${error.message}` });
    }
};



function getClosestAspectRatio(width, height) {
    if (!width || !height) return { ratio: "4:3" }; // Fallback if dimensions missing

    const targetRatio = width / height;
    const supportedRatios = [
        { str: "16:9", val: 16/9 },
        { str: "4:3",  val: 4/3 },
        { str: "1:1",  val: 1.0 },
        { str: "3:4",  val: 3/4 },
        { str: "9:16", val: 9/16 }
    ];

    // Find the ratio with the smallest difference
    const closest = supportedRatios.reduce((prev, curr) => {
        return (Math.abs(curr.val - targetRatio) < Math.abs(prev.val - targetRatio)) ? curr : prev;
    });

    return { ratio: closest.str }; // ✅ Returns object: { ratio: "16:9" }
}