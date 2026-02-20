// ============================================================================
// app.js - Core Application Logic
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// --- 2. GLOBAL APP NAMESPACE ---
// We expose this to window so HTML inline handlers (onclick) can use them.
window.Fluxgram = {
    state: { currentUser: null, activeChatId: null, activeChatUser: null, unsubMessages: null, unsubChats: null, typingTimeout: null },
    ui: {},
    auth: {},
    dash: {},
    chat: {}
};

// --- 3. UI HELPERS ---
window.Fluxgram.ui = {
    loader: (show) => {
        const l = document.getElementById('global-loader');
        if(l) l.classList.toggle('hidden', !show);
    },
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
        document.getElementById('login-form').classList.toggle('hidden', formType !== 'login');
        document.getElementById('signup-form').classList.toggle('hidden', formType !== 'signup');
        document.getElementById('reset-form').classList.toggle('hidden', formType !== 'reset');
    },
    autoResize: (el) => {
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight) + 'px';
    },
    getParam: (param) => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }
};

const UI = window.Fluxgram.ui;

// --- 4. AUTHENTICATION LOGIC ---
window.Fluxgram.auth = {
    login: async () => {
        const e = document.getElementById('login-email').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if(!e || !p) return UI.toast("Enter email and password", "error");
        
        UI.loader(true);
        try {
            await signInWithEmailAndPassword(auth, e, p);
            // onAuthStateChanged will handle redirect
        } catch (err) { UI.toast("Invalid credentials", "error"); UI.loader(false); }
    },

    signup: async () => {
        const u = document.getElementById('signup-username').value.trim();
        const e = document.getElementById('signup-email').value.trim();
        const p = document.getElementById('signup-password').value.trim();
        
        if(!u || !e || p.length < 6) return UI.toast("Fill all fields. Password min 6 chars.", "error");
        if(/\s/.test(u)) return UI.toast("Username cannot contain spaces.", "error");
        
        UI.loader(true);
        try {
            // 1. Check if username is unique
            const searchKey = u.toLowerCase();
            const q = query(collection(db, "users"), where("searchKey", "==", searchKey));
            const snaps = await getDocs(q);
            if(!snaps.empty) throw new Error("Username already taken.");

            // 2. Create Auth User
            const res = await createUserWithEmailAndPassword(auth, e, p);
            
            // 3. Create Firestore Profile
            await setDoc(doc(db, "users", res.user.uid), {
                uid: res.user.uid, email: e, username: u, searchKey: searchKey, isOnline: true, lastSeen: serverTimestamp()
            });
            UI.toast("Account created!");
        } catch (err) { UI.toast(err.message, "error"); UI.loader(false); }
    },

    reset: async () => {
        const e = document.getElementById('reset-email').value.trim();
        if(!e) return UI.toast("Enter email", "error");
        try {
            await sendPasswordResetEmail(auth, e);
            UI.toast("Password reset sent to email", "success");
            UI.toggleForms('login');
        } catch(err) { UI.toast(err.message, "error"); }
    },

    logout: async () => {
        UI.loader(true);
        if(auth.currentUser) await setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
        await signOut(auth);
    }
};

// --- 5. PRESENCE SYSTEM ---
function updatePresence(isOnline) {
    if(auth.currentUser) {
        setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: isOnline, lastSeen: serverTimestamp() }, { merge: true });
    }
}
window.addEventListener('beforeunload', () => updatePresence(false));
document.addEventListener('visibilitychange', () => { updatePresence(document.visibilityState === 'visible'); });

// --- 6. AUTH STATE OBSERVER (Routing Guard) ---
onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname;
    const State = window.Fluxgram.state;
    UI.loader(false);

    if (user) {
        State.currentUser = user;
        updatePresence(true);
        // Redirect logic
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
        const term = document.getElementById('search-input').value.trim().toLowerCase();
        const resultsBox = document.getElementById('search-results');
        const chatList = document.getElementById('chat-list');
        const State = window.Fluxgram.state;

        if(term.length < 2) {
            resultsBox.classList.add('hidden');
            chatList.classList.remove('hidden');
            return;
        }

        resultsBox.classList.remove('hidden');
        chatList.classList.add('hidden');
        resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">Searching...</div>`;

        try {
            const q = query(collection(db, "users"), where("searchKey", ">=", term), where("searchKey", "<=", term + '\uf8ff'));
            const snaps = await getDocs(q);
            
            resultsBox.innerHTML = '';
            snaps.forEach(docSnap => {
                if(docSnap.id === State.currentUser.uid) return;
                const u = docSnap.data();
                resultsBox.innerHTML += `
                    <div class="chat-item" onclick="window.location.href='chat.html?uid=${u.uid}'">
                        <div class="avatar">${u.username.charAt(0)}</div>
                        <div class="chat-info">
                            <div class="c-name">${u.username}</div>
                            <div class="c-msg">${u.email}</div>
                        </div>
                    </div>
                `;
            });
            if(resultsBox.innerHTML === '') resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">No users found</div>`;
        } catch(e) { console.error(e); }
    },

    loadChats: () => {
        const State = window.Fluxgram.state;
        const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid), orderBy("updatedAt", "desc"));
        
        State.unsubChats = onSnapshot(q, async (snapshot) => {
            const list = document.getElementById('chat-list');
            if(!list) return;
            list.innerHTML = '';
            
            if(snapshot.empty) list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted);">No chats yet. Search a user to start.</div>`;

            for (const chatDoc of snapshot.docs) {
                const data = chatDoc.data();
                const otherUid = data.members.find(id => id !== State.currentUser.uid);
                
                // Fetch other user doc
                const otherUserDoc = await getDoc(doc(db, "users", otherUid));
                if(!otherUserDoc.exists()) continue;
                const otherUser = otherUserDoc.data();

                const timeStr = data.updatedAt ? data.updatedAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                const isTyping = data.typing && data.typing.includes(otherUid);
                const unread = (data.lastSender !== State.currentUser.uid && data.unreadCount > 0) ? `<div class="unread-badge">${data.unreadCount}</div>` : '';

                list.innerHTML += `
                    <div class="chat-item" onclick="window.location.href='chat.html?uid=${otherUid}'">
                        <div class="avatar">${otherUser.username.charAt(0)}</div>
                        <div class="chat-info">
                            <div class="c-name-row">
                                <div class="c-name">${otherUser.username}</div>
                                <div class="c-time">${timeStr}</div>
                            </div>
                            <div class="c-msg-row">
                                <div class="c-msg" style="${isTyping ? 'color:var(--accent);' : ''}">${isTyping ? 'typing...' : (data.lastMessage || 'New Chat')}</div>
                                ${unread}
                            </div>
                        </div>
                    </div>
                `;
            }
        });
    }
};

// --- 8. CHAT LOGIC ---
window.Fluxgram.chat = {
    init: async () => {
        const State = window.Fluxgram.state;
        const otherUid = UI.getParam('uid');
        if(!otherUid) return window.location.replace('dashboard.html');

        // Setup Chat ID
        const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`;
        State.activeChatId = chatId;

        // Ensure Chat Doc Exists
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        if(!chatSnap.exists()){
            await setDoc(chatRef, { members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp(), lastMessage: "Chat created", unreadCount: 0 });
        } else {
            // Reset unread count if I am opening it and I didn't send the last message
            if(chatSnap.data().lastSender !== State.currentUser.uid) {
                await updateDoc(chatRef, { unreadCount: 0 });
            }
        }

        // Fetch Remote User Info & Listen to Presence
        onSnapshot(doc(db, "users", otherUid), (d) => {
            if(d.exists()) {
                const u = d.data();
                State.activeChatUser = u;
                document.getElementById('chat-name').innerText = u.username;
                document.getElementById('chat-avatar').innerText = u.username.charAt(0);
                
                const statusEl = document.getElementById('chat-status');
                statusEl.innerText = u.isOnline ? 'Online' : 'Offline';
                statusEl.classList.toggle('online', u.isOnline);
            }
        });

        // Listen for Typing
        onSnapshot(doc(db, "chats", chatId), (d) => {
            if(d.exists() && d.data().typing && d.data().typing.includes(otherUid)) {
                document.getElementById('typing-indicator').classList.remove('hidden');
            } else {
                document.getElementById('typing-indicator').classList.add('hidden');
            }
        });

        // Setup input listeners
        const msgInput = document.getElementById('msg-input');
        msgInput.addEventListener('input', () => {
            UI.autoResize(msgInput);
            window.Fluxgram.chat.setTyping();
        });
        msgInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Fluxgram.chat.send(); }
        });

        window.Fluxgram.chat.loadMessages();
    },

    loadMessages: () => {
        const State = window.Fluxgram.state;
        const container = document.getElementById('messages-container');
        const q = query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("timestamp", "asc"));
        
        State.unsubMessages = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                const isMe = msg.senderId === State.currentUser.uid;
                const timeStr = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                
                container.innerHTML += `
                    <div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}">
                        <div class="msg-bubble">
                            ${msg.text.replace(/\n/g, '<br>')}
                            <div class="msg-meta">${timeStr} ${isMe ? '<i class="fas fa-check-double" style="color:var(--accent);"></i>' : ''}</div>
                        </div>
                    </div>
                `;
            });
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
        });
    },

    send: async () => {
        const State = window.Fluxgram.state;
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        if(!text || !State.activeChatId) return;

        input.value = '';
        UI.autoResize(input);

        // Add message
        await addDoc(collection(db, `chats/${State.activeChatId}/messages`), {
            text: text, senderId: State.currentUser.uid, timestamp: serverTimestamp()
        });
        
        // Update parent chat doc
        const chatRef = doc(db, "chats", State.activeChatId);
        const snap = await getDoc(chatRef);
        let unread = snap.exists() ? (snap.data().unreadCount || 0) : 0;
        
        await setDoc(chatRef, { 
            lastMessage: text, 
            lastSender: State.currentUser.uid,
            updatedAt: serverTimestamp(),
            unreadCount: unread + 1,
            typing: [] 
        }, { merge: true });
    },

    setTyping: () => {
        const State = window.Fluxgram.state;
        if(!State.activeChatId) return;
        setDoc(doc(db, "chats", State.activeChatId), { typing: [State.currentUser.uid] }, { merge: true });
        
        clearTimeout(State.typingTimeout);
        State.typingTimeout = setTimeout(() => {
            setDoc(doc(db, "chats", State.activeChatId), { typing: [] }, { merge: true });
        }, 1500);
    }
};
