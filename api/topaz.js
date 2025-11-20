const fetch = require('node-fetch');
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;

module.exports = async (req, res) => {
    // 1. Security Check
    if (!TOPAZ_API_KEY) {
        console.error("❌ Missing TOPAZ_API_KEY");
        return res.status(500).json({ error: "Server Config Error: Missing API Key." });
    }

    // 2. Handle GET Requests (Status & Download)
    if (req.method === 'GET') {
        const { processId, action } = req.query; 

        if (!processId) return res.status(400).json({ error: "Missing processId" });

        const endpointType = action === 'download' ? 'download' : 'processing'; // Default to 'processing' check docs
        // Note: Some Topaz docs say /v1/status/{id} or /v1/processing/{id}. Verify based on your model.
        
        try {
            // If your specific model documentation says '/v1/status', change 'processing' below to 'status'
            const topazUrl = `https://api.topazlabs.com/image/v1/${endpointType}/${processId}`;
            
            const response = await fetch(topazUrl, {
                method: 'GET',
                headers: { 
                    'X-API-Key': TOPAZ_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            // Parse response safely
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await response.json();
                return res.status(response.status).json(data);
            } else {
                const text = await response.text();
                return res.status(response.status).json({ error: `Topaz Non-JSON Error: ${text}` });
            }

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 3. Handle POST Requests (Start Job)
    if (req.method === 'POST') {
        try {
            const { endpoint, ...params } = req.body; 

            if (!endpoint) return res.status(400).json({ error: "Missing 'endpoint' param." });

            console.log(`[Topaz Proxy] Forwarding to: ${endpoint}`);
            console.log(`[Topaz Proxy] Params:`, JSON.stringify(params));

            const response = await fetch(`https://api.topazlabs.com/image/v1/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });

            // Parse response safely
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await response.json();
                return res.status(response.status).json(data);
            } else {
                // If Topaz returns text (e.g. 404 or 401 HTML), return it as error
                const text = await response.text();
                console.error(`[Topaz Proxy] Non-JSON Response: ${text}`);
                return res.status(response.status).json({ error: `Topaz Error: ${text}` });
            }

        } catch (error) {
            console.error(`[Topaz Proxy] Exception:`, error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).send("Method Not Allowed");
};