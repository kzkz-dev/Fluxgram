import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { State } from "./state.js";

export const Utils = {
  escapeHTML(text = "") {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  parseMentionsSafe(text = "") {
    const escaped = Utils.escapeHTML(text).replace(/\n/g, "<br>");
    return escaped.replace(/@([a-zA-Z0-9_]{6,})/g, `<span class="mention" data-username="$1">@$1</span>`);
  },

  formatTime(ts) {
    if (!ts) return "Just now";
    if (typeof ts.toDate === "function") {
      return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return "";
  },

  formatDate(ts) {
    if (!ts) return "";
    if (typeof ts.toDate === "function") {
      return ts.toDate().toLocaleDateString("en-US", { month: "long", day: "numeric" });
    }
    return "";
  },

  getMillis(ts) {
    if (!ts) return Date.now();
    if (typeof ts.toMillis === "function") return ts.toMillis();
    return 0;
  },

  renderAvatarHTML(photoURL, fallbackName, sizeClass = "") {
    if (photoURL && photoURL.length > 10) {
      return `<img src="${photoURL}" alt="avatar" class="${sizeClass}">`;
    }
    return `<span class="${sizeClass}">${(fallbackName || "U").charAt(0).toUpperCase()}</span>`;
  },

  async compressToBase64(dataUrl, maxWidth = 300, quality = 0.65) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
    });
  },

  formatLastSeen(user) {
    if (!user) return "";
    if (user.isOnline) return "online";
    if (user.lastSeen && typeof user.lastSeen.toDate === "function") {
      const date = user.lastSeen.toDate();
      return `last seen ${date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    }
    return "offline";
  },

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  },

  bindMentionClicks(openByUsername) {
    document.querySelectorAll(".mention").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const username = el.getAttribute("data-username");
        if (username) openByUsername(username);
      };
    });
  },

  async getCachedUser(uid) {
    if (State.userCache[uid]) return State.userCache[uid];
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        State.userCache[uid] = snap.data();
        return snap.data();
      }
    } catch (e) {}
    return null;
  },

  getParam(param) {
    return new URLSearchParams(window.location.search).get(param);
  }
};