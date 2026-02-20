// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, sendPasswordResetEmail, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, collection, query, where, 
    orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
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

// --- GLOBAL VARIABLES ---
let currentUser = null;
let typingTimeout = null;

// --- ROUTING & PRESENCE MANAGER ---
onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname;
    
    if (user) {
        currentUser = user;
        // Set presence to online
        await updatePresence(true);
        
        // Redirect away from login page if already logged in
        if (path.includes("index.html") || path === "/") {
            window.location.href = "dashboard.html";
        }
        
        // Initialize page-specific scripts
        if (path.includes("dashboard.html")) initDashboard();
        if (path.includes("chat.html")) initChat();

    } else {
        // Redirect to login if not authenticated
        if (!path.includes("index.html") && path !== "/") {
            window.location.href = "index.html";
        }
    }
});

// Update Online/Offline status
async function updatePresence(isOnline) {
    if(!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
        isOnline: isOnline,
        lastSeen: serverTimestamp()
    }).catch(e => console.log("Presence init err (doc might not exist yet)"));
}

// Handle window close for presence
window.addEventListener('beforeunload', () => {
    if(currentUser) updatePresence(false);
});

// --- AUTHENTICATION FUNCTIONS (Used in index.html) ---
window.toggleAuth = (mode) => {
    document.getElementById('loginBox').classList.toggle('hidden', mode === 'signup');
    document.getElementById('signupBox').classList.toggle('hidden', mode === 'login');
};

window.signup = async () => {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const errBox = document.getElementById('signupError');

    if(!email || !pass || !username) return errBox.innerText = "All fields are required", errBox.classList.remove('hidden');
    if(pass.length < 6) return errBox.innerText = "Password must be at least 6 characters", errBox.classList.remove('hidden');

    try {
        // Check if username exists (Case insensitive search key)
        const q = query(collection(db, "users"), where("searchKey", "==", username.toLowerCase()));
        const snapshot = await getDocs(q);
        if(!snapshot.empty) return errBox.innerText = "Username already taken", errBox.classList.remove('hidden');

        // Create User
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        
        // Save profile to Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
            uid: cred.user.uid,
            email: email,
            username: username,
            searchKey: username.toLowerCase(), // for prefix searching
            isOnline: true,
            lastSeen: serverTimestamp()
        });
        
    } catch (error) {
        errBox.innerText = error.message;
        errBox.classList.remove('hidden');
    }
};

window.login = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const errBox = document.getElementById('loginError');

    if(!email || !pass) return errBox.innerText = "Enter email and password", errBox.classList.remove('hidden');

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        errBox.innerText = "Invalid credentials";
        errBox.classList.remove('hidden');
    }
};

window.resetPassword = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if(!email) return alert("Please enter your email in the email field first.");
    try {
        await sendPasswordResetEmail(auth, email);
        alert("Password reset email sent.");
    } catch(err) { alert(err.message); }
};

window.logout = async () => {
    await updatePresence(false);
    await signOut(auth);
};

// --- DASHBOARD FUNCTIONS (Used in dashboard.html) ---
function initDashboard() {
    loadChatList();
}

window.searchUsers = async () => {
    const term = document.getElementById('searchInput').value.trim().toLowerCase();
    const list = document.getElementById('chatList');
    
    if(term.length === 0) return loadChatList(); // restore chats

    list.innerHTML = '<div style="text-align:center; padding:20px;">Searching...</div>';

    // Firestore prefix search using `>=` and `<=`
    const q = query(collection(db, "users"), 
        where("searchKey", ">=", term), 
        where("searchKey", "<=", term + '\uf8ff')
    );
    
    const snaps = await getDocs(q);
    list.innerHTML = '';

    if(snaps.empty) return list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No users found</div>';

    snaps.forEach(docSnap => {
        if(docSnap.id === currentUser.uid) return; // Don't search self
        const u = docSnap.data();
        
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.onclick = () => openChat(docSnap.id);
        
        div.innerHTML = `
            <div class="avatar">${u.username.charAt(0)}</div>
            <div class="chat-info">
                <div class="chat-header-row"><div class="chat-name">${u.username}</div></div>
                <div class="chat-msg-row"><div class="chat-last-msg">Start chatting...</div></div>
            </div>
        `;
        list.appendChild(div);
    });
};

function loadChatList() {
    const q = query(collection(db, "chats"), where("members", "array-contains", currentUser.uid), orderBy("updatedAt", "desc"));
    
    onSnapshot(q, async (snapshot) => {
        // If user is currently searching, don't overwrite the screen
        if(document.getElementById('searchInput').value.trim().length > 0) return;

        const list = document.getElementById('chatList');
        list.innerHTML = '';

        if(snapshot.empty) return list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No active chats. Search a username to start!</div>';

        for (const chatDoc of snapshot.docs) {
            const data = chatDoc.data();
            const otherUid = data.members.find(id => id !== currentUser.uid);
            
            // Get other user's info
            const userDoc = await getDoc(doc(db, "users", otherUid));
            if(!userDoc.exists()) continue;
            const otherUser = userDoc.data();

            // Unread logic
            let unreadCount = data[`unread_${currentUser.uid}`] || 0;
            const unreadHTML = unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : '';

            // Formatting time
            let timeStr = "";
            if(data.updatedAt) {
                const date = data.updatedAt.toDate();
                timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const div = document.createElement('div');
            div.className = 'chat-item';
            div.onclick = () => openChat(otherUid);
            
            div.innerHTML = `
                <div class="avatar">${otherUser.username.charAt(0)}</div>
                <div class="chat-info">
                    <div class="chat-header-row">
                        <div class="chat-name">${otherUser.username}</div>
                        <div class="chat-time">${timeStr}</div>
                    </div>
                    <div class="chat-msg-row">
                        <div class="chat-last-msg">${data.lastMessage || 'New chat'}</div>
                        ${unreadHTML}
                    </div>
                </div>
            `;
            list.appendChild(div);
        }
    });
}

window.openChat = async (otherUid) => {
    // Generate unique chat ID regardless of who starts it
    const chatId = currentUser.uid < otherUid ? `${currentUser.uid}_${otherUid}` : `${otherUid}_${currentUser.uid}`;
    
    // Create chat doc if not exists
    const chatRef = doc(db, "chats", chatId);
    const snap = await getDoc(chatRef);
    if(!snap.exists()) {
        await setDoc(chatRef, {
            members: [currentUser.uid, otherUid],
            updatedAt: serverTimestamp(),
            lastMessage: ""
        });
    }
    
    // Redirect
    window.location.href = `chat.html?uid=${otherUid}`;
};

// --- CHAT FUNCTIONS (Used in chat.html) ---
let activeChatId = null;
let activeOtherUid = null;

async function initChat() {
    const params = new URLSearchParams(window.location.search);
    activeOtherUid = params.get('uid');
    if(!activeOtherUid) return window.location.href = "dashboard.html";

    activeChatId = currentUser.uid < activeOtherUid ? `${currentUser.uid}_${activeOtherUid}` : `${activeOtherUid}_${currentUser.uid}`;

    // Load Header Info
    const userDoc = await getDoc(doc(db, "users", activeOtherUid));
    if(userDoc.exists()) {
        const u = userDoc.data();
        document.getElementById('chatName').innerText = u.username;
        document.getElementById('chatAvatar').innerText = u.username.charAt(0);
        
        // Listen for online status
        onSnapshot(doc(db, "users", activeOtherUid), (d) => {
            const data = d.data();
            const statusEl = document.getElementById('chatStatus');
            if(data.isOnline) {
                statusEl.innerText = "Online";
                statusEl.classList.add("online");
            } else {
                statusEl.classList.remove("online");
                statusEl.innerText = data.lastSeen ? "Last seen " + data.lastSeen.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Offline";
            }
        });
    }

    // Listen for typing indicator
    onSnapshot(doc(db, "chats", activeChatId), (d) => {
        if(d.exists()) {
            const typingArr = d.data().typing || [];
            document.getElementById('typingIndicator').classList.toggle('hidden', !typingArr.includes(activeOtherUid));
        }
    });

    loadMessages();
}

function loadMessages() {
    const container = document.getElementById('messagesContainer');
    const q = query(collection(db, `chats/${activeChatId}/messages`), orderBy("timestamp", "asc"));
    
    onSnapshot(q, async (snapshot) => {
        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === currentUser.uid;
            const timeStr = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            
            container.innerHTML += `
                <div class="msg-wrapper ${isMe ? 'msg-sent' : 'msg-received'}">
                    <div class="msg-bubble">
                        ${msg.text.replace(/\n/g, '<br>')}
                        <div class="msg-meta">${timeStr}</div>
                    </div>
                </div>
            `;
        });
        
        // Auto scroll
        setTimeout(() => container.scrollTop = container.scrollHeight, 100);

        // Reset my unread count when viewing
        await updateDoc(doc(db, "chats", activeChatId), {
            [`unread_${currentUser.uid}`]: 0
        });
    });
}

window.sendMessage = async () => {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if(!text || !activeChatId) return;

    input.value = '';
    
    // Add msg
    await addDoc(collection(db, `chats/${activeChatId}/messages`), {
        text: text,
        senderId: currentUser.uid,
        timestamp: serverTimestamp()
    });

    // Update parent chat doc & increment unread for receiver
    const chatRef = doc(db, "chats", activeChatId);
    const snap = await getDoc(chatRef);
    const currentUnread = snap.data()[`unread_${activeOtherUid}`] || 0;

    await updateDoc(chatRef, {
        lastMessage: text,
        updatedAt: serverTimestamp(),
        typing: [], // clear typing
        [`unread_${activeOtherUid}`]: currentUnread + 1
    });
};

window.handleTyping = async () => {
    if(!activeChatId) return;
    const chatRef = doc(db, "chats", activeChatId);
    
    // Add to typing array
    await updateDoc(chatRef, { typing: [currentUser.uid] });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        // Remove from typing array after 2 seconds of no typing
        updateDoc(chatRef, { typing: [] });
    }, 2000);
    
    // Auto resize textarea
    const el = document.getElementById('msgInput');
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
};

// Enter key to send message
document.addEventListener('keypress', (e) => {
    if (e.target.id === 'msgInput' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
