import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {getFirestore} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0kd9gUjl1t0wyFV_hWZSrhEyiuAaROgQ",
  authDomain: "daily-split.firebaseapp.com",
  projectId: "daily-split",
  storageBucket: "daily-split.firebasestorage.app",
  messagingSenderId: "569319713656",
  appId: "1:569319713656:web:999112caa8d57f788cf68d",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export default app;
