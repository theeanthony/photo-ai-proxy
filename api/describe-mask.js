const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Helper function to fetch an image from a URL and convert it to a Google AI GenerativePart
const urlToGenerativePart = async (url, mimeType) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}. Status: ${response.status}`);
    }
    const buffer = await response.buffer();
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. RECEIVE FIREBASE URLS FROM CLIENT
        const { image_url, mask_url, user_id } = req.body;
        if (!image_url || !mask_url || !user_id) {
            return res.status(400).json({ error: 'Missing image_url, mask_url, or user_id' });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not configured');
            return res.status(500).json({ error: 'API key not configured' });
        }

        // 2. INITIALIZE GEMINI CLIENT
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

        // 3. PREPARE THE MULTIMODAL PROMPT
        const prompt = "In one short, simple phrase, describe the primary object or person highlighted in the second image (the mask). Examples: 'a red car', 'a man in a blue shirt', 'the bird on the branch'. Be concise.";

        // Fetch and convert images
        const imageParts = await Promise.all([
            urlToGenerativePart(image_url, "image/jpeg"),
            urlToGenerativePart(mask_url, "image/png")
        ]);

        // --- THIS IS THE FIX ---
        // The text prompt must be wrapped in an object with a 'text' key.
        const promptParts = [
            { text: prompt }, // Correctly formatted text part
            ...imageParts
        ];
        // --- END OF FIX ---


        // 4. CALL THE GEMINI API
        console.log("Calling Gemini API to describe masked object...");
        // The generateContent method can take the parts array directly.
        const result = await model.generateContent(promptParts);
        const response = result.response;
        
        if (!response || !response.candidates || response.candidates.length === 0) {
             throw new Error("Invalid response from Gemini API");
        }
        
        // Extract and clean the text description
        let description = response.text().trim();
        description = description.replace(/^["']|["']$/g, ''); 
        
        console.log(`Gemini generated description: "${description}"`);

        // 5. RESPOND TO THE CLIENT WITH THE DESCRIPTION
        res.status(200).json({
            description: description
        });

    } catch (error) {
        console.error('Server error in /api/describe-mask:', error);
        res.status(500).json({ error: 'An unexpected error occurred.', details: error.message });
    }
};
