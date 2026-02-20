// ============================================================================
// app.js - Core Application Logic (With Usernames, Mentions & Links)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- 1. FIREBASE INITIALIZATION ---
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

// --- 2. GLOBAL NAMESPACE ---
window.Fluxgram = {
    state: { currentUser: null, activeChatId: null, activeChatUser: null, activeChatData: null, unsubMessages: null, unsubChats: null, typingTimeout: null, callDocId: null },
    ui: {}, auth: {}, dash: {}, chat: {}, call: {}, utils: {}
};

// --- 3. UTILS & UI HELPERS ---
window.Fluxgram.utils = {
    // Universal Uniqueness Checker (checks both users & chats)
    isUsernameUnique: async (username) => {
        const u = username.toLowerCase().replace('@', '');
        const qUsers = query(collection(db, "users"), where("searchKey", "==", u));
        const qChats = query(collection(db, "chats"), where("searchKey", "==", u));
        const [sU, sC] = await Promise.all([getDocs(qUsers), getDocs(qChats)]);
        return sU.empty && sC.empty;
    },
    // Convert @username to clickable links
    parseMentions: (text) => {
        return text.replace(/@([a-zA-Z0-9_]{6,})/g, '<span style="color: var(--accent); cursor: pointer; text-decoration: underline;" onclick="Fluxgram.chat.openByUsername(\'$1\')">@$1</span>');
    }
};

window.Fluxgram.ui = {
    loader: (show) => { const l = document.getElementById('global-loader'); if(l) l.classList.toggle('hidden', !show); },
    toast: (msg, type = 'success') => {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = msg;
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
    getParam: (param) => new URLSearchParams(window.location.search).get(param)
};

const UI = window.Fluxgram.ui;
const Utils = window.Fluxgram.utils;
const State = window.Fluxgram.state;

// --- 4. AUTHENTICATION ---
window.Fluxgram.auth = {
    login: async () => {
        const e = document.getElementById('login-email').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if(!e || !p) return UI.toast("Enter email and password", "error");
        UI.loader(true);
        try { await signInWithEmailAndPassword(auth, e, p); } 
        catch (err) { UI.toast("Invalid credentials.", "error"); UI.loader(false); }
    },

    signup: async () => {
        let u = document.getElementById('signup-username').value.trim().replace('@', '');
        const e = document.getElementById('signup-email').value.trim();
        const p = document.getElementById('signup-password').value.trim();
        
        if(!u || !e || p.length < 6) return UI.toast("Fill all fields. Password min 6 chars.", "error");
        if(u.length < 6) return UI.toast("Username must be at least 6 characters.", "error");
        if(/[^a-zA-Z0-9_]/.test(u)) return UI.toast("Username can only contain letters, numbers, and underscores.", "error");

        UI.loader(true);
        try {
            const isUnique = await Utils.isUsernameUnique(u);
            if(!isUnique) throw new Error("Username already taken.");

            const res = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db, "users", res.user.uid), {
                uid: res.user.uid, email: e, username: u, searchKey: u.toLowerCase(), isOnline: true, lastSeen: serverTimestamp()
            });
            UI.toast("Account created successfully!");
        } catch (err) { UI.toast(err.message, "error"); } 
        finally { UI.loader(false); }
    },

    logout: async () => {
        UI.loader(true);
        if(auth.currentUser) await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
        await signOut(auth);
    }
};

// --- 5. PRESENCE SYSTEM ---
function updatePresence(isOnline) {
    if(auth.currentUser) setDoc(doc(db, "users", auth.currentUser.uid), { isOnline, lastSeen: serverTimestamp() }, { merge: true }).catch(e=>{});
}
window.addEventListener('beforeunload', () => updatePresence(false));
document.addEventListener('visibilitychange', () => updatePresence(document.visibilityState === 'visible'));

// --- 6. OBSERVER & DEEP LINKING ---
onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname;
    UI.loader(false);

    if (user) {
        State.currentUser = user;
        updatePresence(true);
        
        // Check for Deep Link (e.g., flux.me/username simulated as ?u=username)
        const deepLinkUsername = UI.getParam('u');
        if(deepLinkUsername) {
            if(!path.endsWith('chat.html')) {
                // Let dashboard handle it or redirect to chat
                window.location.replace(`chat.html?link=${deepLinkUsername}`);
                return;
            }
        }

        if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
            window.location.replace('dashboard.html');
        } else if (path.endsWith('dashboard.html')) {
            window.Fluxgram.dash.loadChats();
        } else if (path.endsWith('chat.html')) {
            window.Fluxgram.chat.init();
        }
    } else {
        State.currentUser = null;
        if (!path.endsWith('index.html') && path !== '/' && !path.endsWith('/')) {
            window.location.replace('index.html');
        }
    }
});

// --- 7. DASHBOARD LOGIC ---
window.Fluxgram.dash = {
    search: async () => {
        const term = document.getElementById('search-input').value.trim().toLowerCase().replace('@', '');
        const resultsBox = document.getElementById('search-results');
        const chatList = document.getElementById('chat-list');

        if(term.length < 2) { resultsBox.classList.add('hidden'); chatList.classList.remove('hidden'); return; }
        resultsBox.classList.remove('hidden'); chatList.classList.add('hidden');
        resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">Searching...</div>`;

        try {
            // Search Users
            const qU = query(collection(db, "users"), where("searchKey", ">=", term), where("searchKey", "<=", term + '\uf8ff'));
            // Search Chats (Groups/Channels)
            const qC = query(collection(db, "chats"), where("searchKey", ">=", term), where("searchKey", "<=", term + '\uf8ff'));
            
            const [snapsU, snapsC] = await Promise.all([getDocs(qU), getDocs(qC)]);
            resultsBox.innerHTML = '';
            
            snapsU.forEach(d => {
                if(d.id === State.currentUser.uid) return;
                const u = d.data();
                resultsBox.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?uid=${u.uid}'"><div class="avatar">${u.username.charAt(0).toUpperCase()}</div><div class="chat-info"><div class="c-name">@${u.username}</div></div></div>`;
            });
            
            snapsC.forEach(d => {
                const c = d.data();
                if(c.type === 'group' || c.type === 'channel') {
                    resultsBox.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?chatId=${d.id}'"><div class="avatar" style="background:var(--accent); color:#000;">${c.name.charAt(0).toUpperCase()}</div><div class="chat-info"><div class="c-name">${c.name} (Public)</div><div class="c-msg">@${c.username}</div></div></div>`;
                }
            });

            if(resultsBox.innerHTML === '') resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">No exact matches found</div>`;
        } catch(e) { console.error(e); }
    },

    setCreateType: (type) => {
        document.getElementById('create-type').value = type;
        const btnG = document.getElementById('btn-type-group');
        const btnC = document.getElementById('btn-type-channel');
        btnG.style.background = type === 'group' ? 'var(--primary)' : 'var(--bg-base)';
        btnG.style.color = type === 'group' ? 'white' : 'var(--text-muted)';
        btnC.style.background = type === 'channel' ? 'var(--primary)' : 'var(--bg-base)';
        btnC.style.color = type === 'channel' ? 'white' : 'var(--text-muted)';
    },

    createGroupOrChannel: async () => {
        const type = document.getElementById('create-type').value;
        const name = document.getElementById('create-name').value.trim();
        let username = document.getElementById('create-username').value.trim().replace('@', '');
        
        if(!name) return UI.toast("Name is required", "error");
        if(username && username.length < 6) return UI.toast("Username must be at least 6 chars", "error");

        UI.loader(true);
        try {
            if(username) {
                const isUnique = await Utils.isUsernameUnique(username);
                if(!isUnique) throw new Error("This @username is already taken!");
            }

            const newRef = await addDoc(collection(db, "chats"), {
                type: type, name: name, username: username || null, searchKey: username ? username.toLowerCase() : null,
                admin: State.currentUser.uid, members: [State.currentUser.uid],
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: `Created ${type}`, unreadCount: 0
            });
            window.location.href = `chat.html?chatId=${newRef.id}`;
        } catch(e) { UI.toast(e.message, "error"); UI.loader(false); }
    },

    loadChats: () => {
        const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid));
        State.unsubChats = onSnapshot(q, async (snapshot) => {
            const list = document.getElementById('chat-list');
            if(!list) return;
            list.innerHTML = '';
            if(snapshot.empty) return list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted);">No chats yet.</div>`;

            const chatDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));

            for (const data of chatDocs) {
                const timeStr = data.updatedAt ? data.updatedAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                
                if (data.type === 'group' || data.type === 'channel') {
                    list.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?chatId=${data.id}'"><div class="avatar" style="background:var(--accent); color:#000;">${data.name.charAt(0).toUpperCase()}</div><div class="chat-info"><div class="c-name-row"><div class="c-name">${data.name}</div><div class="c-time">${timeStr}</div></div><div class="c-msg-row"><div class="c-msg">${data.lastMessage || ''}</div></div></div></div>`;
                    continue;
                }

                const otherUid = data.members.find(id => id !== State.currentUser.uid);
                try {
                    const otherUserDoc = await getDoc(doc(db, "users", otherUid));
                    if(!otherUserDoc.exists()) continue;
                    const otherUser = otherUserDoc.data();
                    list.innerHTML += `<div class="chat-item" onclick="window.location.href='chat.html?uid=${otherUid}'"><div class="avatar">${otherUser.username.charAt(0).toUpperCase()}</div><div class="chat-info"><div class="c-name-row"><div class="c-name">${otherUser.username}</div><div class="c-time">${timeStr}</div></div><div class="c-msg-row"><div class="c-msg">${data.lastMessage || ''}</div></div></div></div>`;
                } catch(err) {}
            }
        });
    }
};

// --- 8. CHAT LOGIC ---
window.Fluxgram.chat = {
    init: async () => {
        const otherUid = UI.getParam('uid');       
        const existingChatId = UI.getParam('chatId'); 
        const deepLink = UI.getParam('link'); // Handles ?u=username redirects

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
                        document.getElementById('chat-avatar').innerText = data.name.charAt(0).toUpperCase();
                        document.getElementById('chat-status').innerText = `${data.members.length} members • @${data.username || 'Private'}`;
                        
                        document.getElementById('btn-call-audio').classList.add('hidden');
                        const addBtn = document.getElementById('btn-add-member');
                        if(addBtn) {
                            if (data.admin === State.currentUser.uid) addBtn.classList.remove('hidden');
                            else addBtn.classList.add('hidden');
                        }

                        if(data.type === 'channel' && data.admin !== State.currentUser.uid) document.getElementById('input-area').classList.add('hidden');
                        else document.getElementById('input-area').classList.remove('hidden');
                    }
                });
            } else {
                const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`;
                State.activeChatId = chatId;

                const chatRef = doc(db, "chats", chatId);
                const chatSnap = await getDoc(chatRef);
                if(!chatSnap.exists()){ await setDoc(chatRef, { type: 'direct', members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp() }); }

                onSnapshot(doc(db, "users", otherUid), (d) => {
                    if(d.exists()) {
                        const u = d.data();
                        State.activeChatUser = u;
                        document.getElementById('chat-name').innerText = u.username;
                        document.getElementById('chat-avatar').innerText = u.username.charAt(0).toUpperCase();
                        document.getElementById('chat-status').innerText = u.isOnline ? 'Online' : 'Offline';
                    }
                });
            }

            const msgInput = document.getElementById('msg-input');
            if(msgInput) {
                msgInput.addEventListener('input', () => { UI.autoResize(msgInput); });
                msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Fluxgram.chat.send(); } });
            }

            window.Fluxgram.chat.loadMessages();
        } catch(error) { UI.toast("Failed to load chat", "error"); }
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
                const timeStr = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                
                // Parse Mentions (@username)
                let textContent = Utils.parseMentions(msg.text.replace(/\n/g, '<br>'));

                container.innerHTML += `
                    <div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}">
                        <div class="msg-bubble">
                            ${textContent}
                            <div class="msg-meta">${timeStr}</div>
                        </div>
                    </div>
                `;
            });
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
    },

    send: async () => {
        const input = document.getElementById('msg-input');
        if(!input) return;
        const text = input.value.trim();
        if(!text || !State.activeChatId) return;

        input.value = '';
        UI.autoResize(input);

        await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { text: text, senderId: State.currentUser.uid, timestamp: serverTimestamp() });
        await setDoc(doc(db, "chats", State.activeChatId), { lastMessage: text, lastSender: State.currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
    },

    // Mention & Link Resolver Engine
    openByUsername: async (username) => {
        UI.loader(true);
        const key = username.toLowerCase();
        try {
            // Check Users
            const qU = query(collection(db, "users"), where("searchKey", "==", key));
            const snapU = await getDocs(qU);
            if(!snapU.empty) {
                const uId = snapU.docs[0].id;
                if(uId === State.currentUser.uid) { UI.toast("You cannot chat with yourself"); UI.loader(false); return; }
                window.location.href = `chat.html?uid=${uId}`;
                return;
            }

            // Check Groups/Channels
            const qC = query(collection(db, "chats"), where("searchKey", "==", key));
            const snapC = await getDocs(qC);
            if(!snapC.empty) {
                const chatId = snapC.docs[0].id;
                // Auto join if not a member
                if(!snapC.docs[0].data().members.includes(State.currentUser.uid)) {
                    await updateDoc(doc(db, "chats", chatId), { members: arrayUnion(State.currentUser.uid) });
                    UI.toast("Joined successfully!");
                }
                window.location.href = `chat.html?chatId=${chatId}`;
                return;
            }

            UI.toast("Username not found!", "error");
            if(window.location.pathname.endsWith('chat.html') && !State.activeChatId) window.location.replace('dashboard.html');
        } catch(e) { console.error(e); }
        UI.loader(false);
    },

    copyLink: () => {
        const u = State.activeChatUser?.username || State.activeChatData?.username;
        if(u) {
            const link = `${window.location.origin}${window.location.pathname}?link=${u}`;
            navigator.clipboard.writeText(link);
            UI.toast("Shareable Link Copied!");
        } else {
            UI.toast("This chat doesn't have a public username.", "error");
        }
    },

    promptAddMember: async () => {
        const username = prompt("Enter exact @username of the person to add:");
        if(!username) return;
        
        UI.loader(true);
        try {
            const q = query(collection(db, "users"), where("searchKey", "==", username.replace('@','').toLowerCase()));
            const snaps = await getDocs(q);
            
            if(snaps.empty) { UI.toast("User not found", "error"); UI.loader(false); return; }
            
            const newMemberUid = snaps.docs[0].id;
            await updateDoc(doc(db, "chats", State.activeChatId), { members: arrayUnion(newMemberUid) });
            UI.toast("Member added successfully!", "success");
        } catch(e) { UI.toast("Failed to add member", "error"); }
        UI.loader(false);
    }
};

// WebRTC logic remains unchanged (same as your previous app.js)
// ... Keep your window.Fluxgram.call object here
