import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { State } from "./state.js";
import { UI } from "./ui.js";
import { Utils } from "./utils.js";
import { AuthModule } from "./auth.js";
import { DashboardModule } from "./dashboard.js";
import { ChatModule } from "./chat.js";
import { ProfileModule } from "./profile.js";
import { CallsModule } from "./calls.js";

window.FluxgramV41 = {
  auth: AuthModule,
  dash: DashboardModule,
  chat: ChatModule,
  profile: ProfileModule,
  calls: CallsModule,
  ui: UI,
  utils: Utils,
  showMsgMenu: (msgId) => ChatModule.showMsgMenu(msgId)
};

function hideSplashNow() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.style.visibility = "hidden";
  }, 450);
}

function updatePresence(isOnline) {
  if (auth.currentUser) {
    setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        isOnline,
        lastSeen: serverTimestamp()
      },
      { merge: true }
    ).catch(() => {});
  }
}

window.addEventListener("beforeunload", () => updatePresence(false));
document.addEventListener("visibilitychange", () => {
  updatePresence(document.visibilityState === "visible");
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-reply-msg")?.addEventListener("click", () => ChatModule.initReply());
  document.getElementById("btn-delete-everyone")?.addEventListener("click", () => ChatModule.executeDelete("everyone"));
  document.getElementById("btn-delete-me")?.addEventListener("click", () => ChatModule.executeDelete("me"));
});

try {
  onAuthStateChanged(auth, (user) => {
    try {
      const path = window.location.pathname.toLowerCase();

      if (user) {
        State.currentUser = user;

        onSnapshot(doc(db, "users", user.uid), (d) => {
          if (d.exists()) State.userData = d.data();
        });

        updatePresence(true);

        if (path.includes("index") || path === "/" || path.endsWith("/")) {
          window.location.replace("dashboard.html");
          return;
        }

        if (path.includes("dashboard")) {
          DashboardModule.loadChats();
        }

        if (path.includes("chat")) {
          ChatModule.init();
        }
      } else {
        State.currentUser = null;

        if (path.includes("dashboard") || path.includes("chat")) {
          window.location.replace("index.html");
          return;
        }
      }
    } catch (err) {
      console.error("onAuthStateChanged inner error:", err);
      UI.toast("Runtime error in app state.", "error");
    } finally {
      hideSplashNow();
      UI.loader(false);
    }
  });
} catch (err) {
  console.error("main bootstrap failed:", err);
  hideSplashNow();
  UI.loader(false);
}