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

                    fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 

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
                
                falResult = {
                    images: [bananaResult.images[0], seedreamResult.images[0]].filter(Boolean),
                    timings: { 
                        totalTime: (bananaResult.timings?.totalTime || 0) + (seedreamResult.timings?.totalTime || 0)
                    }
                };
                break;
            }
case 'angle_shift': {
    // 1. Get all parameters from the client
    // We only need image_urls, prompt, negative_prompt, width, and height
    const { image_urls, prompt, negative_prompt, width, height } = apiParams;

    console.log("[PROCESS-IMAGE] 'angle_shift'. Using qwen-image-edit-plus-lora.");

    // 2. Create the base request body (WITHOUT the 'loras' array)
    let falBody = { 
        image_urls: image_urls, 
        prompt: prompt,
        negative_prompt: negative_prompt || "",
    };

    // 3. Conditionally add the image_size if width and height were provided
    if (width && height) {
        falBody.image_size = {
            width: width,
            height: height
        };
        console.log(`[PROCESS-IMAGE] Setting image_size: ${width}x${height}`);
    }
     
    // 4. Make the single, final API call
    console.log("[PROCESS-IMAGE] Calling Fal with body:", JSON.stringify(falBody, null, 2));
    falResult = await fetchFromFal('https://fal.run/fal-ai/qwen-image-edit-plus-lora', falBody);
     
    break;
}
               
            
            case 'colorize': {
                const { image_url, prompt } = apiParams;
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
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
                falResult = await fetchFromFal('https://fal.run/fal-ai/reve/edit', { 
                    image_urls: [image_url], 
                    prompt: prompt
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
                
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', {
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
                 falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
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

