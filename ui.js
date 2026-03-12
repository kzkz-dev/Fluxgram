export const UI = {
  loader(show) {
    const el = document.getElementById("global-loader");
    if (el) el.classList.toggle("hidden", !show);
  },

  toast(msg, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  },

  autoResize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  },

  toggleForms(formType) {
    ["login", "signup", "reset"].forEach((f) => {
      const el = document.getElementById(`${f}-form`);
      if (el) el.classList.toggle("hidden", formType !== f);
    });
  }
};