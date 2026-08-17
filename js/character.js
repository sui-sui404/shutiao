/**
 * Character — 角色管理模块
 * 角色列表 / 创建编辑 / 导入（JSON、TXT、DOCX）/ 删除
 */
import bus from "./eventBus.js";
import {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
} from "./db.js";
import { createCharacter } from "./models.js";

let currentCharId = null;
let longPressTimer = null;

/* ───────── 主渲染 ───────── */

export async function renderCharacter(container) {
  container.innerHTML = `
    <div class="char-page">
      <!-- 列表视图 -->
      <div class="char-list-view" id="char-list-view">
        <div class="char-list" id="char-list"></div>
        <div class="char-bottom-actions">
          <button class="settings-btn primary" id="char-create-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建
          </button>
          <button class="settings-btn" id="char-import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            导入角色卡
          </button>
        </div>
      </div>

      <!-- 编辑视图 -->
      <div class="char-edit-view hidden" id="char-edit-view">
        <div class="char-edit-header">
          <button class="chat-back-to-home" id="char-edit-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="char-edit-title" id="char-edit-title">新建角色</span>
          <div style="width:36px"></div>
        </div>
        <div class="char-edit-form">
          <label class="field-label">名字</label>
          <input type="text" class="field-input" id="char-name" placeholder="给角色起个名字" />

          <label class="field-label">头像</label>
          <input type="hidden" id="char-avatar" value="" />
          <div class="char-avatar-upload" id="char-avatar-upload"><div class="char-avatar-preview" id="char-avatar-preview"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><span style="font-size:13px;color:var(--text-tertiary)">点击上传头像</span></div><input type="file" id="char-avatar-file" accept="image/*" style="display:none" />
          <label class="field-label">角色设定</label>
          <textarea class="field-input field-textarea" id="char-desc" placeholder="把角色卡的全部内容粘贴到这里" rows="10"></textarea>

          <label class="field-label">开场白</label>
          <textarea class="field-input field-textarea" id="char-first-msg" placeholder="角色开口说的第一句话（可留空）" rows="4"></textarea>

          <div class="form-actions">
            <button class="settings-btn primary" id="char-save-btn">保存</button>
            <button class="settings-btn danger hidden" id="char-delete-btn">删除角色</button>
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
  const chars = await getAllCharacters();

  if (chars.length === 0) {
    list.innerHTML = `<div class="empty-hint">还没有角色，点击下方按钮新建或导入角色卡</div>`;
    return;
  }

  list.innerHTML = chars
    .map((c) => {
      const desc = c.description || c.systemPrompt || "";
      const preview = desc.length > 60 ? desc.slice(0, 60) + "…" : desc;
      const avatarHtml = (c.avatar && c.avatar.startsWith("data:")) ? `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : escHtml(c.avatar || (c.name ? c.name.charAt(0) : "?"));
      return `
      <div class="session-card char-card" data-id="${c.id}">
        <div class="session-avatar">${avatarHtml}</div>
        <div class="session-info">
          <div class="session-top-row">
            <span class="session-name">${escHtml(c.name || "未命名")}</span>
            <span class="session-time">${formatDate(c.createdAt)}</span>
          </div>
          <div class="session-preview">${escHtml(preview || "暂无简介")}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

/* ───────── 事件绑定 ───────── */

function bindEvents(container) {
  const charList = container.querySelector("#char-list");

  /* 点击角色卡 → 编辑；长按 → 删除确认 */
  charList.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".char-card");
    if (!card) return;
    const id = card.dataset.id;
    longPressTimer = setTimeout(async () => {
      longPressTimer = null;
      const char = await getCharacter(id);
      if (char && confirm(`确定删除角色「${char.name}」吗？`)) {
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
        alert("导入失败：" + err.message);
      }
    };
    input.click();
  });

  /* 返回按钮 */
  container.querySelector("#char-edit-back").addEventListener("click", () => {
    closeEditView(container);
  });

  /* 保存 */
  container.querySelector("#char-save-btn").addEventListener("click", async () => {
    const values = readForm(container);
    if (!values.name.trim()) {
      alert("请输入角色名字");
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
  container.querySelector("#char-delete-btn").addEventListener("click", async () => {
    if (!currentCharId) return;
    const char = await getCharacter(currentCharId);
    if (char && confirm(`确定删除角色「${char.name}」吗？`)) {
      await deleteCharacter(currentCharId);
      bus.emit("character:deleted", currentCharId);
      closeEditView(container);
      await renderCharList(container);
    }
  });

  // Avatar upload
  container.querySelector("#char-avatar-upload")?.addEventListener("click", () => {
    container.querySelector("#char-avatar-file")?.click();
  });
  container.querySelector("#char-avatar-file")?.addEventListener("change", (e) => {
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
}

/* ───────── 编辑视图开关 ───────── */

async function openEditView(container, charId) {
  try {
  currentCharId = charId;
  const titleEl = container.querySelector("#char-edit-title");
  const deleteBtn = container.querySelector("#char-delete-btn");

  if (charId) {
    titleEl.textContent = "编辑角色";
    deleteBtn.classList.remove("hidden");
    const char = await getCharacter(charId);
    if (char) fillForm(container, char);
  } else {
    titleEl.textContent = "新建角色";
    deleteBtn.classList.add("hidden");
    fillForm(container, createCharacter());
  }

  container.querySelector("#char-list-view").classList.add("hidden");
  container.querySelector("#char-edit-view").classList.remove("hidden");
  } catch (err) { console.error("[Character] openEditView error:", err); }
}

function closeEditView(container) {
  currentCharId = null;
  container.querySelector("#char-edit-view").classList.add("hidden");
  container.querySelector("#char-list-view").classList.remove("hidden");
}

/* ───────── 表单读写 ───────── */

function fillForm(container, c) {
  const nameEl = container.querySelector("#char-name");
  const avatarEl = container.querySelector("#char-avatar");
  if (nameEl) nameEl.value = c.name || "";
  if (avatarEl) avatarEl.value = c.avatar || "";
  const preview = container.querySelector("#char-avatar-preview"); if (c.avatar && c.avatar.startsWith("data:")) { preview.innerHTML = `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; } else { preview.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`; }
  container.querySelector("#char-avatar-upload").dataset.avatar = c.avatar || "";
  container.querySelector("#char-desc").value = c.description || c.systemPrompt || "";
  container.querySelector("#char-first-msg").value = c.firstMessage || "";
}

function readForm(container) {
  return {
    name: (container.querySelector("#char-name")?.value || "").trim(),
    avatar: container.querySelector("#char-avatar-upload")?.dataset?.avatar || "",
    firstMessage: (container.querySelector("#char-first-msg")?.value || "").trim(),
    systemPrompt: "",
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

  throw new Error("不支持的文件格式，请使用 .json / .txt / .docx");
}

/* --- JSON 导入 --- */
async function importFromJSON(data) {
  const name = data.name || data.char_name || "导入角色";
  const descParts = [];
  if (data.description) descParts.push(data.description);
  if (data.personality) descParts.push(data.personality);
  if (data.scenario) descParts.push(data.scenario);
  if (data.mes_example || data.exampleMessages) {
    descParts.push(data.mes_example || data.exampleMessages);
  }
  const description = descParts.join("\n\n") || data.system_prompt || data.systemPrompt || "";
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
  /* 动态加载 JSZip（仅在需要时） */
  if (typeof window.JSZip === "undefined") {
    await loadScript("https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js");
  }

  const arrayBuffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await window.JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error("无法解析 DOCX 文件，请确认文件未损坏");
  }

  const docXml = zip.file("word/document.xml");
  if (!docXml) {
    throw new Error("DOCX 中找不到 word/document.xml");
  }

  const xmlText = await docXml.async("text");
  const bodyText = extractTextFromXml(xmlText);

  if (!bodyText.trim()) {
    throw new Error("DOCX 文件内容为空");
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
    s.onerror = () => reject(new Error("加载 JSZip 失败，请检查网络"));
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