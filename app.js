// ============================================================================
// app.js - Fluxgram Engine (Direct Upload Edition - Fixes Browser Memory Crash)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// Using ultra-light uploadBytes to prevent mobile browser memory crash
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const storage = getStorage(app);

window.Fluxgram = {
    state: { currentUser: null, userData: null, activeChatId: null, activeChatUser: null, activeChatData: null, unsubMessages: null, unsubChats: null, typingTimeout: null, callDocId: null },
    ui: {}, auth: {}, dash: {}, chat: {}, call: {}, utils: {}, profile: {}
};

const State = window.Fluxgram.state;

const formatTime = (ts) => {
    if (!ts) return 'Just now';
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    return '';
};
const getMillis = (ts) => {
    if (!ts) return Date.now(); 
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    return 0;
};

// --- UTILS & RENDERERS ---
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
        if(photoURL) return `<img src="${photoURL}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" class="${sizeClass}">`;
        return `<span class="${sizeClass}">${(fallbackName||'U').charAt(0).toUpperCase()}</span>`;
    }
};
const Utils = window.Fluxgram.utils;

// --- UI HELPERS ---
window.Fluxgram.ui = {
    loader: (show) => { const l = document.getElementById('global-loader'); if(l) l.classList.toggle('hidden', !show); },
    toast: (msg, type = 'success') => {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`; toast.innerHTML = msg;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },
    toggleForms: (formType) => {
        ['login', 'signup', 'reset'].forEach(f => {
            const el = document.getElementById(`${f}-form`);
            if(el) el.classList.toggle('hidden', formType !== f);
        });
    },
    autoResize: (el) => { if (el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; } },
    getParam: (param) => new URLSearchParams(window.location.search).get(param),
    
    showProfile: () => {
        const pv = document.getElementById('profile-view');
        if(!pv) return;

        if (State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) {
            const d = State.activeChatData;
            document.getElementById('pv-name').innerText = d.name;
            document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(d.photoURL, d.name);
            document.getElementById('pv-status').innerText = `${d.members.length} Members`;
            document.getElementById('pv-bio').innerText = d.desc || "No description provided.";
            document.getElementById('pv-bio-label').innerText = "Description";
            if(d.username) { document.getElementById('pv-username-box').classList.remove('hidden'); document.getElementById('pv-username').innerText = `@${d.username}`; } 
            else { document.getElementById('pv-username-box').classList.add('hidden'); }
            document.getElementById('pv-phone-box').classList.add('hidden');
            const editBtn = document.getElementById('btn-edit-chat');
            if(editBtn) { if(d.admin === State.currentUser.uid) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }
        } else if (State.activeChatUser) {
            const u = State.activeChatUser;
            document.getElementById('pv-name').innerText = u.name || u.username;
            document.getElementById('pv-avatar').innerHTML = Utils.renderAvatarHTML(u.photoURL, u.username || u.name);
            document.getElementById('pv-status').innerText = u.isOnline ? 'Online' : 'Offline';
            document.getElementById('pv-bio').innerText = u.bio || "Available on Fluxgram";
            document.getElementById('pv-bio-label').innerText = "Bio";
            if(u.username) { document.getElementById('pv-username-box').classList.remove('hidden'); document.getElementById('pv-username').innerText = `@${u.username}`; } 
            else { document.getElementById('pv-username-box').classList.add('hidden'); }
            if(u.phone || u.email) { document.getElementById('pv-phone-box').classList.remove('hidden'); document.getElementById('pv-phone').innerText = u.phone || u.email; } 
            else { document.getElementById('pv-phone-box').classList.add('hidden'); }
            const editBtn = document.getElementById('btn-edit-chat');
            if(editBtn) editBtn.classList.add('hidden'); 
        }
        pv.classList.remove('hidden');
    },
    hideProfile: () => { const pv = document.getElementById('profile-view'); if(pv) pv.classList.add('hidden'); }
};
const UI = window.Fluxgram.ui;

// --- AUTHENTICATION ---
window.Fluxgram.auth = {
    login: async () => {
        const e = document.getElementById('login-email').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if(!e || !p) return UI.toast("Enter email and password", "error");
        UI.loader(true);
        try { await signInWithEmailAndPassword(auth, e, p); } catch (err) { UI.toast("Invalid credentials.", "error"); UI.loader(false); }
    },
    signup: async () => {
        let u = document.getElementById('signup-username').value.trim().replace('@', '');
        const e = document.getElementById('signup-email').value.trim();
        const p = document.getElementById('signup-password').value.trim();
        if(!u || !e || p.length < 6) return UI.toast("Fill all fields. Password min 6 chars.", "error");
        if(u.length < 6) return UI.toast("Username must be at least 6 characters.", "error");

        UI.loader(true);
        try {
            if(!(await Utils.isUsernameUnique(u))) throw new Error("Username already taken.");
            const res = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db, "users", res.user.uid), { uid: res.user.uid, email: e, username: u, searchKey: u.toLowerCase(), isOnline: true, lastSeen: serverTimestamp(), photoURL: null });
            UI.toast("Account created successfully!");
        } catch (err) { UI.toast(err.message, "error"); } finally { UI.loader(false); }
    },
    reset: async () => {
        const e = document.getElementById('reset-email').value.trim();
        if(!e) return UI.toast("Enter email", "error");
        try { await sendPasswordResetEmail(auth, e); UI.toast("Password reset link sent!", "success"); UI.toggleForms('login'); } catch(err) { UI.toast(err.message, "error"); }
    },
    logout: async () => {
        UI.loader(true);
        if(auth.currentUser) await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
        await signOut(auth);
    }
};

function updatePresence(isOnline) {
    if(auth.currentUser) setDoc(doc(db, "users", auth.currentUser.uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true }).catch(e=>{});
}
window.addEventListener('beforeunload', () => updatePresence(false));
document.addEventListener('visibilitychange', () => updatePresence(document.visibilityState === 'visible'));

onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname.toLowerCase();
    UI.loader(false);
    
    if (user) {
        State.currentUser = user;
        onSnapshot(doc(db, "users", user.uid), (d) => { if(d.exists()) State.userData = d.data(); });
        
        const deepLinkUsername = UI.getParam('link');
        if(deepLinkUsername && !path.includes('chat')) { window.location.replace(`chat.html?link=${deepLinkUsername}`); return; }

        if (path.includes('dashboard')) { 
            window.Fluxgram.dash.loadChats(); 
        } else if (path.includes('chat')) { 
            window.Fluxgram.chat.init(); 
            window.Fluxgram.call.listenForCalls(); 
        } else { 
            window.location.replace('dashboard.html'); 
        }
    } else {
        State.currentUser = null;
        if (path.includes('dashboard') || path.includes('chat')) { window.location.replace('index.html'); }
    }
});

// --- PROFILE & SETTINGS MANAGER (DIRECT UPLOAD) ---
window.Fluxgram.profile = {
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
    
    openUserEdit: () => {
        if(!State.userData) return;
        document.getElementById('edit-user-name').value = State.userData.name || '';
        document.getElementById('edit-user-username').value = State.userData.username || '';
        document.getElementById('edit-user-bio').value = State.userData.bio || '';
        document.getElementById('display-email').innerText = State.userData.email || 'Email not set';
        
        const preview = document.getElementById('user-avatar-preview');
        const text = document.getElementById('user-avatar-text');
        if(State.userData.photoURL) {
            preview.src = State.userData.photoURL; preview.classList.remove('hidden'); text.classList.add('hidden');
        } else {
            preview.classList.add('hidden'); text.classList.remove('hidden');
            text.innerText = (State.userData.username || 'U').charAt(0).toUpperCase();
        }
        document.getElementById('edit-user-modal').classList.remove('hidden');
    },

    saveUserEdit: async () => {
        const n = document.getElementById('edit-user-name').value.trim();
        let u = document.getElementById('edit-user-username').value.trim().replace('@', '');
        const b = document.getElementById('edit-user-bio').value.trim();
        const fileInput = document.getElementById('user-avatar-input');
        
        if(!u || u.length < 6) return UI.toast("Username must be at least 6 chars", "error");
        
        UI.loader(true);
        try {
            if(!(await Utils.isUsernameUnique(u, State.userData.username))) throw new Error("This @username is already taken!");
            
            let finalPhotoURL = State.userData.photoURL !== undefined ? State.userData.photoURL : null;
            
            // Direct Upload without Canvas Compression
            if(fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const storageRef = ref(storage, `avatars/users/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                finalPhotoURL = await getDownloadURL(snapshot.ref);
            }

            await setDoc(doc(db, "users", State.currentUser.uid), { name: n, username: u, searchKey: u.toLowerCase(), bio: b, photoURL: finalPhotoURL }, { merge: true });
            document.getElementById('edit-user-modal').classList.add('hidden'); 
            UI.toast("Profile updated successfully!");
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
            document.getElementById('email-change-modal').classList.add('hidden'); document.getElementById('display-email').innerText = newEmail; UI.toast("Email updated successfully!", "success");
        } catch(e) { UI.toast("Error: Incorrect password or invalid email.", "error"); } finally { UI.loader(false); }
    },

    openChatEdit: () => {
        if(!State.activeChatData || State.activeChatData.admin !== State.currentUser.uid) return;
        const d = State.activeChatData;
        document.getElementById('edit-chat-name').value = d.name || '';
        document.getElementById('edit-chat-username').value = d.username || '';
        document.getElementById('edit-chat-desc').value = d.desc || '';
        const preview = document.getElementById('chat-avatar-preview');
        const text = document.getElementById('chat-avatar-text');
        if(d.photoURL) { preview.src = d.photoURL; preview.classList.remove('hidden'); text.classList.add('hidden'); } 
        else { preview.classList.add('hidden'); text.classList.remove('hidden'); text.innerText = (d.name || 'G').charAt(0).toUpperCase(); }
        document.getElementById('edit-chat-modal').classList.remove('hidden');
    },

    saveChatEdit: async () => {
        const n = document.getElementById('edit-chat-name').value.trim();
        let u = document.getElementById('edit-chat-username').value.trim().replace('@', '');
        const desc = document.getElementById('edit-chat-desc').value.trim();
        const fileInput = document.getElementById('chat-avatar-input');

        if(!n) return UI.toast("Name is required", "error");
        if(u && u.length < 6) return UI.toast("Username must be at least 6 chars", "error");

        UI.loader(true);
        try {
            if(u && !(await Utils.isUsernameUnique(u, State.activeChatData.username))) throw new Error("This @username is already taken!");
            
            let finalPhotoURL = State.activeChatData.photoURL !== undefined ? State.activeChatData.photoURL : null;
            
            // Direct Upload without Canvas Compression
            if(fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const storageRef = ref(storage, `avatars/chats/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                finalPhotoURL = await getDownloadURL(snapshot.ref);
            }

            await updateDoc(doc(db, "chats", State.activeChatId), { name: n, username: u || null, searchKey: u ? u.toLowerCase() : null, desc: desc, photoURL: finalPhotoURL });
            document.getElementById('edit-chat-modal').classList.add('hidden'); 
            UI.toast("Updated successfully!"); 
            UI.showProfile(); 
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

// --- DASHBOARD LOGIC ---
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
        const fileInput = document.getElementById('create-avatar-input');
        
        if(!name) return UI.toast("Name is required", "error");
        if(username && username.length < 6) return UI.toast("Username must be at least 6 chars", "error");

        UI.loader(true);
        try {
            if(username && !(await Utils.isUsernameUnique(username))) throw new Error("This @username is already taken!");
            
            let photoURL = null;
            if(fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const storageRef = ref(storage, `avatars/chats/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(snapshot.ref);
            }

            const newRef = await addDoc(collection(db, "chats"), {
                type: type, name: name, desc: desc, username: username || null, searchKey: username ? username.toLowerCase() : null, photoURL: photoURL,
                admin: State.currentUser.uid, members: [State.currentUser.uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: `Created ${type}`, unreadCount: 0
            });
            window.location.href = `chat.html?chatId=${newRef.id}`;
        } catch(e) { UI.toast(e.message, "error"); } finally { UI.loader(false); }
    },
    loadChats: () => {
        const list = document.getElementById('chat-list');
        if(!list) return;

        const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid));
        
        State.unsubChats = onSnapshot(q, async (snapshot) => {
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

                if(!data.members || !Array.isArray(data.members)) continue;
                const otherUid = data.members.find(id => id !== State.currentUser.uid);
                if(!otherUid) continue;

                try {
                    const otherUserDoc = await getDoc(doc(db, "users", otherUid));
                    if(!otherUserDoc.exists()) continue;
                    const otherUser = otherUserDoc.data();
                    const isTyping = data.typing && data.typing.includes(otherUid);
                    list.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?uid=${otherUid}'"><div class="avatar">${Utils.renderAvatarHTML(otherUser.photoURL, otherUser.username)}</div><div class="chat-info"><div class="c-name-row"><div class="c-name">${otherUser.username || 'User'}</div><div class="c-time">${timeStr}</div></div><div class="c-msg-row"><div class="c-msg" style="${isTyping ? 'color:var(--accent);' : ''}">${isTyping ? 'typing...' : (data.lastMessage || '')}</div>${unread}</div></div></div>`;
                } catch(err) {}
            }
        });
    }
};

window.Fluxgram.chat = {
    init: async () => {
        const otherUid = UI.getParam('uid');       
        const existingChatId = UI.getParam('chatId'); 
        const deepLink = UI.getParam('link'); 

        try {
            if(deepLink) return await window.Fluxgram.chat.openByUsername(deepLink);
            if(!otherUid && !existingChatId) return window.location.replace('dashboard.html');

            if (existingChatId) {
                State.activeChatId = existingChatId;
                onSnapshot(doc(db, "chats", existingChatId), (d) => {
                    if(d.exists()) {
                        const data = d.data();
                        State.activeChatData = data;
                        document.getElementById('chat-name').innerText = data.name;
                        document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(data.photoURL, data.name);
                        document.getElementById('chat-status').innerText = `${data.members.length} members`;
                        
                        document.getElementById('btn-call-audio').classList.add('hidden');
                        const addBtn = document.getElementById('btn-add-member');
                        if(addBtn) { if (data.admin === State.currentUser.uid) addBtn.classList.remove('hidden'); else addBtn.classList.add('hidden'); }
                        if(data.type === 'channel' && data.admin !== State.currentUser.uid) document.getElementById('input-area').classList.add('hidden'); else document.getElementById('input-area').classList.remove('hidden');
                        if(data.lastSender !== State.currentUser.uid) updateDoc(doc(db, "chats", existingChatId), { unreadCount: 0 });
                        if(!document.getElementById('profile-view').classList.contains('hidden')) UI.showProfile();
                    } else { window.location.replace('dashboard.html'); }
                });
            } else {
                const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`;
                State.activeChatId = chatId;

                const chatRef = doc(db, "chats", chatId);
                const chatSnap = await getDoc(chatRef);
                if(!chatSnap.exists()){ await setDoc(chatRef, { type: 'direct', members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp() }); }
                else if(chatSnap.data().lastSender !== State.currentUser.uid) { await updateDoc(chatRef, { unreadCount: 0 }); }

                onSnapshot(doc(db, "users", otherUid), (d) => {
                    if(d.exists()) {
                        const u = d.data();
                        State.activeChatUser = u;
                        document.getElementById('chat-name').innerText = u.username || u.name || 'User';
                        document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(u.photoURL, u.username || u.name);
                        document.getElementById('chat-status').innerText = u.isOnline ? 'Online' : 'Offline';
                        if(!document.getElementById('profile-view').classList.contains('hidden')) UI.showProfile();
                    }
                });
            }

            const msgInput = document.getElementById('msg-input');
            if(msgInput) {
                msgInput.addEventListener('input', () => { UI.autoResize(msgInput); });
                msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Fluxgram.chat.send(); } });
            }

            window.Fluxgram.chat.loadMessages();
        } catch(error) { UI.toast("Failed to load chat: " + error.message, "error"); }
    },
    loadMessages: () => {
        const container = document.getElementById('messages-container');
        if(!container) return;
        const q = query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("timestamp", "asc"));
        State.unsubMessages = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                const isMe = msg.senderId === State.currentUser.uid;
                const timeStr = formatTime(msg.timestamp);
                let textContent = Utils.parseMentions((msg.text||'').replace(/\n/g, '<br>'));
                const senderNameHTML = (!isMe && State.activeChatData && (State.activeChatData.type === 'group' || State.activeChatData.type === 'channel')) ? `<div style="font-size:0.75rem; color:var(--accent); font-weight:bold; margin-bottom:3px;">User: ${msg.senderId.substring(0,5)}</div>` : '';

                container.innerHTML += `<div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}"><div class="msg-bubble">${senderNameHTML}${textContent}<div class="msg-meta">${timeStr}</div></div></div>`;
            });
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
    },
    send: async () => {
        const input = document.getElementById('msg-input');
        if(!input) return;
        const text = input.value.trim();
        if(!text || !State.activeChatId) return;
        input.value = ''; UI.autoResize(input);
        
        try {
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { text: text, senderId: State.currentUser.uid, timestamp: serverTimestamp() });
            const snap = await getDoc(doc(db, "chats", State.activeChatId));
            let unread = snap.exists() ? (snap.data().unreadCount || 0) : 0;
            await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: text, lastSender: State.currentUser.uid, updatedAt: serverTimestamp(), unreadCount: unread + 1, typing: [] }, { merge: true });
        } catch(e) { UI.toast(e.message, "error"); }
    },
    openByUsername: async (username) => {
        UI.loader(true);
        const key = username.toLowerCase();
        try {
            const qU = query(collection(db, "users"), where("searchKey", "==", key));
            const snapU = await getDocs(qU);
            if(!snapU.empty) {
                const uId = snapU.docs[0].id;
                if(uId === State.currentUser.uid) { UI.toast("You cannot chat with yourself"); UI.loader(false); return; }
                window.location.href = `chat.html?uid=${uId}`; return;
            }
            const qC = query(collection(db, "chats"), where("searchKey", "==", key));
            const snapC = await getDocs(qC);
            if(!snapC.empty) {
                const chatId = snapC.docs[0].id;
                if(!snapC.docs[0].data().members.includes(State.currentUser.uid)) { await updateDoc(doc(db, "chats", chatId), { members: arrayUnion(State.currentUser.uid) }); UI.toast("Joined successfully!"); }
                window.location.href = `chat.html?chatId=${chatId}`; return;
            }
            UI.toast("Username not found!", "error");
            if(window.location.pathname.endsWith('chat.html') && !State.activeChatId) window.location.replace('dashboard.html');
        } catch(e) {}
        UI.loader(false);
    },
    copyLink: () => {
        const u = State.activeChatUser?.username || State.activeChatData?.username;
        if(u) { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?link=${u}`); UI.toast("Shareable Link Copied!"); } 
        else { UI.toast("This chat doesn't have a public username.", "error"); }
    },
    promptAddMember: async () => {
        const username = prompt("Enter exact @username to add:");
        if(!username) return;
        UI.loader(true);
        try {
            const q = query(collection(db, "users"), where("searchKey", "==", username.replace('@','').toLowerCase()));
            const snaps = await getDocs(q);
            if(snaps.empty) { UI.toast("User not found", "error"); UI.loader(false); return; }
            await updateDoc(doc(db, "chats", State.activeChatId), { members: arrayUnion(snaps.docs[0].id) });
            UI.toast("Member added successfully!", "success");
        } catch(e) { UI.toast("Failed to add member", "error"); }
        finally { UI.loader(false); }
    }
};

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
let pc = null, localStream = null;
window.Fluxgram.call = {
    startCall: async (type) => {
        if(!State.activeChatUser) return;
        const callDoc = doc(collection(db, "calls")); State.callDocId = callDoc.id;
        const callScreen = document.getElementById('call-screen'); if(!callScreen) return; 
        callScreen.classList.remove('hidden'); document.getElementById('callName').innerText = State.activeChatUser.username; document.getElementById('callStatus').innerText = "Calling..."; document.getElementById('call-controls-active').classList.remove('hidden'); document.getElementById('call-controls-incoming').classList.add('hidden');
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true }); document.getElementById('localVideo').srcObject = localStream;
            pc = new RTCPeerConnection(servers); localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            pc.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; document.getElementById('callStatus').innerText = "Connected"; };
            const offerCandidates = collection(callDoc, 'offerCandidates'); pc.onicecandidate = (event) => { if(event.candidate) addDoc(offerCandidates, event.candidate.toJSON()); };
            const offerDescription = await pc.createOffer(); await pc.setLocalDescription(offerDescription);
            await setDoc(callDoc, { offer: { type: offerDescription.type, sdp: offerDescription.sdp }, callerId: State.currentUser.uid, receiverId: State.activeChatUser.uid, type: type, status: 'ringing' });
            onSnapshot(callDoc, (snapshot) => { const data = snapshot.data(); if (!pc.currentRemoteDescription && data?.answer) { pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } if(data?.status === 'ended') window.Fluxgram.call.endCallLocal(); });
            onSnapshot(collection(callDoc, 'answerCandidates'), (snapshot) => { snapshot.docChanges().forEach((change) => { if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); }); });
        } catch (err) { UI.toast("Camera/Mic access denied.", "error"); window.Fluxgram.call.endCallLocal(); }
    },
    listenForCalls: () => {
        const callScreen = document.getElementById('call-screen'); if(!callScreen) return; 
        onSnapshot(query(collection(db, "calls"), where("receiverId", "==", State.currentUser.uid), where("status", "==", "ringing")), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if(change.type === 'added') {
                    const callData = change.doc.data(); State.callDocId = change.doc.id;
                    const callerDoc = await getDoc(doc(db, "users", callData.callerId));
                    callScreen.classList.remove('hidden'); document.getElementById('callName').innerText = callerDoc.exists() ? callerDoc.data().username : "Unknown"; document.getElementById('callStatus').innerText = "Incoming Call..."; document.getElementById('call-controls-active').classList.add('hidden'); document.getElementById('call-controls-incoming').classList.remove('hidden');
                }
            });
        });
    },
    acceptCall: async () => {
        document.getElementById('call-controls-active').classList.remove('hidden'); document.getElementById('call-controls-incoming').classList.add('hidden'); document.getElementById('callStatus').innerText = "Connecting...";
        const callDocRef = doc(db, "calls", State.callDocId); const callData = (await getDoc(callDocRef)).data();
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: callData.type === 'video', audio: true }); document.getElementById('localVideo').srcObject = localStream;
            pc = new RTCPeerConnection(servers); localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            pc.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; document.getElementById('callStatus').innerText = "Connected"; };
            const answerCandidates = collection(callDocRef, 'answerCandidates'); pc.onicecandidate = (event) => { if(event.candidate) addDoc(answerCandidates, event.candidate.toJSON()); };
            await pc.setRemoteDescription(new RTCSessionDescription(callData.offer)); const answerDescription = await pc.createAnswer(); await pc.setLocalDescription(answerDescription);
            await updateDoc(callDocRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp }, status: 'connected' });
            onSnapshot(collection(callDocRef, 'offerCandidates'), (snapshot) => { snapshot.docChanges().forEach((change) => { if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())); }); });
            onSnapshot(callDocRef, (snap) => { if(snap.data()?.status === 'ended') window.Fluxgram.call.endCallLocal(); });
        } catch (err) { UI.toast("Camera/Mic access denied.", "error"); window.Fluxgram.call.endCall(); }
    },
    endCall: async () => { if(State.callDocId) await updateDoc(doc(db, "calls", State.callDocId), { status: 'ended' }); window.Fluxgram.call.endCallLocal(); },
    endCallLocal: () => {
        if(pc) { pc.close(); pc = null; } if(localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        document.getElementById('remoteVideo').srcObject = null; document.getElementById('localVideo').srcObject = null;
        const callScreen = document.getElementById('call-screen'); if(callScreen) callScreen.classList.add('hidden'); State.callDocId = null;
    },
    toggleMic: () => { if(!localStream) return; const audioTrack = localStream.getAudioTracks()[0]; audioTrack.enabled = !audioTrack.enabled; document.getElementById('mic-icon').className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash'; },
    toggleCam: () => { if(!localStream) return; const videoTrack = localStream.getVideoTracks()[0]; if(videoTrack) { videoTrack.enabled = !videoTrack.enabled; document.getElementById('cam-icon').className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash'; } }
};
