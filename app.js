// ============================================================================
// app.js - Core Application Logic (Optimized & Error-Proof with WebRTC)
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
window.Fluxgram = {
    state: { currentUser: null, activeChatId: null, activeChatUser: null, unsubMessages: null, unsubChats: null, typingTimeout: null, callDocId: null },
    ui: {},
    auth: {},
    dash: {},
    chat: {},
    call: {}
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
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const resetForm = document.getElementById('reset-form');
        
        if (loginForm) loginForm.classList.toggle('hidden', formType !== 'login');
        if (signupForm) signupForm.classList.toggle('hidden', formType !== 'signup');
        if (resetForm) resetForm.classList.toggle('hidden', formType !== 'reset');
    },
    autoResize: (el) => {
        if (!el) return;
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
        } catch (err) { 
            UI.toast("Invalid credentials. Check email & password.", "error"); 
        } finally {
            UI.loader(false);
        }
    },

    signup: async () => {
        const u = document.getElementById('signup-username').value.trim();
        const e = document.getElementById('signup-email').value.trim();
        const p = document.getElementById('signup-password').value.trim();
        
        if(!u || !e || p.length < 6) return UI.toast("Fill all fields. Password min 6 chars.", "error");
        if(/\s/.test(u)) return UI.toast("Username cannot contain spaces.", "error");
        
        UI.loader(true);
        try {
            const searchKey = u.toLowerCase();
            const q = query(collection(db, "users"), where("searchKey", "==", searchKey));
            const snaps = await getDocs(q);
            if(!snaps.empty) throw new Error("Username already taken.");

            const res = await createUserWithEmailAndPassword(auth, e, p);
            
            await setDoc(doc(db, "users", res.user.uid), {
                uid: res.user.uid, email: e, username: u, searchKey: searchKey, isOnline: true, lastSeen: serverTimestamp()
            });
            UI.toast("Account created successfully!");
        } catch (err) { 
            UI.toast(err.message, "error"); 
        } finally {
            UI.loader(false);
        }
    },

    reset: async () => {
        const e = document.getElementById('reset-email').value.trim();
        if(!e) return UI.toast("Enter email", "error");
        try {
            await sendPasswordResetEmail(auth, e);
            UI.toast("Password reset link sent!", "success");
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
        setDoc(doc(db, "users", auth.currentUser.uid), { isOnline: isOnline, lastSeen: serverTimestamp() }, { merge: true }).catch(err => console.log("Presence update failed:", err));
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
        
        if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
            window.location.replace('dashboard.html');
        } else if (path.endsWith('dashboard.html')) {
            window.Fluxgram.dash.loadChats();
            window.Fluxgram.call.listenForCalls(); // Start listening for incoming calls
        } else if (path.endsWith('chat.html')) {
            window.Fluxgram.chat.init();
            window.Fluxgram.call.listenForCalls(); // Listen here too
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

        if(!resultsBox || !chatList) return;

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
                        <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                        <div class="chat-info">
                            <div class="c-name">${u.username}</div>
                            <div class="c-msg">${u.email}</div>
                        </div>
                    </div>
                `;
            });
            if(resultsBox.innerHTML === '') resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">No users found</div>`;
        } catch(e) { 
            console.error("Search Error:", e); 
            resultsBox.innerHTML = `<div style="padding:15px; text-align:center; color:var(--danger);">Search failed. Please check database rules.</div>`;
        }
    },

    loadChats: () => {
        const State = window.Fluxgram.state;
        const list = document.getElementById('chat-list');
        if(!list) return;

        const q = query(collection(db, "chats"), where("members", "array-contains", State.currentUser.uid));
        
        State.unsubChats = onSnapshot(q, async (snapshot) => {
            list.innerHTML = '';
            
            if(snapshot.empty) {
                list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted);">No chats yet. Search a user to start.</div>`;
                return;
            }

            const chatDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            chatDocs.sort((a, b) => {
                const timeA = a.updatedAt ? a.updatedAt.toMillis() : 0;
                const timeB = b.updatedAt ? b.updatedAt.toMillis() : 0;
                return timeB - timeA;
            });

            for (const data of chatDocs) {
                const otherUid = data.members.find(id => id !== State.currentUser.uid);
                
                try {
                    const otherUserDoc = await getDoc(doc(db, "users", otherUid));
                    if(!otherUserDoc.exists()) continue;
                    const otherUser = otherUserDoc.data();

                    const timeStr = data.updatedAt ? data.updatedAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                    const isTyping = data.typing && data.typing.includes(otherUid);
                    const unread = (data.lastSender !== State.currentUser.uid && data.unreadCount > 0) ? `<div class="unread-badge">${data.unreadCount}</div>` : '';

                    list.innerHTML += `
                        <div class="chat-item" onclick="window.location.href='chat.html?uid=${otherUid}'">
                            <div class="avatar">${otherUser.username.charAt(0).toUpperCase()}</div>
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
                } catch(err) {
                    console.error("Error loading user profile for chat list:", err);
                }
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

        const chatId = State.currentUser.uid < otherUid ? `${State.currentUser.uid}_${otherUid}` : `${otherUid}_${State.currentUser.uid}`;
        State.activeChatId = chatId;

        try {
            const chatRef = doc(db, "chats", chatId);
            const chatSnap = await getDoc(chatRef);
            if(!chatSnap.exists()){
                await setDoc(chatRef, { members: [State.currentUser.uid, otherUid], updatedAt: serverTimestamp(), lastMessage: "Chat created", unreadCount: 0 });
            } else {
                if(chatSnap.data().lastSender !== State.currentUser.uid) {
                    await updateDoc(chatRef, { unreadCount: 0 });
                }
            }

            onSnapshot(doc(db, "users", otherUid), (d) => {
                if(d.exists()) {
                    const u = d.data();
                    State.activeChatUser = u;
                    const nameEl = document.getElementById('chat-name');
                    const avatarEl = document.getElementById('chat-avatar');
                    const statusEl = document.getElementById('chat-status');

                    if(nameEl) nameEl.innerText = u.username;
                    if(avatarEl) avatarEl.innerText = u.username.charAt(0).toUpperCase();
                    if(statusEl) {
                        statusEl.innerText = u.isOnline ? 'Online' : 'Offline';
                        statusEl.classList.toggle('online', u.isOnline);
                    }
                }
            });

            onSnapshot(doc(db, "chats", chatId), (d) => {
                const typingEl = document.getElementById('typing-indicator');
                if(!typingEl) return;
                
                if(d.exists() && d.data().typing && d.data().typing.includes(otherUid)) {
                    typingEl.classList.remove('hidden');
                } else {
                    typingEl.classList.add('hidden');
                }
            });

            const msgInput = document.getElementById('msg-input');
            if(msgInput) {
                msgInput.addEventListener('input', () => {
                    UI.autoResize(msgInput);
                    window.Fluxgram.chat.setTyping();
                });
                msgInput.addEventListener('keypress', (e) => {
                    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Fluxgram.chat.send(); }
                });
            }

            window.Fluxgram.chat.loadMessages();

        } catch(error) {
            console.error("Chat Init Error:", error);
            UI.toast("Failed to initialize chat", "error");
        }
    },

    loadMessages: () => {
        const State = window.Fluxgram.state;
        const container = document.getElementById('messages-container');
        if(!container) return;

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
        if(!input) return;

        const text = input.value.trim();
        if(!text || !State.activeChatId) return;

        input.value = '';
        UI.autoResize(input);

        try {
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), {
                text: text, senderId: State.currentUser.uid, timestamp: serverTimestamp()
            });
            
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
        } catch(error) {
            console.error("Send Message Error:", error);
            UI.toast("Failed to send message", "error");
        }
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

// --- 9. WEBRTC CALLING SYSTEM ---
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
let pc = null;
let localStream = null;

window.Fluxgram.call = {
    startCall: async (type) => {
        const State = window.Fluxgram.state;
        if(!State.activeChatUser) return;
        
        const callDoc = doc(collection(db, "calls"));
        State.callDocId = callDoc.id;

        // Display UI
        const callScreen = document.getElementById('call-screen');
        if(!callScreen) return; // Ensure we are on chat.html
        
        callScreen.classList.remove('hidden');
        document.getElementById('callName').innerText = State.activeChatUser.username;
        document.getElementById('callStatus').innerText = "Calling...";
        document.getElementById('call-controls-active').classList.remove('hidden');
        document.getElementById('call-controls-incoming').classList.add('hidden');

        try {
            // Request Camera/Mic Access
            localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
            document.getElementById('localVideo').srcObject = localStream;

            pc = new RTCPeerConnection(servers);
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.ontrack = (event) => {
                document.getElementById('remoteVideo').srcObject = event.streams[0];
                document.getElementById('callStatus').innerText = "Connected";
            };

            const offerCandidates = collection(callDoc, 'offerCandidates');
            pc.onicecandidate = (event) => {
                if(event.candidate) addDoc(offerCandidates, event.candidate.toJSON());
            };

            // Create Offer
            const offerDescription = await pc.createOffer();
            await pc.setLocalDescription(offerDescription);

            await setDoc(callDoc, {
                offer: { type: offerDescription.type, sdp: offerDescription.sdp },
                callerId: State.currentUser.uid, 
                receiverId: State.activeChatUser.uid, 
                type: type, 
                status: 'ringing'
            });

            // Listen for Answer
            onSnapshot(callDoc, (snapshot) => {
                const data = snapshot.data();
                if (!pc.currentRemoteDescription && data?.answer) {
                    const answerDescription = new RTCSessionDescription(data.answer);
                    pc.setRemoteDescription(answerDescription);
                }
                if(data?.status === 'ended') window.Fluxgram.call.endCallLocal();
            });

            // Listen for Remote ICE
            onSnapshot(collection(callDoc, 'answerCandidates'), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                });
            });

        } catch (err) {
            UI.toast("Camera/Mic access denied.", "error");
            window.Fluxgram.call.endCallLocal();
        }
    },

    listenForCalls: () => {
        const State = window.Fluxgram.state;
        const callScreen = document.getElementById('call-screen');
        if(!callScreen) return; // Prevent errors on dashboard.html if call overlay is missing
        
        const q = query(collection(db, "calls"), where("receiverId", "==", State.currentUser.uid), where("status", "==", "ringing"));
        onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if(change.type === 'added') {
                    const callData = change.doc.data();
                    State.callDocId = change.doc.id;
                    
                    const callerDoc = await getDoc(doc(db, "users", callData.callerId));
                    const callerName = callerDoc.exists() ? callerDoc.data().username : "Unknown";
                    
                    callScreen.classList.remove('hidden');
                    document.getElementById('callName').innerText = callerName;
                    document.getElementById('callStatus').innerText = "Incoming Call...";
                    document.getElementById('call-controls-active').classList.add('hidden');
                    document.getElementById('call-controls-incoming').classList.remove('hidden');
                }
            });
        });
    },

    acceptCall: async () => {
        const State = window.Fluxgram.state;
        document.getElementById('call-controls-active').classList.remove('hidden');
        document.getElementById('call-controls-incoming').classList.add('hidden');
        document.getElementById('callStatus').innerText = "Connecting...";

        const callDocRef = doc(db, "calls", State.callDocId);
        const callDoc = await getDoc(callDocRef);
        const callData = callDoc.data();

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: callData.type === 'video', audio: true });
            document.getElementById('localVideo').srcObject = localStream;

            pc = new RTCPeerConnection(servers);
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.ontrack = (event) => {
                document.getElementById('remoteVideo').srcObject = event.streams[0];
                document.getElementById('callStatus').innerText = "Connected";
            };

            const answerCandidates = collection(callDocRef, 'answerCandidates');
            pc.onicecandidate = (event) => {
                if(event.candidate) addDoc(answerCandidates, event.candidate.toJSON());
            };

            await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
            const answerDescription = await pc.createAnswer();
            await pc.setLocalDescription(answerDescription);

            await updateDoc(callDocRef, { 
                answer: { type: answerDescription.type, sdp: answerDescription.sdp }, 
                status: 'connected' 
            });

            onSnapshot(collection(callDocRef, 'offerCandidates'), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                });
            });
            
            onSnapshot(callDocRef, (snap) => { if(snap.data()?.status === 'ended') window.Fluxgram.call.endCallLocal(); });
        } catch (err) {
            UI.toast("Camera/Mic access denied.", "error");
            window.Fluxgram.call.endCall();
        }
    },

    endCall: async () => {
        const State = window.Fluxgram.state;
        if(State.callDocId) {
            await updateDoc(doc(db, "calls", State.callDocId), { status: 'ended' });
        }
        window.Fluxgram.call.endCallLocal();
    },

    endCallLocal: () => {
        const State = window.Fluxgram.state;
        if(pc) { pc.close(); pc = null; }
        if(localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('localVideo').srcObject = null;
        
        const callScreen = document.getElementById('call-screen');
        if(callScreen) callScreen.classList.add('hidden');
        
        State.callDocId = null;
    },

    toggleMic: () => {
        if(!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        const icon = document.getElementById('mic-icon');
        if(icon) icon.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    },

    toggleCam: () => {
        if(!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if(videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const icon = document.getElementById('cam-icon');
            if(icon) icon.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
        }
    }
};
