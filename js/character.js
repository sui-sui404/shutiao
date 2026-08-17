/**
 * Character — 角色管理模块
 * 角色列表 / 创建编辑 / 导入（JSON、TXT、DOCX）/ 删除 / NPC 生成器
 */
import bus from "./eventBus.js";
import {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  getAllMasks,
} from "./db.js";
import { createCharacter } from "./models.js";

let currentCharId = null;
let longPressTimer = null;
let currentFilter = "all";
let currentIsNpc = false;

/* ───────── 注入模块样式 ───────── */

function injectStyles() {
  if (document.getElementById("char-module-styles")) return;
  const el = document.createElement("style");
  el.id = "char-module-styles";
  el.textContent = `
    .char-filter-bar {
      display: flex;
      padding: 12px 16px 4px;
    }
    .char-filter-btn {
      flex: 1;
      padding: 7px 0;
      border: 1px solid #D1D1D6;
      background: transparent;
      color: #636366;
      font-size: 13px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .char-filter-btn:first-child {
      border-radius: 8px 0 0 8px;
    }
    .char-filter-btn:last-child {
      border-radius: 0 8px 8px 0;
    }
    .char-filter-btn:not(:first-child) {
      border-left: none;
    }
    .char-filter-btn.active {
      background: #1D1D1F;
      color: #fff;
      border-color: #1D1D1F;
    }
    .char-type-toggle {
      display: flex;
      margin-bottom: 16px;
    }
    .char-type-btn {
      flex: 1;
      padding: 8px 0;
      border: 1px solid #D1D1D6;
      background: transparent;
      color: #636366;
      font-size: 13px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .char-type-btn:first-child {
      border-radius: 8px 0 0 8px;
    }
    .char-type-btn:last-child {
      border-radius: 0 8px 8px 0;
      border-left: none;
    }
    .char-type-btn.active {
      background: #1D1D1F;
      color: #fff;
      border-color: #1D1D1F;
    }
    .char-npc-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(142,142,147,0.15);
      color: #8E8E93;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-left: 6px;
      vertical-align: middle;
      line-height: 16px;
    }
  `;
  document.head.appendChild(el);
}

/* ───────── 主渲染 ───────── */

export async function renderCharacter(container) {
  injectStyles();

  container.innerHTML = `
    <div class="char-page">
      <!-- 列表视图 -->
      <div class="char-list-view" id="char-list-view">
        <div class="char-filter-bar" id="char-filter-bar">
          <button class="char-filter-btn active" data-filter="all">All</button>
          <button class="char-filter-btn" data-filter="characters">Characters</button>
          <button class="char-filter-btn" data-filter="npcs">NPCs</button>
        </div>
        <div class="char-list" id="char-list"></div>
        <div class="char-bottom-actions">
          <button class="settings-btn primary" id="char-create-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create
          </button>
          <button class="settings-btn" id="char-import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import
          </button>
          <button class="settings-btn" id="char-npc-gen-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            NPC Generator
          </button>
        </div>
      </div>

      <!-- 编辑视图 -->
      <div class="char-edit-view hidden" id="char-edit-view">
        <div class="char-edit-header">
          <button class="chat-back-to-home" id="char-edit-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="char-edit-title" id="char-edit-title">Create Character</span>
          <div style="width:36px"></div>
        </div>
        <div class="char-edit-form">
          <label class="field-label">Type</label>
          <div class="char-type-toggle" id="char-type-toggle">
            <button class="char-type-btn active" data-type="character">Character</button>
            <button class="char-type-btn" data-type="npc">NPC</button>
          </div>

          <label class="field-label">Name</label>
          <input type="text" class="field-input" id="char-name" placeholder="Enter character name" />

          <label class="field-label">Avatar</label>
          <input type="hidden" id="char-avatar" value="" />
          <div class="char-avatar-upload" id="char-avatar-upload">
            <div class="char-avatar-preview" id="char-avatar-preview">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span style="font-size:13px;color:#AEAEB2">Tap to upload avatar</span>
          </div>
          <input type="file" id="char-avatar-file" accept="image/*" style="display:none" />

          <label class="field-label">Description</label>
          <textarea class="field-input field-textarea" id="char-desc" placeholder="Paste character card content here" rows="10"></textarea>

          <label class="field-label">First Message</label>
          <textarea class="field-input field-textarea" id="char-first-msg" placeholder="Opening line (optional)" rows="4"></textarea>

          <label class="field-label">Mask Binding</label>
          <select class="field-input" id="char-mask-select">
            <option value="">Default</option>
          </select>

          <div class="form-actions">
            <button class="settings-btn primary" id="char-save-btn">Save</button>
            <button class="settings-btn danger hidden" id="char-delete-btn">Delete</button>
          </div>
        </div>
      </div>

      <!-- NPC Generator 视图 -->
      <div class="char-edit-view hidden" id="npc-gen-view">
        <div class="char-edit-header">
          <button class="chat-back-to-home" id="npc-gen-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="char-edit-title">NPC Generator</span>
          <div style="width:36px"></div>
        </div>
        <div class="char-edit-form">
          <label class="field-label">Name</label>
          <input type="text" class="field-input" id="npc-gen-name" placeholder="NPC name" />

          <label class="field-label">Brief Description</label>
          <textarea class="field-input field-textarea" id="npc-gen-desc" placeholder="Short description of this NPC" rows="3"></textarea>

          <label class="field-label">Relationship</label>
          <input type="text" class="field-input" id="npc-gen-rel" placeholder="Relationship to main character" />

          <div class="form-actions">
            <button class="settings-btn primary" id="npc-gen-create-btn">Create NPC</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await renderCharList(container);
  bindEvents(container);
}

/* ───────── 列表渲染 ───────── */

async function renderCharList(container) {
  const list = container.querySelector("#char-list");
  let chars = await getAllCharacters();

  if (currentFilter === "characters") {
    chars = chars.filter((c) => !c.isNpc);
  } else if (currentFilter === "npcs") {
    chars = chars.filter((c) => c.isNpc);
  }

  if (chars.length === 0) {
    const msg =
      currentFilter === "npcs"
        ? "No NPCs yet. Use NPC Generator to create one."
        : currentFilter === "characters"
        ? "No characters yet. Tap Create or Import to add one."
        : "No characters yet. Tap the buttons below to get started.";
    list.innerHTML = `<div class="empty-hint">${msg}</div>`;
    return;
  }

  list.innerHTML = chars
    .map((c) => {
      const desc = c.description || c.systemPrompt || "";
      const preview = desc.length > 60 ? desc.slice(0, 60) + "\u2026" : desc;
      const avatarHtml =
        c.avatar && c.avatar.startsWith("data:")
          ? `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : escHtml(c.avatar || (c.name ? c.name.charAt(0) : "?"));
      const npcBadge = c.isNpc
        ? `<span class="char-npc-badge">NPC</span>`
        : "";
      return `
      <div class="session-card char-card" data-id="${c.id}">
        <div class="session-avatar">${avatarHtml}</div>
        <div class="session-info">
          <div class="session-top-row">
            <span class="session-name">${escHtml(c.name || "Unnamed")}${npcBadge}</span>
            <span class="session-time">${formatDate(c.createdAt)}</span>
          </div>
          <div class="session-preview">${escHtml(preview || "No description")}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

/* ───────── 事件绑定 ───────── */

function bindEvents(container) {
  const charList = container.querySelector("#char-list");

  /* 筛选栏 */
  container.querySelector("#char-filter-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".char-filter-btn");
    if (!btn) return;
    const filter = btn.dataset.filter;
    if (filter === currentFilter) return;
    currentFilter = filter;
    container
      .querySelectorAll(".char-filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderCharList(container);
  });

  /* 点击角色卡 → 编辑；长按 → 删除确认 */
  charList.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".char-card");
    if (!card) return;
    const id = card.dataset.id;
    longPressTimer = setTimeout(async () => {
      longPressTimer = null;
      const char = await getCharacter(id);
      if (char && confirm(`Delete "${char.name}"?`)) {
        await deleteCharacter(id);
        bus.emit("character:deleted", id);
        await renderCharList(container);
      }
    }, 600);
  });

  charList.addEventListener("pointerup", (e) => {
    const card = e.target.closest(".char-card");
    if (!card) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      openEditView(container, card.dataset.id);
    }
  });

  charList.addEventListener("pointerleave", () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  charList.addEventListener("pointercancel", () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  /* 新建按钮 */
  container.querySelector("#char-create-btn").addEventListener("click", () => {
    openEditView(container, null);
  });

  /* 导入按钮 */
  container.querySelector("#char-import-btn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.txt,.docx";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        await handleImportFile(file);
        await renderCharList(container);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    input.click();
  });

  /* NPC Generator 按钮 */
  container
    .querySelector("#char-npc-gen-btn")
    .addEventListener("click", () => {
      openNpcGenView(container);
    });

  /* 类型切换 */
  container
    .querySelector("#char-type-toggle")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".char-type-btn");
      if (!btn) return;
      currentIsNpc = btn.dataset.type === "npc";
      container
        .querySelectorAll(".char-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

  /* 返回按钮（编辑视图） */
  container.querySelector("#char-edit-back").addEventListener("click", () => {
    closeEditView(container);
  });

  /* 保存 */
  container
    .querySelector("#char-save-btn")
    .addEventListener("click", async () => {
      const values = readForm(container);
      if (!values.name.trim()) {
        alert("Please enter a name.");
        return;
      }

      let char;
      if (currentCharId) {
        const existing = await getCharacter(currentCharId);
        char = { ...existing, ...values, updatedAt: Date.now() };
      } else {
        char = createCharacter(values);
      }

      await saveCharacter(char);
      bus.emit("character:changed", char);
      closeEditView(container);
      await renderCharList(container);
    });

  /* 删除（编辑页内） */
  container
    .querySelector("#char-delete-btn")
    .addEventListener("click", async () => {
      if (!currentCharId) return;
      const char = await getCharacter(currentCharId);
      if (char && confirm(`Delete "${char.name}"?`)) {
        await deleteCharacter(currentCharId);
        bus.emit("character:deleted", currentCharId);
        closeEditView(container);
        await renderCharList(container);
      }
    });

  /* Avatar upload */
  container
    .querySelector("#char-avatar-upload")
    ?.addEventListener("click", () => {
      container.querySelector("#char-avatar-file")?.click();
    });
  container
    .querySelector("#char-avatar-file")
    ?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const upload = container.querySelector("#char-avatar-upload");
        upload.dataset.avatar = dataUrl;
        const preview = container.querySelector("#char-avatar-preview");
        preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      };
      reader.readAsDataURL(file);
    });

  /* NPC Generator — 返回 */
  container.querySelector("#npc-gen-back").addEventListener("click", () => {
    closeNpcGenView(container);
  });

  /* NPC Generator — 创建 */
  container
    .querySelector("#npc-gen-create-btn")
    .addEventListener("click", async () => {
      const name = (
        container.querySelector("#npc-gen-name")?.value || ""
      ).trim();
      const desc = (
        container.querySelector("#npc-gen-desc")?.value || ""
      ).trim();
      const rel = (
        container.querySelector("#npc-gen-rel")?.value || ""
      ).trim();

      if (!name) {
        alert("Please enter an NPC name.");
        return;
      }

      const parts = [];
      if (desc) parts.push(desc);
      if (rel) parts.push("Relationship: " + rel);
      const description = parts.join("\n");

      const char = createCharacter({
        name,
        avatar: name.charAt(0) || "?",
        description,
        isNpc: true,
      });

      await saveCharacter(char);
      bus.emit("character:changed", char);
      closeNpcGenView(container);
      await renderCharList(container);
    });
}

/* ───────── 编辑视图开关 ───────── */

async function openEditView(container, charId) {
  try {
    currentCharId = charId;
    const titleEl = container.querySelector("#char-edit-title");
    const deleteBtn = container.querySelector("#char-delete-btn");

    if (charId) {
      const char = await getCharacter(charId);
      currentIsNpc = !!(char && char.isNpc);
      titleEl.textContent = currentIsNpc ? "Edit NPC" : "Edit Character";
      deleteBtn.classList.remove("hidden");
      if (char) fillForm(container, char);
    } else {
      currentIsNpc = false;
      titleEl.textContent = "Create Character";
      deleteBtn.classList.add("hidden");
      fillForm(container, createCharacter());
    }

    updateTypeToggle(container);
    await populateMaskDropdown(container, charId);

    container.querySelector("#char-list-view").classList.add("hidden");
    container.querySelector("#char-edit-view").classList.remove("hidden");
  } catch (err) {
    console.error("[Character] openEditView error:", err);
  }
}

function closeEditView(container) {
  currentCharId = null;
  currentIsNpc = false;
  container.querySelector("#char-edit-view").classList.add("hidden");
  container.querySelector("#char-list-view").classList.remove("hidden");
}

function openNpcGenView(container) {
  container.querySelector("#npc-gen-name").value = "";
  container.querySelector("#npc-gen-desc").value = "";
  container.querySelector("#npc-gen-rel").value = "";
  container.querySelector("#char-list-view").classList.add("hidden");
  container.querySelector("#npc-gen-view").classList.remove("hidden");
}

function closeNpcGenView(container) {
  container.querySelector("#npc-gen-view").classList.add("hidden");
  container.querySelector("#char-list-view").classList.remove("hidden");
}

/* ───────── 类型切换 UI ───────── */

function updateTypeToggle(container) {
  const btns = container.querySelectorAll(".char-type-btn");
  btns.forEach((b) => {
    const isMatch =
      (currentIsNpc && b.dataset.type === "npc") ||
      (!currentIsNpc && b.dataset.type === "character");
    b.classList.toggle("active", isMatch);
  });
}

/* ───────── Mask Binding ───────── */

async function populateMaskDropdown(container, charId) {
  const select = container.querySelector("#char-mask-select");
  if (!select) return;
  let masks = [];
  try {
    masks = await getAllMasks();
  } catch (_) {
    /* masks table may not exist yet */
  }
  let selectedMaskId = "";
  if (charId) {
    const char = await getCharacter(charId);
    if (char) selectedMaskId = char.maskId || "";
  }
  select.innerHTML =
    `<option value="">Default</option>` +
    masks
      .map(
        (m) =>
          `<option value="${m.id}"${m.id === selectedMaskId ? " selected" : ""}>${escHtml(m.name || "Unnamed Mask")}</option>`
      )
      .join("");
}

/* ───────── 表单读写 ───────── */

function fillForm(container, c) {
  const nameEl = container.querySelector("#char-name");
  if (nameEl) nameEl.value = c.name || "";

  const preview = container.querySelector("#char-avatar-preview");
  if (c.avatar && c.avatar.startsWith("data:")) {
    preview.innerHTML = `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    preview.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  container.querySelector("#char-avatar-upload").dataset.avatar =
    c.avatar || "";

  container.querySelector("#char-desc").value =
    c.description || c.systemPrompt || "";
  container.querySelector("#char-first-msg").value = c.firstMessage || "";
}

function readForm(container) {
  const maskVal = container.querySelector("#char-mask-select")?.value || "";
  return {
    name: (container.querySelector("#char-name")?.value || "").trim(),
    avatar:
      container.querySelector("#char-avatar-upload")?.dataset?.avatar || "",
    description: (container.querySelector("#char-desc")?.value || "").trim(),
    firstMessage: (
      container.querySelector("#char-first-msg")?.value || ""
    ).trim(),
    isNpc: currentIsNpc,
    maskId: maskVal || null,
  };
}

/* ───────── 导入处理 ───────── */

async function handleImportFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "json") {
    const text = await file.text();
    const data = JSON.parse(text);
    await importFromJSON(data);
    return;
  }

  if (ext === "txt") {
    const text = await file.text();
    const baseName = file.name.replace(/\.txt$/i, "");
    await importFromText(baseName, text);
    return;
  }

  if (ext === "docx") {
    await importFromDocx(file);
    return;
  }

  throw new Error("Unsupported format. Use .json / .txt / .docx");
}

/* --- JSON 导入 --- */
async function importFromJSON(data) {
  const name = data.name || data.char_name || "Imported Character";
  const descParts = [];
  if (data.description) descParts.push(data.description);
  if (data.personality) descParts.push(data.personality);
  if (data.scenario) descParts.push(data.scenario);
  if (data.mes_example || data.exampleMessages) {
    descParts.push(data.mes_example || data.exampleMessages);
  }
  const description =
    descParts.join("\n\n") || data.system_prompt || data.systemPrompt || "";
  const firstMessage = data.first_mes || data.firstMessage || "";
  const avatar = data.avatar || (name ? name.charAt(0) : "?");

  const char = createCharacter({
    name,
    avatar,
    description,
    firstMessage,
    systemPrompt: data.system_prompt || data.systemPrompt || "",
    tags: data.tags || [],
  });
  await saveCharacter(char);
  bus.emit("character:changed", char);
}

/* --- TXT 导入 --- */
async function importFromText(baseName, text) {
  const char = createCharacter({
    name: baseName,
    avatar: baseName.charAt(0) || "?",
    description: text.trim(),
    firstMessage: "",
    systemPrompt: "",
  });
  await saveCharacter(char);
  bus.emit("character:changed", char);
}

/* --- DOCX 导入 --- */
async function importFromDocx(file) {
  if (typeof window.JSZip === "undefined") {
    await loadScript("https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js");
  }

  const arrayBuffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await window.JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error("Cannot parse DOCX file. It may be corrupted.");
  }

  const docXml = zip.file("word/document.xml");
  if (!docXml) {
    throw new Error("Invalid DOCX: word/document.xml not found.");
  }

  const xmlText = await docXml.async("text");
  const bodyText = extractTextFromXml(xmlText);

  if (!bodyText.trim()) {
    throw new Error("DOCX file is empty.");
  }

  const baseName = file.name.replace(/\.docx$/i, "");
  const char = createCharacter({
    name: baseName,
    avatar: baseName.charAt(0) || "?",
    description: bodyText.trim(),
    firstMessage: "",
    systemPrompt: "",
  });
  await saveCharacter(char);
  bus.emit("character:changed", char);
}

/* 从 document.xml 提取纯文本 */
function extractTextFromXml(xml) {
  const paragraphs = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pXml = pMatch[0];
    let paraText = "";
    let tMatch;
    tRegex.lastIndex = 0;
    while ((tMatch = tRegex.exec(pXml)) !== null) {
      paraText += tMatch[1];
    }
    paragraphs.push(paraText);
  }
  return paragraphs.join("\n");
}

/* 动态加载外部脚本 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load JSZip."));
    document.head.appendChild(s);
  });
}

/* ───────── 构建角色 Prompt ───────── */

export function buildCharacterPrompt(char) {
  return char.systemPrompt || char.description || "";
}

/* ───────── 工具函数 ───────── */

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}