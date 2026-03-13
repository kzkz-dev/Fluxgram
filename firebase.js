import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsbZ1fqDivv8OyUiTcaEMcpZlJlM1TI6Y",
  authDomain: "fluxgram-87009.firebaseapp.com",
  projectId: "fluxgram-87009",
  storageBucket: "fluxgram-87009.firebasestorage.app",
  messagingSenderId: "698836385253",
  appId: "1:698836385253:web:c40e67ee9006cff536830c"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);