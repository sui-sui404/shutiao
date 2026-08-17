/**
 * Presets — 预设系统
 * 管理 prompt 模板，控制 AI 回复风格（旁白、双语、语气等）
 */
import bus from "./eventBus.js";
import { getAllPresets, savePreset, deletePreset } from "./db.js";
import { createPreset } from "./models.js";

const BUILTIN_PRESETS = [
  { id: "__default", name: "Default", systemPrompt: "", enableNarrator: false, enableBilingual: false, isBuiltin: true },
  { id: "__narrator", name: "Narrator", systemPrompt: "Include narrative descriptions of actions, emotions, and surroundings in your responses. Wrap narration in asterisks *like this*.", enableNarrator: true, enableBilingual: false, isBuiltin: true },
  { id: "__bilingual", name: "Bilingual", systemPrompt: "Reply in your character's language first, then provide a Chinese translation on a new line after [TL].", enableNarrator: false, enableBilingual: true, isBuiltin: true },
  { id: "__narrator_bilingual", name: "Narrator + Bilingual", systemPrompt: "Include narrative descriptions wrapped in *asterisks*. Reply in character language first, then provide Chinese translation after [TL].", enableNarrator: true, enableBilingual: true, isBuiltin: true },
];

let activePresetId = "__default";
let editingPresetId = null;

export async function renderPresets(container) {
  const customPresets = await getAllPresets();

  container.innerHTML = `
    <div class="presets-page">
      <div class="presets-header">
        <span class="presets-title">Presets</span>
      </div>

      <!-- Built-in presets -->
      <div class="presets-section">
        <div class="presets-section-title">Built-in</div>
        ${BUILTIN_PRESETS.map(p => `
          <div class="preset-card ${p.id === activePresetId ? 'active' : ''}" data-presetid="${p.id}">
            <div class="preset-card-left">
              <div class="preset-card-name">${p.name}</div>
              <div class="preset-card-desc">${getPresetDesc(p)}</div>
            </div>
            <div class="preset-card-right">
              ${p.id === activePresetId ? '<span class="active-badge">Active</span>' : ''}
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Custom presets -->
      <div class="presets-section">
        <div class="presets-section-title">Custom</div>
        <div id="custom-presets-list">
          ${customPresets.length === 0
            ? '<div class="presets-empty">No custom presets yet</div>'
            : customPresets.map(p => `
              <div class="preset-card ${p.id === activePresetId ? 'active' : ''}" data-presetid="${p.id}" data-custom="true">
                <div class="preset-card-left">
                  <div class="preset-card-name">${escHtml(p.name)}</div>
                  <div class="preset-card-desc">${getPresetDesc(p)}</div>
                </div>
                <div class="preset-card-right">
                  ${p.id === activePresetId ? '<span class="active-badge">Active</span>' : ''}
                </div>
              </div>
            `).join("")
          }
        </div>
        <button class="settings-btn primary" id="add-preset-btn" style="margin-top:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Preset
        </button>
      </div>

      <!-- Preset edit form -->
      <div class="presets-section presets-edit hidden" id="preset-edit-section">
        <div class="presets-section-title" id="preset-edit-heading">New Preset</div>

        <label class="field-label">Name</label>
        <input type="text" class="field-input" id="preset-name" placeholder="My Preset" />

        <label class="field-label">System Prompt</label>
        <textarea class="field-textarea" id="preset-system" rows="6" placeholder="Instructions for the AI..."></textarea>

        <label class="field-label">Features</label>
        <div class="preset-options">
          <label class="preset-option">
            <input type="checkbox" id="preset-narrator" />
            <span>Enable narration</span>
          </label>
          <label class="preset-option">
            <input type="checkbox" id="preset-bilingual" />
            <span>Enable bilingual</span>
          </label>
        </div>

        <label class="field-label">Translation Language</label>
        <input type="text" class="field-input" id="preset-lang" placeholder="Chinese" />

        <div class="form-actions" style="margin-top:12px">
          <button class="settings-btn" id="preset-cancel-btn">Cancel</button>
          <button class="settings-btn primary" id="preset-save-btn">Save</button>
          <button class="settings-btn danger hidden" id="preset-delete-btn">Delete</button>
        </div>
      </div>
    </div>
  `;

  // Click preset card to activate
  container.querySelectorAll(".preset-card").forEach(card => {
    card.addEventListener("click", () => {
      activePresetId = card.dataset.presetid;
      localStorage.setItem("activePresetId", activePresetId);
      bus.emit("preset:activated", activePresetId);
      // Re-render to update active states
      renderPresets(container);
    });

    // Long press on custom preset to edit
    if (card.dataset.custom === "true") {
      let timer;
      card.addEventListener("touchstart", () => {
        timer = setTimeout(() => openEditPreset(container, card.dataset.presetid), 500);
      });
      card.addEventListener("touchend", () => clearTimeout(timer));
      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openEditPreset(container, card.dataset.presetid);
      });
    }
  });

  // Load saved active preset
  const saved = localStorage.getItem("activePresetId");
  if (saved) activePresetId = saved;

  // Add preset button
  container.querySelector("#add-preset-btn")?.addEventListener("click", () => {
    editingPresetId = null;
    container.querySelector("#preset-edit-heading").textContent = "New Preset";
    container.querySelector("#preset-name").value = "";
    container.querySelector("#preset-system").value = "";
    container.querySelector("#preset-narrator").checked = false;
    container.querySelector("#preset-bilingual").checked = false;
    container.querySelector("#preset-lang").value = "Chinese";
    container.querySelector("#preset-delete-btn").classList.add("hidden");
    container.querySelector("#preset-edit-section").classList.remove("hidden");
  });

  container.querySelector("#preset-cancel-btn")?.addEventListener("click", () => {
    container.querySelector("#preset-edit-section").classList.add("hidden");
  });

  container.querySelector("#preset-save-btn")?.addEventListener("click", async () => {
    const name = container.querySelector("#preset-name").value.trim();
    if (!name) { alert("Name is required"); return; }

    const data = {
      name,
      systemPrompt: container.querySelector("#preset-system").value.trim(),
      enableNarrator: container.querySelector("#preset-narrator").checked,
      enableBilingual: container.querySelector("#preset-bilingual").checked,
      translationLang: container.querySelector("#preset-lang").value.trim() || "Chinese",
    };

    if (editingPresetId) {
      const existing = await getAllPresets();
      const preset = existing.find(p => p.id === editingPresetId);
      if (preset) {
        Object.assign(preset, data);
        await savePreset(preset);
      }
    } else {
      const preset = createPreset(data);
      await savePreset(preset);
    }

    container.querySelector("#preset-edit-section").classList.add("hidden");
    renderPresets(container);
  });

  container.querySelector("#preset-delete-btn")?.addEventListener("click", async () => {
    if (!editingPresetId) return;
    if (confirm("Delete this preset?")) {
      await deletePreset(editingPresetId);
      if (activePresetId === editingPresetId) {
        activePresetId = "__default";
        localStorage.setItem("activePresetId", activePresetId);
      }
      editingPresetId = null;
      renderPresets(container);
    }
  });
}

async function openEditPreset(container, presetId) {
  const presets = await getAllPresets();
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return;

  editingPresetId = presetId;
  container.querySelector("#preset-edit-heading").textContent = "Edit Preset";
  container.querySelector("#preset-name").value = preset.name;
  container.querySelector("#preset-system").value = preset.systemPrompt || "";
  container.querySelector("#preset-narrator").checked = preset.enableNarrator || false;
  container.querySelector("#preset-bilingual").checked = preset.enableBilingual || false;
  container.querySelector("#preset-lang").value = preset.translationLang || "Chinese";
  container.querySelector("#preset-delete-btn").classList.remove("hidden");
  container.querySelector("#preset-edit-section").classList.remove("hidden");
}

function getPresetDesc(p) {
  const parts = [];
  if (p.enableNarrator) parts.push("Narration");
  if (p.enableBilingual) parts.push("Bilingual");
  if (parts.length === 0) return p.systemPrompt ? "Custom prompt" : "Standard chat mode";
  return parts.join(" + ");
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

export function getActivePresetId() {
  return localStorage.getItem("activePresetId") || "__default";
}

export function getBuiltinPreset(id) {
  return BUILTIN_PRESETS.find(p => p.id === id) || null;
}