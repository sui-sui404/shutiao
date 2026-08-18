/**
 * Lore — World Book module (SillyTavern-style)
 *
 * Entry types:
 *   keyword  — triggered when keywords appear in recent messages
 *   constant — always injected for the linked character
 *   global   — always injected for every character
 *
 * Exports:
 *   renderLore(container)  — renders the full World Book UI
 *   getLoreForPrompt(characterId, messages) — returns matched entries for prompt building
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
let filterCharId = null;
let filterType = "all"; // "all" | "keyword" | "constant" | "global"

/* ───────── Position labels ───────── */

const POSITION_LABELS = {
  before_char: "Before Char Defs",
  after_char: "After Char Defs",
  before_example: "Before Examples",
  after_example: "After Examples",
  at_depth: "At Depth",
};

const TYPE_LABELS = {
  keyword: "Keyword",
  constant: "Constant",
  global: "Global",
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

    // ── Global: always included ──
    if (type === "global") {
      matched.push(entry);
      continue;
    }

    // ── Constant: included if linked to this character or unlinked ──
    if (type === "constant") {
      if (!entry.characterId || entry.characterId === characterId) {
        matched.push(entry);
      }
      continue;
    }

    // ── Keyword: scan last N messages for keyword hits ──
    if (type === "keyword") {
      // Must belong to this character or be unlinked
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

  // Sort by priority descending, then by order ascending
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
      <!-- List View -->
      <div class="lore-list-view" id="lore-list-view">
        <div class="lore-tab-bar" id="lore-tab-bar"></div>
        <div class="lore-filter" id="lore-filter"></div>
        <div class="lore-list" id="lore-list"></div>
        <div class="lore-bottom-actions">
          <button class="settings-btn primary" id="lore-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Entry
          </button>
          <button class="settings-btn" id="lore-import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Import
          </button>
          <button class="settings-btn" id="lore-export-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      <!-- Edit View -->
      <div class="lore-edit-view hidden" id="lore-edit-view">
        <div class="lore-edit-header">
          <button class="chat-back-to-home" id="lore-edit-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.8">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span class="lore-edit-title" id="lore-edit-title">New Entry</span>
          <div style="width:36px"></div>
        </div>
        <div class="lore-edit-form">
          <label class="field-label">Type</label>
          <select class="field-input" id="lore-type">
            <option value="keyword">Keyword</option>
            <option value="constant">Constant</option>
            <option value="global">Global</option>
          </select>

          <div id="lore-keywords-group">
            <label class="field-label">Keywords</label>
            <input type="text" class="field-input" id="lore-keywords"
                   placeholder="keyword1, keyword2, keyword3" />
          </div>

          <label class="field-label">Content</label>
          <textarea class="field-input field-textarea" id="lore-content"
                    placeholder="Describe this world knowledge..." rows="8"></textarea>

          <label class="field-label">Position</label>
          <select class="field-input" id="lore-position">
            <option value="before_char">Before Character Defs</option>
            <option value="after_char">After Character Defs</option>
            <option value="before_example">Before Examples</option>
            <option value="after_example">After Examples</option>
            <option value="at_depth">At Depth</option>
          </select>

          <div id="lore-depth-group" class="hidden">
            <label class="field-label">Scan Depth</label>
            <input type="number" class="field-input" id="lore-depth"
                   placeholder="100" min="0" max="999" value="100" />
          </div>

          <div class="lore-edit-row">
            <div class="lore-edit-half">
              <label class="field-label">Priority</label>
              <input type="number" class="field-input" id="lore-priority"
                     placeholder="0" min="0" max="999" value="0" />
            </div>
            <div class="lore-edit-half">
              <label class="field-label">Order</label>
              <input type="number" class="field-input" id="lore-order"
                     placeholder="0" min="0" max="999" value="0" />
            </div>
          </div>

          <label class="field-label">Character</label>
          <select class="field-input" id="lore-char-select">
            <option value="">Global (All Characters)</option>
          </select>

          <label class="field-label">Comment</label>
          <input type="text" class="field-input" id="lore-comment"
                 placeholder="Optional note for yourself..." />

          <div class="lore-toggle-row">
            <span class="field-label" style="margin:0">Enabled</span>
            <label class="toggle-switch">
              <input type="checkbox" id="lore-enabled" checked />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-actions">
            <button class="settings-btn primary" id="lore-save-btn">Save</button>
            <button class="settings-btn danger hidden" id="lore-delete-btn">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;

  renderTabs(container);
  await renderFilter(container);
  await renderList(container);
  bindEvents(container);
}

/* ───────── Tabs ───────── */

function renderTabs(container) {
  const bar = container.querySelector("#lore-tab-bar");
  const tabs = [
    { key: "all", label: "All" },
    { key: "keyword", label: "Keyword" },
    { key: "constant", label: "Constant" },
    { key: "global", label: "Global" },
  ];
  bar.innerHTML = tabs
    .map(
      (t) =>
        `<button class="lore-tab${filterType === t.key ? " lore-tab-active" : ""}"
                 data-type="${t.key}">${t.label}</button>`
    )
    .join("");

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".lore-tab");
    if (!btn) return;
    filterType = btn.dataset.type;
    renderTabs(container);
    renderList(container);
  });
}

/* ───────── Character Filter ───────── */

async function renderFilter(container) {
  const filterEl = container.querySelector("#lore-filter");
  const chars = await getAllCharacters();

  filterEl.innerHTML = `
    <select class="field-input lore-filter-select" id="lore-filter-select">
      <option value="">All Characters</option>
      ${chars
        .map(
          (c) =>
            `<option value="${c.id}">${escHtml(c.name || "Unnamed")}</option>`
        )
        .join("")}
    </select>
  `;

  const select = filterEl.querySelector("#lore-filter-select");
  if (filterCharId) select.value = filterCharId;

  select.addEventListener("change", () => {
    filterCharId = select.value || null;
    renderList(container);
  });
}

/* ───────── Entry List ───────── */

async function renderList(container) {
  const list = container.querySelector("#lore-list");
  let entries = await getAllLoreEntries();

  // Apply type filter
  if (filterType !== "all") {
    entries = entries.filter((e) => (e.type || "keyword") === filterType);
  }

  // Apply character filter
  if (filterCharId) {
    entries = entries.filter((e) => e.characterId === filterCharId);
  }

  // Sort by priority desc, then order asc
  entries.sort((a, b) => {
    const pDiff = (b.priority || 0) - (a.priority || 0);
    if (pDiff !== 0) return pDiff;
    return (a.order || 0) - (b.order || 0);
  });

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-hint">No lore entries yet. Tap + to create world knowledge.</div>`;
    return;
  }

  const chars = await getAllCharacters();
  const charMap = {};
  chars.forEach((c) => {
    charMap[c.id] = c.name || "Unnamed";
  });

  list.innerHTML = entries
    .map((entry) => {
      const type = entry.type || "keyword";
      const preview =
        (entry.content || "").length > 80
          ? entry.content.slice(0, 80) + "\u2026"
          : entry.content || "";
      const keywords = entry.keywords || [];
      const charName = entry.characterId
        ? charMap[entry.characterId] || ""
        : "";
      const disabledClass =
        entry.isEnabled === false ? " lore-card-disabled" : "";
      const posLabel =
        entry.position === "at_depth"
          ? `Depth ${entry.depth ?? 0}`
          : POSITION_LABELS[entry.position] || entry.position || "";

      return `
      <div class="lore-card${disabledClass}" data-id="${entry.id}">
        <div class="lore-card-top">
          <div class="lore-card-left">
            <span class="lore-type-badge lore-type-${type}">${TYPE_LABELS[type] || type}</span>
            <div class="lore-card-keywords">
              ${
                type === "keyword"
                  ? keywords.length > 0
                    ? keywords
                        .map(
                          (k) =>
                            `<span class="lore-keyword-badge">${escHtml(k)}</span>`
                        )
                        .join("")
                    : `<span class="lore-keyword-badge lore-badge-empty">no keywords</span>`
                  : ""
              }
            </div>
          </div>
          <div class="lore-card-meta">
            ${
              charName
                ? `<span class="lore-card-char">${escHtml(charName)}</span>`
                : ""
            }
            <span class="lore-card-priority">P${entry.priority || 0}</span>
          </div>
        </div>
        <div class="lore-card-preview">${escHtml(preview)}</div>
        <div class="lore-card-bottom">
          <span class="lore-position-badge">${escHtml(posLabel)}</span>
          ${entry.comment ? `<span class="lore-card-comment">${escHtml(entry.comment)}</span>` : ""}
        </div>
      </div>
    `;
    })
    .join("");
}

/* ───────── Events ───────── */

function bindEvents(container) {
  const loreList = container.querySelector("#lore-list");
  const addBtn = container.querySelector("#lore-add-btn");
  const importBtn = container.querySelector("#lore-import-btn");
  const exportBtn = container.querySelector("#lore-export-btn");

  // Click card -> edit
  loreList.addEventListener("click", (e) => {
    const card = e.target.closest(".lore-card");
    if (!card) return;
    openEditView(container, card.dataset.id);
  });

  // Add
  addBtn.addEventListener("click", () => {
    openEditView(container, null);
  });

  // Import
  importBtn.addEventListener("click", () => handleImport(container));

  // Export
  exportBtn.addEventListener("click", () => handleExport());

  // Back
  container
    .querySelector("#lore-edit-back")
    .addEventListener("click", () => closeEditView(container));

  // Save
  container
    .querySelector("#lore-save-btn")
    .addEventListener("click", async () => {
      await saveCurrentForm(container);
    });

  // Delete
  container
    .querySelector("#lore-delete-btn")
    .addEventListener("click", async () => {
      if (!currentEditId) return;
      if (!confirm("Delete this lore entry?")) return;
      await deleteLoreEntry(currentEditId);
      bus.emit("lore:deleted", currentEditId);
      currentEditId = null;
      closeEditView(container);
    });

  // Type selector toggles keyword field visibility
  const typeSelect = container.querySelector("#lore-type");
  typeSelect.addEventListener("change", () => {
    syncFormVisibility(container);
  });

  // Position selector toggles depth field
  const posSelect = container.querySelector("#lore-position");
  posSelect.addEventListener("change", () => {
    syncFormVisibility(container);
  });
}

/* ───────── Edit View ───────── */

async function openEditView(container, entryId) {
  const listView = container.querySelector("#lore-list-view");
  const editView = container.querySelector("#lore-edit-view");
  const titleEl = container.querySelector("#lore-edit-title");
  const deleteBtn = container.querySelector("#lore-delete-btn");

  await populateCharSelect(container);

  if (entryId) {
    currentEditId = entryId;
    titleEl.textContent = "Edit Entry";
    deleteBtn.classList.remove("hidden");
    const entries = await getAllLoreEntries();
    const entry = entries.find((e) => e.id === entryId);
    if (entry) fillForm(container, entry);
  } else {
    currentEditId = null;
    titleEl.textContent = "New Entry";
    deleteBtn.classList.add("hidden");
    fillForm(container, createLoreEntry());
  }

  syncFormVisibility(container);
  listView.classList.add("hidden");
  editView.classList.remove("hidden");
}

function closeEditView(container) {
  container.querySelector("#lore-edit-view").classList.add("hidden");
  container.querySelector("#lore-list-view").classList.remove("hidden");
  currentEditId = null;
  renderList(container);
}

async function populateCharSelect(container) {
  const select = container.querySelector("#lore-char-select");
  const chars = await getAllCharacters();
  select.innerHTML = `
    <option value="">Global (All Characters)</option>
    ${chars
      .map(
        (c) =>
          `<option value="${c.id}">${escHtml(c.name || "Unnamed")}</option>`
      )
      .join("")}
  `;
}

function fillForm(container, entry) {
  container.querySelector("#lore-type").value = entry.type || "keyword";
  container.querySelector("#lore-keywords").value = (entry.keywords || []).join(
    ", "
  );
  container.querySelector("#lore-content").value = entry.content || "";

  // Position: if it's "at_depth", select "at_depth"; otherwise select the value
  const pos = entry.position || "after_char";
  container.querySelector("#lore-position").value = pos;
  container.querySelector("#lore-depth").value = entry.depth ?? 100;
  container.querySelector("#lore-priority").value = entry.priority ?? 0;
  container.querySelector("#lore-order").value = entry.order ?? 0;
  container.querySelector("#lore-enabled").checked = entry.isEnabled !== false;
  container.querySelector("#lore-char-select").value =
    entry.characterId || "";
  container.querySelector("#lore-comment").value = entry.comment || "";

  syncFormVisibility(container);
}

function syncFormVisibility(container) {
  const type = container.querySelector("#lore-type").value;
  const pos = container.querySelector("#lore-position").value;
  const kwGroup = container.querySelector("#lore-keywords-group");
  const depthGroup = container.querySelector("#lore-depth-group");

  // Show keywords only for keyword type
  if (type === "keyword") {
    kwGroup.classList.remove("hidden");
  } else {
    kwGroup.classList.add("hidden");
  }

  // Show depth input when position is "at_depth" OR type is "keyword"
  if (pos === "at_depth" || type === "keyword") {
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

  const type = container.querySelector("#lore-type").value;
  const position = container.querySelector("#lore-position").value;

  return {
    type,
    keywords: type === "keyword" ? keywords : [],
    content: (container.querySelector("#lore-content").value || "").trim(),
    position,
    depth: parseInt(container.querySelector("#lore-depth").value, 10) || 100,
    priority:
      parseInt(container.querySelector("#lore-priority").value, 10) || 0,
    order: parseInt(container.querySelector("#lore-order").value, 10) || 0,
    isEnabled: container.querySelector("#lore-enabled").checked,
    characterId: container.querySelector("#lore-char-select").value || null,
    comment: (container.querySelector("#lore-comment").value || "").trim(),
  };
}

async function saveCurrentForm(container) {
  const values = readForm(container);

  if (values.type === "keyword" && values.keywords.length === 0) {
    alert("Keyword entries need at least one keyword.");
    return;
  }
  if (!values.content) {
    alert("Please add some content.");
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
    alert("No lore entries to export.");
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
        alert("Invalid lore file format.");
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
      alert(`Imported ${imported} lore entries.`);
      bus.emit("lore:changed");
      await renderList(container);
    } catch (err) {
      console.error("[Lore] Import error:", err);
      alert("Failed to import: " + err.message);
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