// api/video-proxy.js

// const fetch = require('node-fetch');
// const admin = require('firebase-admin');

// // 1. INITIALIZE FIREBASE (Reuse existing logic)
// if (!admin.apps.length) {
//     if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//         const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//         admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
//     } else {
//         console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON missing");
//     }
// }

// // 2. CONFIG
// // api/video-proxy.js
// // FIXED VERSION - Corrects Topaz URL structure and Fal endpoint handling

const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobType, apiParams, userId } = req.body;

    console.log(`📥 [Proxy] Received: ${jobType}`, JSON.stringify(apiParams, null, 2));

    // Route to appropriate handler
    switch (jobType) {
      // ============ TOPAZ HANDLERS ============
      case 'topaz_create':
        return await handleTopazCreate(apiParams, res);
      
      case 'topaz_accept':
        return await handleTopazAccept(apiParams, res);
      
      case 'topaz_complete':
        return await handleTopazComplete(apiParams, res);
      
      case 'topaz_status':
        return await handleTopazStatus(apiParams, res);

      // ============ FAL HANDLERS ============
      case 'fal_video_submit':
        return await handleFalSubmit(apiParams, res);
      
      case 'fal_video_status':
        return await handleFalStatus(apiParams, res);
      
      case 'fal_video_result':
        return await handleFalResult(apiParams, res);

      default:
        return res.status(400).json({ error: `Unknown jobType: ${jobType}` });
    }

  } catch (error) {
    console.error('❌ [Proxy] Error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
}

// ============================================
// TOPAZ HANDLERS (FIXED)
// ============================================

async function handleTopazCreate(params, res) {
  // ✅ FIXED: Correct URL structure (no /v1/requests)
  const url = 'https://api.topazlabs.com/video/';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': TOPAZ_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Topaz Create Failed:', data);
    throw new Error(`Topaz Create Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Topaz Create Success:', data);
  return res.status(200).json(data);
}

async function handleTopazAccept(params, res) {
  const { request_id } = params;
  
  // ✅ FIXED: Use PATCH not POST (per Topaz docs)
  const url = `https://api.topazlabs.com/video/${request_id}/accept`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'X-API-Key': TOPAZ_API_KEY,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Topaz Accept Failed:', data);
    throw new Error(`Topaz Accept Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Topaz Accept Success:', data);
  return res.status(200).json(data);
}

async function handleTopazComplete(params, res) {
  const { request_id, uploadResults } = params;
  
  // ✅ FIXED: Correct endpoint name
  const url = `https://api.topazlabs.com/video/${request_id}/complete-upload`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'X-API-Key': TOPAZ_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ uploadResults })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Topaz Complete Failed:', data);
    throw new Error(`Topaz Complete Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Topaz Complete Success:', data);
  return res.status(200).json(data);
}

async function handleTopazStatus(params, res) {
  const { request_id } = params;
  
  const url = `https://api.topazlabs.com/video/${request_id}/status`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': TOPAZ_API_KEY,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Topaz Status Failed:', data);
    throw new Error(`Topaz Status Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return res.status(200).json(data);
}

// ============================================
// FAL HANDLERS (FIXED)
// ============================================

async function handleFalSubmit(params, res) {
  const { endpoint, video_url, upscale_factor, target_fps } = params;
  
  // ✅ FIXED: Use endpoint parameter from iOS
  const falEndpoint = endpoint || 'fal-ai/topaz/upscale/video';

  // ✅ FIXED: Correct Fal API URL structure
  const url = `https://queue.fal.run/${falEndpoint}`;
  
  const payload = {
    video_url,
    upscale_factor: upscale_factor || 2
  };
  
  // Add optional parameters
  if (target_fps) {
    payload.target_fps = target_fps;
  }

  console.log('📤 [Fal] Submitting to:', url, payload);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Fal Submit Failed:', data);
    throw new Error(`Fal Submit Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Fal Submit Success:', data);
  
  // ✅ Fal returns { request_id: "..." }
  return res.status(200).json({ 
    request_id: data.request_id 
  });
}

async function handleFalStatus(params, res) {
  const { request_id } = params;
  
  // ✅ FIXED: Correct status endpoint
  const url = `https://queue.fal.run/fal-ai/fast-video-upscaler/requests/${request_id}/status`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Fal Status Failed:', data);
    throw new Error(`Fal Status Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return res.status(200).json(data);
}

async function handleFalResult(params, res) {
  const { request_id } = params;
  
  // ✅ FIXED: Correct result endpoint
  const url = `https://queue.fal.run/fal-ai/fast-video-upscaler/requests/${request_id}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('🔴 Fal Result Failed:', data);
    throw new Error(`Fal Result Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return res.status(200).json(data);
}