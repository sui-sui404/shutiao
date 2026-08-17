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
function openModal(appName) {
  const modal = document.getElementById("app-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  if (!modal) return;

  title.textContent = appName;
  body.innerHTML = "";

  if (appName === "Settings") {
    renderSettings(body);
  } else if (appName === "Chat") {
    renderChat(body);
  } else if (appName === "Character") {
    renderCharacter(body);
  } else if (appName === "Presets") {
    renderPresets(body);
  } else if (appName === "Lore") {
    renderLore(body);
  } else {
    body.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">Coming Soon</p>`;
  }

  modal.classList.remove("hidden");
  modal.classList.add("modal-open");

  bus.emit("modal:opened", appName);
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
