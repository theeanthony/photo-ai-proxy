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

        // 🔍 DEBUG LOG 1: Incoming Request
        console.log("🔹 [POST] Incoming Request:", {
            uid: uid,
            endpoint: endpoint,
            source_url: source_url ? (source_url.substring(0, 40) + "...") : "MISSING",
            params: otherParams
        });

        if (!endpoint || !source_url) {
            console.error("❌ Missing required params");
            return res.status(400).json({ error: "Missing required params" });
        }

        try {
            // 2. READ USER STATE
            const userRef = db.collection('users').doc(uid);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
            
            const userData = userDoc.data();
            const isUnlimited = userData.subscriptionStatus === 'Unlimited';
            const cost = calculateCost(endpoint, otherParams);

            // =================================================
            // 💎 CALL Rez API (Topaz)
            // =================================================

            const form = new FormData();
            
            // 🔍 DEBUG LOG 2: Key Mapping Logic
            // Generative endpoints require 'input_uri', standard use 'source_url'
            const isGenerative = endpoint.includes('enhance-gen');
            const fileParamKey = isGenerative ? 'input_uri' : 'source_url';
            
            console.log(`🛠️ Mapping Logic: IsGenerative=${isGenerative}, Key=${fileParamKey}`);
            
            // Append the file URL with the correct key
            form.append(fileParamKey, source_url);
            
            // Append other params
            console.log("📦 Appending Parameters:");
            for (const [key, value] of Object.entries(otherParams)) {
                // Filter logic
                if (key !== 'estimated_mp' && key !== 'input_uri') {
                    console.log(`   + ${key}: ${value}`);
                    form.append(key, String(value));
                } else {
                    console.log(`   - Skipped: ${key}`);
                }
            }

            // 3. Send
            console.log(`🚀 Sending to: ${BASE_URL}/${endpoint}`);
            
            const response = await fetch(`${BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Accept': 'application/json',
                    ...form.getHeaders()
                },
                body: form
            });

            const data = await response.json();
            
            // 🔍 DEBUG LOG 3: Response
            if (!response.ok) {
                 console.error("❌ Topaz API Error Response:", JSON.stringify(data, null, 2));
                 return res.status(response.status).json(data);
            }

            console.log("✅ Topaz Success:", data.process_id);

            // =================================================
            // 💰 ATOMIC DEDUCTION
            // =================================================
            await userRef.update({
                lastRequestTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                credits: isUnlimited ? admin.firestore.FieldValue.increment(0) : admin.firestore.FieldValue.increment(-cost),
                lifetime_generations: admin.firestore.FieldValue.increment(1)
            });

            return res.status(200).json(data);

        } catch (error) {
            console.error("🔥 Proxy Exception:", error);
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