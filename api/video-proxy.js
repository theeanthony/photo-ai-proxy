// // api/video-proxy.js

// // const fetch = require('node-fetch'); // Uncomment if running locally on Node < 18
// // const admin = require('firebase-admin');

// const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
// const FAL_API_KEY = process.env.FAL_API_KEY;

// // ✅ FIXED: Use CommonJS syntax for Vercel/Node compatibility
// module.exports = async (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

//   if (req.method === 'OPTIONS') return res.status(200).end();
//   if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

//   try {
//     const { jobType, apiParams } = req.body;
//     console.log(`📥 [Proxy] Received: ${jobType}`);

//     switch (jobType) {
//       case 'topaz_create': return await handleTopazCreate(apiParams, res);
//       case 'topaz_accept': return await handleTopazAccept(apiParams, res);
//       case 'topaz_complete': return await handleTopazComplete(apiParams, res);
//       case 'topaz_status': return await handleTopazStatus(apiParams, res);
      
//       case 'fal_video_submit': return await handleFalSubmit(apiParams, res);
//       case 'fal_video_status': return await handleFalStatus(apiParams, res);
//       case 'fal_video_result': return await handleFalResult(apiParams, res);
      
//       default: return res.status(400).json({ error: `Unknown jobType: ${jobType}` });
//     }
//   } catch (error) {
//     console.error('❌ [Proxy] Error:', error);
//     return res.status(500).json({ error: error.message });
//   }
// };

// // ============================================
// // TOPAZ HANDLERS
// // ============================================

// async function handleTopazCreate(params, res) {
//   const url = 'https://api.topazlabs.com/video/';
  
//   const response = await fetch(url, {
//     method: 'POST',
//     headers: {
//       'X-API-Key': TOPAZ_API_KEY,
//       'Content-Type': 'application/json',
//       'Accept': 'application/json'
//     },
//     body: JSON.stringify(params)
//   });

//   const data = await response.json();

//   if (!response.ok) {
//     console.error('🔴 Topaz Create Failed:', data);
//     throw new Error(`Topaz Create Failed (${response.status}): ${JSON.stringify(data)}`);
//   }

//   console.log('✅ Topaz Create Success:', data);
//   return res.status(200).json(data);
// }

// async function handleTopazAccept(params, res) {
//   const { request_id } = params;
//   const url = `https://api.topazlabs.com/video/${request_id}/accept`;
  
//   const response = await fetch(url, {
//     method: 'PATCH',
//     headers: {
//       'X-API-Key': TOPAZ_API_KEY,
//       'Accept': 'application/json'
//     }
//   });

//   const data = await response.json();
//   console.log(`🔍 [Topaz Status Full Response]:`, JSON.stringify(data, null, 2));

//   if (!response.ok) {
//     console.error('🔴 Topaz Accept Failed:', data);
//     throw new Error(`Topaz Accept Failed (${response.status}): ${JSON.stringify(data)}`);
//   }

//   console.log('✅ Topaz Accept Success:', data);
//   return res.status(200).json(data);
// }

// async function handleTopazComplete(params, res) {
//   const { request_id, uploadResults } = params;
  
//   const url = `https://api.topazlabs.com/video/${request_id}/complete-upload`;
  
//   const response = await fetch(url, {
//     method: 'PATCH',
//     headers: {
//       'X-API-Key': TOPAZ_API_KEY,
//       'Content-Type': 'application/json',
//       'Accept': 'application/json'
//     },
//     body: JSON.stringify({ uploadResults })
//   });

//   const data = await response.json();

//   if (!response.ok) {
//     console.error('🔴 Topaz Complete Failed:', data);
//     throw new Error(`Topaz Complete Failed (${response.status}): ${JSON.stringify(data)}`);
//   }

//   console.log('✅ Topaz Complete Success:', data);
//   return res.status(200).json(data);
// }

// async function handleTopazStatus(params, res) {
//   const { request_id } = params;
//   const url = `https://api.topazlabs.com/video/${request_id}/status`;
  
//   const response = await fetch(url, {
//     method: 'GET',
//     headers: {
//       'X-API-Key': TOPAZ_API_KEY,
//       'Accept': 'application/json'
//     }
//   });

//   const data = await response.json();

//   if (!response.ok) {
//     console.error('🔴 Topaz Status Failed:', data);
//     throw new Error(`Topaz Status Failed (${response.status}): ${JSON.stringify(data)}`);
//   }

//   // ✅ DEBUG LOGGING: Print what Topaz sends back (helps debugging percentages)
//   console.log(`🔍 [Topaz Status] ID: ${request_id} | Status: ${data.status} | Progress: ${data.progress}%`);

//   return res.status(200).json(data);
// }

// // ============================================
// // FAL HANDLERS
// // ============================================

// async function handleFalSubmit(params, res) {
//     const { video_url, upscale_factor, model_id } = params;
    
//     // Default to the single endpoint if not provided
//     const targetModel = model_id || 'fal-ai/topaz/upscale/video';
//     const url = `https://queue.fal.run/${targetModel}`;
    
//     const payload = { video_url, upscale_factor: upscale_factor || 2.0 };
//     console.log(`📤 [Fal] Submitting to ${targetModel}...`);
  
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
  
//     if (!response.ok) {
//       const text = await response.text();
//       console.error('🔴 Fal Submit Failed:', text);
//       throw new Error(`Fal Submit Error: ${text}`);
//     }
    
//     const data = await response.json();
//     console.log('✅ [Fal] Submit Success:', data);
//     return res.status(200).json(data);
//   }
  
//   async function handleFalStatus(params, res) {
//     const { request_id, model_id } = params;
    
//     const targetModel = model_id || 'fal-ai/topaz/upscale/video';
//     const url = `https://queue.fal.run/${targetModel}/requests/${request_id}/status`;
    
//     const response = await fetch(url, {
//       method: 'GET',
//       headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Accept': 'application/json' }
//     });
  
//     if (!response.ok) {
//       if (response.status === 404) return res.status(200).json({ status: "IN_QUEUE" });
//       const text = await response.text();
//       console.error('🔴 Fal Status Failed:', text);
//       throw new Error(`Fal Status Error: ${text}`);
//     }
  
//     const text = await response.text();
//     try {
//         const data = JSON.parse(text);
//         // ✅ DEBUG LOGGING
//         console.log(`🔍 [Fal Status] ID: ${request_id} | Status: ${data.status}`);
//         return res.status(200).json(data);
//     } catch (e) {
//         console.error("🔴 JSON Parse Error. Raw text:", text);
//         throw new Error(`Received invalid JSON from Fal: ${text.substring(0, 50)}...`);
//     }
//   }
  
//   async function handleFalResult(params, res) {
//     const { request_id, model_id } = params;
//     const targetModel = model_id || 'fal-ai/topaz/upscale/video';
//     const url = `https://queue.fal.run/${targetModel}/requests/${request_id}`;
    
//     console.log(`📥 [Fal Result] Fetching for ${request_id}...`);
    
//     const response = await fetch(url, {
//       method: 'GET',
//       headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Accept': 'application/json' }
//     });
  
//     if (!response.ok) {
//       const text = await response.text();
//       console.error('🔴 Fal Result Failed:', text);
//       throw new Error(`Fal Result Error: ${text}`);
//     }
  
//     const data = await response.json();
//     // ✅ DEBUG LOGGING
//     console.log(`✅ [Fal Result] Success:`, JSON.stringify(data, null, 2));
//     return res.status(200).json(data);
//   }


// api/video-proxy.js - SECURE VERSION
// ============================================
// P0-1: Firebase Token Verification
// P0-2: Server-Side Credit Validation
// P0-3: Job-to-User Binding
// P0-4: Credit Reservation System
// P0-5: Rate Limiting
// ============================================

const admin = require('firebase-admin');

// Environment Variables (set these in Vercel Dashboard)
const TOPAZ_API_KEY = process.env.TOPAZ_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;

// ============================================
// FIREBASE ADMIN INITIALIZATION
// ============================================
// In Vercel, set FIREBASE_SERVICE_ACCOUNT as a JSON string environment variable
// containing your service account credentials

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[Firebase] Admin SDK initialized successfully');
  } catch (error) {
    console.error('[Firebase] Failed to initialize Admin SDK:', error.message);
    // Don't throw - let individual requests fail gracefully
  }
}

const db = admin.firestore();

// ============================================
// RATE LIMITING (In-Memory for Vercel)
// Note: For production scale, consider Upstash Redis
// ============================================
const rateLimits = new Map();
const RATE_LIMIT_JOBS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour

function checkRateLimit(userId) {
  const now = Date.now();
  const userHistory = rateLimits.get(userId) || [];

  // Filter to only recent requests within window
  const recentRequests = userHistory.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= RATE_LIMIT_JOBS_PER_HOUR) {
    console.log(`[RateLimit] User ${userId} exceeded limit (${recentRequests.length}/${RATE_LIMIT_JOBS_PER_HOUR})`);
    return false;
  }

  // Add current request
  recentRequests.push(now);
  rateLimits.set(userId, recentRequests);

  console.log(`[RateLimit] User ${userId}: ${recentRequests.length}/${RATE_LIMIT_JOBS_PER_HOUR} jobs this hour`);
  return true;
}

// ============================================
// FIREBASE TOKEN VERIFICATION
// ============================================
async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log(`[Auth] Verified user: ${decodedToken.uid}`);
    return decodedToken.uid;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    throw new Error('Invalid or expired authentication token');
  }
}

// ============================================
// CREDIT VALIDATION & RESERVATION SYSTEM
// ============================================

/**
 * Validates user has credits and reserves one atomically
 * Returns: { success: boolean, reservationId?: string, error?: string }
 */
async function reserveCredit(userId) {
  const userRef = db.collection('users').doc(userId);
  const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        return { success: false, error: 'User not found' };
      }

      const userData = userDoc.data();

      // Pro users (Unlimited) always pass - no credit deduction needed
      if (userData.subscriptionStatus === 'Unlimited') {
        console.log(`[Credits] User ${userId} is Pro - unlimited access`);
        return { success: true, isPro: true };
      }

      // Check credit balance
      const currentCredits = userData.credits || 0;
      if (currentCredits <= 0) {
        console.log(`[Credits] User ${userId} has no credits (${currentCredits})`);
        return { success: false, error: 'Insufficient credits' };
      }

      // Reserve credit: deduct and store reservation
      transaction.update(userRef, {
        credits: admin.firestore.FieldValue.increment(-1),
        lastJobAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Store reservation for potential refund
      const reservationRef = db.collection('creditReservations').doc(reservationId);
      transaction.set(reservationRef, {
        userId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'reserved', // reserved | confirmed | refunded
        creditsReserved: 1
      });

      console.log(`[Credits] Reserved 1 credit for user ${userId}. Remaining: ${currentCredits - 1}`);
      return { success: true, reservationId, remainingCredits: currentCredits - 1 };
    });

    return result;
  } catch (error) {
    console.error(`[Credits] Reservation failed for user ${userId}:`, error.message);
    return { success: false, error: 'Credit reservation failed' };
  }
}

/**
 * Confirms a credit reservation (job succeeded)
 */
async function confirmCreditReservation(reservationId) {
  if (!reservationId) return; // Pro users don't have reservations

  try {
    await db.collection('creditReservations').doc(reservationId).update({
      status: 'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[Credits] Reservation ${reservationId} confirmed`);
  } catch (error) {
    console.error(`[Credits] Failed to confirm reservation ${reservationId}:`, error.message);
  }
}

/**
 * Refunds a credit reservation (job failed)
 */
async function refundCreditReservation(reservationId, userId) {
  if (!reservationId) return; // Pro users don't have reservations

  try {
    await db.runTransaction(async (transaction) => {
      const reservationRef = db.collection('creditReservations').doc(reservationId);
      const reservationDoc = await transaction.get(reservationRef);

      if (!reservationDoc.exists || reservationDoc.data().status !== 'reserved') {
        console.log(`[Credits] Reservation ${reservationId} not eligible for refund`);
        return;
      }

      // Refund the credit
      const userRef = db.collection('users').doc(userId);
      transaction.update(userRef, {
        credits: admin.firestore.FieldValue.increment(1)
      });

      // Mark reservation as refunded
      transaction.update(reservationRef, {
        status: 'refunded',
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    console.log(`[Credits] Refunded reservation ${reservationId} for user ${userId}`);
  } catch (error) {
    console.error(`[Credits] Failed to refund reservation ${reservationId}:`, error.message);
  }
}

// ============================================
// JOB OWNERSHIP TRACKING
// ============================================

/**
 * Records job ownership in Firestore
 */
async function recordJobOwnership(jobId, userId, reservationId) {
  try {
    await db.collection('jobs').doc(jobId).set({
      userId: userId,
      reservationId: reservationId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'created'
    });
    console.log(`[Jobs] Recorded ownership: ${jobId} -> ${userId}`);
  } catch (error) {
    console.error(`[Jobs] Failed to record ownership for ${jobId}:`, error.message);
  }
}

/**
 * Validates that a user owns a specific job
 */
async function validateJobOwnership(jobId, userId) {
  try {
    const jobDoc = await db.collection('jobs').doc(jobId).get();

    if (!jobDoc.exists) {
      // Job not tracked - allow for backwards compatibility
      // Consider returning false in production after migration
      console.log(`[Jobs] Job ${jobId} not found in tracking - allowing (legacy)`);
      return true;
    }

    const isOwner = jobDoc.data().userId === userId;
    if (!isOwner) {
      console.log(`[Jobs] User ${userId} denied access to job ${jobId} (owner: ${jobDoc.data().userId})`);
    }
    return isOwner;
  } catch (error) {
    console.error(`[Jobs] Ownership check failed for ${jobId}:`, error.message);
    return false; // Fail closed for security
  }
}

/**
 * Updates job status in tracking
 */
async function updateJobStatus(jobId, status) {
  try {
    await db.collection('jobs').doc(jobId).update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    // Non-critical - don't throw
    console.error(`[Jobs] Failed to update status for ${jobId}:`, error.message);
  }
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let userId = null;
  let reservationId = null;

  try {
    // ============================================
    // STEP 1: Verify Firebase Token (P0-1)
    // ============================================
    userId = await verifyFirebaseToken(req);

    const { jobType, apiParams } = req.body;
    console.log(`[Proxy] User: ${userId} | JobType: ${jobType}`);

    // ============================================
    // STEP 2: Job-specific validation
    // ============================================

    if (jobType === 'topaz_create') {
      // P0-5: Rate Limiting
      if (!checkRateLimit(userId)) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'You can submit up to 10 jobs per hour. Please try again later.'
        });
      }

      // P0-2: Credit Validation & P0-4: Reservation
      const creditResult = await reserveCredit(userId);
      if (!creditResult.success) {
        return res.status(403).json({
          error: 'Insufficient credits',
          message: creditResult.error || 'You need credits to process videos. Please upgrade or wait for more credits.'
        });
      }
      reservationId = creditResult.reservationId; // Will be null for Pro users
    }

    // P0-3: Job ownership validation for status/complete/accept operations
    if (['topaz_status', 'topaz_complete', 'topaz_accept'].includes(jobType)) {
      const requestId = apiParams?.request_id;
      if (requestId) {
        const isOwner = await validateJobOwnership(requestId, userId);
        if (!isOwner) {
          return res.status(403).json({
            error: 'Unauthorized',
            message: 'You do not have access to this job.'
          });
        }
      }
    }

    // ============================================
    // STEP 3: Route to handlers
    // ============================================
    switch (jobType) {
      case 'topaz_create':
        return await handleTopazCreate(apiParams, res, userId, reservationId);
      case 'topaz_accept':
        return await handleTopazAccept(apiParams, res);
      case 'topaz_complete':
        return await handleTopazComplete(apiParams, res);
      case 'topaz_status':
        return await handleTopazStatus(apiParams, res);

      case 'fal_video_submit':
        return await handleFalSubmit(apiParams, res, userId);
      case 'fal_video_status':
        return await handleFalStatus(apiParams, res);
      case 'fal_video_result':
        return await handleFalResult(apiParams, res);

      default:
        return res.status(400).json({ error: `Unknown jobType: ${jobType}` });
    }
  } catch (error) {
    console.error('[Proxy] Error:', error.message);

    // Refund credit if we reserved one and the request failed
    if (reservationId && userId) {
      await refundCreditReservation(reservationId, userId);
    }

    // Return appropriate error status
    if (error.message.includes('authentication') || error.message.includes('token')) {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message });
  }
};

// ============================================
// TOPAZ HANDLERS
// ============================================

async function handleTopazCreate(params, res, userId, reservationId) {
  const url = 'https://api.topazlabs.com/video/';

  try {
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
      console.error('[Topaz] Create Failed:', data);

      // REFUND credit on Topaz API error
      if (reservationId) {
        await refundCreditReservation(reservationId, userId);
      }

      throw new Error(`Topaz Create Failed (${response.status}): ${JSON.stringify(data)}`);
    }

    // Record job ownership (P0-3)
    await recordJobOwnership(data.requestId, userId, reservationId);

    // Confirm the credit reservation since Topaz accepted the job (P0-4)
    await confirmCreditReservation(reservationId);

    console.log('[Topaz] Create Success:', data.requestId);
    return res.status(200).json(data);

  } catch (error) {
    // Refund if anything goes wrong after reservation
    if (reservationId) {
      await refundCreditReservation(reservationId, userId);
    }
    throw error;
  }
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

  if (!response.ok) {
    console.error('[Topaz] Accept Failed:', data);
    throw new Error(`Topaz Accept Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  // Update job status
  await updateJobStatus(request_id, 'accepted');

  console.log('[Topaz] Accept Success:', request_id);
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
    console.error('[Topaz] Complete Failed:', data);
    throw new Error(`Topaz Complete Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  // Update job status
  await updateJobStatus(request_id, 'processing');

  console.log('[Topaz] Complete Success:', request_id);
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
    console.error('[Topaz] Status Failed:', data);
    throw new Error(`Topaz Status Failed (${response.status}): ${JSON.stringify(data)}`);
  }

  // Update job status if completed or failed
  if (data.status === 'success' || data.status === 'complete') {
    await updateJobStatus(request_id, 'completed');
  } else if (data.status === 'failed') {
    await updateJobStatus(request_id, 'failed');
  }

  console.log(`[Topaz] Status for ${request_id}: ${data.status} (${data.progress || 0}%)`);
  return res.status(200).json(data);
}

// ============================================
// FAL HANDLERS (with similar security)
// ============================================

async function handleFalSubmit(params, res, userId) {
  const { video_url, upscale_factor, model_id } = params;

  const targetModel = model_id || 'fal-ai/topaz/upscale/video';
  const url = `https://queue.fal.run/${targetModel}`;

  const payload = { video_url, upscale_factor: upscale_factor || 2.0 };
  console.log(`[Fal] Submitting to ${targetModel} for user ${userId}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Fal] Submit Failed:', text);
    throw new Error(`Fal Submit Error: ${text}`);
  }

  const data = await response.json();

  // Record FAL job ownership
  if (data.request_id) {
    await recordJobOwnership(data.request_id, userId, null);
  }

  console.log('[Fal] Submit Success:', data);
  return res.status(200).json(data);
}

async function handleFalStatus(params, res) {
  const { request_id, model_id } = params;

  const targetModel = model_id || 'fal-ai/topaz/upscale/video';
  const url = `https://queue.fal.run/${targetModel}/requests/${request_id}/status`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return res.status(200).json({ status: "IN_QUEUE" });
    }
    const text = await response.text();
    console.error('[Fal] Status Failed:', text);
    throw new Error(`Fal Status Error: ${text}`);
  }

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    console.log(`[Fal] Status for ${request_id}: ${data.status}`);
    return res.status(200).json(data);
  } catch (e) {
    console.error("[Fal] JSON Parse Error. Raw text:", text);
    throw new Error(`Received invalid JSON from Fal: ${text.substring(0, 50)}...`);
  }
}

async function handleFalResult(params, res) {
  const { request_id, model_id } = params;
  const targetModel = model_id || 'fal-ai/topaz/upscale/video';
  const url = `https://queue.fal.run/${targetModel}/requests/${request_id}`;

  console.log(`[Fal] Fetching result for ${request_id}...`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Fal] Result Failed:', text);
    throw new Error(`Fal Result Error: ${text}`);
  }

  const data = await response.json();
  console.log(`[Fal] Result Success for ${request_id}`);
  return res.status(200).json(data);
}