import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

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
    });
  }
} else {
  app = getApps()[0];
}

export const db = app ? getFirestore(app) : null!;
