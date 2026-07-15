import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

let app: any = null;

if (getApps().length === 0) {
  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.warn('Firebase Admin environment variables are missing. Initialization skipped.');
  } else {
    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
      }),
      storageBucket,
    });
  }
} else {
  app = getApps()[0];
}

export const db = app ? getFirestore(app) : null!;
export const bucket = app ? getStorage(app).bucket() : null!;
