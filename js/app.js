/**
 * App — 主入口，初始化所有模块
 */
import { initDefaults } from "./db.js";
import bus from "./eventBus.js";
import { renderSettings } from "./settings.js";
import { renderChat } from "./chat.js";
import { renderCharacter } from "./character.js";

const APP_VERSION = "0.2.0";

async function boot() {
  console.log(`[MiMaShu] v${APP_VERSION} booting...`);

  await initDefaults();

  fixThemeColor();

  initClock();
  initLockScreen();
  initHomeScreen();
  initStatusBar();
  initPhotoWidgets();

  console.log("[MiMaShu] Ready.");
  bus.emit("app:ready");
}

/* ── Clock ── */
function initClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  tick();
  setInterval(tick, 1000);
}

/* ── Lock Screen ── */
function initLockScreen() {
  const lockScreen = document.getElementById("lock-screen");
  const homeScreen = document.getElementById("home-screen");
  const unlockBtn = document.getElementById("unlock-btn");
  if (!lockScreen || !homeScreen) return;

  let startY = 0;

  function unlock() {
    lockScreen.classList.add("hidden");
    homeScreen.classList.remove("hidden");
    bus.emit("screen:unlocked");
  }

  if (unlockBtn) unlockBtn.addEventListener("click", unlock);

  lockScreen.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
  });

  lockScreen.addEventListener("touchend", (e) => {
    const dy = startY - e.changedTouches[0].clientY;
    if (dy > 80) unlock();
  });
}

/* ── Home Screen Pages ── */
function initHomeScreen() {
  const pages = document.getElementById("app-pages");
  if (!pages) return;

  const dots = document.querySelectorAll(".page-dot");
  let currentPage = 0;
  const totalPages = pages.children.length;
  let startX = 0;

  function goToPage(index) {
    currentPage = Math.max(0, Math.min(index, totalPages - 1));
    pages.style.transform = `translateX(-${currentPage * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("active", i === currentPage));
  }

  pages.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  pages.addEventListener("touchend", (e) => {
    const dx = startX - e.changedTouches[0].clientX;
    if (dx > 60) goToPage(currentPage + 1);
    else if (dx < -60) goToPage(currentPage - 1);
  });

  initAppIcons();
}

/* ── App Icon Click → Open Modal ── */
function initAppIcons() {
  document.querySelectorAll(".app-icon").forEach((icon) => {
    icon.addEventListener("click", () => {
      const appName = icon.dataset.app;
      if (!appName) return;
      bus.emit("app:open", appName);
      openModal(appName);
    });
  });
}

/* ── Modal System ── */
async function openModal(appName) {
  const modal = document.getElementById("app-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  if (!modal) return;

  title.textContent = appName === "Lore" ? "\u4e16\u754c\u4e66" : appName;
  body.innerHTML = "";

  if (appName === "Settings") {
    await renderSettings(body);
  } else if (appName === "Chat") {
    await renderChat(body);
  } else if (appName === "Character") {
    await renderCharacter(body);
  } else if (appName === "Presets") {
    renderPresets(body);
  } else if (appName === "Lore") {
    renderLore(body);

  } else {
    renderPlaceholder(body, appName);
  }

  modal.classList.remove("hidden");
  modal.classList.add("modal-open");

  bus.emit("modal:opened", appName);
}


/* ── App Placeholder Pages ── */
const APP_INFO = {
  Phone: {
    desc: "Snoop through your character's phone",
    icon: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    subs: ["WeChat", "Gallery", "Browser", "Notes", "Calendar", "Contacts", "Messages", "Music", "Wallet", "Maps", "Clock", "Calculator"],
  },
  Theater: {
    desc: "AI-generated interactive stories",
    icon: '<svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    subs: ["New Story", "My Stories", "Templates"],
  },
  World: {
    desc: "Isekai parallel worlds to explore",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    subs: ["World List", "Create World", "Import"],
  },
  Reading: {
    desc: "Read and annotate character stories",
    icon: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    subs: ["Library", "Bookmarks", "Reading History"],
  },
  Emotion: {
    desc: "Track your character's emotional state",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    subs: ["Mood Chart", "Emotion Log", "Triggers"],
  },
  Games: {
    desc: "Mini-games to play with your character",
    icon: '<svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/></svg>',
    subs: ["Truth or Dare", "Drawing", "Quiz", "Would You Rather"],
  },
  Forum: {
    desc: "Community hub for characters",
    icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    subs: ["Feed", "Popular", "My Posts"],
  },
  Couple: {
    desc: "Shared couple space with your partner",
    icon: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    subs: ["Timeline", "Collection Wall", "Photo Album", "Time Capsule", "Message Board"],
  },
  Diary: {
    desc: "Character's private diary entries",
    icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    subs: ["Today", "All Entries", "Shared Diary"],
  },
  Assistant: {
    desc: "Smart assistant for quick actions",
    icon: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    subs: ["Quick Commands", "Shortcuts", "Automation"],
  },
  Memory: {
    desc: "Long-term memory and knowledge base",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    subs: ["Key Memories", "Auto Summary", "Memory Search"],
  },
};

function renderPlaceholder(container, appName) {
  const info = APP_INFO[appName] || { desc: "This feature is under development", icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', subs: [] };

  const subsHtml = info.subs.length > 0
    ? '<div class="placeholder-subs">' + info.subs.map(s =>
        '<div class="placeholder-sub-item">' +
          '<div class="placeholder-sub-dot"></div>' +
          '<span>' + s + '</span>' +
          '<span class="placeholder-sub-badge">Soon</span>' +
        '</div>'
      ).join("") + '</div>'
    : '';

  container.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-icon-wrap">
        <div class="placeholder-icon">${info.icon}</div>
      </div>
      <div class="placeholder-badge">Coming Soon</div>
      <div class="placeholder-desc">${info.desc}</div>
      ${subsHtml}
    </div>
  `;
}

export function closeModal() {
  const modal = document.getElementById("app-modal");
  if (!modal) return;
  modal.classList.remove("modal-open");
  setTimeout(() => modal.classList.add("hidden"), 300);
  bus.emit("modal:closed");
}

/* ── Status Bar ── */
/* ── Fix theme-color for Android cutout ── */
function fixThemeColor() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const color = isDark ? "#1C1C1E" : "#F2F2F7";
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = color;
  document.head.appendChild(meta);
}

function initStatusBar() {
  const battery = document.getElementById("battery-level");
  if (!battery && navigator.getBattery) {
    navigator.getBattery?.().then((b) => {
      const el = document.getElementById("battery-level");
      if (el) el.textContent = Math.round(b.level * 100) + "%";
    });
  }
}

/* ── Photo Upload Widgets ── */
function initPhotoWidgets() {
  setupPhotoSlot("polaroid-1", "polaroid-photo-1");
  setupPhotoSlot("polaroid-2", "polaroid-photo-2");
  setupPhotoSlot("lock-photo-area", "lock-photo");
}

function setupPhotoSlot(elementId, storageKey) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const saved = localStorage.getItem(storageKey);
  if (saved) showPhoto(el, saved);

  el.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        localStorage.setItem(storageKey, dataUrl);
        showPhoto(el, dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function showPhoto(container, dataUrl) {
  const existing = container.querySelector("img");
  if (existing) {
    existing.src = dataUrl;
    return;
  }
  container.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  container.appendChild(img);
}

/* ── Expose for HTML onclick ── */
/* ── PWA Install Prompt ── */
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  if (isStandalone) return;
  if (document.getElementById("pwa-install-banner")) return;
  if (localStorage.getItem("pwa-banner-dismissed") === "1") return;

  const banner = document.createElement("div");
  banner.id = "pwa-install-banner";
  banner.innerHTML = `
    <div class="pwa-banner-text">
      <strong>Install MiMaShu</strong>
      <span>Add to home screen for fullscreen experience</span>
    </div>
    <button id="pwa-install-btn">Install</button>
    <button id="pwa-dismiss-btn">&times;</button>
  `;
  document.body.appendChild(banner);

  document.getElementById("pwa-install-btn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === "accepted") {
      banner.remove();
    }
    deferredInstallPrompt = null;
  });

  document.getElementById("pwa-dismiss-btn").addEventListener("click", () => {
    banner.remove();
    localStorage.setItem("pwa-banner-dismissed", "1");
  });
}

window.addEventListener("appinstalled", () => {
  const banner = document.getElementById("pwa-install-banner");
  if (banner) banner.remove();
  deferredInstallPrompt = null;
});

window.MiMaShu = { closeModal, bus };

/* ── Boot ── */
document.addEventListener("DOMContentLoaded", boot);
import { renderPresets } from "./presets.js";
import { renderLore } from "./lore.js";
