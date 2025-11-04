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
            case 'generic_restore': {
                const { image_url, banana_prompt, seedream_prompt } = apiParams;
                const [bananaResult, seedreamResult] = await Promise.all([
                    fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
                        image_urls: [image_url], 
                        prompt: banana_prompt || "repair photo" 
                    }),
                    fetchFromFal('https://fal.run/fal-ai/bytedance/seedream/v4/edit', { 
                        image_urls: [image_url], 
                        prompt: seedream_prompt || "repair photo"
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
            
            case 'colorize': {
                const { image_url, prompt } = apiParams;
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
                    image_urls: [image_url], 
                    prompt: prompt || "colorize this photo, add natural and realistic colors" 
                });
                break;
            }
                case 'textual_edit': {
                // Extract parameters sent from the app
                const { image_url, mask_url, prompt } = apiParams;

                // Call nano-banana with the image, mask, and prompt
                falResult = await fetchFromFal('https://fal.run/fal-ai/nano-banana/edit', { 
                    image_urls: [image_url], // nano-banana expects an array
                    mask_url: mask_url,
                    prompt: prompt
               });
                break;
            }
case 'video': {
    // 1. Get the parameters
    const { 
        image_urls, 
        prompt,
        duration,
        resolution,
        aspect_ratio,
        fps,
        generate_audio 
    } = apiParams;

    // ⭐️ --- FIX: Parse inputs to numbers and use number defaults --- ⭐️
    const numericDuration = parseInt(duration || 6, 10);
    const numericFPS = parseInt(fps || 25, 10);
    
    // 2. Call the model with the correct data types
    // ⭐️ --- FIX: Rename this variable --- ⭐️
    const falResponse = await fetchFromFal(
        'https://fal.run/fal-ai/ltxv-2/image-to-video/fast', 
        { 
            image_url: image_urls[0],
            prompt: prompt,
            
            // ✅ Use the new numeric values
            duration: numericDuration,
            fps: numericFPS,
            
            // These are correctly strings
            resolution: resolution || "1080p",
            aspect_ratio: aspect_ratio || "16:9",
            
            generate_audio: generate_audio ?? false 
        }
    );

    // 3. Format the result - This code is now correct!
    falResult = {
        images: [falResponse.video], 
        timings: falResponse.timings || null, // Timings are on the root response
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

