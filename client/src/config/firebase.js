import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyC9ZIxTc2yZSI8-4igVjM1VqZH1Ix51LFM',
  authDomain: 'nutrichat-5b54d.firebaseapp.com',
  projectId: 'nutrichat-5b54d',
  appId: '1:669772882896:web:d23b9ba468ec8e83c4cfd5',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);