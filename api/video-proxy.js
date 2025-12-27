// api/video-proxy.js

// const fetch = require('node-fetch'); // Uncomment if running locally on Node < 18
// const admin = require('firebase-admin');

const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;

// ✅ FIXED: Use CommonJS syntax for Vercel/Node compatibility
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { jobType, apiParams } = req.body;
    console.log(`📥 [Proxy] Received: ${jobType}`);

    switch (jobType) {
      case 'topaz_create': return await handleTopazCreate(apiParams, res);
      case 'topaz_accept': return await handleTopazAccept(apiParams, res);
      case 'topaz_complete': return await handleTopazComplete(apiParams, res);
      case 'topaz_status': return await handleTopazStatus(apiParams, res);
      
      case 'fal_video_submit': return await handleFalSubmit(apiParams, res);
      case 'fal_video_status': return await handleFalStatus(apiParams, res);
      case 'fal_video_result': return await handleFalResult(apiParams, res);
      
      default: return res.status(400).json({ error: `Unknown jobType: ${jobType}` });
    }
  } catch (error) {
    console.error('❌ [Proxy] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================
// TOPAZ HANDLERS
// ============================================

async function handleTopazCreate(params, res) {
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
  const url = `https://api.topazlabs.com/video/${request_id}/accept`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'X-API-Key': TOPAZ_API_KEY,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();
  console.log(`🔍 [Topaz Status Full Response]:`, JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.error('🔴 Topaz Accept Failed:', data);
    throw new Error(`Topaz Accept Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Topaz Accept Success:', data);
  return res.status(200).json(data);
}

async function handleTopazComplete(params, res) {
  const { request_id, uploadResults } = params;
  
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

  // ✅ DEBUG LOGGING: Print what Topaz sends back (helps debugging percentages)
  console.log(`🔍 [Topaz Status] ID: ${request_id} | Status: ${data.status} | Progress: ${data.progress}%`);

  return res.status(200).json(data);
}

// ============================================
// FAL HANDLERS
// ============================================

async function handleFalSubmit(params, res) {
    const { video_url, upscale_factor, model_id } = params;
    
    // Default to the single endpoint if not provided
    const targetModel = model_id || 'fal-ai/topaz/upscale/video';
    const url = `https://queue.fal.run/${targetModel}`;
    
    const payload = { video_url, upscale_factor: upscale_factor || 2.0 };
    console.log(`📤 [Fal] Submitting to ${targetModel}...`);
  
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  
    if (!response.ok) {
      const text = await response.text();
      console.error('🔴 Fal Submit Failed:', text);
      throw new Error(`Fal Submit Error: ${text}`);
    }
    
    const data = await response.json();
    console.log('✅ [Fal] Submit Success:', data);
    return res.status(200).json(data);
  }
  
  async function handleFalStatus(params, res) {
    const { request_id, model_id } = params;
    
    const targetModel = model_id || 'fal-ai/topaz/upscale/video';
    const url = `https://queue.fal.run/${targetModel}/requests/${request_id}/status`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Accept': 'application/json' }
    });
  
    if (!response.ok) {
      if (response.status === 404) return res.status(200).json({ status: "IN_QUEUE" });
      const text = await response.text();
      console.error('🔴 Fal Status Failed:', text);
      throw new Error(`Fal Status Error: ${text}`);
    }
  
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        // ✅ DEBUG LOGGING
        console.log(`🔍 [Fal Status] ID: ${request_id} | Status: ${data.status}`);
        return res.status(200).json(data);
    } catch (e) {
        console.error("🔴 JSON Parse Error. Raw text:", text);
        throw new Error(`Received invalid JSON from Fal: ${text.substring(0, 50)}...`);
    }
  }
  
  async function handleFalResult(params, res) {
    const { request_id, model_id } = params;
    const targetModel = model_id || 'fal-ai/topaz/upscale/video';
    const url = `https://queue.fal.run/${targetModel}/requests/${request_id}`;
    
    console.log(`📥 [Fal Result] Fetching for ${request_id}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Accept': 'application/json' }
    });
  
    if (!response.ok) {
      const text = await response.text();
      console.error('🔴 Fal Result Failed:', text);
      throw new Error(`Fal Result Error: ${text}`);
    }
  
    const data = await response.json();
    // ✅ DEBUG LOGGING
    console.log(`✅ [Fal Result] Success:`, JSON.stringify(data, null, 2));
    return res.status(200).json(data);
  }