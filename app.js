// ============================================================================
// app.js - Fluxgram Ultimate Engine (FULL CODE - NO SHORTCUTS)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCsbZ1fqDivv8OyUiTcaEMcpZlJlM1TI6Y",
    authDomain: "fluxgram-87009.firebaseapp.com",
    projectId: "fluxgram-87009",
    storageBucket: "fluxgram-87009.firebasestorage.app",
    messagingSenderId: "698836385253",
    appId: "1:698836385253:web:c40e67ee9006cff536830c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.Fluxgram = {
    state: { currentUser: null, userData: null, activeChatId: null, activeChatUser: null, activeChatData: null, unsubMessages: null, unsubChats: null, callDocId: null, startTime: null, selectedMsgId: null, isInitialLoad: true, replyingTo: null, callRole: null, callType: null },
    ui: {}, auth: {}, dash: {}, chat: {}, call: {}, utils: {}, profile: {}, network: {}
};

const State = window.Fluxgram.state;
window._localMessages = {};

// Voice variables
window._voiceRecorder = null;
window._voiceChunks = [];
window._voiceStream = null;
window._recordTimer = null;
window._recordSeconds = 0;
window._isRecordingCancelled = false;
window._startX = 0;

window.Fluxgram.network = {
    init: () => { window.addEventListener('online', Fluxgram.network.updateStatusUI); window.addEventListener('offline', Fluxgram.network.updateStatusUI); },
    updateStatusUI: () => {
        const bar = document.getElementById('connection-status-bar'); const text = document.getElementById('connection-text'); const icon = document.getElementById('connection-icon');
        if(!bar || !text || !icon) return;
        if (!navigator.onLine) { bar.classList.remove('hidden'); text.innerText = "Waiting for network..."; icon.className = "fas fa-wifi status-icon"; } 
        else if (State.isInitialLoad) { bar.classList.remove('hidden'); text.innerText = "Connecting..."; icon.className = "fas fa-sync-alt fa-spin status-icon"; } 
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
        const qUsers = query(collection(db, "users"), where("searchKey", "==", u)); const qChats = query(collection(db, "chats"), where("searchKey", "==", u));
        const [sU, sC] = await Promise.all([getDocs(qUsers), getDocs(qChats)]); return sU.empty && sC.empty;
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
                if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } else { if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; } }
                canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', quality));
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
        container.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },
    toggleForms: (formType) => { ['login', 'signup', 'reset'].forEach(f => { const el = document.getElementById(`${f}-form`); if(el) el.classList.toggle('hidden', formType !== f); }); },
    autoResize: (el) => { if (el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; } },
    getParam: (param) => new URLSearchParams(window.location.search).get(param),
    showProfile: () => {
        const pv = document.getElementById('profile-view'); if(!pv) return;
        if (State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) {
            document.getElementById('pv-name').innerText = State.activeChatData.name; document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(State.activeChatData.photoURL, State.activeChatData.name);
            if(document.getElementById('pv-btn-audio')) document.getElementById('pv-btn-audio').classList.add('hidden');
            if(document.getElementById('pv-btn-video')) document.getElementById('pv-btn-video').classList.add('hidden');
            const editBtn = document.getElementById('btn-edit-chat'); if(editBtn) { if(State.activeChatData.admin === State.currentUser.uid) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }
        } else if (State.activeChatUser) {
            document.getElementById('pv-name').innerText = State.activeChatUser.name || State.activeChatUser.username; document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(State.activeChatUser.photoURL, State.activeChatUser.username || State.activeChatUser.name);
            if(document.getElementById('pv-btn-audio')) document.getElementById('pv-btn-audio').classList.remove('hidden');
            if(document.getElementById('pv-btn-video')) document.getElementById('pv-btn-video').classList.remove('hidden');
            const editBtn = document.getElementById('btn-edit-chat'); if(editBtn) editBtn.classList.add('hidden'); 
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
    reset: async () => { const e = document.getElementById('reset-email').value.trim(); if(!e) return UI.toast("Enter email", "error"); try { await sendPasswordResetEmail(auth, e); UI.toast("Password reset link sent!", "success"); UI.toggleForms('login'); } catch(err) { UI.toast(err.message, "error"); } },
    logout: async () => { UI.loader(true); if(auth.currentUser) await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }); await signOut(auth); }
};

function updatePresence(isOnline) { if(auth.currentUser) setDoc(doc(db, "users", auth.currentUser.uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true }).catch(e=>{}); }
window.addEventListener('beforeunload', () => updatePresence(false));
document.addEventListener('visibilitychange', () => updatePresence(document.visibilityState === 'visible'));

Fluxgram.network.init();

onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname.toLowerCase();
    if (user) {
        State.currentUser = user; onSnapshot(doc(db, "users", user.uid), (d) => { if(d.exists()) State.userData = d.data(); });
        const deepLinkUsername = UI.getParam('link'); if(deepLinkUsername && !path.includes('chat')) { window.location.replace(`chat.html?link=${deepLinkUsername}`); return; }
        if (path.includes('index') || path === '/' || path.endsWith('/')) { window.location.replace('dashboard.html'); return; }
        if (path.includes('dashboard')) { window.Fluxgram.dash.loadChats(); } else if (path.includes('chat')) { window.Fluxgram.chat.init(); window.Fluxgram.call.listenForCalls(); }
    } else {
        State.currentUser = null; if (path.includes('dashboard') || path.includes('chat')) { window.location.replace('index.html'); }
    }
    const splash = document.getElementById('splash-screen'); if(splash) { splash.style.opacity = '0'; setTimeout(() => { splash.style.visibility = 'hidden'; }, 500); }
    UI.loader(false);
});

window.Fluxgram.profile = {
    openMyProfile: () => {
        if(!State.userData) return;
        document.getElementById('my-display-name').innerText = State.userData.name || State.userData.username;
        document.getElementById('my-display-avatar').innerHTML = Utils.renderAvatarHTML(State.userData.photoURL, State.userData.username || 'U');
        document.getElementById('my-display-email').innerText = State.userData.email || 'Not set';
        document.getElementById('my-display-bio').innerText = State.userData.bio || 'Available on Fluxgram';
        document.getElementById('my-display-username').innerText = `@${State.userData.username}`;
        document.getElementById('my-profile-edit-state').classList.add('hidden');
        document.getElementById('my-profile-view-state').classList.remove('hidden');
        document.getElementById('my-profile-view-state').style.display = 'flex';
        document.getElementById('my-profile-modal').classList.remove('hidden');
    },
    toggleEditState: (showEdit) => {
        const viewState = document.getElementById('my-profile-view-state');
        const editState = document.getElementById('my-profile-edit-state');
        if(showEdit) {
            document.getElementById('edit-user-name').value = State.userData.name || '';
            document.getElementById('edit-user-username').value = State.userData.username || '';
            document.getElementById('edit-user-bio').value = State.userData.bio || '';
            viewState.classList.add('hidden'); editState.classList.remove('hidden'); editState.style.display = 'flex';
        } else {
            editState.classList.add('hidden'); viewState.classList.remove('hidden'); viewState.style.display = 'flex';
        }
    },
    instantAvatarUpload: async (event) => {
        const file = event.target.files[0]; if(!file) return; UI.loader(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Str = await Utils.compressToBase64(e.target.result, 300, 0.7);
                await setDoc(doc(db, "users", State.currentUser.uid), { photoURL: base64Str }, { merge: true });
                document.getElementById('my-display-avatar').innerHTML = Utils.renderAvatarHTML(base64Str, State.userData.username);
                UI.toast("Profile photo updated!", "success"); UI.loader(false);
            };
            reader.readAsDataURL(file);
        } catch(e) { UI.toast("Failed to update photo", "error"); UI.loader(false); }
    },
    saveUserEdit: async () => {
        const n = document.getElementById('edit-user-name').value.trim();
        let u = document.getElementById('edit-user-username').value.trim().replace('@', '');
        const b = document.getElementById('edit-user-bio').value.trim();
        if(!u || u.length < 6) return UI.toast("Username must be at least 6 chars", "error");
        UI.loader(true);
        try {
            if(!(await Utils.isUsernameUnique(u, State.userData.username))) throw new Error("This @username is already taken!");
            await setDoc(doc(db, "users", State.currentUser.uid), { name: n, username: u, searchKey: u.toLowerCase(), bio: b }, { merge: true });
            State.userData.name = n; State.userData.username = u; State.userData.bio = b;
            window.Fluxgram.profile.openMyProfile(); 
            UI.toast("Info updated successfully!");
        } catch(e) { UI.toast(e.message, "error"); } finally { UI.loader(false); }
    },
    changeEmail: async () => {
        const pass = document.getElementById('email-change-password').value;
        const newEmail = document.getElementById('email-change-new').value.trim();
        if(!pass || !newEmail) return UI.toast("Enter password and new email", "error");
        UI.loader(true);
        try {
            const credential = EmailAuthProvider.credential(State.currentUser.email, pass);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updateEmail(auth.currentUser, newEmail);
            await setDoc(doc(db, "users", State.currentUser.uid), { email: newEmail }, { merge: true });
            document.getElementById('email-change-modal').classList.add('hidden'); 
            document.getElementById('my-display-email').innerText = newEmail; 
            UI.toast("Email updated successfully!", "success");
        } catch(e) { UI.toast("Error: Incorrect password or invalid email.", "error"); } finally { UI.loader(false); }
    },
    previewImage: (event, imgId, textId) => {
        const file = event.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById(imgId).src = e.target.result;
                document.getElementById(imgId).classList.remove('hidden');
                if(document.getElementById(textId)) document.getElementById(textId).classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    },
    openChatEdit: () => {
        if(!State.activeChatData || State.activeChatData.admin !== State.currentUser.uid) return;
        const d = State.activeChatData;
        document.getElementById('edit-chat-name').value = d.name || '';
        document.getElementById('edit-chat-username').value = d.username || '';
        document.getElementById('edit-chat-desc').value = d.desc || '';
        const preview = document.getElementById('chat-avatar-preview');
        const text = document.getElementById('chat-avatar-text');
        if(d.photoURL && d.photoURL.length > 10) { preview.src = d.photoURL; preview.classList.remove('hidden'); text.classList.add('hidden'); } 
        else { preview.classList.add('hidden'); text.classList.remove('hidden'); text.innerText = (d.name || 'G').charAt(0).toUpperCase(); }
        document.getElementById('edit-chat-modal').classList.remove('hidden');
    },
    saveChatEdit: async () => {
        const n = document.getElementById('edit-chat-name').value.trim();
        let u = document.getElementById('edit-chat-username').value.trim().replace('@', '');
        const desc = document.getElementById('edit-chat-desc').value.trim();
        const previewImg = document.getElementById('chat-avatar-preview');
        if(!n) return UI.toast("Name is required", "error");
        if(u && u.length < 6) return UI.toast("Username must be at least 6 chars", "error");
        UI.loader(true);
        try {
            if(u && !(await Utils.isUsernameUnique(u, State.activeChatData.username))) throw new Error("This @username is already taken!");
            let finalPhotoURL = State.activeChatData.photoURL !== undefined ? State.activeChatData.photoURL : null;
            if(previewImg && !previewImg.classList.contains('hidden') && previewImg.src.startsWith('data:')) {
                finalPhotoURL = await Utils.compressToBase64(previewImg.src, 150, 0.6);
            }
            await updateDoc(doc(db, "chats", State.activeChatId), { name: n, username: u || null, searchKey: u ? u.toLowerCase() : null, desc: desc, photoURL: finalPhotoURL });
            document.getElementById('edit-chat-modal').classList.add('hidden'); 
            UI.toast("Updated successfully!"); UI.showProfile(); 
        } catch(e) { UI.toast(e.message, "error"); } finally { UI.loader(false); }
    },
    deleteChat: async () => {
        if(confirm("Are you sure you want to delete this Group/Channel?")) {
            UI.loader(true);
            try { await deleteDoc(doc(db, "chats", State.activeChatId)); UI.toast("Deleted successfully"); window.location.href = 'dashboard.html'; } 
            catch(e) { UI.toast(e.message, "error"); UI.loader(false); }
        }
    }
};

window.Fluxgram.dash = {
    search: async () => {
        const term = document.getElementById('search-input').value.trim().toLowerCase().replace('@', '');
        const resBox = document.getElementById('search-results');
        const chatList = document.getElementById('chat-list');
        if(term.length < 2) { resBox.classList.add('hidden'); chatList.classList.remove('hidden'); return; }
        resBox.classList.remove('hidden'); chatList.classList.add('hidden');
        resBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">Searching...</div>`;

        try {
            const [snapsU, snapsC] = await Promise.all([ getDocs(query(collection(db, "users"), where("searchKey", ">=", term), where("searchKey", "<=", term + '\uf8ff'))), getDocs(query(collection(db, "chats"), where("searchKey", ">=", term), where("searchKey", "<=", term + '\uf8ff'))) ]);
            resBox.innerHTML = '';
            snapsU.forEach(d => {
                if(d.id === State.currentUser.uid) return; const u = d.data();
                resBox.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?uid=${u.uid}'"><div class="avatar">${Utils.renderAvatarHTML(u.photoURL, u.username)}</div><div class="chat-info"><div class="c-name">@${u.username}</div></div></div>`;
            });
            snapsC.forEach(d => {
                const c = d.data();
                if(c.type === 'group' || c.type === 'channel') {
                    resBox.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?chatId=${d.id}'"><div class="avatar">${Utils.renderAvatarHTML(c.photoURL, c.name)}</div><div class="chat-info"><div class="c-name">${c.name} (Public)</div><div class="c-msg">@${c.username}</div></div></div>`;
                }
            });
            if(resBox.innerHTML === '') resBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">No matches found</div>`;
        } catch(e) {}
    },
    setCreateType: (type) => {
        document.getElementById('create-type').value = type;
        const btnG = document.getElementById('btn-type-group'); const btnC = document.getElementById('btn-type-channel');
        btnG.style.background = type === 'group' ? 'var(--primary)' : 'var(--bg-base)'; btnG.style.color = type === 'group' ? 'white' : 'var(--text-muted)';
        btnC.style.background = type === 'channel' ? 'var(--primary)' : 'var(--bg-base)'; btnC.style.color = type === 'channel' ? 'white' : 'var(--text-muted)';
    },
    createGroupOrChannel: async () => {
        const type = document.getElementById('create-type').value;
        const name = document.getElementById('create-name').value.trim();
        const desc = document.getElementById('create-desc').value.trim();
        let username = document.getElementById('create-username').value.trim().replace('@', '');
        const previewImg = document.getElementById('create-avatar-preview');
        
        if(!name) return UI.toast("Name is required", "error");
        if(username && username.length < 6) return UI.toast("Username must be at least 6 chars", "error");

        UI.loader(true);
        try {
            if(username && !(await Utils.isUsernameUnique(username))) throw new Error("This @username is already taken!");
            let photoURL = null;
            if(previewImg && !previewImg.classList.contains('hidden') && previewImg.src.startsWith('data:')) { photoURL = await Utils.compressToBase64(previewImg.src, 150, 0.6); }

            const newRef = await addDoc(collection(db, "chats"), {
                type: type, name: name, desc: desc, username: username || null, searchKey: username ? username.toLowerCase() : null, photoURL: photoURL,
                admin: State.currentUser.uid, members: [State.currentUser.uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: `Created ${type}`, unreadCount: 0
            });
            window.location.href = `chat.html?chatId=${newRef.id}`;
        } catch(e) { UI.toast(e.message, "error"); } finally { UI.loader(false); }
    },
    loadChats: () => {
        const list = document.getElementById('chat-list'); if(!list) return;
        State.isInitialLoad = true; Fluxgram.network.updateStatusUI();
        const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid));
        
        State.unsubChats = onSnapshot(q, async (snapshot) => {
            State.isInitialLoad = false; Fluxgram.network.updateStatusUI(); list.innerHTML = '';
            if(snapshot.empty) { list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted);">No chats yet.</div>`; return; }

            const chatDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt));

            for (const data of chatDocs) {
                const timeStr = formatTime(data.updatedAt); const unread = (data.lastSender !== State.currentUser.uid && data.unreadCount > 0) ? `<div class="unread-badge">${data.unreadCount}</div>` : '';
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
    }
};

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
                const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`; State.activeChatId = chatId;
                const chatRef = doc(db, "chats", chatId); const chatSnap = await getDoc(chatRef);
                if(!chatSnap.exists()){ await setDoc(chatRef, { type: 'direct', members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp() }); }
                else if(chatSnap.data().lastSender !== State.currentUser.uid) { await updateDoc(chatRef, { unreadCount: 0 }); }
                onSnapshot(doc(db, "users", otherUid), (d) => { if(d.exists()) { State.activeChatUser = d.data(); document.getElementById('chat-name').innerText = State.activeChatUser.username || State.activeChatUser.name; document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(State.activeChatUser.photoURL, State.activeChatUser.username); } });
            }

            const msgInput = document.getElementById('msg-input');
            if(msgInput) {
                msgInput.addEventListener('focus', () => { setTimeout(() => { const container = document.getElementById('messages-container'); if(container) container.scrollTop = container.scrollHeight; }, 300); });
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
            window._localMessages = {}; container.innerHTML = ''; let lastDateStr = ''; let batch = writeBatch(db); let hasUnreadMessages = false;

            snapshot.forEach(docSnap => {
                const msgId = docSnap.id; const msg = docSnap.data(); window._localMessages[msgId] = msg;
                if(msg.deletedFor && msg.deletedFor.includes(State.currentUser.uid)) return; 
                if(msg.senderId !== State.currentUser.uid && msg.status !== 'read') { batch.update(docSnap.ref, { status: 'read' }); hasUnreadMessages = true; }

                const isMe = msg.senderId === State.currentUser.uid; const timeStr = formatTime(msg.timestamp); const dateStr = formatDate(msg.timestamp);
                if(dateStr && dateStr !== lastDateStr) { container.innerHTML += `<div class="date-divider"><span>${dateStr}</span></div>`; lastDateStr = dateStr; }

                let contentHTML = '';
                if(msg.type === 'call') { contentHTML = `<div class="call-log ${msg.status === 'missed' ? 'missed' : 'success'}"><i class="fas fa-phone"></i> ${msg.text}</div>`; } 
                else {
                    if(msg.replyTo) { contentHTML += `<div class="replied-msg-box"><div class="replied-name">${msg.replyTo.senderName}</div><div class="replied-text">${msg.replyTo.text}</div></div>`; }
                    if(msg.text) contentHTML += Utils.parseMentions((msg.text||'').replace(/\n/g, '<br>'));
                    if(msg.image) contentHTML += `<img src="${msg.image}" class="chat-img" onclick="event.stopPropagation(); window.open('${msg.image}')">`;
                    if(msg.audio) contentHTML += `<audio src="${msg.audio}" controls class="chat-audio" onclick="event.stopPropagation()"></audio>`;
                }

                let tickHTML = '';
                if(isMe && msg.type !== 'call') { if(msg.status === 'read') tickHTML = `<span class="msg-ticks read"><i class="fas fa-check-double"></i></span>`; else tickHTML = `<span class="msg-ticks"><i class="fas fa-check"></i></span>`; }
                const senderNameHTML = (!isMe && State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) ? `<div style="font-size:0.75rem; color:var(--accent); font-weight:bold; margin-bottom:3px;">User: ${msg.senderId.substring(0,5)}</div>` : '';

                container.innerHTML += `<div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}"><div class="msg-bubble" onclick="Fluxgram.chat.showMsgMenu('${msgId}')">${senderNameHTML}${contentHTML}<div class="msg-meta">${timeStr}${tickHTML}</div></div></div>`;
            });
            if(hasUnreadMessages) batch.commit();
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
    },

    showMsgMenu: (msgId) => {
        State.selectedMsgId = msgId; const msg = window._localMessages[msgId]; if(!msg || msg.type === 'call') return;
        const isMe = msg.senderId === State.currentUser.uid; const isAdmin = State.activeChatData && State.activeChatData.admin === State.currentUser.uid;
        const modal = document.getElementById('msg-action-modal'); const btnEveryone = document.getElementById('btn-delete-everyone');
        if(isMe || isAdmin) btnEveryone.classList.remove('hidden'); else btnEveryone.classList.add('hidden'); modal.classList.remove('hidden');
    },

    initReply: () => {
        const msgId = State.selectedMsgId; const msg = window._localMessages[msgId]; if(!msg) return; document.getElementById('msg-action-modal').classList.add('hidden');
        const isMe = msg.senderId === State.currentUser.uid; let senderName = isMe ? "You" : (State.activeChatUser?.username || "User"); let previewText = msg.text || (msg.image ? '📸 Image' : '🎤 Voice');
        State.replyingTo = { msgId: msgId, text: previewText, senderName: senderName };
        document.getElementById('reply-preview-name').innerText = senderName; document.getElementById('reply-preview-text').innerText = previewText; document.getElementById('reply-preview-bar').classList.remove('hidden'); document.getElementById('msg-input').focus();
    },

    cancelReply: () => { State.replyingTo = null; document.getElementById('reply-preview-bar').classList.add('hidden'); },

    executeDelete: async (type) => {
        const msgId = State.selectedMsgId; if(!msgId) return; document.getElementById('msg-action-modal').classList.add('hidden');
        try {
            const msgRef = doc(db, `chats/${State.activeChatId}/messages`, msgId);
            if(type === 'everyone') { await deleteDoc(msgRef); UI.toast("Message deleted"); } else if(type === 'me') { await updateDoc(msgRef, { deletedFor: arrayUnion(State.currentUser.uid) }); UI.toast("Deleted for you"); }
        } catch(e) { UI.toast("Failed to delete", "error"); }
    },

    send: async () => {
        const input = document.getElementById('msg-input'); if(!input) return; const text = input.value.trim(); if(!text || !State.activeChatId) return;
        input.value = ''; UI.autoResize(input); document.getElementById('btn-send-text').classList.add('hidden'); document.getElementById('btn-record-voice').classList.remove('hidden');
        const msgData = { text: text, senderId: State.currentUser.uid, timestamp: serverTimestamp(), status: 'sent' };
        if(State.replyingTo) { msgData.replyTo = State.replyingTo; window.Fluxgram.chat.cancelReply(); }
        try {
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), msgData); const snap = await getDoc(doc(db, "chats", State.activeChatId)); let unread = snap.exists() ? (snap.data().unreadCount || 0) : 0;
            await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: text, lastSender: State.currentUser.uid, updatedAt: serverTimestamp(), unreadCount: unread + 1, typing: [] }, { merge: true });
        } catch(e) { UI.toast(e.message, "error"); }
    },

    sendImage: async (e) => {
        const file = e.target.files[0]; if(!file) return; UI.loader(true);
        try {
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onloadend = async () => {
                const compressedImg = await Utils.compressToBase64(reader.result, 600, 0.7);
                await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { image: compressedImg, senderId: State.currentUser.uid, timestamp: serverTimestamp() });
                await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: '📸 Image', lastSender: State.currentUser.uid, updatedAt: serverTimestamp() }, { merge: true }); UI.loader(false);
            };
        } catch(err) { UI.toast("Image send failed", "error"); UI.loader(false); }
    },

    startVoice: async (e) => {
        e.preventDefault(); window._startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX; window._isRecordingCancelled = false; window._recordSeconds = 0;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); window._voiceStream = stream;
            window._voiceRecorder = new MediaRecorder(stream); window._voiceChunks = [];
            window._voiceRecorder.ondataavailable = ev => { if(ev.data.size > 0) window._voiceChunks.push(ev.data); };
            
            window._voiceRecorder.onstop = async () => {
                if(window._voiceStream) window._voiceStream.getTracks().forEach(t => t.stop());
                clearInterval(window._recordTimer); document.getElementById('recording-ui').classList.add('hidden'); document.getElementById('recording-ui').style.display = 'none'; document.body.classList.remove('recording-active');
                if(window._isRecordingCancelled) return; 
                if(window._recordSeconds < 1) return; // Prevent 0 second bug

                const audioBlob = new Blob(window._voiceChunks); const reader = new FileReader(); reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { audio: base64Audio, senderId: State.currentUser.uid, timestamp: serverTimestamp(), status: 'sent' });
                    await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: '🎤 Voice Message', lastSender: State.currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
                };
            };
            document.getElementById('recording-ui').classList.remove('hidden'); document.getElementById('recording-ui').style.display = 'flex'; document.body.classList.add('recording-active');
            const recTime = document.getElementById('record-time'); recTime.innerText = "0:00";
            window._recordTimer = setInterval(() => { window._recordSeconds++; let m = Math.floor(window._recordSeconds / 60); let s = window._recordSeconds % 60; recTime.innerText = `${m}:${s < 10 ? '0'+s : s}`; }, 1000);
            window._voiceRecorder.start(200); 
        } catch (err) { UI.toast("Microphone access denied!", "error"); }
    },
    
    stopVoice: (e) => { if(window._voiceRecorder && window._voiceRecorder.state !== "inactive") { window._voiceRecorder.stop(); } },

    slideVoice: (e) => {
        if(!window._voiceRecorder || window._voiceRecorder.state === "inactive") return;
        let currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        if(window._startX - currentX > 60) { window._isRecordingCancelled = true; window._voiceRecorder.stop(); }
    },

    toggleEmoji: () => { document.getElementById('emoji-panel').classList.toggle('hidden'); },
    addEmoji: (emoji) => {
        const input = document.getElementById('msg-input'); input.value += emoji;
        document.getElementById('btn-send-text').classList.remove('hidden'); document.getElementById('btn-record-voice').classList.add('hidden');
        document.getElementById('emoji-panel').classList.add('hidden');
    },
    openByUsername: async (username) => {
        UI.loader(true); const key = username.toLowerCase();
        try {
            const qU = query(collection(db, "users"), where("searchKey", "==", key)); const snapU = await getDocs(qU);
            if(!snapU.empty) { const uId = snapU.docs[0].id; if(uId === State.currentUser.uid) { UI.toast("You cannot chat with yourself"); UI.loader(false); return; } window.location.href = `chat.html?uid=${uId}`; return; }
            const qC = query(collection(db, "chats"), where("searchKey", "==", key)); const snapC = await getDocs(qC);
            if(!snapC.empty) { const chatId = snapC.docs[0].id; if(!snapC.docs[0].data().members.includes(State.currentUser.uid)) { await updateDoc(doc(db, "chats", chatId), { members: arrayUnion(State.currentUser.uid) }); UI.toast("Joined successfully!"); } window.location.href = `chat.html?chatId=${chatId}`; return; }
            UI.toast("Username not found!", "error"); if(window.location.pathname.endsWith('chat.html') && !State.activeChatId) window.location.replace('dashboard.html');
        } catch(e) {} UI.loader(false);
    },
    copyLink: () => {
        const u = State.activeChatUser?.username || State.activeChatData?.username;
        if(u) { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?link=${u}`); UI.toast("Shareable Link Copied!"); } else { UI.toast("This chat doesn't have a public username.", "error"); }
    },
    promptAddMember: async () => {
        const username = prompt("Enter exact @username to add:"); if(!username) return; UI.loader(true);
        try {
            const q = query(collection(db, "users"), where("searchKey", "==", username.replace('@','').toLowerCase())); const snaps = await getDocs(q);
            if(snaps.empty) { UI.toast("User not found", "error"); UI.loader(false); return; }
            await updateDoc(doc(db, "chats", State.activeChatId), { members: arrayUnion(snaps.docs[0].id) }); UI.toast("Member added successfully!", "success");
        } catch(e) { UI.toast("Failed to add member", "error"); } finally { UI.loader(false); }
    }
};

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

window.Fluxgram.call = {
    startCall: async (type) => {
        if(!State.activeChatUser) return;
        State.callRole = 'caller'; State.callType = type;
        const callDoc = doc(collection(db, "calls")); State.callDocId = callDoc.id;
        const callScreen = document.getElementById('call-screen'); if(!callScreen) return; 
        callScreen.classList.remove('hidden'); document.getElementById('callName').innerText = State.activeChatUser.name || State.activeChatUser.username; document.getElementById('callStatus').innerText = "Calling..."; 
        document.getElementById('call-controls-active').classList.remove('hidden'); document.getElementById('call-controls-incoming').classList.add('hidden');
        document.getElementById('localVideo').classList.add('hidden'); 
        try {
            window.localStream = await navigator.mediaDevices.getUserMedia({ video: (type === 'video'), audio: true }); 
            if (type === 'video') { document.getElementById('localVideo').srcObject = window.localStream; document.getElementById('call-video-toggle').innerHTML = '<i class="fas fa-video"></i>'; } 
            else { document.getElementById('call-video-toggle').innerHTML = '<i class="fas fa-video-slash" style="color:var(--danger);"></i>'; }
            window.pc = new RTCPeerConnection(servers); window.localStream.getTracks().forEach(track => window.pc.addTrack(track, window.localStream));
            window.pc.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; document.getElementById('callStatus').innerText = "Connected"; if (State.callType === 'video') document.getElementById('localVideo').classList.remove('hidden'); };
            const offerCandidates = collection(callDoc, 'offerCandidates'); window.pc.onicecandidate = (event) => { if(event.candidate) addDoc(offerCandidates, event.candidate.toJSON()); };
            const offerDescription = await window.pc.createOffer(); await window.pc.setLocalDescription(offerDescription);
            await setDoc(callDoc, { offer: { type: offerDescription.type, sdp: offerDescription.sdp }, callerId: State.currentUser.uid, receiverId: State.activeChatUser.uid, type: type, status: 'ringing' });
            onSnapshot(callDoc, (snapshot) => { const data = snapshot.data(); if (!window.pc.currentRemoteDescription && data?.answer) { window.pc.setRemoteDescription(new RTCSessionDescription(data.answer)); State.startTime = Date.now(); } if(data?.status === 'ended') window.Fluxgram.call.endCallLocal(true); });
            onSnapshot(collection(callDoc, 'answerCandidates'), (snapshot) => { snapshot.docChanges().forEach((change) => { if (change.type === 'added') window.pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); }); });
        } catch (err) { UI.toast("Microphone/Camera access denied.", "error"); window.Fluxgram.call.endCallLocal(false); }
    },
    listenForCalls: () => {
        const callScreen = document.getElementById('call-screen'); if(!callScreen) return; 
        onSnapshot(query(collection(db, "calls"), where("receiverId", "==", State.currentUser.uid), where("status", "==", "ringing")), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if(change.type === 'added') {
                    State.callRole = 'receiver'; const callData = change.doc.data(); State.callDocId = change.doc.id; State.callType = callData.type;
                    const callerDoc = await getDoc(doc(db, "users", callData.callerId));
                    callScreen.classList.remove('hidden'); document.getElementById('callName').innerText = callerDoc.exists() ? (callerDoc.data().name || callerDoc.data().username) : "Unknown"; document.getElementById('callStatus').innerText = `Incoming ${callData.type} Call...`; 
                    document.getElementById('call-controls-active').classList.add('hidden'); document.getElementById('call-controls-incoming').classList.remove('hidden'); document.getElementById('localVideo').classList.add('hidden');
                }
            });
        });
    },
    acceptCall: async () => {
        document.getElementById('call-controls-active').classList.remove('hidden'); document.getElementById('call-controls-incoming').classList.add('hidden'); document.getElementById('callStatus').innerText = "Connecting...";
        const callDocRef = doc(db, "calls", State.callDocId); const callData = (await getDoc(callDocRef)).data();
        try {
            window.localStream = await navigator.mediaDevices.getUserMedia({ video: (State.callType === 'video'), audio: true }); 
            if (State.callType === 'video') { document.getElementById('localVideo').srcObject = window.localStream; document.getElementById('localVideo').classList.remove('hidden'); document.getElementById('call-video-toggle').innerHTML = '<i class="fas fa-video"></i>'; } 
            else { document.getElementById('call-video-toggle').innerHTML = '<i class="fas fa-video-slash" style="color:var(--danger);"></i>'; }
            window.pc = new RTCPeerConnection(servers); window.localStream.getTracks().forEach(track => window.pc.addTrack(track, window.localStream));
            window.pc.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; document.getElementById('callStatus').innerText = "Connected"; };
            const answerCandidates = collection(callDocRef, 'answerCandidates'); window.pc.onicecandidate = (event) => { if(event.candidate) addDoc(answerCandidates, event.candidate.toJSON()); };
            await window.pc.setRemoteDescription(new RTCSessionDescription(callData.offer)); const answerDescription = await window.pc.createAnswer(); await window.pc.setLocalDescription(answerDescription);
            await updateDoc(callDocRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp }, status: 'connected' }); State.startTime = Date.now();
            onSnapshot(collection(callDocRef, 'offerCandidates'), (snapshot) => { snapshot.docChanges().forEach((change) => { if (change.type === 'added') window.pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); }); });
            onSnapshot(callDocRef, (snap) => { if(snap.data()?.status === 'ended') window.Fluxgram.call.endCallLocal(true); });
        } catch (err) { UI.toast("Microphone/Camera access denied.", "error"); window.Fluxgram.call.endCall(); }
    },
    endCall: async () => { if(State.callDocId) await updateDoc(doc(db, "calls", State.callDocId), { status: 'ended' }); window.Fluxgram.call.endCallLocal(true); },
    endCallLocal: async (writeHistory = false) => {
        if(window.pc) { window.pc.close(); window.pc = null; } if(window.localStream) { window.localStream.getTracks().forEach(t => t.stop()); window.localStream = null; }
        document.getElementById('remoteVideo').srcObject = null; document.getElementById('localVideo').srcObject = null; document.getElementById('localVideo').classList.add('hidden'); 
        const callScreen = document.getElementById('call-screen'); if(callScreen) callScreen.classList.add('hidden'); 
        if(writeHistory && State.activeChatId && State.callRole === 'caller') {
            let durationText = "Missed Call"; let callStatus = "missed";
            if(State.startTime) { const totalSeconds = Math.floor((Date.now() - State.startTime) / 1000); const mins = Math.floor(totalSeconds / 60); const secs = totalSeconds % 60; durationText = `Call ended (${mins}m ${secs}s)`; callStatus = "success"; }
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { type: 'call', text: durationText, status: callStatus, senderId: State.currentUser.uid, timestamp: serverTimestamp() });
        }
        State.callDocId = null; State.startTime = null; State.callRole = null; State.callType = null;
    },
    toggleMic: () => { if(!window.localStream) return; const audioTrack = window.localStream.getAudioTracks()[0]; audioTrack.enabled = !audioTrack.enabled; document.getElementById('mic-icon').className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash'; document.getElementById('mic-icon').style.color = audioTrack.enabled ? 'white' : 'var(--danger)'; },
    toggleVideo: () => { 
        if(!window.localStream) return; const videoTracks = window.localStream.getVideoTracks(); 
        if(videoTracks.length > 0) { const videoTrack = videoTracks[0]; videoTrack.enabled = !videoTrack.enabled; const btn = document.getElementById('call-video-toggle'); btn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash" style="color:var(--danger);"></i>'; if(videoTrack.enabled) document.getElementById('localVideo').classList.remove('hidden'); else document.getElementById('localVideo').classList.add('hidden'); } 
        else { UI.toast("Cannot enable video in an audio call.", "error"); }
    },
    toggleSpeaker: () => { UI.toast("Speaker toggle available in native app.", "success"); }
};

document.addEventListener('DOMContentLoaded', () => {
    const btnReply = document.getElementById('btn-reply-msg');
    if(btnReply) btnReply.addEventListener('click', () => { Fluxgram.chat.initReply(); });
});
