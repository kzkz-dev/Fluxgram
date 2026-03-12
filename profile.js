import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { State } from "./state.js";
import { Utils } from "./utils.js";
import { UI } from "./ui.js";

export const ProfileModule = {
  openMyProfile() {
    if (!State.userData) return;

    Utils.setText("my-display-name", State.userData.name || State.userData.username || "User");
    Utils.setText("my-display-email", State.userData.email || "Not set");
    Utils.setText("my-display-bio", State.userData.bio || "Available on Fluxgram");
    Utils.setText("my-display-username", `@${State.userData.username || "unknown"}`);

    const avatar = document.getElementById("my-display-avatar");
    if (avatar) {
      avatar.innerHTML = Utils.renderAvatarHTML(
        State.userData.photoURL,
        State.userData.username || "U"
      );
    }

    document.getElementById("my-profile-modal")?.classList.remove("hidden");
  },

  async instantAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    UI.loader(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = await Utils.compressToBase64(e.target.result, 300, 0.7);
        await setDoc(
          doc(db, "users", State.currentUser.uid),
          { photoURL: base64 },
          { merge: true }
        );
        UI.toast("Profile photo updated!", "success");
        UI.loader(false);
      };
      reader.readAsDataURL(file);
    } catch {
      UI.toast("Failed to update photo", "error");
      UI.loader(false);
    }
  }
};