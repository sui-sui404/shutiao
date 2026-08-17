/**
  * Settings — Settings 页面逻辑
  * API 配置 + 多 API 管理 + 连接测试 + 模型参数
  */
import bus from "./eventBus.js";
import {
  getSettings,
  saveSettings,
  getAllApiConfigs,
  saveApiConfig,
  deleteApiConfig,
  getApiConfig,
} from "./db.js";
import { createApiConfig } from "./models.js";
import { testApiConnection } from "./api.js";

let currentEditId = null;

export async function renderSettings(container) {
  const settings = await getSettings();
  const apis = await getAllApiConfigs();

  container.innerHTML = `
    <div class="settings-page">

      <!-- API List -->
      <div class="settings-section">
        <div class="settings-section-title">API Configurations</div>
        <div class="api-list" id="api-list">
          ${apis.length === 0 ? '<div class="empty-hint">No API configured yet</div>' : apis.map((api) => `
            <div class="api-card ${settings.activeApiId === api.id ? "active" : ""}" data-id="${api.id}">
              <div class="api-card-left">
                <div class="api-card-name">${escHtml(api.name)}</div>
                <div class="api-card-model">${escHtml(api.model || "No model set")}</div>
              </div>
              <div class="api-card-right">
                ${settings.activeApiId === api.id ? '<span class="active-badge">Active</span>' : ""}
              </div>
            </div>
          `).join("")}
        </div>
        <button class="settings-btn primary" id="add-api-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add API
        </button>
      </div>

      <!-- API Edit Form (hidden by default) -->
      <div class="settings-section api-edit-section hidden" id="api-edit-section">
        <div class="settings-section-title" id="api-edit-title">New API</div>

        <label class="field-label">Name</label>
        <input type="text" class="field-input" id="api-name" placeholder="My API" />

        <label class="field-label">Base URL</label>
        <input type="url" class="field-input" id="api-base-url" placeholder="https://api.openai.com" />

        <label class="field-label">API Key</label>
        <div class="field-password-wrap">
          <input type="password" class="field-input" id="api-key" placeholder="sk-..." />
          <button class="field-toggle-eye" id="toggle-key-vis">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--icon-color)" stroke-width="1.4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>

        <label class="field-label">Model</label>
        <div class="field-row">
          <input type="text" class="field-input" id="api-model" placeholder="gpt-4o-mini" />
          <button class="settings-btn fetch-models-btn" id="fetch-models-btn">Fetch</button>
        </div>
        <div class="models-dropdown hidden" id="models-dropdown"></div>

        <!-- Sliders -->
        <div class="slider-group">
          <label class="field-label">Temperature <span class="slider-val" id="temp-val">0.7</span></label>
          <input type="range" class="field-slider" id="api-temp" min="0" max="2" step="0.1" value="0.7" />
        </div>

        <div class="slider-group">
          <label class="field-label">Stream</label>
          <label class="toggle-switch">
            <input type="checkbox" id="api-stream" checked />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Action Buttons -->
        <div class="form-actions">
          <button class="settings-btn" id="api-test-btn">Test Connection</button>
          <button class="settings-btn" id="api-update-btn">Update</button>
          <button class="settings-btn primary" id="api-save-btn">Save</button>
        </div>
        <div class="form-actions">
          <button class="settings-btn danger hidden" id="api-delete-btn">Delete</button>
          <button class="settings-btn" id="api-cancel-btn">Cancel</button>
        </div>
        <div class="test-result hidden" id="test-result"></div>
      </div>

      <!-- Data Management -->
      <div class="settings-section">
        <div class="settings-section-title">Data</div>
        <div class="form-actions">
          <button class="settings-btn" id="export-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Backup
          </button>
          <button class="settings-btn" id="import-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import Backup
          </button>
        </div>
      </div>

    </div>
  `;

  bindSettingsEvents(container);
}

function bindSettingsEvents(container) {
  // API card click → set active + open edit
  container.querySelectorAll(".api-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const id = card.dataset.id;
      await saveSettings({ activeApiId: id });
      openEditForm(container, id);
    });
  });

  // Add API button
  container.querySelector("#add-api-btn")?.addEventListener("click", () => {
    openEditForm(container, null);
  });

  // Save
  container.querySelector("#api-save-btn")?.addEventListener("click", async () => {
    await saveCurrentForm(container);
  });

  // Cancel
  container.querySelector("#api-cancel-btn")?.addEventListener("click", () => {
    closeEditForm(container);
  });

  // Delete
  container.querySelector("#api-delete-btn")?.addEventListener("click", async () => {
    if (currentEditId && confirm("Delete this API configuration?")) {
      const settings = await getSettings();
      if (settings.activeApiId === currentEditId) {
        await saveSettings({ activeApiId: null });
      }
      await deleteApiConfig(currentEditId);
      currentEditId = null;
      renderSettings(container);
    }
  });

  // Test connection
  container.querySelector("#api-test-btn")?.addEventListener("click", async () => {
    const resultEl = container.querySelector("#test-result");
    resultEl.classList.remove("hidden");
    resultEl.className = "test-result testing";
    resultEl.textContent = "Testing...";

    const config = readFormValues(container);
    try {
      const result = await testApiConnection(config);
      resultEl.className = "test-result success";
      resultEl.textContent = `Connected! Model: ${result.model}`;
    } catch (err) {
      resultEl.className = "test-result error";
      resultEl.textContent = `Failed: ${err.message}`;
    }
  });

  // Slider live update
  const tempSlider = container.querySelector("#api-temp");

  tempSlider?.addEventListener("input", () => {
    container.querySelector("#temp-val").textContent = tempSlider.value;
  });

  // Stream toggle

  // Fetch Models
  container.querySelector("#fetch-models-btn")?.addEventListener("click", async () => {
    const baseUrl = container.querySelector("#api-base-url").value.trim();
    const apiKey = container.querySelector("#api-key").value.trim();
    const dropdown = container.querySelector("#models-dropdown");
    if (!baseUrl) { alert("Please enter a Base URL first"); return; }
    const fetchBtn = container.querySelector("#fetch-models-btn");
    fetchBtn.textContent = "...";
    fetchBtn.disabled = true;
    try {
      const url = baseUrl.replace(/\/+$/, "") + "/v1/models";
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = "Bearer " + apiKey;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const json = await resp.json();
      const models = (json.data || []).map(m => m.id).sort();
      if (models.length === 0) { dropdown.innerHTML = '<div class="models-empty">No models found</div>'; }
      else { dropdown.innerHTML = models.map(m => `<div class="model-option" data-model="${m}">${m}</div>`).join(""); }
      dropdown.classList.remove("hidden");
      dropdown.querySelectorAll(".model-option").forEach(opt => {
        opt.addEventListener("click", () => {
          container.querySelector("#api-model").value = opt.dataset.model;
          dropdown.classList.add("hidden");
        });
      });
    } catch (err) {
      dropdown.innerHTML = `<div class="models-empty" style="color:#FF3B30">Failed: ${err.message}</div>`;
      dropdown.classList.remove("hidden");
    } finally {
      fetchBtn.textContent = "Fetch";
      fetchBtn.disabled = false;
    }
  });

  // Update button (update parameters for existing API)
  container.querySelector("#api-update-btn")?.addEventListener("click", async () => {
    if (!currentEditId) { alert("No API selected to update. Click an API card first."); return; }
    const existing = await getApiConfig(currentEditId);
    if (!existing) return;
    const values = readFormValues(container);
    const updated = { ...existing, temperature: values.temperature, stream: values.stream, model: values.model };
    await saveApiConfig(updated);
    bus.emit("settings:updated");
    const testResult = container.querySelector("#test-result");
    if (testResult) { testResult.textContent = "Updated ✓"; testResult.className = "test-result success"; testResult.classList.remove("hidden"); }
  });

  // Toggle password visibility
  container.querySelector("#toggle-key-vis")?.addEventListener("click", () => {
    const input = container.querySelector("#api-key");
    input.type = input.type === "password" ? "text" : "password";
  });

  // Export
  container.querySelector("#export-btn")?.addEventListener("click", async () => {
    const { exportAll } = await import("./db.js");
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mimashu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  container.querySelector("#import-btn")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { importAll } = await import("./db.js");
        await importAll(data);
        alert("Backup restored successfully!");
        renderSettings(container);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    input.click();
  });
}

async function openEditForm(container, apiId) {
  const section = container.querySelector("#api-edit-section");
  const titleEl = container.querySelector("#api-edit-title");
  const deleteBtn = container.querySelector("#api-delete-btn");

  section.classList.remove("hidden");

  if (apiId) {
    currentEditId = apiId;
    titleEl.textContent = "Edit API";
    deleteBtn.classList.remove("hidden");
    const api = await getApiConfig(apiId);
    if (api) fillForm(container, api);
  } else {
    currentEditId = null;
    titleEl.textContent = "New API";
    deleteBtn.classList.add("hidden");
    fillForm(container, createApiConfig());
  }

  section.scrollIntoView({ behavior: "smooth" });
}

function closeEditForm(container) {
  container.querySelector("#api-edit-section").classList.add("hidden");
  container.querySelector("#test-result").classList.add("hidden");
  currentEditId = null;
}

function fillForm(container, api) {
  container.querySelector("#api-name").value = api.name || "";
  container.querySelector("#api-base-url").value = api.baseUrl || "";
  container.querySelector("#api-key").value = api.apiKey || "";
  container.querySelector("#api-model").value = api.model || "";

  const tempSlider = container.querySelector("#api-temp");

  tempSlider.value = api.temperature ?? 0.7;

  container.querySelector("#temp-val").textContent = tempSlider.value;

  const streamCheck = container.querySelector("#api-stream");
  if (streamCheck) {
    streamCheck.checked = api.stream !== false;
  }
}

function readFormValues(container) {
  return {
    name: container.querySelector("#api-name").value.trim() || "Untitled",
    baseUrl: container.querySelector("#api-base-url").value.trim(),
    apiKey: container.querySelector("#api-key").value.trim(),
    model: container.querySelector("#api-model").value.trim(),
    temperature: parseFloat(container.querySelector("#api-temp").value),
    stream: container.querySelector("#api-stream")?.checked ?? true,
  };
}

async function saveCurrentForm(container) {
  const values = readFormValues(container);

  if (!values.baseUrl) {
    alert("Please enter a Base URL");
    return;
  }

  let config;
  if (currentEditId) {
    const existing = await getApiConfig(currentEditId);
    config = { ...existing, ...values };
  } else {
    config = createApiConfig(values);
  }

  await saveApiConfig(config);
  await saveSettings({ activeApiId: config.id });
  currentEditId = null;
  renderSettings(container);
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
