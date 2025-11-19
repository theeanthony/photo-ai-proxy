const fetch = require('node-fetch');
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;

module.exports = async (req, res) => {
    if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Missing API Key" });

    // 1. GET: Check Status
    if (req.method === 'GET') {
        const { processId } = req.query;
        if (!processId) return res.status(400).json({ error: "Missing processId" });

        try {
            // Usually: https://api.topazlabs.com/image/v1/processing/{id} OR /jobs/{id}
            // We default to 'processing' or 'status' based on your API docs. 
            // If Topaz returns the download URL here, we don't need a separate download action.
            const topazUrl = `https://api.topazlabs.com/image/v1/processing/${processId}`;
            
            const response = await fetch(topazUrl, {
                headers: { 'X-API-Key': TOPAZ_API_KEY }
            });
            
            // Forward the status code (404, 200, etc)
            if (!response.ok) {
                const txt = await response.text();
                return res.status(response.status).json({ error: txt });
            }

            const data = await response.json();
            return res.status(200).json(data);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 2. POST: Start Job
    if (req.method === 'POST') {
        try {
            const { endpoint, ...params } = req.body; 
            if (!endpoint) return res.status(400).json({ error: "Missing 'endpoint'" });

            console.log(`Forwarding to Topaz Endpoint: ${endpoint}`);

            const response = await fetch(`https://api.topazlabs.com/image/v1/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });

            const data = await response.json();
            return res.status(response.status).json(data);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).send("Method Not Allowed");
};