// On your Vercel Server (e.g., /api/vertex-remove-object.js)

const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const clientOptions = {
  apiEndpoint: 'us-central1-aiplatform.googleapis.com',
};

// Instantiates a client
const predictionServiceClient = new PredictionServiceClient(clientOptions);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Get the base64 strings from the request body
  const { image_base64, mask_base64 } = req.body;

  if (!image_base64 || !mask_base64) {
    return res.status(400).json({ error: 'Missing image or mask data.' });
  }

  // Construct the request for the Vertex AI API
  const endpoint = `projects/YOUR_PROJECT_ID/locations/us-central1/publishers/google/models/imagegeneration@006`;

  const instance = {
    prompt: '', // Prompt is empty for object removal
    image: { bytesBase64Encoded: image_base64 },
    mask: { image: { bytesBase64Encoded: mask_base64 } },
  };

  const parameters = {
    sampleCount: 1,
    editMode: 'inpaint-removal',
  };

  const request = {
    endpoint,
    instances: [instance],
    parameters,
  };

  try {
    // Make the call to the Vertex AI API
    const [response] = await predictionServiceClient.predict(request);
    const predictions = response.predictions;
    
    // Send the resulting image back to the app
    const finalImageBase64 = predictions[0].structValue.fields.bytesBase64Encoded.stringValue;
    res.status(200).json({ image_base64: finalImageBase64 });

  } catch (error) {
    console.error('Error calling Vertex AI:', error);
    res.status(500).json({ error: 'Failed to process image with Vertex AI.' });
  }
}
