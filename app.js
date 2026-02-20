// ============================================================================
// app.js - Fluxgram Ultra Engine (HD Calls, Delete Msg, Call Log & Fixes)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
    state: { currentUser: null, userData: null, activeChatId: null, activeChatUser: null, callDocId: null, startTime: null },
    ui: {}, auth: {}, dash: {}, chat: {}, call: {}, utils: {}, profile: {}
};

const State = window.Fluxgram.state;

// --- UTILS ---
window.Fluxgram.utils = {
    renderAvatarHTML: (photoURL, fallbackName) => {
        if(photoURL && photoURL.length > 10) return `<img src="${photoURL}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        return `<span>${(fallbackName||'U').charAt(0).toUpperCase()}</span>`;
    },
    compressToBase64: (dataUrl, maxWidth = 300) => {
        return new Promise((resolve) => {
            const img = new Image(); img.src = dataUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                canvas.width = maxWidth; canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        });
    }
};

const Utils = window.Fluxgram.utils;

// --- CHAT & DELETE LOGIC ---
window.Fluxgram.chat = {
    init: async () => {
        const uid = new URLSearchParams(window.location.search).get('uid');
        const chatId = new URLSearchParams(window.location.search).get('chatId');
        if (uid) {
            State.activeChatId = auth.currentUser.uid < uid ? `${auth.currentUser.uid}_${uid}` : `${uid}_${auth.currentUser.uid}`;
            onSnapshot(doc(db, "users", uid), (d) => {
                if(d.exists()) {
                    State.activeChatUser = d.data();
                    document.getElementById('chat-name').innerText = d.data().username;
                    document.getElementById('chat-avatar').innerHTML = Utils.renderAvatarHTML(d.data().photoURL, d.data().username);
                }
            });
        }
        window.Fluxgram.chat.loadMessages();
    },
    loadMessages: () => {
        const container = document.getElementById('messages-container');
        onSnapshot(query(collection(db, `chats/${State.activeChatId}/messages`), orderBy("timestamp", "asc")), (snap) => {
            container.innerHTML = '';
            snap.forEach(d => {
                const m = d.data();
                const isMe = m.senderId === auth.currentUser.uid;
                let content = m.text || '';
                if(m.image) content = `<img src="${m.image}" class="chat-img">`;
                if(m.audio) content = `<audio src="${m.audio}" controls class="chat-audio"></audio>`;
                if(m.type === 'call') content = `<div class="call-log ${m.status === 'missed' ? 'missed' : 'success'}"><i class="fas fa-phone"></i> ${m.text}</div>`;

                container.innerHTML += `
                    <div class="msg-row ${isMe ? 'msg-tx' : 'msg-rx'}">
                        <div class="msg-bubble" onclick="Fluxgram.chat.showDeleteMenu('${d.id}', '${m.senderId}')">
                            ${content}
                        </div>
                    </div>
                `;
            });
            container.scrollTop = container.scrollHeight;
        });
    },
    send: async () => {
        const txt = document.getElementById('msg-input').value.trim();
        if(!txt) return;
        document.getElementById('msg-input').value = '';
        await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { text: txt, senderId: auth.currentUser.uid, timestamp: serverTimestamp() });
        await setDoc(doc(db, "chats", State.activeChatId), { updatedAt: serverTimestamp(), lastMessage: txt }, { merge: true });
    },
    sendImage: async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64 = await Utils.compressToBase64(reader.result);
            await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { image: base64, senderId: auth.currentUser.uid, timestamp: serverTimestamp() });
        };
    },
    startVoice: async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader(); reader.readAsDataURL(blob);
                reader.onload = async () => {
                    await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { audio: reader.result, senderId: auth.currentUser.uid, timestamp: serverTimestamp() });
                };
            };
            window._rec = recorder; recorder.start();
            document.getElementById('btn-record-voice').classList.add('recording');
        } catch(e) { alert("Mic Access Denied. Check browser settings."); }
    },
    stopVoice: () => {
        if(window._rec) { window._rec.stop(); document.getElementById('btn-record-voice').classList.remove('recording'); }
    },
    showDeleteMenu: async (msgId, senderId) => {
        const isMe = senderId === auth.currentUser.uid;
        const choice = confirm(isMe ? "Delete for everyone?" : "Delete for me?");
        if(choice) {
            await deleteDoc(doc(db, `chats/${State.activeChatId}/messages`, msgId));
        }
    }
};

// --- HD CALLING SYSTEM ---
let pc, localStream;
const servers = { 
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
    iceCandidatePoolSize: 10
};

window.Fluxgram.call = {
    startCall: async (type) => {
        const callDoc = doc(collection(db, "calls"));
        State.callDocId = callDoc.id;
        document.getElementById('call-screen').classList.remove('hidden');
        document.getElementById('callName').innerText = State.activeChatUser.username;

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
            
            // Initial state: hide video if audio call
            localStream.getVideoTracks()[0].enabled = (type === 'video');

            pc = new RTCPeerConnection(servers);
            localStream.getTracks().forEach(tr => pc.addTrack(tr, localStream));

            pc.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];
            
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await pc.setLocalDescription(offer);

            await setDoc(callDoc, { 
                offer: { sdp: offer.sdp, type: offer.type },
                callerId: auth.currentUser.uid, receiverId: State.activeChatUser.uid, 
                status: 'ringing', type: type, timestamp: serverTimestamp() 
            });

            onSnapshot(callDoc, (s) => {
                const data = s.data();
                if(!pc.currentRemoteDescription && data?.answer) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                if(data?.status === 'ended') window.Fluxgram.call.cleanup();
            });
            State.startTime = Date.now();
        } catch(e) { window.Fluxgram.call.cleanup(); }
    },
    listenForCalls: () => {
        onSnapshot(query(collection(db, "calls"), where("receiverId", "==", auth.currentUser.uid), where("status", "==", "ringing")), (snap) => {
            snap.docChanges().forEach(async c => {
                if(c.type === 'added') {
                    State.callDocId = c.doc.id;
                    const data = c.doc.data();
                    document.getElementById('call-screen').classList.remove('hidden');
                    document.getElementById('call-incoming-btns').classList.remove('hidden');
                    document.getElementById('callName').innerText = "Incoming " + data.type;
                }
            });
        });
    },
    acceptCall: async () => {
        document.getElementById('call-incoming-btns').classList.add('hidden');
        const callRef = doc(db, "calls", State.callDocId);
        const callData = (await getDoc(callRef)).data();

        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        pc = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(tr => pc.addTrack(tr, localStream));
        pc.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];

        await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(callRef, { answer: { sdp: answer.sdp, type: answer.type }, status: 'connected' });
        State.startTime = Date.now();
    },
    endCall: async () => {
        let duration = "No Answer";
        if(State.startTime) {
            const sec = Math.floor((Date.now() - State.startTime)/1000);
            duration = `${Math.floor(sec/60)}m ${sec%60}s`;
        }
        await addDoc(collection(db, `chats/${State.activeChatId}/messages`), { 
            type: 'call', text: duration, status: State.startTime ? 'success' : 'missed', senderId: auth.currentUser.uid, timestamp: serverTimestamp() 
        });
        if(State.callDocId) await updateDoc(doc(db, "calls", State.callDocId), { status: 'ended' });
        window.Fluxgram.call.cleanup();
    },
    cleanup: () => {
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        if(pc) pc.close();
        document.getElementById('call-screen').classList.add('hidden');
        State.callDocId = null; State.startTime = null;
    },
    toggleVideo: () => {
        const track = localStream.getVideoTracks()[0];
        track.enabled = !track.enabled;
        document.getElementById('call-video-toggle').innerHTML = track.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
};

// --- AUTH PRESENCE ---
onAuthStateChanged(auth, u => {
    if(u) {
        if(window.location.pathname.includes('chat')) window.Fluxgram.chat.init();
        window.Fluxgram.call.listenForCalls();
    }
});
