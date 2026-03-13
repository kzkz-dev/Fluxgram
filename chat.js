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

function isPinned() {
  return Array.isArray(State.activeChatData?.pinnedBy) && State.activeChatData.pinnedBy.includes(State.currentUser.uid);
}
function isMuted() {
  return Array.isArray(State.activeChatData?.mutedBy) && State.activeChatData.mutedBy.includes(State.currentUser.uid);
}
function isArchived() {
  return Array.isArray(State.activeChatData?.archivedBy) && State.activeChatData.archivedBy.includes(State.currentUser.uid);
}

function refreshHeaderButtons() {
  const pinBtn = document.getElementById("btn-pin-chat");
  const muteBtn = document.getElementById("btn-mute-chat");
  const archiveBtn = document.getElementById("btn-archive-chat");

  if (pinBtn) pinBtn.classList.toggle("active-state-btn", isPinned());
  if (muteBtn) muteBtn.classList.toggle("active-state-btn", isMuted());
  if (archiveBtn) archiveBtn.classList.toggle("active-state-btn", isArchived());

  if (muteBtn) {
    muteBtn.innerHTML = isMuted()
      ? `<i class="fas fa-bell-slash"></i>`
      : `<i class="fas fa-bell"></i>`;
  }
}

function buildReactionsHTML(reactions = {}) {
  const entries = Object.entries(reactions).filter(([, users]) => Array.isArray(users) && users.length > 0);
  if (!entries.length) return "";
  return `
    <div class="msg-reactions">
      ${entries.map(([emoji, users]) => `<span class="msg-reaction-chip">${emoji} ${users.length}</span>`).join("")}
    </div>
  `;
}

function buildForwardHTML(forwardedFrom) {
  if (!forwardedFrom) return "";
  return `
    <div class="forward-box">
      <div class="forward-label"><i class="fas fa-share"></i> Forwarded</div>
      <div class="forward-text">${Utils.escapeHTML(forwardedFrom.textPreview || "Message")}</div>
    </div>
  `;
}

function collectSharedMedia(messagesMap) {
  return Object.entries(messagesMap)
    .map(([id, msg]) => ({ id, ...msg }))
    .filter((msg) => (msg.type === "image" || msg.type === "voice") && msg.media?.downloadURL)
    .sort((a, b) => Utils.getMillis(b.createdAt) - Utils.getMillis(a.createdAt));
}

async function ensureSavedMessagesChat() {
  const savedId = `saved_${State.currentUser.uid}`;
  const savedRef = doc(db, "chats", savedId);
  const savedSnap = await getDoc(savedRef);

  if (!savedSnap.exists()) {
    await setDoc(savedRef, {
      type: "saved",
      title: "Saved Messages",
      description: "Your private saved notes",
      username: null,
      searchKey: null,
      photoURL: null,
      ownerId: State.currentUser.uid,
      members: [State.currentUser.uid],
      pinnedBy: [],
      mutedBy: [],
      archivedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      memberCount: 1,
      isPublic: false,
      lastMessage: {
        text: "Welcome to Saved Messages",
        type: "system",
        senderId: State.currentUser.uid,
        timestamp: serverTimestamp()
      }
    });
  }

  return savedId;
}

async function resolveForwardTarget(rawTarget) {
  const target = (rawTarget || "").trim();
  if (!target) return null;

  if (target.toLowerCase() === "saved") {
    return await ensureSavedMessagesChat();
  }

  if (target.startsWith("@")) {
    const key = target.replace("@", "").toLowerCase();

    const snapU = await getDocs(query(collection(db, "users"), where("searchKey", "==", key)));
    if (!snapU.empty) {
      const uid = snapU.docs[0].id;
      if (uid === State.currentUser.uid) return await ensureSavedMessagesChat();

      const directId = State.currentUser.uid < uid ? `${State.currentUser.uid}_${uid}` : `${uid}_${State.currentUser.uid}`;
      const ref = doc(db, "chats", directId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, {
          type: "direct",
          title: null,
          ownerId: State.currentUser.uid,
          members: [State.currentUser.uid, uid],
          pinnedBy: [],
          mutedBy: [],
          archivedBy: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          typingUsers: [],
          lastMessage: null
        });
      }

      return directId;
    }

    const snapC = await getDocs(query(collection(db, "chats"), where("searchKey", "==", key)));
    if (!snapC.empty) return snapC.docs[0].id;
  }

  const maybeChatRef = doc(db, "chats", target);
  const maybeChatSnap = await getDoc(maybeChatRef);
  if (maybeChatSnap.exists()) return target;

  return null;
}

export const ChatModule = {
  editingMsgId: null,

  async init() {
    const otherUid = Utils.getParam("uid");
    const chatId = Utils.getParam("chatId");
    const deepLink = Utils.getParam("link");

    try {
      if (deepLink) return await ChatModule.openByUsername(deepLink);
      if (!otherUid && !chatId) return window.location.replace("dashboard.html");

      if (chatId) {
        State.activeChatId = chatId;
        State.unsubscribers.activeChat?.();
        State.unsubscribers.activeChat = onSnapshot(doc(db, "chats", chatId), (snap) => {
          if (!snap.exists()) return;
          State.activeChatData = snap.data();

          const title = State.activeChatData.title || State.activeChatData.name || "Chat";
          Utils.setText("chat-name", title);

          if (State.activeChatData.type === "saved") {
            Utils.setText("chat-status", "Private cloud storage");
          } else if (State.activeChatData.type === "channel") {
            Utils.setText("chat-status", "Channel");
          } else if (State.activeChatData.type === "group") {
            Utils.setText("chat-status", "Group");
          } else {
            Utils.setText("chat-status", "Conversation");
          }

          const avatar = document.getElementById("chat-avatar");
          if (avatar) {
            if (State.activeChatData.type === "saved") {
              avatar.innerHTML = `<span><i class="fas fa-bookmark"></i></span>`;
            } else {
              avatar.innerHTML = Utils.renderAvatarHTML(State.activeChatData.photoURL, title);
            }
          }

          refreshHeaderButtons();
        });
      } else {
        const directId =
          State.currentUser.uid < otherUid
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
            pinnedBy: [],
            mutedBy: [],
            archivedBy: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            typingUsers: [],
            lastMessage: null
          });
        }

        State.unsubscribers.activeUser?.();
        State.unsubscribers.activeUser = onSnapshot(doc(db, "users", otherUid), (userSnap) => {
          if (!userSnap.exists()) return;
          State.activeChatUser = userSnap.data();
          Utils.setText(
            "chat-name",
            State.activeChatUser.username || State.activeChatUser.name || "User"
          );
          Utils.setText("chat-status", Utils.formatLastSeen(State.activeChatUser));

          const avatar = document.getElementById("chat-avatar");
          if (avatar) {
            avatar.innerHTML = Utils.renderAvatarHTML(
              State.activeChatUser.photoURL,
              State.activeChatUser.username || State.activeChatUser.name || "U"
            );
          }
        });

        State.unsubscribers.activeChat?.();
        State.unsubscribers.activeChat = onSnapshot(ref, (snap2) => {
          if (snap2.exists()) {
            State.activeChatData = snap2.data();
            refreshHeaderButtons();
          }
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
    } catch (e) {
      console.error("chat init error:", e);
      UI.toast("Failed to load chat", "error");
    }
  },

  toggleSharedMedia() {
    document.getElementById("shared-media-panel")?.classList.toggle("hidden");
  },

  renderSharedMedia() {
    const list = document.getElementById("shared-media-list");
    if (!list) return;

    const items = collectSharedMedia(window._localMessages || {});
    if (!items.length) {
      list.innerHTML = `<div class="shared-media-empty">No media yet</div>`;
      return;
    }

    list.innerHTML = items.map((msg) => {
      if (msg.type === "image") {
        return `<img src="${msg.media.downloadURL}" class="shared-media-thumb">`;
      }

      return `
        <div class="shared-media-audio-item">
          <i class="fas fa-microphone"></i>
          <audio src="${msg.media.downloadURL}" controls></audio>
        </div>
      `;
    }).join("");
  },

  async togglePin() {
    if (!State.activeChatId) return;
    try {
      await updateDoc(doc(db, "chats", State.activeChatId), {
        pinnedBy: isPinned() ? arrayRemove(State.currentUser.uid) : arrayUnion(State.currentUser.uid)
      });
      UI.toast(isPinned() ? "Unpinned" : "Pinned");
    } catch (e) {
      console.error(e);
      UI.toast("Failed to update pin", "error");
    }
  },

  async toggleMute() {
    if (!State.activeChatId) return;
    try {
      await updateDoc(doc(db, "chats", State.activeChatId), {
        mutedBy: isMuted() ? arrayRemove(State.currentUser.uid) : arrayUnion(State.currentUser.uid)
      });
      UI.toast(isMuted() ? "Unmuted" : "Muted");
    } catch (e) {
      console.error(e);
      UI.toast("Failed to update mute", "error");
    }
  },

  async toggleArchive() {
    if (!State.activeChatId) return;
    try {
      const nowArchived = !isArchived();
      await updateDoc(doc(db, "chats", State.activeChatId), {
        archivedBy: nowArchived ? arrayUnion(State.currentUser.uid) : arrayRemove(State.currentUser.uid)
      });
      UI.toast(nowArchived ? "Chat archived" : "Chat unarchived");
      if (nowArchived) {
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 250);
      }
    } catch (e) {
      console.error(e);
      UI.toast("Failed to update archive", "error");
    }
  },

  toggleSendVoiceButtons() {
    const hasText = !!document.getElementById("msg-input")?.value.trim();
    document.getElementById("btn-send-text")?.classList.toggle("hidden", !hasText);
    document.getElementById("btn-record-voice")?.classList.toggle("hidden", hasText);
  },

  async markTyping() {
    if (!State.activeChatId || !State.currentUser?.uid) return;
    if (State.activeChatData?.type === "saved") return;

    const chatRef = doc(db, "chats", State.activeChatId);

    try {
      await updateDoc(chatRef, { typingUsers: arrayUnion(State.currentUser.uid) });
    } catch {}

    clearTimeout(State.typingTimeout);
    State.typingTimeout = setTimeout(async () => {
      try {
        await updateDoc(chatRef, { typingUsers: arrayRemove(State.currentUser.uid) });
      } catch {}
    }, 1400);
  },

  async stopTypingNow() {
    if (!State.activeChatId || !State.currentUser?.uid) return;
    if (State.activeChatData?.type === "saved") return;
    try {
      await updateDoc(doc(db, "chats", State.activeChatId), {
        typingUsers: arrayRemove(State.currentUser.uid)
      });
    } catch {}
  },

  loadMessages() {
    const container = document.getElementById("messages-container");
    if (!container) return;

    State.unsubscribers.messages?.();
    const q = query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("createdAt", "asc"));

    State.unsubscribers.messages = onSnapshot(
      q,
      async (snapshot) => {
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

          if (
            State.activeChatData?.type !== "saved" &&
            msg.senderId !== State.currentUser.uid &&
            msg.status !== "read"
          ) {
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
          if (
            !isMe &&
            State.activeChatData &&
            (State.activeChatData.type === "group" || State.activeChatData.type === "channel")
          ) {
            const sender = await Utils.getCachedUser(msg.senderId);
            senderNameHTML = `<div class="msg-sender">${Utils.escapeHTML(
              sender?.username || sender?.name || "User"
            )}</div>`;
          }

          let contentHTML = "";

          if (msg.replyTo) {
            contentHTML += `
              <div class="replied-msg-box">
                <div class="replied-name">${Utils.escapeHTML(msg.replyTo.senderName || "User")}</div>
                <div class="replied-text">${Utils.escapeHTML(msg.replyTo.textPreview || "")}</div>
              </div>`;
          }

          contentHTML += buildForwardHTML(msg.forwardedFrom);

          if (msg.text) contentHTML += Utils.parseMentionsSafe(msg.text);

          if (msg.media?.downloadURL && msg.type === "image") {
            contentHTML += `<img src="${msg.media.downloadURL}" class="chat-img">`;
          }

          if (msg.media?.downloadURL && msg.type === "voice") {
            contentHTML += `<audio src="${msg.media.downloadURL}" controls class="chat-audio"></audio>`;
          }

          const editedLabel = msg.editedAt ? `<span class="edited-label">edited</span>` : "";

          const tickHTML =
            isMe && State.activeChatData?.type !== "saved"
              ? msg.status === "read"
                ? `<span class="msg-ticks read"><i class="fas fa-check-double"></i></span>`
                : `<span class="msg-ticks"><i class="fas fa-check"></i></span>`
              : "";

          container.innerHTML += `
            <div class="msg-row ${isMe ? "msg-tx" : "msg-rx"}">
              <div class="msg-bubble" onclick="window.FluxgramV41.showMsgMenu('${msgId}')">
                ${senderNameHTML}
                ${contentHTML}
                ${buildReactionsHTML(msg.reactions)}
                <div class="msg-meta">${editedLabel}${Utils.formatTime(msg.createdAt)}${tickHTML}</div>
              </div>
            </div>`;
        }

        if (hasUnread) batch.commit().catch(() => {});
        Utils.bindMentionClicks(ChatModule.openByUsername);
        ChatModule.renderSharedMedia();

        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      },
      (error) => {
        console.error("loadMessages error:", error);
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);">Failed to load messages</div>`;
      }
    );
  },

  showMsgMenu(msgId) {
    State.selectedMsgId = msgId;
    const msg = window._localMessages[msgId];
    const isMe = msg?.senderId === State.currentUser.uid;
    const canEdit = !!(isMe && msg?.type === "text" && msg?.text);

    document.getElementById("btn-edit-msg")?.classList.toggle("hidden", !canEdit);
    document.getElementById("btn-delete-everyone")?.classList.toggle("hidden", !isMe);

    document.getElementById("msg-action-modal")?.classList.remove("hidden");
  },

  initReply() {
    const msgId = State.selectedMsgId;
    const msg = window._localMessages[msgId];
    if (!msg) return;

    State.replyingTo = {
      messageId: msgId,
      senderId: msg.senderId,
      senderName:
        msg.senderId === State.currentUser.uid ? "You" : State.activeChatUser?.username || "User",
      textPreview:
        msg.text ||
        (msg.type === "image" ? "📸 Image" : msg.type === "voice" ? "🎤 Voice" : "Message")
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

  initEdit() {
    const msgId = State.selectedMsgId;
    const msg = window._localMessages[msgId];
    if (!msg || msg.senderId !== State.currentUser.uid || msg.type !== "text" || !msg.text) return;

    ChatModule.editingMsgId = msgId;
    const input = document.getElementById("msg-input");
    input.value = msg.text;
    UI.autoResize(input);
    ChatModule.toggleSendVoiceButtons();
    input.focus();

    document.getElementById("edit-preview-text").innerText = msg.text;
    document.getElementById("edit-preview-bar")?.classList.remove("hidden");
    document.getElementById("msg-action-modal")?.classList.add("hidden");
  },

  cancelEdit() {
    ChatModule.editingMsgId = null;
    document.getElementById("edit-preview-bar")?.classList.add("hidden");
  },

  async toggleReaction(emoji) {
    const msgId = State.selectedMsgId;
    const msg = window._localMessages[msgId];
    if (!msgId || !msg) return;

    const reactions = { ...(msg.reactions || {}) };
    const users = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    const myUid = State.currentUser.uid;

    const idx = users.indexOf(myUid);
    if (idx >= 0) users.splice(idx, 1);
    else users.push(myUid);

    if (users.length) reactions[emoji] = users;
    else delete reactions[emoji];

    try {
      await updateDoc(doc(db, `chats/${State.activeChatId}/messages`, msgId), {
        reactions
      });
      document.getElementById("msg-action-modal")?.classList.add("hidden");
    } catch (e) {
      console.error(e);
      UI.toast("Failed to react", "error");
    }
  },

  async forwardMessage() {
    const msgId = State.selectedMsgId;
    const msg = window._localMessages[msgId];
    if (!msg) return;

    const targetRaw = prompt("Forward to: @username, chatId, or type saved");
    if (!targetRaw) return;

    try {
      const targetChatId = await resolveForwardTarget(targetRaw);
      if (!targetChatId) {
        UI.toast("Target not found", "error");
        return;
      }

      const payload = {
        type: msg.type || "text",
        senderId: State.currentUser.uid,
        text: msg.text || "",
        createdAt: serverTimestamp(),
        editedAt: null,
        status: "sent",
        deletedFor: [],
        forwardedFrom: {
          senderId: msg.senderId,
          textPreview: msg.text || (msg.type === "image" ? "📸 Image" : msg.type === "voice" ? "🎤 Voice" : "Message")
        }
      };

      if (msg.media?.downloadURL) {
        payload.media = msg.media;
      }

      await addDoc(collection(db, `chats/${targetChatId}/messages`), payload);

      await updateDoc(doc(db, "chats", targetChatId), {
        updatedAt: serverTimestamp(),
        lastMessage: {
          text: payload.text || "Forwarded message",
          type: payload.type,
          senderId: State.currentUser.uid,
          timestamp: serverTimestamp()
        }
      });

      document.getElementById("msg-action-modal")?.classList.add("hidden");
      UI.toast("Message forwarded");
    } catch (e) {
      console.error(e);
      UI.toast("Failed to forward", "error");
    }
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

    try {
      if (ChatModule.editingMsgId) {
        await updateDoc(doc(db, `chats/${State.activeChatId}/messages`, ChatModule.editingMsgId), {
          text,
          editedAt: serverTimestamp()
        });

        await updateDoc(doc(db, "chats", State.activeChatId), {
          updatedAt: serverTimestamp(),
          lastMessage: {
            text,
            type: "text",
            senderId: State.currentUser.uid,
            timestamp: serverTimestamp()
          }
        });

        ChatModule.cancelEdit();
        UI.toast("Message updated");
        return;
      }

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
    } catch (e) {
      console.error("send message error:", e);
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
    } catch (e) {
      console.error("openByUsername error:", e);
      UI.toast("Search failed", "error");
    }

    UI.loader(false);
  }
};