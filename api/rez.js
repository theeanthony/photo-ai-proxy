// npm install node-fetch form-data firebase-admin
const fetch = require('node-fetch');
const FormData = require('form-data');
const admin = require('firebase-admin');

// 1. INITIALIZE FIREBASE
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON missing");
    }
}

const db = admin.firestore();
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const BASE_URL = "https://api.topazlabs.com/image/v1";

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
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Server Config Error" });

    // AUTH CHECK
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
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
    // 🚀 HANDLE POST
    // =========================================================
    if (req.method === 'POST') {
        const { endpoint, source_url, ...otherParams } = req.body;

        if (!endpoint || !source_url) {
            return res.status(400).json({ error: "Missing required params" });
        }

        try {
            // 1. COST CALCULATION
            const userRef = db.collection('users').doc(uid);
            const userDoc = await userRef.get();
            if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
            
            const userData = userDoc.data();
            const isUnlimited = userData.subscriptionStatus === 'Unlimited';
            const cost = calculateCost(endpoint, otherParams);

            // 2. PREPARE FORM DATA
            // Documentation confirms source_url works with multipart/form-data
            const form = new FormData();
            
            // ✅ Fix: Use 'source_url' as documented
            form.append('source_url', source_url);
            
            // Append other parameters
            for (const [key, value] of Object.entries(otherParams)) {
                if (key !== 'estimated_mp' && key !== 'input_uri') {
                    form.append(key, String(value));
                }
            }
            
            console.log(`🚀 Sending to: ${BASE_URL}/${endpoint}`);

            // 3. SEND REQUEST
            // 🚨 CRITICAL FIX: Do NOT manually set 'Content-Type': 'multipart/form-data'
            // The ...form.getHeaders() call automatically sets the correct Content-Type 
            // AND the boundary string (e.g. "multipart/form-data; boundary=---123"). 
            // Setting it manually overwrites the boundary, causing the API to see an empty body.
            
            const response = await fetch(`${BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': TOPAZ_API_KEY,
                    'Accept': 'application/json',
                    ...form.getHeaders() // <--- THIS is the magic line
                },
                body: form
            });

            const data = await response.json();

            if (!response.ok) {
                 console.error("❌ Topaz Error:", JSON.stringify(data));
                 return res.status(response.status).json(data);
            }

            // 4. DEDUCT CREDITS
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
    // 📡 HANDLE GET
    // =========================================================
    if (req.method === 'GET') {
        const { processId, action } = req.query;
        if (!processId) return res.status(400).json({ error: "Missing processId" });
        
        const endpointType = action === 'download' ? 'download' : 'status';
        try {
            const response = await fetch(`${BASE_URL}/${endpointType}/${processId}`, {
                method: 'GET',
                headers: { 'X-API-Key': TOPAZ_API_KEY, 'Accept': 'application/json' }
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