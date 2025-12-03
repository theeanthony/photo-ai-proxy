// npm install node-fetch form-data
const fetch = require('node-fetch');
const FormData = require('form-data'); // Required for Node environments
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const BASE_URL = "https://api.topazlabs.com/image/v1";

module.exports = async (req, res) => {
    if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Missing API Key" });

    // 1. Handle POST (Start Job)
    if (req.method === 'POST') {
        // We receive JSON from iOS (URL + Params), which is fine.
        // BUT we must convert it to Multipart/Form-Data for Topaz.
        const { endpoint, source_url, ...otherParams } = req.body;

        if (!endpoint || !source_url) {
            return res.status(400).json({ error: "Missing 'endpoint' or 'source_url'" });
        }

        try {
            // ERROR PREVENTION: The report says "Generative" models (Restore)
            // reject parameters like 'face_enhancement'. We must filter them here or in iOS. 
            
            // 1. Create FormData Object [cite: 7]
            const form = new FormData();
            form.append('source_url', source_url);
            
            // 2. Append other parameters as strings
            for (const [key, value] of Object.entries(otherParams)) {
                // Convert booleans/numbers to strings explicitly 
                form.append(key, String(value));
            }

            // 3. Send to Topaz
            // CRITICAL: Do NOT set 'Content-Type' manually! 
            // The form-data library will generate the correct boundary header. [cite: 6]
            const response = await fetch(`${BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Accept': 'application/json',
                    ...form.getHeaders() // This adds the multipart boundary automatically
                },
                body: form
            });

            const data = await response.json();
            
            if (!response.ok) {
                 console.error("Topaz Error:", data);
                 return res.status(response.status).json(data);
            }

            return res.status(200).json(data);

        } catch (error) {
            console.error("Proxy Exception:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // 2. Handle GET (Status/Download) - Keeps working as before
    if (req.method === 'GET') {
        const { processId, action } = req.query;
        const endpointType = action === 'download' ? 'download' : 'status';
        const url = `${BASE_URL}/${endpointType}/${processId}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'X-API-Key': TOPAZ_API_KEY,
                'Accept': 'application/json'
            }
        });
        
        // If download, pipe the image
        if (action === 'download' && response.ok) {
             const contentType = response.headers.get("content-type");
             if (contentType && contentType.includes("image")) {
                 res.setHeader("Content-Type", contentType);
                 response.body.pipe(res);
                 return;
             }
        }

        const data = await response.json();
        return res.status(response.status).json(data);
    }
}; 