// // npm install node-fetch form-data
// const fetch = require('node-fetch');
// const FormData = require('form-data'); // Required for Node environments


// const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
// const BASE_URL = "https://api.topazlabs.com/image/v1";



// module.exports = async (req, res) => {
//     if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Missing API Key" });

//     // 1. Handle POST (Start Job)
//     if (req.method === 'POST') {
//         // We receive JSON from iOS (URL + Params), which is fine.
//         // BUT we must convert it to Multipart/Form-Data for Topaz.
//         const { endpoint, source_url, ...otherParams } = req.body;

//         if (!endpoint || !source_url) {
//             return res.status(400).json({ error: "Missing 'endpoint' or 'source_url'" });
//         }

//         try {
//             // ERROR PREVENTION: The report says "Generative" models (Restore)
//             // reject parameters like 'face_enhancement'. We must filter them here or in iOS. 
            
//             // 1. Create FormData Object [cite: 7]
//             const form = new FormData();
//             form.append('source_url', source_url);
            
//             // 2. Append other parameters as strings
//             for (const [key, value] of Object.entries(otherParams)) {
//                 // Convert booleans/numbers to strings explicitly 
//                 form.append(key, String(value));
//             }

//             // 3. Send to Topaz
//             // CRITICAL: Do NOT set 'Content-Type' manually! 
//             // The form-data library will generate the correct boundary header. [cite: 6]
//             const response = await fetch(`${BASE_URL}/${endpoint}`, {
//                 method: 'POST',
//                 headers: {
//                     'X-API-Key': TOPAZ_API_KEY,
//                     'Accept': 'application/json',
//                     ...form.getHeaders() // This adds the multipart boundary automatically
//                 },
//                 body: form
//             });

//             const data = await response.json();
            
//             if (!response.ok) {
//                  console.error("Topaz Error:", data);
//                  return res.status(response.status).json(data);
//             }

//             return res.status(200).json(data);

//         } catch (error) {
//             console.error("Proxy Exception:", error);
//             return res.status(500).json({ error: error.message });
//         }
//     }

//     // 2. Handle GET (Status/Download) - Keeps working as before
//     if (req.method === 'GET') {
//         const { processId, action } = req.query;
//         const endpointType = action === 'download' ? 'download' : 'status';
//         const url = `${BASE_URL}/${endpointType}/${processId}`;
        
//         const response = await fetch(url, {
//             method: 'GET',
//             headers: { 
//                 'X-API-Key': TOPAZ_API_KEY,
//                 'Accept': 'application/json'
//             }
//         });
        
//         // If download, pipe the image
//         if (action === 'download' && response.ok) {
//              const contentType = response.headers.get("content-type");
//              if (contentType && contentType.includes("image")) {
//                  res.setHeader("Content-Type", contentType);
//                  response.body.pipe(res);
//                  return;
//              }
//         }

//         const data = await response.json();
//         return res.status(response.status).json(data);
//     }
// }; 

// npm install node-fetch form-data firebase-admin
const fetch = require('node-fetch');
const FormData = require('form-data');
const admin = require('firebase-admin');

// 1. INITIALIZE FIREBASE (Singleton Pattern)
// We use a service account passed via Environment Variables in Vercel
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
// Based on Topaz Pricing: <24MP = 1, <64MP = 4, etc. [cite: 42-46]
function calculateCost(endpoint, params) {
    // If not enhancing/upscaling (e.g. status check), cost is 0
    if (endpoint.includes('status') || endpoint.includes('download')) return 0;
    
    // Client must send 'estimated_mp' (Megapixels) in the request body
    // If missing, default to 1 credit (Standard HD image)
    const mp = params.estimated_mp || 12.0; 

    if (mp <= 24) return 1;
    if (mp <= 32) return 2;
    if (mp <= 48) return 3;
    if (mp <= 64) return 4;   // [cite: 46]
    if (mp <= 128) return 6;  // [cite: 48]
    if (mp <= 256) return 10; // [cite: 49]
    return 16;                // Max [cite: 50]
}

module.exports = async (req, res) => {
    // CORS Headers (Allow your app to talk to Vercel)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Lock this to your Bundle ID in prod if possible
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    if (!TOPAZ_API_KEY) return res.status(500).json({ error: "Server Configuration Error" });

    // =========================================================
    // 🛡️ CHOKE POINT 3 FIX: AUTHENTICATION
    // =========================================================
    
    // 1. Validate Token
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

        if (!endpoint || !source_url) {
            return res.status(400).json({ error: "Missing required params" });
        }

        try {
            // 2. READ USER STATE (Credits & Sub)
            const userRef = db.collection('users').doc(uid);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
            
            const userData = userDoc.data();
            const isUnlimited = userData.subscriptionStatus === 'Unlimited';
            const monthlyUsage = userData.monthlyUsage || 0;
            const credits = userData.credits || 0;

            if (isUnlimited && monthlyUsage > 2000) {
                console.log(`🐢 Throttling heavy user: ${uid}`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            // 3. RATE LIMITING (Fair Use)
            const now = Date.now();
            const lastReq = userData.lastRequestTimestamp ? userData.lastRequestTimestamp.toMillis() : 0;
            if (now - lastReq < 2000) { // 2 Seconds Cool-down
                return res.status(429).json({ error: "Please wait a moment before trying again." });
            }

            // 4. CALCULATE COST
            const cost = calculateCost(endpoint, otherParams);
            
            // 5. CREDIT CHECK (Choke Point 1 Fix)
            if (!isUnlimited && credits < cost) {
                return res.status(402).json({ error: "Insufficient credits" });
            }

            // =================================================
            // 💎 CALL Rez API
            // =================================================
            
            // 1. Create FormData [cite: 7]
            const form = new FormData();
            form.append('source_url', source_url);
            
            // 2. Append params (Filtering out our internal params like 'estimated_mp')
            for (const [key, value] of Object.entries(otherParams)) {
                if (key !== 'estimated_mp') {
                    form.append(key, String(value));
                }
            }

            // 3. Send [cite: 6]
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
            
            if (!response.ok) {
                 console.error("Topaz Error:", data);
                 return res.status(response.status).json(data);
            }

            // =================================================
            // 💰 ATOMIC DEDUCTION (Choke Point 2 Fix)
            // =================================================
            // Only runs if Topaz accepted the job (200 OK)
            
            await userRef.update({
                lastRequestTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                // Only deduct if not unlimited
                credits: isUnlimited ? admin.firestore.FieldValue.increment(0) : admin.firestore.FieldValue.increment(-cost),
                lifetime_generations: admin.firestore.FieldValue.increment(1)
            });

            return res.status(200).json(data);

        } catch (error) {
            console.error("Proxy Logic Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // =========================================================
    // 📡 HANDLE GET (STATUS / DOWNLOAD)
    // =========================================================
    // Security Note: Status checks are free, so we just pass them through
    // to avoid slamming Firestore limits on polling.
    
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

            // If downloading, check response
            if (action === 'download' && response.ok) {
                // Topaz returns JSON with a 'url' key, NOT the file bytes directly [cite: 276-282].
                // We forward that JSON to the iOS app so the App downloads the bytes directly.
                // This saves Vercel bandwidth costs.
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