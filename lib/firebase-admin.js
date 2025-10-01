const admin = require('firebase-admin');

// Check if the app is already initialized to prevent errors
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
  }
}

module.exports = admin;