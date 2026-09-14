import {
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIREBASE_PROJECT_ID) {
  throw new Error('Add FIREBASE_PROJECT_ID to server/.env.');
}

const app = getApps().length ? getApp() : initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

export const firebaseAuth = getAuth(app);