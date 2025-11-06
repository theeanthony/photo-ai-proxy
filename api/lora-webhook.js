// Create new file: /api/lora-webhook.js
const admin = require('../lib/firebase-admin');

/**
 * This endpoint receives the asynchronous callback from Fal.ai
 * when LoRA training is complete.
 */
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 1. Get context from query params (that we sent in Step 5)
        const { userId, characterId, triggerWord } = req.query;
        
        if (!userId || !characterId || !triggerWord) {
            console.error('[WEBHOOK] Missing query params:', req.query);
            return res.status(400).send('Missing required query parameters.');
        }

        // 2. Get the LoRA URL from the Fal.ai POST body
        // Fal sends the result in the body. It looks like:
        // { "model_url": "https://...", "trigger": "..." }
        const falResult = req.body;
        const loraUrl = falResult?.model_url;

        if (!loraUrl) {
            console.error('[WEBHOOK] Fal.ai response body did not contain model_url:', falResult);
            // Update Firestore to "failed"
            const db = admin.firestore();
            const charRef = db.collection('users').document(userId)
                              .collection('characters').document(characterId);
            await charRef.update({ status: 'failed' });
            return res.status(400).send('No model_url in Fal.ai response.');
        }

        console.log(`[WEBHOOK] Success! LoRA for ${characterId} is at: ${loraUrl}`);
        
        // 3. Update the Firestore document
        const db = admin.firestore();
        const charRef = db.collection('users').document(userId)
                          .collection('characters').document(characterId);
                          
        await charRef.update({
            status: 'ready',
            loraUrl: loraUrl,
            triggerWord: triggerWord
        });

        // 4. Send a 200 OK back to Fal.ai
        res.status(200).send('Webhook processed successfully.');

    } catch (error) {
        console.error('[WEBHOOK] Critical error:', error);
        res.status(500).send(`Internal Server Error: ${error.message}`);
    }
};
