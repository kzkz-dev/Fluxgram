import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  collection,
  getDocs,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db } from "./firebase.js";
import { State } from "./state.js";
import { Utils } from "./utils.js";
import { UI } from "./ui.js";

export const ChatModule = {
  async init() {
    const otherUid = Utils.getParam("uid");
    const chatId = Utils.getParam("chatId");
    const deepLink = Utils.getParam("link");

    try {
      if (deepLink) return await ChatModule.openByUsername(deepLink);
      if (!otherUid && !chatId) return window.location.replace("dashboard.html");

      if (chatId) {
        State.activeChatId = chatId;
        State.unsubscribers.activeChat = onSnapshot(doc(db, "chats", chatId), (snap) => {
          if (!snap.exists()) return;
          State.activeChatData = snap.data();
          const title = State.activeChatData.title || State.activeChatData.name || "Chat";
          Utils.setText("chat-name", title);
          Utils.setText("chat-status", State.activeChatData.type === "channel" ? "Channel" : "Conversation");
          document.getElementById("chat-avatar").innerHTML = Utils.renderAvatarHTML(State.activeChatData.photoURL, title);
        });
      } else {
        const directId = State.currentUser.uid < otherUid
          ? `${State.currentUser.uid}_${otherUid}`
          : `${otherUid}_${State.currentUser.uid}`;

        State.activeChatId = directId;
        const ref = doc(db, "chats", directId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          await setDoc(ref, {
            type: "direct",
            title: null,
            ownerId: State.currentUser.uid,
            members: [State.currentUser.uid, otherUid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            typingUsers: [],
            lastMessage: null
          });
        }

        State.unsubscribers.activeUser = onSnapshot(doc(db, "users", otherUid), (userSnap) => {
          if (!userSnap.exists()) return;
          State.activeChatUser = userSnap.data();
          Utils.setText("chat-name", State.activeChatUser.username || State.activeChatUser.name || "User");
          Utils.setText("chat-status", Utils.formatLastSeen(State.activeChatUser));
          document.getElementById("chat-avatar").innerHTML = Utils.renderAvatarHTML(
            State.activeChatUser.photoURL,
            State.activeChatUser.username || State.activeChatUser.name || "U"
          );
        });
      }

      const msgInput = document.getElementById("msg-input");
      if (msgInput) {
        msgInput.addEventListener("input", () => {
          UI.autoResize(msgInput);
          ChatModule.toggleSendVoiceButtons();
          ChatModule.markTyping();
        });

        msgInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            ChatModule.send();
          }
        });
      }

      ChatModule.loadMessages();
    } catch {
      UI.toast("Failed to load chat", "error");
    }
  },

  toggleSendVoiceButtons() {
    const hasText = !!document.getElementById("msg-input")?.value.trim();
    document.getElementById("btn-send-text")?.classList.toggle("hidden", !hasText);
    document.getElementById("btn-record-voice")?.classList.toggle("hidden", hasText);
  },

  async markTyping() {
    if (!State.activeChatId || !State.currentUser?.uid) return;
    const chatRef = doc(db, "chats", State.activeChatId);

    try {
      await updateDoc(chatRef, { typingUsers: arrayUnion(State.currentUser.uid) });
    } catch (e) {}

    clearTimeout(State.typingTimeout);
    State.typingTimeout = setTimeout(async () => {
      try {
        await updateDoc(chatRef, { typingUsers: arrayRemove(State.currentUser.uid) });
      } catch (e) {}
    }, 1400);
  },

  async stopTypingNow() {
    if (!State.activeChatId || !State.currentUser?.uid) return;
    try {
      await updateDoc(doc(db, "chats", State.activeChatId), { typingUsers: arrayRemove(State.currentUser.uid) });
    } catch (e) {}
  },

  loadMessages() {
    const container = document.getElementById("messages-container");
    if (!container) return;

    const q = query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("createdAt", "asc"));

    State.unsubscribers.messages = onSnapshot(q, async (snapshot) => {
      window._localMessages = {};
      container.innerHTML = "";
      let lastDateStr = "";
      const batch = writeBatch(db);
      let hasUnread = false;

      for (const docSnap of snapshot.docs) {
        const msgId = docSnap.id;
        const msg = docSnap.data();
        window._localMessages[msgId] = msg;

        if (msg.deletedFor && msg.deletedFor.includes(State.currentUser.uid)) continue;

        if (msg.senderId !== State.currentUser.uid && msg.status !== "read") {
          batch.update(docSnap.ref, { status: "read" });
          hasUnread = true;
        }

        const isMe = msg.senderId === State.currentUser.uid;
        const dateStr = Utils.formatDate(msg.createdAt);
        if (dateStr && dateStr !== lastDateStr) {
          container.innerHTML += `<div class="date-divider"><span>${dateStr}</span></div>`;
          lastDateStr = dateStr;
        }

        let senderNameHTML = "";
        if (!isMe && State.activeChatData && (State.activeChatData.type === "group" || State.activeChatData.type === "channel")) {
          const sender = await Utils.getCachedUser(msg.senderId);
          senderNameHTML = `<div class="msg-sender">${Utils.escapeHTML(sender?.username || sender?.name || "User")}</div>`;
        }

        let contentHTML = "";
        if (msg.replyTo) {
          contentHTML += `
            <div class="replied-msg-box">
              <div class="replied-name">${Utils.escapeHTML(msg.replyTo.senderName || "User")}</div>
              <div class="replied-text">${Utils.escapeHTML(msg.replyTo.textPreview || "")}</div>
            </div>`;
        }

        if (msg.text) contentHTML += Utils.parseMentionsSafe(msg.text);
        if (msg.media?.downloadURL && msg.type === "image") {
          contentHTML += `<img src="${msg.media.downloadURL}" class="chat-img">`;
        }
        if (msg.media?.downloadURL && msg.type === "voice") {
          contentHTML += `<audio src="${msg.media.downloadURL}" controls class="chat-audio"></audio>`;
        }

        const tickHTML = isMe
          ? (msg.status === "read"
            ? `<span class="msg-ticks read"><i class="fas fa-check-double"></i></span>`
            : `<span class="msg-ticks"><i class="fas fa-check"></i></span>`)
          : "";

        container.innerHTML += `
          <div class="msg-row ${isMe ? "msg-tx" : "msg-rx"}">
            <div class="msg-bubble" onclick="window.FluxgramV41.showMsgMenu('${msgId}')">
              ${senderNameHTML}
              ${contentHTML}
              <div class="msg-meta">${Utils.formatTime(msg.createdAt)}${tickHTML}</div>
            </div>
          </div>`;
      }

      if (hasUnread) batch.commit().catch(() => {});
      Utils.bindMentionClicks(ChatModule.openByUsername);
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    });
  },

  showMsgMenu(msgId) {
    State.selectedMsgId = msgId;
    document.getElementById("msg-action-modal")?.classList.remove("hidden");
  },

  initReply() {
    const msgId = State.selectedMsgId;
    const msg = window._localMessages[msgId];
    if (!msg) return;

    State.replyingTo = {
      messageId: msgId,
      senderId: msg.senderId,
      senderName: msg.senderId === State.currentUser.uid ? "You" : (State.activeChatUser?.username || "User"),
      textPreview: msg.text || (msg.type === "image" ? "📸 Image" : msg.type === "voice" ? "🎤 Voice" : "Message")
    };

    document.getElementById("reply-preview-name").innerText = State.replyingTo.senderName;
    document.getElementById("reply-preview-text").innerText = State.replyingTo.textPreview;
    document.getElementById("reply-preview-bar")?.classList.remove("hidden");
    document.getElementById("msg-action-modal")?.classList.add("hidden");
  },

  cancelReply() {
    State.replyingTo = null;
    document.getElementById("reply-preview-bar")?.classList.add("hidden");
  },

  async executeDelete(type) {
    const msgId = State.selectedMsgId;
    if (!msgId) return;

    try {
      const ref = doc(db, `chats/${State.activeChatId}/messages`, msgId);
      if (type === "everyone") {
        await deleteDoc(ref);
      } else {
        await updateDoc(ref, { deletedFor: arrayUnion(State.currentUser.uid) });
      }
      document.getElementById("msg-action-modal")?.classList.add("hidden");
      UI.toast("Done");
    } catch {
      UI.toast("Failed to delete", "error");
    }
  },

  async send() {
    const input = document.getElementById("msg-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text || !State.activeChatId) return;

    input.value = "";
    UI.autoResize(input);
    ChatModule.toggleSendVoiceButtons();
    ChatModule.stopTypingNow();

    const data = {
      type: "text",
      senderId: State.currentUser.uid,
      text,
      createdAt: serverTimestamp(),
      editedAt: null,
      status: "sent",
      deletedFor: []
    };

    if (State.replyingTo) {
      data.replyTo = State.replyingTo;
      ChatModule.cancelReply();
    }

    try {
      await addDoc(collection(db, `chats/${State.activeChatId}/messages`), data);
      await updateDoc(doc(db, "chats", State.activeChatId), {
        updatedAt: serverTimestamp(),
        lastMessage: {
          text,
          type: "text",
          senderId: State.currentUser.uid,
          timestamp: serverTimestamp()
        }
      });
    } catch {
      UI.toast("Failed to send", "error");
    }
  },

  async openByUsername(username) {
    UI.loader(true);
    const key = username.toLowerCase().replace("@", "");

    try {
      const snapU = await getDocs(query(collection(db, "users"), where("searchKey", "==", key)));
      if (!snapU.empty) {
        const uid = snapU.docs[0].id;
        if (uid === State.currentUser.uid) {
          UI.toast("You cannot chat with yourself", "error");
          UI.loader(false);
          return;
        }
        window.location.href = `chat.html?uid=${uid}`;
        return;
      }

      const snapC = await getDocs(query(collection(db, "chats"), where("searchKey", "==", key)));
      if (!snapC.empty) {
        window.location.href = `chat.html?chatId=${snapC.docs[0].id}`;
        return;
      }

      UI.toast("Username not found!", "error");
    } catch {
      UI.toast("Search failed", "error");
    }

    UI.loader(false);
  }
};