// api/video-proxy.js

const fetch = require('node-fetch');
const admin = require('firebase-admin');

// 1. INITIALIZE FIREBASE (Reuse existing logic)
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON missing");
    }
}

// 2. CONFIG
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY; // Topaz Video API Key
const FAL_API_KEY = process.env.FAL_API_KEY;     // Fal API Key

// Helper for Fal calls
const fetchFromFal = async (url, body) => {
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
        throw new Error(`Fal Error (${response.status}): ${txt}`);
    }
    return response.json();
};

module.exports = async (req, res) => {
    // Standard CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Auth Check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const { jobType, apiParams, userId } = req.body;
        console.log(`[VIDEO-PROXY] Job: ${jobType} | User: ${userId}`);

        let result;

        switch (jobType) {

            // =========================================================
            // 💎 TOPAZ VIDEO AI HANDSHAKES
            // =========================================================

            // Step 1: Create Request
            case 'topaz_create': {
                console.log("[TOPAZ] Creating Request...");
                
                const response = await fetch('https://api.topazlabs.com/video/v1/requests', {
                    method: 'POST',
                    headers: {
                        'x-api-key': TOPAZ_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(apiParams) // Swift sends { source:..., output:..., filters:... }
                });

                const data = await response.json();
                if (!response.ok) throw new Error(JSON.stringify(data));
                result = data; // Returns { id: "..." }
                break;
            }

            // Step 2: Accept Request (Get S3 URL for Swift)
            case 'topaz_accept': {
                const { request_id } = apiParams;
                console.log(`[TOPAZ] Accepting Request: ${request_id}`);

                const response = await fetch(`https://api.topazlabs.com/video/v1/requests/${request_id}/accept`, {
                    method: 'POST',
                    headers: { 'x-api-key': TOPAZ_API_KEY }
                });

                const data = await response.json();
                if (!response.ok) throw new Error(JSON.stringify(data));
                
                // Returns { uploadUrls: [...], uploadId: ... }
                result = data; 
                break;
            }

            // Step 3: Complete Upload (Swift finished S3 PUT)
            case 'topaz_complete': {
                const { request_id, parts } = apiParams; // parts = [{ partNum: 1, eTag: "..." }]
                console.log(`[TOPAZ] Completing Upload: ${request_id}`);

                const response = await fetch(`https://api.topazlabs.com/video/v1/requests/${request_id}/complete-upload`, {
                    method: 'POST',
                    headers: {
                        'x-api-key': TOPAZ_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ uploadResults: parts })
                });

                // Topaz might return 204 No Content on success, or JSON
                if (response.status === 204) {
                    result = { status: "processing_started" };
                } else {
                    const data = await response.json();
                    if (!response.ok) throw new Error(JSON.stringify(data));
                    result = data;
                }
                break;
            }

            // Step 4: Check Status (Polling)
            case 'topaz_status': {
                const { request_id } = apiParams;
                const response = await fetch(`https://api.topazlabs.com/video/v1/requests/${request_id}/status`, {
                    method: 'GET',
                    headers: { 'x-api-key': TOPAZ_API_KEY }
                });
                
                const data = await response.json();
                result = data;
                break;
            }


            // =========================================================
            // 🚀 FAL.AI VIDEO (Queue Based)
            // =========================================================

// ... inside switch(jobType) ...

case 'fal_video_submit': {
    console.log("[FAL] Submitting Video Upscale...");
    
    // 1. Define the Endpoint (Using Fal's Upscaler)
    // We use the '/queue/' endpoint to get a request_id back immediately
    const endpoint = 'https://queue.fal.run/fal-ai/creative-upscaler-video'; 
    
    // 2. Prepare Body
    // Swift sends: { video_url: "...", upscale_factor: 2.0 }
    // We map it to the model's specific schema.
    const payload = {
        video_url: apiParams.video_url,
        upscale_factor: apiParams.upscale_factor || 2.0,
        // Add any other model-specific defaults here
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Fal Submit Failed (${response.status}): ${txt}`);
    }

    const json = await response.json();
    
    // Fal returns { request_id: "..." }
    result = json; 
    break;
}
            case 'fal_video_status': {
                const { request_id } = apiParams;
                // Basic Queue Status check
                const response = await fetch(`https://queue.fal.run/fal-ai/topaz/requests/${request_id}/status`, {
                    method: 'GET',
                    headers: { 'Authorization': `Key ${FAL_API_KEY}` }
                });
                
                // Handle 404 race condition
                if (response.status === 404) {
                    result = { status: "IN_QUEUE" };
                } else {
                    result = await response.json();
                }
                break;
            }
            
            case 'fal_video_result': {
                const { request_id } = apiParams;
                const response = await fetch(`https://queue.fal.run/fal-ai/topaz/requests/${request_id}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Key ${FAL_API_KEY}` }
                });
                
                result = await response.json();
                break;
            }

            default:
                throw new Error(`Unknown Video Job Type: ${jobType}`);
        }

        res.status(200).json(result);

    } catch (error) {
        console.error("🔥 Video Proxy Error:", error.message);
        res.status(500).json({ error: error.message });
    }
};