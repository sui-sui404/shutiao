/**
 * Lore — World Book module
 * Lore entries list / create / edit / delete / character filter
 */
import bus from "./eventBus.js";
import {
  getAllLoreEntries,
  saveLoreEntry,
  deleteLoreEntry,
  getAllCharacters,
} from "./db.js";
import { createLoreEntry } from "./models.js";

let currentEditId = null;
let filterCharId = null;

/* ───────── Main Render ───────── */

export async function renderLore(container) {
  container.innerHTML = `
    <div class="lore-page">
      <!-- List View -->
      <div class="lore-list-view" id="lore-list-view">
        <div class="lore-filter" id="lore-filter"></div>
        <div class="lore-list" id="lore-list"></div>
        <div class="lore-bottom-actions">
          <button class="settings-btn primary" id="lore-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Entry
          </button>
        </div>
      </div>

      <!-- Edit View -->
      <div class="lore-edit-view hidden" id="lore-edit-view">
        <div class="lore-edit-header">
          <button class="chat-back-to-home" id="lore-edit-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="lore-edit-title" id="lore-edit-title">New Entry</span>
          <div style="width:36px"></div>
        </div>
        <div class="lore-edit-form">
          <label class="field-label">Keywords</label>
          <input type="text" class="field-input" id="lore-keywords" placeholder="keyword1, keyword2, keyword3" />

          <label class="field-label">Content</label>
          <textarea class="field-input field-textarea" id="lore-content" placeholder="Describe this world knowledge..." rows="8"></textarea>

          <label class="field-label">Priority</label>
          <input type="number" class="field-input" id="lore-priority" placeholder="0" min="0" max="999" value="0" />

          <label class="field-label">Character</label>
          <select class="field-input" id="lore-char-select">
            <option value="">Global (All Characters)</option>
          </select>

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

  await renderFilter(container);
  await renderList(container);
  bindEvents(container);
}

/* ───────── Filter Dropdown ───────── */

async function renderFilter(container) {
  const filterEl = container.querySelector("#lore-filter");
  const chars = await getAllCharacters();

  filterEl.innerHTML = `
    <select class="field-input lore-filter-select" id="lore-filter-select">
      <option value="">All Characters</option>
      ${chars.map(c => `<option value="${c.id}">${escHtml(c.name || "Unnamed")}</option>`).join("")}
    </select>
  `;

  const select = filterEl.querySelector("#lore-filter-select");
  if (filterCharId) select.value = filterCharId;

  select.addEventListener("change", () => {
    filterCharId = select.value || null;
    renderList(container);
  });
}

/* ───────── List Render ───────── */

async function renderList(container) {
  const list = container.querySelector("#lore-list");
  let entries = await getAllLoreEntries();

  if (filterCharId) {
    entries = entries.filter(e => e.characterId === filterCharId);
  }

  entries.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-hint">No lore entries yet. Tap + to create world knowledge.</div>`;
    return;
  }

  const chars = await getAllCharacters();
  const charMap = {};
  chars.forEach(c => { charMap[c.id] = c.name || "Unnamed"; });

  list.innerHTML = entries.map(entry => {
    const preview = (entry.content || "").length > 80
      ? entry.content.slice(0, 80) + "…"
      : (entry.content || "");
    const keywords = (entry.keywords || []);
    const charName = entry.characterId ? charMap[entry.characterId] || "" : "";
    const disabledClass = entry.isEnabled === false ? " lore-card-disabled" : "";

    return `
      <div class="lore-card${disabledClass}" data-id="${entry.id}">
        <div class="lore-card-top">
          <div class="lore-card-keywords">
            ${keywords.length > 0
              ? keywords.map(k => `<span class="lore-keyword-badge">${escHtml(k)}</span>`).join("")
              : `<span class="lore-keyword-badge lore-badge-empty">no keywords</span>`
            }
          </div>
          <div class="lore-card-meta">
            ${charName ? `<span class="lore-card-char">${escHtml(charName)}</span>` : ""}
            <span class="lore-card-priority">P${entry.priority || 0}</span>
          </div>
        </div>
        <div class="lore-card-preview">${escHtml(preview)}</div>
      </div>
    `;
  }).join("");
}

/* ───────── Events ───────── */

function bindEvents(container) {
  const loreList = container.querySelector("#lore-list");
  const addBtn = container.querySelector("#lore-add-btn");

  // Click card → edit
  loreList.addEventListener("click", (e) => {
    const card = e.target.closest(".lore-card");
    if (!card) return;
    openEditView(container, card.dataset.id);
  });

  // Add button
  addBtn.addEventListener("click", () => {
    openEditView(container, null);
  });

  // Back button
  container.querySelector("#lore-edit-back").addEventListener("click", () => {
    closeEditView(container);
  });

  // Save
  container.querySelector("#lore-save-btn").addEventListener("click", async () => {
    await saveCurrentForm(container);
  });

  // Delete
  container.querySelector("#lore-delete-btn").addEventListener("click", async () => {
    if (!currentEditId) return;
    if (!confirm("Delete this lore entry?")) return;
    await deleteLoreEntry(currentEditId);
    bus.emit("lore:deleted", currentEditId);
    currentEditId = null;
    closeEditView(container);
  });
}

/* ───────── Edit View ───────── */

async function openEditView(container, entryId) {
  const listView = container.querySelector("#lore-list-view");
  const editView = container.querySelector("#lore-edit-view");
  const titleEl = container.querySelector("#lore-edit-title");
  const deleteBtn = container.querySelector("#lore-delete-btn");

  // Populate character dropdown
  await populateCharSelect(container);

  if (entryId) {
    currentEditId = entryId;
    titleEl.textContent = "Edit Entry";
    deleteBtn.classList.remove("hidden");
    const entries = await getAllLoreEntries();
    const entry = entries.find(e => e.id === entryId);
    if (entry) fillForm(container, entry);
  } else {
    currentEditId = null;
    titleEl.textContent = "New Entry";
    deleteBtn.classList.add("hidden");
    fillForm(container, createLoreEntry());
  }

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
    ${chars.map(c => `<option value="${c.id}">${escHtml(c.name || "Unnamed")}</option>`).join("")}
  `;
}

function fillForm(container, entry) {
  container.querySelector("#lore-keywords").value = (entry.keywords || []).join(", ");
  container.querySelector("#lore-content").value = entry.content || "";
  container.querySelector("#lore-priority").value = entry.priority ?? 0;
  container.querySelector("#lore-enabled").checked = entry.isEnabled !== false;
  const charSelect = container.querySelector("#lore-char-select");
  charSelect.value = entry.characterId || "";
}

function readForm(container) {
  const rawKeywords = container.querySelector("#lore-keywords").value;
  const keywords = rawKeywords
    .split(",")
    .map(k => k.trim())
    .filter(k => k.length > 0);

  return {
    keywords,
    content: (container.querySelector("#lore-content").value || "").trim(),
    priority: parseInt(container.querySelector("#lore-priority").value, 10) || 0,
    isEnabled: container.querySelector("#lore-enabled").checked,
    characterId: container.querySelector("#lore-char-select").value || null,
  };
}

async function saveCurrentForm(container) {
  const values = readForm(container);

  if (values.keywords.length === 0 && !values.content) {
    alert("Please add at least one keyword or some content.");
    return;
  }

  let entry;
  if (currentEditId) {
    const entries = await getAllLoreEntries();
    const existing = entries.find(e => e.id === currentEditId);
    entry = {
      ...existing,
      ...values,
      updatedAt: Date.now(),
    };
  } else {
    entry = createLoreEntry(values);
  }

  await saveLoreEntry(entry);
  bus.emit("lore:changed", entry);
  closeEditView(container);
}

/* ───────── Utilities ───────── */

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}