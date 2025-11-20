// You may need to install these: npm install node-fetch
const fetch = require('node-fetch');
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const BASE_URL = "https://api.topazlabs.com/image/v1";

// Disable Vercel's default body parsing so we can stream the multipart data directly
export const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
    // 1. Security Check
    if (!TOPAZ_API_KEY) {
        return res.status(500).json({ error: "Server Config Error: Missing API Key." });
    }

    // 2. Handle GET Requests (Status & Download)
    if (req.method === 'GET') {
        const { processId, action } = req.query; 

        if (!processId) return res.status(400).json({ error: "Missing processId" });

        // FIX: The report defines the status endpoint as "status", not "processing" [cite: 403]
        // FIX: The report defines the download endpoint as "download" [cite: 421]
        const endpointType = action === 'download' ? 'download' : 'status';
        const topazUrl = `${BASE_URL}/${endpointType}/${processId}`;
        
        try {
            const response = await fetch(topazUrl, {
                method: 'GET',
                headers: { 
                    'X-API-Key': TOPAZ_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            // If it's a download, we might want to pipe the image data back directly
            if (action === 'download' && response.status === 200) {
                 // If Topaz returns the image file directly (rare but possible) or a JSON with URL
                 const contentType = response.headers.get("content-type");
                 if (contentType.includes("image")) {
                     res.setHeader("Content-Type", contentType);
                     response.body.pipe(res);
                     return;
                 }
            }

            const data = await response.json();
            return res.status(response.status).json(data);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 3. Handle POST Requests (Start Job)
    if (req.method === 'POST') {
        // FIX: Do not use JSON.stringify.
        // The iOS app is sending Multipart Form Data[cite: 347].
        // We must pipe the incoming request stream directly to Topaz.
        
        // We need to extract the specific endpoint (e.g., 'enhance', 'sharpen') from the query params
        // because we can't easily read the body without consuming the stream.
        const { endpoint } = req.query; 

        if (!endpoint) {
            return res.status(400).json({ error: "Missing 'endpoint' query param." });
        }

        try {
            const topazUrl = `${BASE_URL}/${endpoint}`;
            
            // Forward the headers (specifically Content-Type with the boundary) from iOS
            const headers = {
                'X-API-Key': TOPAZ_API_KEY,
                'Content-Type': req.headers['content-type'], 
                'Accept': 'application/json'
            };

            const response = await fetch(topazUrl, {
                method: 'POST',
                headers: headers,
                body: req // Pipe the incoming iOS stream directly to Topaz
            });

            const data = await response.json();
            return res.status(response.status).json(data);

        } catch (error) {
            console.error(`[Topaz Proxy] Exception:`, error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).send("Method Not Allowed");
};