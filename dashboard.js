import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "./firebase.js";
import { State } from "./state.js";
import { Utils } from "./utils.js";
import { UI } from "./ui.js";

export const DashboardModule = {
  async search() {
    const term = document.getElementById("search-input")?.value.trim().toLowerCase().replace("@", "");
    const resBox = document.getElementById("search-results");
    const chatList = document.getElementById("chat-list");
    if (!resBox || !chatList) return;

    if (!term || term.length < 2) {
      resBox.classList.add("hidden");
      chatList.classList.remove("hidden");
      return;
    }

    resBox.classList.remove("hidden");
    chatList.classList.add("hidden");
    resBox.innerHTML = `<div style="padding:15px;text-align:center;color:var(--text-muted);">Searching...</div>`;

    try {
      const [snapsU, snapsC] = await Promise.all([
        getDocs(query(collection(db, "users"), where("searchKey", ">=", term), where("searchKey", "<=", term + "\uf8ff"))),
        getDocs(query(collection(db, "chats"), where("searchKey", ">=", term), where("searchKey", "<=", term + "\uf8ff")))
      ]);

      resBox.innerHTML = "";

      snapsU.forEach((d) => {
        if (d.id === State.currentUser.uid) return;
        const u = d.data();
        resBox.innerHTML += `
          <div class="chat-item" onclick="window.location.href='chat.html?uid=${u.uid}'">
            <div class="avatar">${Utils.renderAvatarHTML(u.photoURL, u.username)}</div>
            <div class="chat-info">
              <div class="c-name">@${Utils.escapeHTML(u.username || "user")}</div>
              <div class="c-msg">${Utils.escapeHTML(u.bio || "Available on Fluxgram")}</div>
            </div>
          </div>`;
      });

      snapsC.forEach((d) => {
        const c = d.data();
        resBox.innerHTML += `
          <div class="chat-item" onclick="window.location.href='chat.html?chatId=${d.id}'">
            <div class="avatar">${Utils.renderAvatarHTML(c.photoURL, c.title || c.name || "C")}</div>
            <div class="chat-info">
              <div class="c-name">${Utils.escapeHTML(c.title || c.name || "Chat")}</div>
              <div class="c-msg">${c.username ? "@" + Utils.escapeHTML(c.username) : "Public conversation"}</div>
            </div>
          </div>`;
      });

      if (resBox.innerHTML === "") {
        resBox.innerHTML = `<div style="padding:15px;text-align:center;color:var(--text-muted);">No matches found</div>`;
      }
    } catch {
      resBox.innerHTML = `<div style="padding:15px;text-align:center;color:var(--danger);">Search failed</div>`;
    }
  },

  setCreateType(type) {
    document.getElementById("create-type").value = type;
    document.getElementById("btn-type-group")?.classList.toggle("active", type === "group");
    document.getElementById("btn-type-channel")?.classList.toggle("active", type === "channel");
  },

  async createChat() {
    const type = document.getElementById("create-type")?.value || "group";
    const title = document.getElementById("create-name")?.value.trim();
    const description = document.getElementById("create-desc")?.value.trim();
    const username = document.getElementById("create-username")?.value.trim().replace("@", "");

    if (!title) return UI.toast("Name is required", "error");
    if (username && username.length < 6) return UI.toast("Username must be at least 6 chars", "error");

    UI.loader(true);
    try {
      const ref = await addDoc(collection(db, "chats"), {
        type,
        title,
        description,
        username: username || null,
        searchKey: username ? username.toLowerCase() : null,
        photoURL: null,
        ownerId: State.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        memberCount: 1,
        isPublic: !!username,
        lastMessage: {
          text: `Created ${type}`,
          type: "system",
          senderId: State.currentUser.uid,
          timestamp: serverTimestamp()
        }
      });

      window.location.href = `chat.html?chatId=${ref.id}`;
    } catch (e) {
      UI.toast(e.message || "Failed to create", "error");
    } finally {
      UI.loader(false);
    }
  },

  loadChats() {
    const list = document.getElementById("chat-list");
    if (!list) return;

    const q = query(collection(db, "chats"), where("ownerId", "==", State.currentUser.uid));

    State.unsubscribers.chats = onSnapshot(q, async (snapshot) => {
      State.isInitialLoad = false;
      list.innerHTML = "";

      if (snapshot.empty) {
        list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);">No chats yet.</div>`;
        return;
      }

      const docs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Utils.getMillis(b.updatedAt) - Utils.getMillis(a.updatedAt));

      for (const data of docs) {
        const timeStr = Utils.formatTime(data.updatedAt || data.lastMessage?.timestamp);
        const title = data.title || data.name || "Chat";
        const preview = data.lastMessage?.text || "No messages yet";

        list.innerHTML += `
          <div class="chat-item" onclick="window.location.href='chat.html?chatId=${data.id}'">
            <div class="avatar">${Utils.renderAvatarHTML(data.photoURL, title)}</div>
            <div class="chat-info">
              <div class="c-name-row">
                <div class="c-name">${Utils.escapeHTML(title)}</div>
                <div class="c-time">${timeStr}</div>
              </div>
              <div class="c-msg-row">
                <div class="c-msg">${Utils.escapeHTML(preview)}</div>
              </div>
            </div>
          </div>`;
      }
    });
  }
};