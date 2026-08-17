/**
 * Presets — 预设系统（占位 UI）
 * 管理 prompt 模板，控制 AI 回复风格（旁白、双语、语气等）
 */
import bus from "./eventBus.js";

export function renderPresets(container) {
  container.innerHTML = `
    <div class="presets-page">
      <div class="presets-header">
        <span class="presets-title">Presets</span>
      </div>

      <!-- 内置预设 -->
      <div class="presets-section">
        <div class="presets-section-title">Built-in</div>
        <div class="preset-card active">
          <div class="preset-card-left">
            <div class="preset-card-name">Default</div>
            <div class="preset-card-desc">Standard chat mode</div>
          </div>
          <div class="preset-card-right">
            <span class="active-badge">Active</span>
          </div>
        </div>
        <div class="preset-card">
          <div class="preset-card-left">
            <div class="preset-card-name">Narrator</div>
            <div class="preset-card-desc">Chat + narration / actions</div>
          </div>
          <div class="preset-card-right"></div>
        </div>
        <div class="preset-card">
          <div class="preset-card-left">
            <div class="preset-card-name">Bilingual</div>
            <div class="preset-card-desc">Dual language with translation</div>
          </div>
          <div class="preset-card-right"></div>
        </div>
        <div class="preset-card">
          <div class="preset-card-left">
            <div class="preset-card-name">Narrator + Bilingual</div>
            <div class="preset-card-desc">Full RP with translation</div>
          </div>
          <div class="preset-card-right"></div>
        </div>
      </div>

      <!-- 自定义预设 -->
      <div class="presets-section">
        <div class="presets-section-title">Custom</div>
        <div class="presets-empty">No custom presets yet</div>
        <button class="settings-btn primary" id="add-preset-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Preset
        </button>
      </div>

      <!-- 预设编辑区域（占位） -->
      <div class="presets-section presets-edit hidden" id="preset-edit-section">
        <div class="presets-section-title">Edit Preset</div>

        <label class="field-label">Name</label>
        <input type="text" class="field-input" id="preset-name" placeholder="My Preset" />

        <label class="field-label">System Prompt</label>
        <textarea class="field-textarea" id="preset-system" rows="6" placeholder="You are a character who..."></textarea>

        <label class="field-label">Narrator Style</label>
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

        <div class="form-actions">
          <button class="settings-btn" id="preset-cancel-btn">Cancel</button>
          <button class="settings-btn primary" id="preset-save-btn">Save</button>
        </div>
      </div>
    </div>
  `;

  // 占位事件
  container.querySelector("#add-preset-btn")?.addEventListener("click", () => {
    container.querySelector("#preset-edit-section")?.classList.toggle("hidden");
  });

  container.querySelector("#preset-cancel-btn")?.addEventListener("click", () => {
    container.querySelector("#preset-edit-section")?.classList.add("hidden");
  });

  container.querySelector("#preset-save-btn")?.addEventListener("click", () => {
    alert("Preset saved! (Coming soon - data storage)");
    container.querySelector("#preset-edit-section")?.classList.add("hidden");
  });

  // 点击预设卡片切换 active
  container.querySelectorAll(".preset-card").forEach(card => {
    card.addEventListener("click", () => {
      container.querySelectorAll(".preset-card").forEach(c => {
        c.classList.remove("active");
        c.querySelector(".preset-card-right").innerHTML = "";
      });
      card.classList.add("active");
      card.querySelector(".preset-card-right").innerHTML = '<span class="active-badge">Active</span>';
    });
  });
}
