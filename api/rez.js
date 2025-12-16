// npm install node-fetch form-data firebase-admin
const fetch = require('node-fetch');
const FormData = require('form-data');
const admin = require('firebase-admin');

// 1. INITIALIZE FIREBASE (Singleton Pattern)
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON missing in Vercel Envs");
    }
}

const db = admin.firestore();
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const BASE_URL = "https://api.topazlabs.com/image/v1";

// --- HELPER: COST CALCULATOR ---
function calculateCost(endpoint, params) {
    if (endpoint.includes('status') || endpoint.includes('download')) return 0;
    const mp = params.estimated_mp || 12.0; 
    if (mp <= 24) return 1;
    if (mp <= 32) return 2;
    if (mp <= 48) return 3;
    if (mp <= 64) return 4;
    if (mp <= 128) return 6;
    if (mp <= 256) return 10;
    return 16;
}

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Server Configuration Error" });

    // =========================================================
    // 🛡️ AUTHENTICATION
    // =========================================================
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized: Missing Token" });
    }
    
    let uid;
    try {
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        return res.status(401).json({ error: "Invalid Token" });
    }

   // =========================================================
    // 🚀 HANDLE POST (START JOB)
    // =========================================================
    if (req.method === 'POST') {
        const { endpoint, source_url, ...otherParams } = req.body;
        const userRef = db.collection('users').doc(uid);
        // 🔍 DEBUG 1: Log Incoming Payload
        console.log("📦 [Proxy] Incoming Payload:", JSON.stringify(req.body, null, 2));

        if (!endpoint || !source_url) {
            return res.status(400).json({ error: "Missing required params" });
        }

        try {
            // 1. Check User Credits
            const userDoc = await userRef.get();
            const userRef = db.collection('users').doc(uid);
            
            const userData = userDoc.exists ? userDoc.data() : {};
            
            const cost = calculateCost(endpoint, otherParams);
            const isUnlimited = userData.subscriptionStatus === "Unlimited";
            const currentCredits = userData.credits || 0;

            if (!isUnlimited && currentCredits < cost) {
                console.warn(`⛔ [Proxy] Insufficient Credits. User: ${currentCredits}, Cost: ${cost}`);
                return res.status(402).json({ error: "Insufficient Credits" });
            }

            // 2. Build FormData
            const form = new FormData();
            form.append('source_url', source_url);
            
            console.log("🛠 [Proxy] Building FormData:");

            for (const [key, value] of Object.entries(otherParams)) {
                if (key === 'estimated_mp') continue;
                
                // Sanitize values
                const cleanValue = String(value);
                
                // 🔍 DEBUG 2: Warn on suspicious values
                if (cleanValue === "undefined" || cleanValue === "null") {
                     console.warn(`⚠️ [Proxy] Skipping dangerous param: ${key} = ${cleanValue}`);
                     continue;
                }

                console.log(`   👉 Appending: ${key} = ${cleanValue}`);
                form.append(key, cleanValue);
            }

            console.log(`🚀 [Proxy] Sending to: ${BASE_URL}/${endpoint}`);

            // 3. Send to Topaz
            const response = await fetch(`${BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Accept': 'application/json',
                    ...form.getHeaders()
                },
                body: form
            });

            // 🔍 DEBUG 3: Inspect Raw Response
            const textResponse = await response.text();
            console.log(`📥 [Proxy] Raw Topaz Response (${response.status}):`, textResponse);

            let data;
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                // If Topaz returns HTML (Cloudflare error) or plain text
                console.error("🔥 [Proxy] Failed to parse JSON response:", textResponse);
                return res.status(response.status).json({ error: "Upstream Error", details: textResponse });
            }
            
            if (!response.ok) {
                 console.error("❌ [Proxy] Topaz API Error:", data);
                 return res.status(response.status).json(data);
            }

            // 4. Deduct Credits
            await userRef.update({
                lastRequestTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                credits: isUnlimited ? admin.firestore.FieldValue.increment(0) : admin.firestore.FieldValue.increment(-cost),
                lifetime_generations: admin.firestore.FieldValue.increment(1)
            });

            return res.status(200).json(data);

        } catch (error) {
            console.error("🔥 [Proxy] Critical Logic Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // =========================================================
    // 📡 HANDLE GET (STATUS / DOWNLOAD)
    // =========================================================
    if (req.method === 'GET') {
        const { processId, action } = req.query;
        if (!processId) return res.status(400).json({ error: "Missing processId" });

        const endpointType = action === 'download' ? 'download' : 'status';
        const url = `${BASE_URL}/${endpointType}/${processId}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 
                    'X-API-Key': TOPAZ_API_KEY,
                    'Accept': 'application/json'
                }
            });

            if (action === 'download' && response.ok) {
                const data = await response.json();
                return res.status(200).json(data);
            }

            const data = await response.json();
            return res.status(response.status).json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
};