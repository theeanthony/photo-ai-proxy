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

            case 'ai_resize':
                falResult = await fetchFromFal('https://fal.run/fal-ai/fast-lightning-sdxl/inpainting', { 
                    image_url: apiParams.image_url,
                    mask_url: apiParams.mask_url,
                    prompt: "Extend the image naturally, adding photorealistic details that maintain the precise style, lighting, and perspective of the original scene.",
                    negative_prompt: "repetition, repeating patterns, collage, stacked images, duplicated objects, duplicated subjects, frames, borders, incoherent, disjointed, multiple people, tiling, artifacts"

                });
                break;

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
                 falResult = await fetchFromFal('https://fal.run/fal-ai/stable-diffusion-xl-lightning', { 
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

