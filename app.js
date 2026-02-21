// ============================================================================
// app.js - Fluxgram Ultimate Engine (Added Reply & Blue Ticks)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// 🔥 Added writeBatch for Blue Ticks 🔥
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCsbZ1fqDivv8OyUiTcaEMcpZlJlM1TI6Y",
    authDomain: "fluxgram-87009.firebaseapp.com",
    projectId: "fluxgram-87009",
    storageBucket: "fluxgram-87009.firebasestorage.app",
    messagingSenderId: "698836385253",
    appId: "1:698836385253:web:c40e67ee9006cff536830c",
    databaseURL: "https://fluxgram-87009-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

window.Fluxgram = {
    state: { currentUser: null, userData: null, activeChatId: null, activeChatUser: null, activeChatData: null, unsubMessages: null, unsubChats: null, callDocId: null, startTime: null, selectedMsgId: null, isFirebaseConnected: false, isInitialLoad: true, replyingTo: null },
    ui: {}, auth: {}, dash: {}, chat: {}, call: {}, utils: {}, profile: {}, network: {}
};

const State = window.Fluxgram.state;
window._localMessages = {}; // Local message cache

window.Fluxgram.network = {
    init: () => {
        window.addEventListener('online', Fluxgram.network.updateStatusUI);
        window.addEventListener('offline', Fluxgram.network.updateStatusUI);
        const connectedRef = ref(rtdb, ".info/connected");
        onValue(connectedRef, (snap) => {
            State.isFirebaseConnected = snap.val() === true;
            Fluxgram.network.updateStatusUI();
        });
    },
    updateStatusUI: () => {
        const bar = document.getElementById('connection-status-bar');
        const text = document.getElementById('connection-text');
        const icon = document.getElementById('connection-icon');
        if(!bar || !text || !icon) return;

        if (!navigator.onLine) { bar.classList.remove('hidden'); text.innerText = "Waiting for network..."; icon.className = "fas fa-wifi status-icon"; } 
        else if (!State.isFirebaseConnected) { bar.classList.remove('hidden'); text.innerText = "Connecting..."; icon.className = "fas fa-circle-notch fa-spin status-icon"; } 
        else if (State.isInitialLoad) { bar.classList.remove('hidden'); text.innerText = "Updating..."; icon.className = "fas fa-sync-alt fa-spin status-icon"; } 
        else { bar.classList.add('hidden'); }
    }
};

const formatTime = (ts) => { if (!ts) return 'Just now'; if (typeof ts.toDate === 'function') return ts.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); return ''; };
const formatDate = (ts) => { if (!ts) return ''; if (typeof ts.toDate === 'function') return ts.toDate().toLocaleDateString('en-US', {month:'long', day:'numeric'}); return ''; };
const getMillis = (ts) => { if (!ts) return Date.now(); if (typeof ts.toMillis === 'function') return ts.toMillis(); return 0; };

window.Fluxgram.utils = {
    isUsernameUnique: async (username, currentUsername = null) => {
        const u = username.toLowerCase().replace('@', '');
        if (currentUsername && u === currentUsername.toLowerCase().replace('@', '')) return true; 
        const qUsers = query(collection(db, "users"), where("searchKey", "==", u));
        const qChats = query(collection(db, "chats"), where("searchKey", "==", u));
        const [sU, sC] = await Promise.all([getDocs(qUsers), getDocs(qChats)]);
        return sU.empty && sC.empty;
    },
    parseMentions: (text) => text.replace(/@([a-zA-Z0-9_]{6,})/g, '<span style="color: var(--accent); cursor: pointer; text-decoration: underline;" onclick="Fluxgram.chat.openByUsername(\'$1\')">@$1</span>'),
    renderAvatarHTML: (photoURL, fallbackName, sizeClass = '') => {
        if(photoURL && photoURL.length > 10) return `<img src="${photoURL}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" class="${sizeClass}">`;
        return `<span class="${sizeClass}">${(fallbackName||'U').charAt(0).toUpperCase()}</span>`;
    },
    compressToBase64: (dataUrl, maxWidth = 300, quality = 0.6) => {
        return new Promise((resolve) => {
            const img = new Image(); img.src = dataUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } 
                else { if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(dataUrl);
        });
    }
};
const Utils = window.Fluxgram.utils;

window.Fluxgram.ui = {
    loader: (show) => { const l = document.getElementById('global-loader'); if(l) l.classList.toggle('hidden', !show); },
    toast: (msg, type = 'success') => {
        const container = document.getElementById('toast-container'); if(!container) return;
        const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = msg;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },
    toggleForms: (formType) => { ['login', 'signup', 'reset'].forEach(f => { const el = document.getElementById(`${f}-form`); if(el) el.classList.toggle('hidden', formType !== f); }); },
    autoResize: (el) => { if (el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; } },
    getParam: (param) => new URLSearchParams(window.location.search).get(param),
    showProfile: () => {
        const pv = document.getElementById('profile-view'); if(!pv) return;
        if (State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) {
            const d = State.activeChatData;
            document.getElementById('pv-name').innerText = d.name;
            document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(d.photoURL, d.name);
            if(document.getElementById('pv-btn-audio')) document.getElementById('pv-btn-audio').classList.add('hidden');
            if(document.getElementById('pv-btn-video')) document.getElementById('pv-btn-video').classList.add('hidden');
            const editBtn = document.getElementById('btn-edit-chat');
            if(editBtn) { if(d.admin === State.currentUser.uid) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }
        } else if (State.activeChatUser) {
            const u = State.activeChatUser;
            document.getElementById('pv-name').innerText = u.name || u.username;
            document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(u.photoURL, u.username || u.name);
            if(document.getElementById('pv-btn-audio')) document.getElementById('pv-btn-audio').classList.remove('hidden');
            if(document.getElementById('pv-btn-video')) document.getElementById('pv-btn-video').classList.remove('hidden');
            const editBtn = document.getElementById('btn-edit-chat');
            if(editBtn) editBtn.classList.add('hidden'); 
        }
        pv.classList.remove('hidden');
    },
    hideProfile: () => { const pv = document.getElementById('profile-view'); if(pv) pv.classList.add('hidden'); }
};
const UI = window.Fluxgram.ui;

window.Fluxgram.auth = {
    login: async () => { const e = document.getElementById('login-email').value.trim(); const p = document.getElementById('login-password').value.trim(); if(!e || !p) return UI.toast("Enter email and password", "error"); UI.loader(true); try { await signInWithEmailAndPassword(auth, e, p); } catch (err) { UI.toast("Invalid credentials.", "error"); UI.loader(false); } },
    signup: async () => {
        let u = document.getElementById('signup-username').value.trim().replace('@', ''); const e = document.getElementById('signup-email').value.trim(); const p = document.getElementById('signup-password').value.trim();
        if(!u || !e || p.length < 6) return UI.toast("Fill all fields. Password min 6 chars.", "error");
        UI.loader(true);
        try {
            if(!(await Utils.isUsernameUnique(u))) throw new Error("Username already taken.");
            const res = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db, "users", res.user.uid), { uid: res.user.uid, email: e, username: u, searchKey: u.toLowerCase(), isOnline: true, lastSeen: serverTimestamp(), photoURL: null });
            UI.toast("Account created successfully!");
        } catch (err) { UI.toast(err.message, "error"); } finally { UI.loader(false); }
    },
    logout: async () => { UI.loader(true); if(auth.currentUser) await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }); await signOut(auth); }
};

function updatePresence(isOnline) { if(auth.currentUser) setDoc(doc(db, "users", auth.currentUser.uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true }).catch(e=>{}); }
window.addEventListener('beforeunload', () => updatePresence(false));
document.addEventListener('visibilitychange', () => updatePresence(document.visibilityState === 'visible'));

Fluxgram.network.init();

onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname.toLowerCase();
    if (user) {
        State.currentUser = user;
        onSnapshot(doc(db, "users", user.uid), (d) => { if(d.exists()) State.userData = d.data(); });
        const deepLinkUsername = UI.getParam('link');
        if(deepLinkUsername && !path.includes('chat')) { window.location.replace(`chat.html?link=${deepLinkUsername}`); return; }
        if (path.includes('index') || path === '/' || path.endsWith('/')) { window.location.replace('dashboard.html'); return; }
        if (path.includes('dashboard')) { window.Fluxgram.dash.loadChats(); } 
        else if (path.includes('chat')) { window.Fluxgram.chat.init(); window.Fluxgram.call.listenForCalls(); }
    } else {
        State.currentUser = null;
        if (path.includes('dashboard') || path.includes('chat')) { window.location.replace('index.html'); }
    }
    const splash = document.getElementById('splash-screen');
    if(splash) { splash.style.opacity = '0'; setTimeout(() => { splash.style.visibility = 'hidden'; }, 500); }
    UI.loader(false);
});

// Profile and Dash objects omitted for brevity (Keep yours exactly the same as before!)
window.Fluxgram.profile = { /* KEEP FROM PREVIOUS CODE */ };
window.Fluxgram.dash = { /* KEEP FROM PREVIOUS CODE */ loadChats: () => {
    const list = document.getElementById('chat-list'); if(!list) return;
    State.isInitialLoad = true; Fluxgram.network.updateStatusUI();
    const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid));
    State.unsubChats = onSnapshot(q, async (snapshot) => {
        State.isInitialLoad = false; Fluxgram.network.updateStatusUI();
        list.innerHTML = '';
        if(snapshot.empty) { list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted);">No chats yet.</div>`; return; }
        const chatDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt));
        for (const data of chatDocs) {
            const timeStr = formatTime(data.updatedAt);
            const unread = (data.lastSender !== State.currentUser.uid && data.unreadCount > 0) ? `<div class="unread-badge">${data.unreadCount}</div>` : '';
            if (data.type === 'group' || data.type === 'channel') {
                const icon = data.type === 'channel' ? 'fa-bullhorn' : 'fa-users';
                list.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?chatId=${data.id}'"><div class="avatar">${Utils.renderAvatarHTML(data.photoURL, data.name)}</div><div class="chat-info"><div class="c-name-row"><div class="c-name">${data.name} <i class="fas ${icon}" style="font-size:0.8rem; color:var(--text-muted);"></i></div><div class="c-time">${timeStr}</div></div><div class="c-msg-row"><div class="c-msg">${data.lastMessage || ''}</div>${unread}</div></div></div>`;
                continue;
            }
            const otherUid = data.members.find(id => id !== State.currentUser.uid); if(!otherUid) continue;
            try {
                const otherUserDoc = await getDoc(doc(db, "users", otherUid)); if(!otherUserDoc.exists()) continue;
                const otherUser = otherUserDoc.data();
                list.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?uid=${otherUid}'"><div class="avatar">${Utils.renderAvatarHTML(otherUser.photoURL, otherUser.username)}</div><div class="chat-info"><div class="c-name-row"><div class="c-name">${otherUser.username || 'User'}</div><div class="c-time">${timeStr}</div></div><div class="c-msg-row"><div class="c-msg">${data.lastMessage || ''}</div>${unread}</div></div></div>`;
            } catch(err) {}
        }
    });
}};

// 🔥 MAIN CHAT LOGIC (ADDED BATCH WRITES FOR BLUE TICKS & REPLY STATE) 🔥
window.Fluxgram.chat = {
    init: async () => {
        const otherUid = UI.getParam('uid'); const existingChatId = UI.getParam('chatId'); const deepLink = UI.getParam('link'); 
        try {
            if(deepLink) return await window.Fluxgram.chat.openByUsername(deepLink);
            if(!otherUid && !existingChatId) return window.location.replace('dashboard.html');

            if (existingChatId) {
                State.activeChatId = existingChatId;
                onSnapshot(doc(db, "chats", existingChatId), (d) => {
                    if(d.exists()) {
                        State.activeChatData = d.data();
                        document.getElementById('chat-name').innerText = State.activeChatData.name;
                        document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(State.activeChatData.photoURL, State.activeChatData.name);
                        if(State.activeChatData.lastSender !== State.currentUser.uid) updateDoc(doc(db, "chats", existingChatId), { unreadCount: 0 });
                    }
                });
            } else {
                const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`;
                State.activeChatId = chatId;
                const chatRef = doc(db, "chats", chatId); const chatSnap = await getDoc(chatRef);
                if(!chatSnap.exists()){ await setDoc(chatRef, { type: 'direct', members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp() }); }
                else if(chatSnap.data().lastSender !== State.currentUser.uid) { await updateDoc(chatRef, { unreadCount: 0 }); }

                onSnapshot(doc(db, "users", otherUid), (d) => {
                    if(d.exists()) {
                        State.activeChatUser = d.data();
                        document.getElementById('chat-name').innerText = State.activeChatUser.username || State.activeChatUser.name;
                        document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(State.activeChatUser.photoURL, State.activeChatUser.username);
                    }
                });
            }

            const msgInput = document.getElementById('msg-input');
            if(msgInput) {
                msgInput.addEventListener('input', () => { 
                    UI.autoResize(msgInput); 
                    if(msgInput.value.trim().length > 0) { document.getElementById('btn-send-text').classList.remove('hidden'); document.getElementById('btn-record-voice').classList.add('hidden'); } 
                    else { document.getElementById('btn-send-text').classList.add('hidden'); document.getElementById('btn-record-voice').classList.remove('hidden'); }
                });
                msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Fluxgram.chat.send(); } });
            }
            window.Fluxgram.chat.loadMessages();
        } catch(error) { UI.toast("Failed to load chat", "error"); }
    },
    
    loadMessages: () => {
        const container = document.getElementById('messages-container'); if(!container) return;
        const q = query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("timestamp", "asc"));
        
        State.unsubMessages = onSnapshot(q, (snapshot) => {
            window._localMessages = {}; 
            container.innerHTML = '';
            let lastDateStr = '';
            
            let batch = writeBatch(db); // For updating Blue Ticks
            let hasUnreadMessages = false;

            snapshot.forEach(docSnap => {
                const msgId = docSnap.id;
                const msg = docSnap.data();
                window._localMessages[msgId] = msg;
                
                if(msg.deletedFor && msg.deletedFor.includes(State.currentUser.uid)) return; 
                
                // 🔥 Blue Tick Logic: If the other user sent it and I haven't read it yet
                if(msg.senderId !== State.currentUser.uid && msg.status !== 'read') {
                    batch.update(docSnap.ref, { status: 'read' });
                    hasUnreadMessages = true;
                }

                const isMe = msg.senderId === State.currentUser.uid;
                const timeStr = formatTime(msg.timestamp);
                const dateStr = formatDate(msg.timestamp);
                
                if(dateStr && dateStr !== lastDateStr) { container.innerHTML += `<div class="date-divider"><span>${dateStr}</span></div>`; lastDateStr = dateStr; }

                let contentHTML = '';
                if(msg.type === 'call') {
                    contentHTML = `<div class="call-log ${msg.status === 'missed' ? 'missed' : 'success'}"><i class="fas fa-phone"></i> ${msg.text}</div>`;
                } else {
                    // Render Replied Message Bubble Inside
                    if(msg.replyTo) {
                        contentHTML += `<div class="replied-msg-box"><div class="replied-name">${msg.replyTo.senderName}</div><div class="replied-text">${msg.replyTo.text}</div></div>`;
                    }
                    if(msg.text) contentHTML += Utils.parseMentions((msg.text||'').replace(/\n/g, '<br>'));
                    if(msg.image) contentHTML += `<img src="${msg.image}" class="chat-img" onclick="event.stopPropagation(); window.open('${msg.image}')">`;
                    if(msg.audio) contentHTML += `<audio src="${msg.audio}" controls class="chat-audio" onclick="event.stopPropagation()"></audio>`;
                }

                // Render Ticks for Sender
                let tickHTML = '';
                if(isMe && msg.type !== 'call') {
                    if(msg.status === 'read') tickHTML = `<span class="msg-ticks read"><i class="fas fa-check-double"></i></span>`;
                    else tickHTML = `<span class="msg-ticks"><i class="fas fa-check"></i></span>`; // Sent (Single tick)
                }

                const senderNameHTML = (!isMe && State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) ? `<div style="font-size:0.75rem; color:var(--accent); font-weight:bold; margin-bottom:3px;">User: ${msg.senderId.substring(0,5)}</div>` : '';

                container.innerHTML += `
                    <div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}">
                        <div class="msg-bubble" onclick="Fluxgram.chat.showMsgMenu('${msgId}')">
                            ${senderNameHTML}${contentHTML}<div class="msg-meta">${timeStr}${tickHTML}</div>
                        </div>
                    </div>`;
            });
            
            // Execute Blue Ticks batch update
            if(hasUnreadMessages) batch.commit();

            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
    },

    // 🔥 UPGRADED CONTEXT MENU (Delete & Reply) 🔥
    showMsgMenu: (msgId) => {
        State.selectedMsgId = msgId;
        const msg = window._localMessages[msgId];
        if(!msg || msg.type === 'call') return; // Don't reply/delete call logs for now

        const isMe = msg.senderId === State.currentUser.uid;
        const isAdmin = State.activeChatData && State.activeChatData.admin === State.currentUser.uid;
        
        const modal = document.getElementById('msg-action-modal');
        const btnEveryone = document.getElementById('btn-delete-everyone');
        if(isMe || isAdmin) btnEveryone.classList.remove('hidden'); else btnEveryone.classList.add('hidden');
        
        modal.classList.remove('hidden');
    },

    initReply: () => {
        const msgId = State.selectedMsgId;
        const msg = window._localMessages[msgId];
        if(!msg) return;
        document.getElementById('msg-action-modal').classList.add('hidden');

        // Setup the reply bar
        const isMe = msg.senderId === State.currentUser.uid;
        let senderName = isMe ? "You" : (State.activeChatUser?.username || "User");
        let previewText = msg.text || (msg.image ? '📸 Image' : '🎤 Voice');

        State.replyingTo = { msgId: msgId, text: previewText, senderName: senderName };
        
        document.getElementById('reply-preview-name').innerText = senderName;
        document.getElementById('reply-preview-text').innerText = previewText;
        document.getElementById('reply-preview-bar').classList.remove('hidden');
        
        document.getElementById('msg-input').focus();
    },

    cancelReply: () => {
        State.replyingTo = null;
        document.getElementById('reply-preview-bar').classList.add('hidden');
    },

    executeDelete: async (type) => {
        const msgId = State.selectedMsgId; if(!msgId) return;
        document.getElementById('msg-action-modal').classList.add('hidden');
        try {
            const msgRef = doc(db, `chats/${State.activeChatId}/messages`, msgId);
            if(type === 'everyone') { await deleteDoc(msgRef); UI.toast("Message deleted"); } 
            else if(type === 'me') { await updateDoc(msgRef, { deletedFor: arrayUnion(State.currentUser.uid) }); UI.toast("Deleted for you"); }
        } catch(e) { UI.toast("Failed to delete", "error"); }
    },

    send: async () => {
        const input = document.getElementById('msg-input');
        if(!input) return;
        const text = input.value.trim();
        if(!text || !State.activeChatId) return;
        
        input.value = ''; UI.autoResize(input);
        document.getElementById('btn-send-text').classList.add('hidden');
        document.getElementById('btn-record-voice').classList.remove('hidden');

        const msgData = {
            text: text,
            senderId: State.currentUser.uid,
            timestamp: serverTimestamp(),
            status: 'sent' // Initial status for ticks
        };

        // Inject Reply Data if exists
        if(State.replyingTo) {
            msgData.replyTo = State.replyingTo;
            window.Fluxgram.chat.cancelReply();
        }

        try {
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), msgData);
            const snap = await getDoc(doc(db, "chats", State.activeChatId));
            let unread = snap.exists() ? (snap.data().unreadCount || 0) : 0;
            await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: text, lastSender: State.currentUser.uid, updatedAt: serverTimestamp(), unreadCount: unread + 1, typing: [] }, { merge: true });
        } catch(e) { UI.toast(e.message, "error"); }
    }
};

// Event Listener for the Reply Button in the Modal
document.getElementById('btn-reply-msg').addEventListener('click', () => { Fluxgram.chat.initReply(); });

// (Voice, Media, Call System remains untouched)
window.Fluxgram.call = { /* KEEP PREVIOUS CALL LOGIC EXACLY THE SAME */ };
