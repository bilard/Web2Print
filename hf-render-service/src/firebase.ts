import { initializeApp, applicationDefault, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'web2print-6fe5a';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`;

let app: App | undefined;

function getApp(): App {
  if (!app) {
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    app = initializeApp({
      credential: saPath ? cert(saPath) : applicationDefault(),
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }
  return app;
}

export const auth = () => getAuth(getApp());
export const firestore = () => getFirestore(getApp());
export const storage = () => getStorage(getApp());
export const bucket = () => storage().bucket();
