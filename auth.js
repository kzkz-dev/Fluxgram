import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDocs,
  query,
  collection,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { State } from "./state.js";
import { UI } from "./ui.js";

async function isUsernameUnique(username, currentUsername = null) {
  const u = username.toLowerCase().replace("@", "");
  if (currentUsername && u === currentUsername.toLowerCase().replace("@", "")) return true;

  const qUsers = query(collection(db, "users"), where("searchKey", "==", u));
  const qChats = query(collection(db, "chats"), where("searchKey", "==", u));
  const [sU, sC] = await Promise.all([getDocs(qUsers), getDocs(qChats)]);
  return sU.empty && sC.empty;
}

export const AuthModule = {
  async login() {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value.trim();
    if (!email || !password) return UI.toast("Enter email and password", "error");

    UI.loader(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      UI.toast("Invalid credentials.", "error");
      UI.loader(false);
    }
  },

  async signup() {
    const username = document.getElementById("signup-username")?.value.trim().replace("@", "");
    const email = document.getElementById("signup-email")?.value.trim();
    const password = document.getElementById("signup-password")?.value.trim();

    if (!username || !email || password.length < 6) {
      return UI.toast("Fill all fields. Password min 6 chars.", "error");
    }

    UI.loader(true);
    try {
      if (!(await isUsernameUnique(username))) throw new Error("Username already taken.");

      const res = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", res.user.uid), {
        uid: res.user.uid,
        email,
        username,
        searchKey: username.toLowerCase(),
        name: username,
        bio: "Available on Fluxgram",
        photoURL: null,
        isOnline: true,
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp(),
        settings: {
          theme: "dark",
          wallpaper: "default-dark"
        }
      });

      UI.toast("Account created successfully!");
    } catch (err) {
      UI.toast(err.message, "error");
    } finally {
      UI.loader(false);
    }
  },

  async reset() {
    const email = document.getElementById("reset-email")?.value.trim();
    if (!email) return UI.toast("Enter email", "error");

    try {
      await sendPasswordResetEmail(auth, email);
      UI.toast("Password reset link sent!", "success");
      UI.toggleForms("login");
    } catch (err) {
      UI.toast(err.message, "error");
    }
  },

  async logout() {
    UI.loader(true);
    if (auth.currentUser) {
      await setDoc(doc(db, "users", auth.currentUser.uid), {
        isOnline: false,
        lastSeen: serverTimestamp()
      }, { merge: true });
    }
    await signOut(auth);
  },

  async changeEmail() {
    const pass = document.getElementById("email-change-password")?.value;
    const newEmail = document.getElementById("email-change-new")?.value.trim();
    if (!pass || !newEmail) return UI.toast("Enter password and new email", "error");

    UI.loader(true);
    try {
      const credential = EmailAuthProvider.credential(State.currentUser.email, pass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updateEmail(auth.currentUser, newEmail);
      await setDoc(doc(db, "users", State.currentUser.uid), { email: newEmail }, { merge: true });
      UI.toast("Email updated successfully!", "success");
      document.getElementById("email-change-modal")?.classList.add("hidden");
    } catch {
      UI.toast("Error: Incorrect password or invalid email.", "error");
    } finally {
      UI.loader(false);
    }
  }
};