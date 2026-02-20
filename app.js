// Firebase SDK ইম্পোর্ট করা হচ্ছে
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, updateProfile } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// আপনার Firebase প্রজেক্টের আসল কনফিগারেশন এখানে বসান
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase ইনিশিয়ালাইজেশন
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

// আপনার HTML এর লোডিং স্ক্রিনের ID (যেমন: <div id="loading-screen">...</div>)
const loadingScreen = document.getElementById("loading-screen"); 

// ==========================================
// ১. Auth State Observer (লোডিং স্ক্রিন হাইড করবে)
// ==========================================
onAuthStateChanged(auth, (user) => {
  try {
    if (user) {
      console.log("লগইন করা আছে, ইউজার ID:", user.uid);
      // এখানে আপনার মেইন অ্যাপের ইন্টারফেস বা ডেটা লোড করার ফাংশন কল করতে পারেন
      
    } else {
      console.log("কেউ লগইন করা নেই।");
      // ইউজার লগইন করা না থাকলে লগইন পেজে রিডাইরেক্ট করার কোড এখানে দিতে পারেন
      // window.location.href = "login.html"; 
    }
  } catch (error) {
    console.error("Auth state চেক করার সময় এরর হয়েছে:", error);
  } finally {
    // সফল হোক বা ক্র্যাশ করুক, লোডিং স্ক্রিন সরবেই
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }
  }
});

// ==========================================
// ২. Profile Update & Picture Upload (ক্র্যাশ-প্রুফ)
// ==========================================

// ছবি আপলোড করার ফাংশন
async function uploadProfilePicture(file) {
  try {
    const storageRef = ref(storage, `profile_pictures/${auth.currentUser.uid}`);
    
    // uploadBytesResumable এর বদলে uploadBytes ব্যবহার করা হচ্ছে আটকে যাওয়া ঠেকাতে
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("ছবি আপলোড ফেইল করেছে:", error);
    return null; // ক্র্যাশ না করে নিরাপদে null রিটার্ন করবে
  }
}

// নাম এবং ছবি আপডেট করার ফাংশন
async function updateUserProfile(name, file) {
   let photoURL = null; 
   
   // যদি ইউজার নতুন ছবি সিলেক্ট করে থাকে
   if (file) {
       photoURL = await uploadProfilePicture(file);
   }

   try {
       // photoURL যদি না থাকে, তবে undefined এর বদলে null পাঠাবে
       await updateProfile(auth.currentUser, {
           displayName: name,
           photoURL: photoURL || null 
       });
       console.log("প্রোফাইল সফলভাবে আপডেট হয়েছে!");
       alert("প্রোফাইল আপডেট হয়েছে!");
   } catch (error) {
       console.error("প্রোফাইল আপডেটের সময় এরর:", error);
       alert("প্রোফাইল আপডেট করতে সমস্যা হয়েছে।");
   }
}

// আপনি চাইলে updateUserProfile ফাংশনটি আপনার ফর্ম সাবমিট বাটনের সাথে যুক্ত করে নিতে পারেন।
// উদাহরণ:
// document.getElementById("update-btn").addEventListener("click", () => {
//    const name = document.getElementById("name-input").value;
//    const file = document.getElementById("file-input").files[0];
//    updateUserProfile(name, file);
// });
