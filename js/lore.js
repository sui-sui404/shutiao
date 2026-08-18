/**
 * Lore — 世界书模块
 *
 * 条目属性通过 常驻/全局 开关控制:
 *   keyword  — 关键词匹配触发（常驻OFF）
 *   constant — 常驻注入，绑定角色（常驻ON + 全局OFF）
 *   global   — 常驻注入，所有角色（常驻ON + 全局ON）
 *
 * Exports:
 *   renderLore(container)  — 渲染世界书 UI
 *   getLoreForPrompt(characterId, messages) — 返回匹配条目用于 prompt 构建
 */
import bus from "./eventBus.js";
import {
  getAllLoreEntries,
  saveLoreEntry,
  deleteLoreEntry,
  getAllCharacters,
} from "./db.js";
import { createLoreEntry } from "./models.js";

/* ───────── State ───────── */

let currentEditId = null;

/* ───────── 位置标签 ───────── */

const POSITION_LABELS = {
  before_char: "角色设定之前",
  after_char: "角色设定之后",
  before_example: "示例对话之前",
  after_example: "示例对话之后",
  at_depth: "指定深度",
};

/* ═══════════════════════════════════════════════
   Prompt-side API
   ═══════════════════════════════════════════════ */

/**
 * Return lore entries that should be injected into the prompt.
 *
 * @param {string|null} characterId  — current character (null = no character)
 * @param {Array}       messages     — full message array [{role, content}, ...]
 * @returns {Array} matched entries sorted by priority desc, each with its position
 */
export async function getLoreForPrompt(characterId, messages) {
  const all = await getAllLoreEntries();
  const enabled = all.filter((e) => e.isEnabled !== false);
  const matched = [];

  for (const entry of enabled) {
    const type = entry.type || "keyword";

    if (type === "global") {
      matched.push(entry);
      continue;
    }

    if (type === "constant") {
      if (!entry.characterId || entry.characterId === characterId) {
        matched.push(entry);
      }
      continue;
    }

    if (type === "keyword") {
      if (entry.characterId && entry.characterId !== characterId) continue;

      const keywords = entry.keywords || [];
      if (keywords.length === 0) continue;

      const scanDepth = entry.depth ?? 100;
      const recentMessages = messages.slice(-scanDepth);
      const haystack = recentMessages.map((m) => m.content || "").join("\n").toLowerCase();

      const hit = keywords.some((kw) => {
        if (!kw) return false;
        return haystack.includes(kw.toLowerCase());
      });

      if (hit) matched.push(entry);
    }
  }

  matched.sort((a, b) => {
    const pDiff = (b.priority || 0) - (a.priority || 0);
    if (pDiff !== 0) return pDiff;
    return (a.order || 0) - (b.order || 0);
  });

  return matched;
}

/* ═══════════════════════════════════════════════
   UI Rendering
   ═══════════════════════════════════════════════ */

export async function renderLore(container) {
  container.innerHTML = `
    <div class="lore-page">
      <div class="lore-list-view" id="lore-list-view">
        <div class="lore-list" id="lore-list"></div>
        <div class="lore-bottom-actions">
          <button class="settings-btn primary" id="lore-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新建条目
          </button>
          <button class="settings-btn" id="lore-import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            导入 JSON
          </button>
          <button class="settings-btn" id="lore-export-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出 JSON
          </button>
        </div>
      </div>

      <div class="lore-edit-view hidden" id="lore-edit-view">
        <div class="lore-edit-header">
          <span class="lore-edit-title" id="lore-edit-title">新建条目</span>
          <button class="settings-btn" id="lore-back-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                 stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            返回
          </button>
        </div>
        <div class="lore-edit-form" id="lore-edit-form"></div>
      </div>
    </div>`;

  await renderList(container);
  bindListEvents(container);
}

/* ───────── List rendering ───────── */

async function renderList(container) {
  const entries = await getAllLoreEntries();
  const characters = await getAllCharacters();
  const charMap = {};
  for (const c of characters) charMap[c.id] = c.name || c.id;

  const listEl = container.querySelector("#lore-list");

  entries.sort((a, b) => {
    const pDiff = (b.priority || 0) - (a.priority || 0);
    if (pDiff !== 0) return pDiff;
    return (a.order || 0) - (b.order || 0);
  });

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="empty-hint" style="text-align:center;padding:40px 0;color:var(--text-tertiary);font-size:14px;">暂无世界书条目</div>`;
    return;
  }

  listEl.innerHTML = entries.map((entry) => {
    const type = entry.type || "keyword";
    const keywords = entry.keywords || [];
    const isEnabled = entry.isEnabled !== false;
    const disabledClass = isEnabled ? "" : " lore-card-disabled";
    const charName = entry.characterId ? charMap[entry.characterId] || "" : "";

    const keywordBadges = keywords.length > 0
      ? keywords.slice(0, 5).map((kw) => `<span class="lore-keyword-badge">${escHtml(kw)}</span>`).join("") +
        (keywords.length > 5 ? `<span class="lore-keyword-badge">+${keywords.length - 5}</span>` : "")
      : `<span class="lore-keyword-badge lore-badge-empty">无关键词</span>`;

    const typeBadges = [];
    if (type === "constant" || type === "global") {
      typeBadges.push(`<span class="lore-type-badge lore-type-constant">常驻</span>`);
    }
    if (type === "global") {
      typeBadges.push(`<span class="lore-type-badge lore-type-global">全局</span>`);
    }

    const preview = (entry.content || "").slice(0, 120).replace(/\n/g, " ");
    const posLabel = POSITION_LABELS[entry.position] || entry.position || "";
    const commentHtml = entry.comment
      ? `<span class="lore-card-comment">${escHtml(entry.comment)}</span>`
      : "";

    return `
      <div class="lore-card${disabledClass}" data-id="${entry.id}">
        <div class="lore-card-top">
          <div class="lore-card-left">
            <div class="lore-card-keywords">${keywordBadges}</div>
            ${typeBadges.join("")}
          </div>
          <div class="lore-card-meta">
            ${charName ? `<span class="lore-card-char">${escHtml(charName)}</span>` : ""}
            <span class="lore-card-priority">P${entry.priority || 0}</span>
            <label class="toggle-switch lore-card-toggle" data-toggle-id="${entry.id}">
              <input type="checkbox" ${isEnabled ? "checked" : ""} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="lore-card-preview">${escHtml(preview)}</div>
        <div class="lore-card-bottom">
          <span class="lore-position-badge">${escHtml(posLabel)}</span>
          ${commentHtml}
        </div>
      </div>`;
  }).join("");
}

/* ───────── List events ───────── */

function bindListEvents(container) {
  container.querySelector("#lore-add-btn").addEventListener("click", () => {
    openEditView(container, null);
  });

  container.querySelector("#lore-export-btn").addEventListener("click", handleExport);

  container.querySelector("#lore-import-btn").addEventListener("click", () => {
    handleImport(container);
  });

  container.querySelector("#lore-list").addEventListener("click", (e) => {
    const toggle = e.target.closest(".lore-card-toggle");
    if (toggle) {
      e.stopPropagation();
      const id = toggle.dataset.toggleId;
      const checkbox = toggle.querySelector("input");
      handleToggleEnabled(container, id, checkbox.checked);
      return;
    }

    const card = e.target.closest(".lore-card");
    if (card) {
      openEditView(container, card.dataset.id);
    }
  });

  container.querySelector("#lore-back-btn").addEventListener("click", () => {
    closeEditView(container);
  });
}

async function handleToggleEnabled(container, id, isEnabled) {
  const entries = await getAllLoreEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.isEnabled = isEnabled;
  entry.updatedAt = Date.now();
  await saveLoreEntry(entry);
  bus.emit("lore:changed", entry);
}

/* ───────── Edit View ───────── */

async function openEditView(container, entryId) {
  currentEditId = entryId || null;
  const characters = await getAllCharacters();

  const charOptions = characters.map((c) =>
    `<option value="${c.id}">${escHtml(c.name || c.id)}</option>`
  ).join("");

  const posOptions = Object.entries(POSITION_LABELS).map(([val, label]) =>
    `<option value="${val}">${label}</option>`
  ).join("");

  const formEl = container.querySelector("#lore-edit-form");
  formEl.innerHTML = `
    <label class="field-label">关键词（逗号分隔）</label>
    <input type="text" class="field-input" id="lore-keywords" placeholder="关键词1, 关键词2, ..." />

    <label class="field-label">内容</label>
    <textarea class="field-input" id="lore-content" rows="6" placeholder="世界书条目内容..." style="resize:vertical;min-height:100px;"></textarea>

    <div class="lore-toggle-row">
      <span class="field-label" style="margin:0;">常驻（始终注入）</span>
      <label class="toggle-switch">
        <input type="checkbox" id="lore-always-active" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="lore-toggle-row">
      <span class="field-label" style="margin:0;">全局（所有角色生效）</span>
      <label class="toggle-switch">
        <input type="checkbox" id="lore-is-global" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div id="lore-char-group">
      <label class="field-label">角色</label>
      <select class="field-input" id="lore-char-select">
        <option value="">不绑定角色</option>
        ${charOptions}
      </select>
    </div>

    <label class="field-label">注入位置</label>
    <select class="field-input" id="lore-position">
      ${posOptions}
    </select>

    <div id="lore-depth-group" class="hidden">
      <label class="field-label">深度</label>
      <input type="number" class="field-input" id="lore-depth" min="0" value="100" />
    </div>

    <label class="field-label">优先级</label>
    <input type="number" class="field-input" id="lore-priority" min="0" value="0" />

    <div class="lore-toggle-row">
      <span class="field-label" style="margin:0;">启用</span>
      <label class="toggle-switch">
        <input type="checkbox" id="lore-enabled" checked />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <label class="field-label">备注</label>
    <input type="text" class="field-input" id="lore-comment" placeholder="可选备注..." />

    <div class="form-actions" style="padding-top:8px;">
      <button class="settings-btn primary" id="lore-save-btn">保存</button>
      <button class="settings-btn danger ${currentEditId ? "" : "hidden"}" id="lore-delete-btn">删除</button>
    </div>`;

  if (currentEditId) {
    container.querySelector("#lore-edit-title").textContent = "编辑条目";
    await fillEditForm(container, currentEditId);
  } else {
    container.querySelector("#lore-edit-title").textContent = "新建条目";
    syncFormVisibility(container);
  }

  bindEditEvents(container);
  showEditView(container);
}

function bindEditEvents(container) {
  container.querySelector("#lore-is-global").addEventListener("change", () => {
    syncFormVisibility(container);
  });

  container.querySelector("#lore-position").addEventListener("change", () => {
    syncFormVisibility(container);
  });

  container.querySelector("#lore-save-btn").addEventListener("click", () => {
    saveCurrentForm(container);
  });

  const deleteBtn = container.querySelector("#lore-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!currentEditId) return;
      if (!confirm("确定要删除这个条目吗？")) return;
      await deleteLoreEntry(currentEditId);
      bus.emit("lore:deleted", currentEditId);
      closeEditView(container);
    });
  }
}

function showEditView(container) {
  container.querySelector("#lore-list-view").classList.add("hidden");
  container.querySelector("#lore-edit-view").classList.remove("hidden");
}

function closeEditView(container) {
  container.querySelector("#lore-edit-view").classList.add("hidden");
  container.querySelector("#lore-list-view").classList.remove("hidden");
  currentEditId = null;
  renderList(container);
}

async function fillEditForm(container, entryId) {
  const entries = await getAllLoreEntries();
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  const type = entry.type || "keyword";
  const isAlwaysActive = type === "constant" || type === "global";
  const isGlobal = type === "global";

  container.querySelector("#lore-keywords").value = (entry.keywords || []).join(", ");
  container.querySelector("#lore-content").value = entry.content || "";
  container.querySelector("#lore-always-active").checked = isAlwaysActive;
  container.querySelector("#lore-is-global").checked = isGlobal;
  container.querySelector("#lore-char-select").value = entry.characterId || "";
  container.querySelector("#lore-position").value = entry.position || "after_char";
  container.querySelector("#lore-depth").value = entry.depth ?? 100;
  container.querySelector("#lore-priority").value = entry.priority ?? 0;
  container.querySelector("#lore-enabled").checked = entry.isEnabled !== false;
  container.querySelector("#lore-comment").value = entry.comment || "";

  syncFormVisibility(container);
}

function syncFormVisibility(container) {
  const isGlobal = container.querySelector("#lore-is-global").checked;
  const pos = container.querySelector("#lore-position").value;
  const charGroup = container.querySelector("#lore-char-group");
  const depthGroup = container.querySelector("#lore-depth-group");

  if (isGlobal) {
    charGroup.classList.add("hidden");
  } else {
    charGroup.classList.remove("hidden");
  }

  if (pos === "at_depth") {
    depthGroup.classList.remove("hidden");
  } else {
    depthGroup.classList.add("hidden");
  }
}

function readForm(container) {
  const rawKeywords = container.querySelector("#lore-keywords").value;
  const keywords = rawKeywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const isAlwaysActive = container.querySelector("#lore-always-active").checked;
  const isGlobal = container.querySelector("#lore-is-global").checked;

  let type = "keyword";
  if (isAlwaysActive && isGlobal) type = "global";
  else if (isAlwaysActive) type = "constant";

  const position = container.querySelector("#lore-position").value;

  return {
    type,
    keywords,
    content: (container.querySelector("#lore-content").value || "").trim(),
    position,
    depth: parseInt(container.querySelector("#lore-depth").value, 10) || 100,
    priority: parseInt(container.querySelector("#lore-priority").value, 10) || 0,
    order: 0,
    isEnabled: container.querySelector("#lore-enabled").checked,
    characterId: isGlobal ? null : (container.querySelector("#lore-char-select").value || null),
    comment: (container.querySelector("#lore-comment").value || "").trim(),
  };
}

async function saveCurrentForm(container) {
  const values = readForm(container);

  if (values.type === "keyword" && values.keywords.length === 0) {
    alert("关键词模式下至少需要一个关键词。");
    return;
  }
  if (!values.content) {
    alert("请填写条目内容。");
    return;
  }

  let entry;
  if (currentEditId) {
    const entries = await getAllLoreEntries();
    const existing = entries.find((e) => e.id === currentEditId);
    entry = { ...existing, ...values, updatedAt: Date.now() };
  } else {
    entry = createLoreEntry(values);
  }

  await saveLoreEntry(entry);
  bus.emit("lore:changed", entry);
  closeEditView(container);
}

/* ───────── Import / Export ───────── */

async function handleExport() {
  const entries = await getAllLoreEntries();
  if (entries.length === 0) {
    alert("没有可导出的条目。");
    return;
  }
  const blob = new Blob(
    [JSON.stringify({ version: 1, loreEntries: entries }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lore_export_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImport(container) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.loreEntries || !Array.isArray(data.loreEntries)) {
        alert("无效的世界书文件格式。");
        return;
      }
      let imported = 0;
      for (const raw of data.loreEntries) {
        const entry = createLoreEntry({
          ...raw,
          id: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await saveLoreEntry(entry);
        imported++;
      }
      alert(`已导入 ${imported} 个条目。`);
      bus.emit("lore:changed");
      await renderList(container);
    } catch (err) {
      console.error("[Lore] Import error:", err);
      alert("导入失败: " + err.message);
    }
  });
  input.click();
}

/* ───────── Utilities ───────── */

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
