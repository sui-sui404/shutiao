/**
 * Presets — 预设系统
 * 管理 prompt 模板，控制 AI 回复风格（旁白、双语、语气等）
 */
import bus from "./eventBus.js";
import { getAllPresets, savePreset, deletePreset } from "./db.js";
import { createPreset } from "./models.js";

const BUILTIN_PRESETS = [
  { id: "__default", name: "默认", description: "标准聊天模式", systemPrompt: "", enableNarrator: false, enableBilingual: false, isBuiltin: true },
  { id: "__narrator", name: "旁白", description: "带旁白描写", systemPrompt: "Include narrative descriptions of actions, emotions, and surroundings in your responses. Wrap narration in asterisks *like this*.", enableNarrator: true, enableBilingual: false, isBuiltin: true },
  { id: "__bilingual", name: "双语", description: "双语翻译模式", systemPrompt: "Reply in your character's language first, then provide a Chinese translation on a new line after [TL].", enableNarrator: false, enableBilingual: true, isBuiltin: true },
  { id: "__narrator_bilingual", name: "旁白 + 双语", description: "旁白描写 + 双语翻译", systemPrompt: "Include narrative descriptions wrapped in *asterisks*. Reply in character language first, then provide Chinese translation after [TL].", enableNarrator: true, enableBilingual: true, isBuiltin: true },
];

const MODULE_PRESETS = [
  { module: "chat", name: "Chat 聊天预设" },
  { module: "phone", name: "Phone 查手机预设" },
  { module: "theater", name: "Theater 小剧场预设" },
  { module: "world", name: "World 异世界预设" },
];

let activePresetId = "__default";
let editingPresetId = null;

export async function renderPresets(container) {
  const customPresets = await getAllPresets();

  container.innerHTML = `
    <div class="presets-page">

      <!-- Built-in presets -->
      <div class="presets-section">
        <div class="presets-section-title">内置预设</div>
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
        <div class="presets-section-title">自定义预设</div>
        <div id="custom-presets-list">
          ${customPresets.length === 0
            ? '<div class="presets-empty">暂无自定义预设</div>'
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
          + 新建预设
        </button>
      </div>

      <!-- Per-App module presets -->
      <div class="presets-section">
        <div class="presets-section-title">模块预设（占位）</div>
        ${MODULE_PRESETS.map(m => `
          <div class="preset-card module-placeholder" data-module="${m.module}">
            <div class="preset-card-left">
              <div class="preset-card-name">${m.name}</div>
              <div class="preset-card-desc">Coming soon</div>
            </div>
            <div class="preset-card-right"><span class="coming-badge">即将开放</span></div>
          </div>
        `).join("")}
      </div>

      <!-- Preset edit form -->
      <div class="presets-section presets-edit hidden" id="preset-edit-section">
        <div class="presets-section-title" id="preset-edit-heading">新建预设</div>

        <label class="field-label">名称</label>
        <input type="text" class="field-input" id="preset-name" placeholder="我的预设" />

        <label class="field-label">系统提示词</label>
        <textarea class="field-textarea" id="preset-system" rows="6" placeholder="给 AI 的指令..."></textarea>

        <label class="field-label">功能选项</label>
        <div class="preset-options">
          <label class="preset-option">
            <input type="checkbox" id="preset-narrator" />
            <span>启用旁白</span>
          </label>
          <label class="preset-option">
            <input type="checkbox" id="preset-bilingual" />
            <span>启用双语</span>
          </label>
        </div>

        <label class="field-label">翻译语言</label>
        <input type="text" class="field-input" id="preset-lang" placeholder="中文" />

        <div class="form-actions" style="margin-top:12px">
          <button class="settings-btn" id="preset-cancel-btn">取消</button>
          <button class="settings-btn primary" id="preset-save-btn">保存</button>
          <button class="settings-btn danger hidden" id="preset-delete-btn">删除</button>
        </div>
      </div>
    </div>
  `;

  // Click preset card to activate
  container.querySelectorAll(".preset-card:not(.module-placeholder)").forEach(card => {
    card.addEventListener("click", () => {
      activePresetId = card.dataset.presetid;
      localStorage.setItem("activePresetId", activePresetId);
      bus.emit("preset:activated", activePresetId);
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
    container.querySelector("#preset-edit-heading").textContent = "新建预设";
    container.querySelector("#preset-name").value = "";
    container.querySelector("#preset-system").value = "";
    container.querySelector("#preset-narrator").checked = false;
    container.querySelector("#preset-bilingual").checked = false;
    container.querySelector("#preset-lang").value = "中文";
    container.querySelector("#preset-delete-btn").classList.add("hidden");
    container.querySelector("#preset-edit-section").classList.remove("hidden");
  });

  container.querySelector("#preset-cancel-btn")?.addEventListener("click", () => {
    container.querySelector("#preset-edit-section").classList.add("hidden");
  });

  container.querySelector("#preset-save-btn")?.addEventListener("click", async () => {
    const name = container.querySelector("#preset-name").value.trim();
    if (!name) { alert("请输入预设名称"); return; }

    const data = {
      name,
      systemPrompt: container.querySelector("#preset-system").value.trim(),
      enableNarrator: container.querySelector("#preset-narrator").checked,
      enableBilingual: container.querySelector("#preset-bilingual").checked,
      translationLang: container.querySelector("#preset-lang").value.trim() || "中文",
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
    if (confirm("确定要删除这个预设吗？")) {
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
  container.querySelector("#preset-edit-heading").textContent = "编辑预设";
  container.querySelector("#preset-name").value = preset.name;
  container.querySelector("#preset-system").value = preset.systemPrompt || "";
  container.querySelector("#preset-narrator").checked = preset.enableNarrator || false;
  container.querySelector("#preset-bilingual").checked = preset.enableBilingual || false;
  container.querySelector("#preset-lang").value = preset.translationLang || "中文";
  container.querySelector("#preset-delete-btn").classList.remove("hidden");
  container.querySelector("#preset-edit-section").classList.remove("hidden");
}

function getPresetDesc(p) {
  if (p.description) return p.description;
  const parts = [];
  if (p.enableNarrator) parts.push("旁白");
  if (p.enableBilingual) parts.push("双语");
  if (parts.length === 0) return p.systemPrompt ? "自定义提示词" : "标准聊天模式";
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