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
        
        // --- THIS IS THE FIX ---
        // Changed "gemini-1.5-pro-latest" to the correct API model name "gemini-1.5-pro"
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        // --- END OF FIX ---

        // 3. PREPARE THE MULTIMODAL PROMPT
        const prompt = "You are an expert image analyst. You will receive two images: an original photo and a corresponding mask. Your task is to identify and describe the primary object or person in the original photo that is located within the white area of the mask. Provide a concise, simple description. Examples: 'a brown dog', 'a man wearing a red hat', 'the blue car'.";

        // Fetch and convert images
        const imageParts = await Promise.all([
            urlToGenerativePart(image_url, "image/jpeg"),
            urlToGenerativePart(mask_url, "image/png")
        ]);

        const promptParts = [
            { text: prompt },
            ...imageParts
        ];
        
        // 4. CALL THE GEMINI API
        console.log("Calling Gemini API to describe masked object...");
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
