/**
 * Character — 角色管理模块
 * 角色列表 / 创建编辑 / 导入（JSON、TXT、DOCX）/ 删除 / NPC 生成器（AI + Manual）
 */
import bus from "./eventBus.js";
import {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  getAllMasks,
  getActiveApi,
  getAllLoreEntries,
  getLoreByCharacter,
  saveLoreEntry,
  getLoreEntry as db_getLoreEntry,
} from "./db.js";
import { createCharacter } from "./models.js";
import { chatStream } from "./api.js";

let currentCharId = null;
let longPressTimer = null;
let currentFilter = "all";
let currentIsNpc = false;
let npcGenAbortController = null;
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
    .npc-mode-toggle {
      display: flex;
      margin-bottom: 20px;
    }
    .npc-mode-btn {
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
    .npc-mode-btn:first-child {
      border-radius: 8px 0 0 8px;
    }
    .npc-mode-btn:last-child {
      border-radius: 0 8px 8px 0;
      border-left: none;
    }
    .npc-mode-btn.active {
      background: #1D1D1F;
      color: #fff;
      border-color: #1D1D1F;
    }
    .npc-ai-section,
    .npc-manual-section {
      display: none;
    }
    .npc-ai-section.visible,
    .npc-manual-section.visible {
      display: block;
    }
    .npc-gen-status {
      font-size: 12px;
      font-family: 'Inter', sans-serif;
      color: #AEAEB2;
      margin-top: 8px;
      min-height: 18px;
      transition: color 0.2s;
    }
    .npc-gen-status.error {
      color: #FF3B30;
    }
    .npc-gen-status.success {
      color: #34C759;
    }
    .npc-gen-preview {
      display: none;
      margin-top: 16px;
      padding: 16px;
      border-radius: 12px;
      background: rgba(255,255,255,0.6);
      backdrop-filter: blur(24px) saturate(150%);
      border: 1px solid rgba(0,0,0,0.06);
    }
    .npc-gen-preview.visible {
      display: block;
    }
    .npc-gen-preview .field-label {
      margin-top: 12px;
    }
    .npc-gen-preview .field-label:first-child {
      margin-top: 0;
    }
    .npc-gen-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #D1D1D6;
      border-top-color: #1D1D1F;
      border-radius: 50%;
      animation: npc-spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes npc-spin {
      to { transform: rotate(360deg); }
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
          <button class="char-filter-btn active" data-filter="all">全部</button>
          <button class="char-filter-btn" data-filter="characters">角色</button>
          <button class="char-filter-btn" data-filter="npcs">NPC</button>
        </div>
        <div class="char-list" id="char-list"></div>
        <div class="char-bottom-actions">
          <button class="settings-btn primary" id="char-create-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>创建
          </button>
          <button class="settings-btn" id="char-import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>导入
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
          <span class="char-edit-title" id="char-edit-title">创建角色</span>
          <div style="width:36px"></div>
        </div>
        <div class="char-edit-form">
          <label class="field-label">类型</label>
          <div class="char-type-toggle" id="char-type-toggle">
            <button class="char-type-btn active" data-type="character">角色</button>
            <button class="char-type-btn" data-type="npc">NPC</button>
          </div>

          <label class="field-label">名字</label>
          <input type="text" class="field-input" id="char-name" placeholder="输入角色名字" />

          <label class="field-label">头像</label>
          <input type="hidden" id="char-avatar" value="" />
          <div class="char-avatar-upload" id="char-avatar-upload">
            <div class="char-avatar-preview" id="char-avatar-preview">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span style="font-size:13px;color:#AEAEB2">点击上传头像</span>
          </div>
          <input type="file" id="char-avatar-file" accept="image/*" style="display:none" />

          <label class="field-label">描述</label>
          <textarea class="field-input field-textarea" id="char-desc" placeholder="粘贴角色卡内容" rows="10"></textarea>

          <label class="field-label">开场白</label>
          <textarea class="field-input field-textarea" id="char-first-msg" placeholder="开场白（可选）" rows="4"></textarea>

          <label class="field-label">面具绑定</label>
          <select class="field-input" id="char-mask-select">
            <option value="">默认</option>
          </select>

          <label class="field-label">关联世界书</label>
          <div class="char-lore-bind" id="char-lore-bind">
            <div class="char-lore-list" id="char-lore-list">加载中...</div>
          </div>

          <label class="field-label">朋友圈自动发帖</label>
          <div class="autopost-row">
            <label class="toggle-switch">
              <input type="checkbox" id="char-autopost-toggle">
              <span class="toggle-slider"></span>
            </label>
            <span class="autopost-label" id="autopost-status">关闭</span>
          </div>
          <div class="autopost-chance-row" id="autopost-chance-row" style="display:none">
            <label class="field-label">发帖概率 <span id="autopost-chance-val">30%</span></label>
            <input type="range" class="field-range" id="char-autopost-chance" min="5" max="100" step="5" value="30">
            <div class="autopost-desc">每次检查时，角色有此概率发朋友圈</div>
          </div>

          <div class="form-actions">
            <button class="settings-btn primary" id="char-save-btn">保存</button>
            <button class="settings-btn danger hidden" id="char-delete-btn">删除</button>
          </div>
        </div>
      </div>

      <!-- NPC Generator 视图 -->
      <div class="char-edit-view hidden" id="npc-gen-view">
        <div class="char-edit-header">
          <button class="chat-back-to-home" id="npc-gen-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="char-edit-title">NPC生成器</span>
          <div style="width:36px"></div>
        </div>
        <div class="char-edit-form">
          <div class="npc-mode-toggle" id="npc-mode-toggle">
            <button class="npc-mode-btn active" data-mode="ai">AI生成</button>
            <button class="npc-mode-btn" data-mode="manual">手动创建</button>
          </div>

          <label class="field-label">关联角色</label>
          <select class="field-input" id="npc-parent-select">
            <option value="">请选择关联的角色</option>
          </select>

          <!-- AI Generate Section -->
          <div class="npc-ai-section visible" id="npc-ai-section">
            <label class="field-label">描述你想生成的NPC（例如：角色的爸爸，市井小店老板）</label>
            <textarea class="field-input field-textarea" id="npc-ai-prompt" placeholder="例如：沈莲生的爸爸，安分市井店老板" rows="4"></textarea>
            <div class="form-actions">
              <button class="settings-btn primary" id="npc-ai-generate-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>生成
              </button>
            </div>
            <div class="npc-gen-status" id="npc-gen-status"></div>

            <!-- AI Preview / Edit Form -->
            <div class="npc-gen-preview" id="npc-gen-preview">
              <label class="field-label">名字</label>
              <input type="text" class="field-input" id="npc-ai-name" placeholder="生成的名字" />

              <label class="field-label">描述</label>
              <textarea class="field-input field-textarea" id="npc-ai-desc" rows="4"></textarea>

              <label class="field-label">性格</label>
              <textarea class="field-input field-textarea" id="npc-ai-personality" rows="3"></textarea>

              <label class="field-label">与角色的关系</label>
              <textarea class="field-input field-textarea" id="npc-ai-first-msg" rows="2" placeholder="例如：父子、朋友、同事..."></textarea>

              <div class="form-actions" style="margin-top:16px">
                <button class="settings-btn primary" id="npc-ai-save-btn">保存NPC</button>
                <button class="settings-btn" id="npc-ai-regenerate-btn">重新生成</button>
              </div>
            </div>
          </div>

          <!-- Manual Section -->
          <div class="npc-manual-section" id="npc-manual-section">
            <label class="field-label">名字</label>
            <input type="text" class="field-input" id="npc-gen-name" placeholder="NPC名字" />

            <label class="field-label">简要描述</label>
            <textarea class="field-input field-textarea" id="npc-gen-desc" placeholder="简要描述" rows="3"></textarea>

            <label class="field-label">与角色的关系</label>
            <input type="text" class="field-input" id="npc-gen-rel" placeholder="与角色的关系" />

            <div class="form-actions">
              <button class="settings-btn primary" id="npc-gen-create-btn">创建NPC</button>
            </div>
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
        ? "\u8fd8\u6ca1\u6709NPC\uff0c\u53bb\u751f\u6210\u4e00\u4e2a\u5427"
        : currentFilter === "characters"
        ? "\u8fd8\u6ca1\u6709\u89d2\u8272\uff0c\u70b9\u521b\u5efa\u6216\u5bfc\u5165\u6dfb\u52a0"
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
      if (char && confirm(`\u786e\u5b9a\u5220\u9664 "${char.name}" \u5417\uff1f`)) {
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
        alert("\u5bfc\u5165\u5931\u8d25: " + err.message);
      }
    };
    input.click();
  });

  /* NPC Generator 按钮 */
  container
    .querySelector("#char-npc-gen-btn")
    .addEventListener("click", async () => {
      await openNpcGenView(container);
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
        alert("\u8bf7\u8f93\u5165\u540d\u5b57");
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

  // Auto-post toggle interactivity
  container.querySelector("#char-autopost-toggle")?.addEventListener("change", (e) => {
    const status = container.querySelector("#autopost-status");
    const row = container.querySelector("#autopost-chance-row");
    if (e.target.checked) {
      status.textContent = "\u5f00\u542f";
      row.style.display = "block";
    } else {
      status.textContent = "\u5173\u95ed";
      row.style.display = "none";
    }
  });
  container.querySelector("#char-autopost-chance")?.addEventListener("input", (e) => {
    const valEl = container.querySelector("#autopost-chance-val");
    if (valEl) valEl.textContent = e.target.value + "%";
  });

  /* NPC Generator — 返回 */
  container.querySelector("#npc-gen-back").addEventListener("click", () => {
    if (npcGenAbortController) {
      npcGenAbortController.abort();
      npcGenAbortController = null;
    }
    closeNpcGenView(container);
  });

  /* NPC Generator — Mode Toggle */
  container.querySelector("#npc-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".npc-mode-btn");
    if (!btn) return;
    const mode = btn.dataset.mode;
    container.querySelectorAll(".npc-mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const aiSection = container.querySelector("#npc-ai-section");
    const manualSection = container.querySelector("#npc-manual-section");
    if (mode === "ai") {
      aiSection.classList.add("visible");
      manualSection.classList.remove("visible");
    } else {
      aiSection.classList.remove("visible");
      manualSection.classList.add("visible");
    }
  });

  /* NPC Generator — AI Generate */
  container.querySelector("#npc-ai-generate-btn").addEventListener("click", () => {
    handleAiGenerate(container);
  });

  /* NPC Generator — AI Regenerate */
  container.querySelector("#npc-ai-regenerate-btn").addEventListener("click", () => {
    handleAiGenerate(container);
  });

  /* NPC Generator — AI Save */
  container.querySelector("#npc-ai-save-btn").addEventListener("click", async () => {
    const name = (container.querySelector("#npc-ai-name")?.value || "").trim();
    const desc = (container.querySelector("#npc-ai-desc")?.value || "").trim();
    const personality = (container.querySelector("#npc-ai-personality")?.value || "").trim();
    const relationship = (container.querySelector("#npc-ai-first-msg")?.value || "").trim();
    const parentId = container.querySelector("#npc-parent-select")?.value || "";

    if (!name) {
      alert("\u8bf7\u8f93\u5165\u540d\u5b57");
      return;
    }

    const descParts = [];
    if (desc) descParts.push(desc);
    if (personality) descParts.push("\u6027\u683c: " + personality);
    if (relationship) descParts.push("\u5173\u7cfb: " + relationship);
    const description = descParts.join("\n\n");

    const char = createCharacter({
      name,
      avatar: name.charAt(0) || "?",
      description,
      personality,
      isNpc: true,
      parentId: parentId || null,
    });

    await saveCharacter(char);
    bus.emit("character:changed", char);
    closeNpcGenView(container);
    await renderCharList(container);
  });

  /* NPC Generator — Manual Create */
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
        alert("\u8bf7\u8f93\u5165NPC\u540d\u5b57");
        return;
      }
      const parentId = container.querySelector("#npc-parent-select")?.value || "";

      const parts = [];
      if (desc) parts.push(desc);
      if (rel) parts.push("Relationship: " + rel);
      const description = parts.join("\n");

      const char = createCharacter({
        name,
        avatar: name.charAt(0) || "?",
        description,
        isNpc: true,
        parentId: parentId || null,
      });

      await saveCharacter(char);
      bus.emit("character:changed", char);
      closeNpcGenView(container);
      await renderCharList(container);
    });
}
/* ───────── AI NPC Generation ───────── */

async function handleAiGenerate(container) {
  const promptText = (container.querySelector("#npc-ai-prompt")?.value || "").trim();
  if (!promptText) {
    alert("\u8bf7\u63cf\u8ff0\u4f60\u60f3\u751f\u6210\u7684NPC");
    return;
  }
  const parentId = container.querySelector("#npc-parent-select")?.value || "";
  let parentChar = null;
  if (parentId) {
    parentChar = await getCharacter(parentId);
  }

  const statusEl = container.querySelector("#npc-gen-status");
  const previewEl = container.querySelector("#npc-gen-preview");
  const genBtn = container.querySelector("#npc-ai-generate-btn");

  const api = await getActiveApi();
  if (!api) {
    statusEl.textContent = "\u8bf7\u5148\u5728Settings\u914d\u7f6eAPI";
    statusEl.className = "npc-gen-status error";
    return;
  }

  if (npcGenAbortController) {
    npcGenAbortController.abort();
  }
  npcGenAbortController = new AbortController();

  genBtn.disabled = true;
  previewEl.classList.remove("visible");
  statusEl.className = "npc-gen-status";
  statusEl.innerHTML = `<span class="npc-gen-spinner"></span>生成中...`;

  const systemPrompt = [
    "You are an NPC generator for a role-playing scenario.",
    parentChar ? "The main character is: " + parentChar.name + ". Background: " + (parentChar.description || "") : "",
    "Based on the user's description, create an NPC character profile related to the main character.",
    'Output ONLY valid JSON with these fields:',
    '{"name": "...", "description": "...", "personality": "...", "relationship": "..."}',
    "description should be a detailed character description.",
    "personality should describe their personality traits.",
    "relationship should describe their relationship with the main character.",
    "Write everything in Chinese if the input is in Chinese.",
    "Do not include any other text, markdown fences, or explanation. Only the JSON object."
  ].join("\n");

  try {
    const fullText = await chatStream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
      { temperature: 0.9 },
      null,
      npcGenAbortController.signal
    );

    const jsonStr = extractJson(fullText);
    const parsed = JSON.parse(jsonStr);

    container.querySelector("#npc-ai-name").value = parsed.name || "";
    container.querySelector("#npc-ai-desc").value = parsed.description || "";
    container.querySelector("#npc-ai-personality").value = parsed.personality || "";
    container.querySelector("#npc-ai-first-msg").value = parsed.relationship || parsed.firstMessage || "";

    previewEl.classList.add("visible");
    statusEl.textContent = "\u751f\u6210\u5b8c\u6210\uff01\u8bf7\u67e5\u770b\u5e76\u7f16\u8f91\u540e\u4fdd\u5b58";
    statusEl.className = "npc-gen-status success";
  } catch (err) {
    if (err.name === "AbortError") {
      statusEl.textContent = "\u5df2\u53d6\u6d88";
      statusEl.className = "npc-gen-status";
    } else {
      statusEl.textContent = "Error: " + err.message;
      statusEl.className = "npc-gen-status error";
    }
  } finally {
    genBtn.disabled = false;
    npcGenAbortController = null;
  }
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
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
      titleEl.textContent = currentIsNpc ? "Edit NPC" : "\u7f16\u8f91\u89d2\u8272";
      deleteBtn.classList.remove("hidden");
      if (char) fillForm(container, char);
      // Populate world book bindings
      await populateCharLore(container, charId);
    } else {
      currentIsNpc = false;
      titleEl.textContent = "创建角色";
      deleteBtn.classList.add("hidden");
      fillForm(container, createCharacter());
      // Clear world book section for new char
      const loreList = container.querySelector("#char-lore-list");
      if (loreList) loreList.innerHTML = '<div class="empty-hint">\u4fdd\u5b58\u540e\u53ef\u7ed1\u5b9a\u4e16\u754c\u4e66</div>';
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

async function openNpcGenView(container) {
  // Populate parent character selector
  const parentSel = container.querySelector("#npc-parent-select");
  if (parentSel) {
    const allChars = await getAllCharacters();
    const mainChars = allChars.filter(c => !c.isNpc);
    parentSel.innerHTML = '<option value="">\u8bf7\u9009\u62e9\u5173\u8054\u7684\u89d2\u8272</option>';
    mainChars.forEach(c => {
      parentSel.innerHTML += '<option value="' + c.id + '">' + (c.name || '\u89d2\u8272') + '</option>';
    });
  }

  container.querySelector("#npc-gen-name").value = "";
  container.querySelector("#npc-gen-desc").value = "";
  container.querySelector("#npc-gen-rel").value = "";
  container.querySelector("#npc-ai-prompt").value = "";
  container.querySelector("#npc-ai-name").value = "";
  container.querySelector("#npc-ai-desc").value = "";
  container.querySelector("#npc-ai-personality").value = "";
  container.querySelector("#npc-ai-first-msg").value = "";
  container.querySelector("#npc-gen-status").textContent = "";
  container.querySelector("#npc-gen-status").className = "npc-gen-status";
  container.querySelector("#npc-gen-preview").classList.remove("visible");

  container.querySelectorAll(".npc-mode-btn").forEach((b) => b.classList.remove("active"));
  container.querySelector('[data-mode="ai"]').classList.add("active");
  container.querySelector("#npc-ai-section").classList.add("visible");
  container.querySelector("#npc-manual-section").classList.remove("visible");

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
    if (char) selectedMaskId = char.boundMaskId || char.maskId || "";
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

async function populateCharLore(container, charId) {
  const listEl = container.querySelector("#char-lore-list");
  if (!listEl) return;
  try {
    const allLore = await getAllLoreEntries();
    const charLore = allLore.filter(l => l.characterId === charId);
    const otherLore = allLore.filter(l => !l.characterId || l.characterId !== charId);
    
    if (allLore.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">\u8fd8\u6ca1\u6709\u4e16\u754c\u4e66\uff0c\u8bf7\u5148\u5728 Lore \u91cc\u521b\u5efa</div>';
      return;
    }
    
    let html = '';
    if (charLore.length > 0) {
      html += '<div class="char-lore-bound-label">\u5df2\u7ed1\u5b9a</div>';
      charLore.forEach(l => {
        html += '<div class="char-lore-item bound" data-loreid="' + l.id + '"><span class="char-lore-name">' + (l.title || l.keywords?.join(", ") || "\u672a\u547d\u540d") + '</span><button class="char-lore-unbind" data-loreid="' + l.id + '">\u53d6\u6d88\u7ed1\u5b9a</button></div>';
      });
    }
    if (otherLore.length > 0) {
      html += '<div class="char-lore-bound-label">\u53ef\u7ed1\u5b9a</div>';
      otherLore.forEach(l => {
        html += '<div class="char-lore-item" data-loreid="' + l.id + '"><span class="char-lore-name">' + (l.title || l.keywords?.join(", ") || "\u672a\u547d\u540d") + '</span><button class="char-lore-bind-btn" data-loreid="' + l.id + '">\u7ed1\u5b9a</button></div>';
      });
    }
    listEl.innerHTML = html;
    
    // Bind/unbind handlers
    listEl.querySelectorAll(".char-lore-bind-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const entry = await db_getLoreEntry(btn.dataset.loreid);
        if (entry) {
          entry.characterId = charId;
          await saveLoreEntry(entry);
          await populateCharLore(container, charId);
        }
      });
    });
    listEl.querySelectorAll(".char-lore-unbind").forEach(btn => {
      btn.addEventListener("click", async () => {
        const entry = await db_getLoreEntry(btn.dataset.loreid);
        if (entry) {
          entry.characterId = "";
          await saveLoreEntry(entry);
          await populateCharLore(container, charId);
        }
      });
    });
  } catch(e) {
    listEl.innerHTML = '<div class="empty-hint">\u52a0\u8f7d\u5931\u8d25</div>';
    console.error(e);
  }
}

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

  // Auto-post settings
  const apToggle = container.querySelector("#char-autopost-toggle");
  const apChance = container.querySelector("#char-autopost-chance");
  const apStatus = container.querySelector("#autopost-status");
  const apRow = container.querySelector("#autopost-chance-row");
  if (apToggle) {
    apToggle.checked = !!c.autoPost;
    apStatus.textContent = c.autoPost ? "\u5f00\u542f" : "\u5173\u95ed";
    apRow.style.display = c.autoPost ? "block" : "none";
  }
  if (apChance) {
    apChance.value = c.autoPostChance || 30;
    const valEl = container.querySelector("#autopost-chance-val");
    if (valEl) valEl.textContent = (c.autoPostChance || 30) + "%";
  }
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
    boundMaskId: maskVal || null,
    autoPost: container.querySelector("#char-autopost-toggle")?.checked || false,
    autoPostChance: parseInt(container.querySelector("#char-autopost-chance")?.value || "30", 10),
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