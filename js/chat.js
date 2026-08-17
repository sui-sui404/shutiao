/**
 * Chat — 聊天核心模块
 * 消息气泡 / 流式回复 / 会话管理 / Markdown / 消息操作
 */
import bus from "./eventBus.js";
import {
  getAllSessions,
  getSession,
  saveSession,
  deleteSession,
  getSessionMessages,
  addMessage,
  updateMessage,
  deleteMessage,
  deleteLastAssistantMessage,
  getSettings,
  getActiveApi,
  getCharacter,
  getPreset,
  getAllCharacters,
} from "./db.js";
import { createSession, createMessage } from "./models.js";
import { chatStream } from "./api.js";
import { buildCharacterPrompt } from "./character.js";

/* ── 颜文字/表情 快捷输入 ── */
const KAOMOJI = {
  "开心": ["(◕ᴗ◕✿)", "(≧▽≦)", "(✿◠‿◠)", "ヽ(>∀<☆)ノ", "(ᐡᐧﻌᐧᐡ)"],
  "难过": ["(╥_╥)", "(ಥ_ಥ)", "(;ω;)", "(T_T)", "( ´_ゝ`)"],
  "生气": ["(╬▔皿▔)╯", "(ノ`Д´)ノ", "(▀̿Ĺ̯▀̿ ̿)", "(`ε´)"],
  "害羞": ["(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)", "(〃ω〃)", "(/ω\)", "(///ˊㅿˋ///)"],
  "爱": ["(♥ω♥*)", "(◍•ᴗ•◍)❤", "(´,,•ω•,,)♡", "♡(ᐡ •ﻌ• ᐡ)♡"],
  "哭": ["(╥﹏╥)", "(;´༎ຶД༎ຶ`)", "(πーπ)", "·°̥̥̥̥̥̥̥(´∩ω∩`)"],
  "惊讶": ["(°△°|||)", "(ΩДΩ)", "∑(°口°๑)", "(⊙_⊙)"],
  "无语": ["(−_−)", "(¬_¬)", "( ˘_˘)", "(눈_눈)"],
  "可爱": ["(◕ᴗ◕✿)", "( ˘ ³˘)♥", "(⁎⁍̴̛ᴗ⁍̴̛⁎)", "ε=ε=(ノ≧∇≦)ノ"],
  "撒娇": ["(ᐡᐧﻌᐧᐡ)", "(´,,•ω•,,)", "( ˊ̱˂˃ˋ̱ )", "🥺"],
};


let activeSessionId = null;
let abortController = null;
let isStreaming = false;

export async function renderChat(container) {
  container.innerHTML = `
    <div class="chat-page">
      <!-- Session List View -->
      <div class="chat-sessions" id="chat-sessions">
        <div class="chat-sessions-header">
          <button class="chat-back-to-home" id="chat-close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="chat-sessions-title">Chats</span>
          <button class="chat-new-btn" id="new-session-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="session-list" id="session-list"></div>
        <!-- Contacts View -->
        <div class="chat-contacts-view hidden" id="chat-contacts-view">
          <div class="contacts-header">
            <span class="contacts-title">联系人</span>
            <button class="chat-new-btn" id="add-contact-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
          </div>
          <div class="contacts-list" id="contacts-list"><div class="empty-hint">还没有联系人，点 + 创建角色</div></div>
        </div>

        <!-- Moments View -->
        <div class="chat-moments-view hidden" id="chat-moments-view">
          <div class="contacts-header"><span class="contacts-title">朋友圈</span></div>
          <div class="empty-hint" style="padding:40px 0;text-align:center">Coming soon</div>
        </div>

        <!-- Me View -->
        <div class="chat-me-view hidden" id="chat-me-view">
          <div class="contacts-header"><span class="contacts-title">我</span></div>
          <div class="empty-hint" style="padding:40px 0;text-align:center">Coming soon</div>
        </div>

        <div class="chat-bottom-tabs">
          <button class="chat-tab active" data-tab="chats">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>聊天</span>
          </button>
          <button class="chat-tab" data-tab="contacts">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>联系人</span>
          </button>
          <button class="chat-tab" data-tab="moments">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>朋友圈</span>
          </button>
          <button class="chat-tab" data-tab="me">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>我</span>
          </button>
        </div>
      </div>

      <!-- Character Picker -->
      <div class="char-picker-overlay hidden" id="char-picker-overlay">
        <div class="char-picker-sheet">
          <div class="char-picker-header">
            <span class="char-picker-title">选择角色</span>
            <button class="modal-close" id="char-picker-close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="char-picker-list" id="char-picker-list"></div>
          <button class="char-picker-skip" id="char-picker-skip">不选角色，直接开始</button>
        </div>
      </div>

      <!-- Chat View -->
      <div class="chat-view hidden" id="chat-view">
        <div class="chat-topbar">
          <button class="chat-back-btn" id="chat-back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="chat-topbar-title" id="chat-topbar-title">Chat</span>
          <button class="chat-menu-btn" id="chat-menu-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="kaomoji-suggest hidden" id="kaomoji-suggest"></div>
        <div class="chat-input-area">
          <div class="chat-input-row1">
            <div class="chat-input-wrap"><textarea class="chat-input" id="chat-input" placeholder="输入消息..." rows="1"></textarea></div>
            <button class="chat-send-btn" id="chat-send-btn">发送</button>
          </div>
          <div class="chat-input-row2">
            <button class="chat-tool-btn" id="chat-voice-btn" title="语音"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>
            <button class="chat-tool-btn" id="chat-photo-btn" title="图片"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>
            <button class="chat-tool-btn" id="chat-emoji-btn" title="表情"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>
            <button class="chat-tool-btn" id="chat-narrate-btn" title="旁白"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
            <button class="chat-tool-btn" id="chat-plus-btn" title="更多"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
          </div>
        </div>
                <div class="chat-plus-menu hidden" id="chat-plus-menu">
          <div class="plus-menu-grid">
            <button class="plus-menu-item" data-action="photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Photo</span></button>
            <button class="plus-menu-item" data-action="image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>Image</span></button>
            <button class="plus-menu-item" data-action="voice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg><span>Voice</span></button>
            <button class="plus-menu-item" data-action="location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>Locate</span></button>
            <button class="plus-menu-item" data-action="redpacket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="12" cy="15" r="2"/></svg><span>RedPkt</span></button>
            <button class="plus-menu-item" data-action="transfer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>Trans</span></button>
            <button class="plus-menu-item" data-action="narrator"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>Narrat</span></button>
            <button class="plus-menu-item" data-action="reroll"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>Reroll</span></button>
            <button class="plus-menu-item" data-action="save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Save</span></button>
          </div>
        </div>
      </div>

      <!-- Search Page (WeChat style) -->
      <div class="chat-search-page hidden" id="chat-search-page">
        <div class="search-header">
          <div class="search-input-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="search-input" id="search-input" placeholder="搜索" autofocus />
          </div>
          <button class="search-cancel" id="search-cancel">取消</button>
        </div>
        <div class="search-results" id="search-results"></div>
      </div>

      <!-- Message context menu -->
      <div class="msg-context-menu hidden" id="msg-context-menu">
        <button class="msg-ctx-item" data-action="edit">Edit</button>
        <button class="msg-ctx-item" data-action="regen">Regenerate</button>
        <button class="msg-ctx-item" data-action="delete">Delete</button>
      </div>

      <!-- Chat top menu (replaces direct delete) -->
      <!-- Chat Detail Page (full page, like WeChat) -->
      <div class="chat-detail-page hidden" id="chat-detail-page">
        <div class="chat-topbar">
          <button class="chat-back-btn" id="detail-back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="chat-topbar-title">聊天信息</span>
          <div style="width:36px"></div>
        </div>
        <div class="detail-content">
          <div class="detail-avatar-section">
            <div class="detail-avatar" id="detail-avatar">?</div>
            <div class="detail-name" id="detail-name">New Chat</div>
          </div>
          <div class="detail-section">
            <button class="detail-item" data-action="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>查找聊天记录</span><svg class="detail-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <div class="detail-section">
            <div class="detail-item" style="cursor:default"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg><span>消息免打扰</span><label class="toggle-switch" style="margin-left:auto"><input type="checkbox" id="mute-toggle" /><span class="toggle-slider"></span></label></div>
            <div class="detail-item" style="cursor:default"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>置顶聊天</span><label class="toggle-switch" style="margin-left:auto"><input type="checkbox" id="pin-toggle" /><span class="toggle-slider"></span></label></div>
            <div class="detail-item" style="cursor:default"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>旁白模式</span><label class="toggle-switch" style="margin-left:auto"><input type="checkbox" id="narration-toggle" /><span class="toggle-slider"></span></label></div>
          </div>
          <div class="detail-section">
            <button class="detail-item" data-action="edit-remark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>修改备注</span><svg class="detail-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg></button>
            <button class="detail-item" data-action="char-info"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>角色信息</span><svg class="detail-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg></button>
            <button class="detail-item" data-action="chat-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>设置聊天背景</span><svg class="detail-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <div class="detail-section">
            <button class="detail-item" data-action="export"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>导出聊天记录</span><svg class="detail-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg></button>
            <button class="detail-item danger" data-action="clear-history"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>清空聊天记录</span></button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindChatEvents(container);
  await renderSessionList(container);

  // Back button closes the modal
  container.querySelector("#chat-close-btn")?.addEventListener("click", () => {
    if (window.MiMaShu?.closeModal) window.MiMaShu.closeModal();
  });

  // Bottom tab switching
  container.querySelectorAll(".chat-tab").forEach(tab => {
    tab.addEventListener("click", async () => {
      const target = tab.dataset.tab;
      container.querySelectorAll(".chat-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      container.querySelector(".chat-sessions-header").classList.add("hidden");
      container.querySelector("#session-list").classList.add("hidden");
      container.querySelector("#chat-contacts-view").classList.add("hidden");
      container.querySelector("#chat-moments-view").classList.add("hidden");
      container.querySelector("#chat-me-view").classList.add("hidden");
      if (target === "chats") {
        container.querySelector(".chat-sessions-header").classList.remove("hidden");
        container.querySelector("#session-list").classList.remove("hidden");
      } else if (target === "contacts") {
        container.querySelector("#chat-contacts-view").classList.remove("hidden");
        await renderContacts(container);
      } else if (target === "moments") {
        container.querySelector("#chat-moments-view").classList.remove("hidden");
      } else if (target === "me") {
        container.querySelector("#chat-me-view").classList.remove("hidden");
      }
    });
  });

  // Add contact button -> open Character app
  container.querySelector("#add-contact-btn")?.addEventListener("click", () => {
    if (window.MiMaShu?.closeModal) window.MiMaShu.closeModal();
    setTimeout(() => {
      const charIcon = document.querySelector('[data-app="Character"]');
      if (charIcon) charIcon.click();
    }, 300);
  });
}

/* ── Session List ── */
async function renderSessionList(container) {
  const list = container.querySelector("#session-list");
  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-hint">No chats yet. Tap + to start.</div>`;
    return;
  }

  let html = "";
  for (const s of sessions) {
    const msgs = await getSessionMessages(s.id);
    const lastMsg = msgs[msgs.length - 1];
    const preview = lastMsg
      ? truncate(lastMsg.content, 40)
      : "No messages yet";
    const timeStr = formatTime(s.updatedAt);
    const charName = s.characterId
      ? (await getCharacter(s.characterId))?.name || "Unknown"
      : s.mode === "ai" ? "AI" : "Chat";

    html += `
      <div class="session-card-wrapper" data-id="${s.id}">
        <div class="session-card" data-id="${s.id}">
          <div class="session-avatar">${charName.charAt(0).toUpperCase()}</div>
          <div class="session-info">
            <div class="session-top-row">
              <span class="session-name">${escHtml(s.title)}</span>
              <span class="session-time">${timeStr}</span>
            </div>
            <div class="session-preview">${escHtml(preview)}</div>
          </div>
        </div>
        <div class="session-swipe-actions">
          <button class="session-pin-btn" data-id="${s.id}"><svg viewBox="0 0 24 24"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>置顶</button>
          <button class="session-delete-btn" data-id="${s.id}"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除</button>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}

/* ── Chat View ── */
async function openChatView(container, sessionId) {
  try {
    activeSessionId = sessionId;
    const session = await getSession(sessionId);
    if (!session) { console.error("[Chat] session not found:", sessionId); return; }

    container.querySelector("#chat-sessions").classList.add("hidden");
    container.querySelector("#chat-view").classList.remove("hidden");
    let displayTitle = session.title;
    if (session.characterId) {
      const char = await getCharacter(session.characterId);
      if (char?.name) displayTitle = char.name;
    }
    container.querySelector("#chat-topbar-title").textContent = displayTitle;

    await renderMessages(container);
    autoResizeInput(container.querySelector("#chat-input"));
  } catch (err) {
    console.error("[Chat] openChatView error:", err);
    container.querySelector("#chat-sessions").classList.remove("hidden");
    container.querySelector("#chat-view").classList.add("hidden");
  }
}

function closeChatView(container) {
  if (isStreaming && abortController) {
    abortController.abort();
    isStreaming = false;
  }
  activeSessionId = null;
  container.querySelector("#chat-view").classList.add("hidden");
  container.querySelector("#chat-sessions").classList.remove("hidden");
  renderSessionList(container);
}

/* ── Messages Rendering ── */
async function renderMessages(container) {
  const msgContainer = container.querySelector("#chat-messages");
  if (!activeSessionId) return;

  const messages = await getSessionMessages(activeSessionId);

  if (messages.length === 0) {
    msgContainer.innerHTML = `<div class="chat-empty">Start a conversation...</div>`;
    return;
  }

  msgContainer.innerHTML = messages
    .map(
      (msg) => `
    <div class="msg-row ${msg.role}" data-msgid="${msg.id}">
      <div class="msg-bubble ${msg.role}">
        <div class="msg-content">${renderMarkdown(msg.content)}</div>
        <div class="msg-meta">
          ${msg.isEdited ? '<span class="msg-edited">edited</span>' : ""}
          <span class="msg-time">${formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  scrollToBottom(msgContainer);
}

/* ── Send Message ── */
async function sendMessage(container) {
  if (isStreaming) return;

  const input = container.querySelector("#chat-input");
  const text = input.value.trim();
  if (!text || !activeSessionId) return;

  input.value = "";
  input.style.height = "auto";

  const api = await getActiveApi();
  if (!api) {
    alert("Please configure an API in Settings first.");
    return;
  }

  const userMsg = createMessage({
    sessionId: activeSessionId,
    role: "user",
    content: text,
  });
  await addMessage(userMsg);

  const msgContainer = container.querySelector("#chat-messages");
  appendMessageBubble(msgContainer, userMsg);
  scrollToBottom(msgContainer);

  await generateReply(container);
}

async function generateReply(container) {
  const msgContainer = container.querySelector("#chat-messages");
  const session = await getSession(activeSessionId);
  if (!session) return;

  const systemPrompt = await buildSystemPrompt(session);
  const history = await getSessionMessages(activeSessionId);

  const apiMessages = [];
  if (systemPrompt) {
    apiMessages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    apiMessages.push({ role: m.role, content: m.content });
  }

  const assistantMsg = createMessage({
    sessionId: activeSessionId,
    role: "assistant",
    content: "",
  });

  appendMessageBubble(msgContainer, assistantMsg);
  const bubbleContent = msgContainer.querySelector(
    `[data-msgid="${assistantMsg.id}"] .msg-content`
  );

  isStreaming = true;
  abortController = new AbortController();
  const sendBtn = container.querySelector("#chat-send-btn");
  sendBtn.disabled = true;

  try {
    const fullText = await chatStream(
      apiMessages,
      {},
      (chunk, accumulated) => {
        assistantMsg.content = accumulated;
        bubbleContent.innerHTML = renderMarkdown(accumulated) + '<span class="typing-cursor"></span>';
        scrollToBottom(msgContainer);
      },
      abortController.signal
    );

    assistantMsg.content = fullText;
    bubbleContent.innerHTML = renderMarkdown(fullText);
    await addMessage(assistantMsg);

    if (history.length <= 1 && !session.characterId) {
      const title = fullText.slice(0, 30).replace(/\n/g, " ") || "Chat";
      await saveSession({ ...session, title });
      container.querySelector("#chat-topbar-title").textContent = title;
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      bubbleContent.innerHTML = `<span class="msg-error">Error: ${escHtml(err.message)}</span>`;
    }
  } finally {
    isStreaming = false;
    abortController = null;
    sendBtn.disabled = false;
  }
}

async function buildSystemPrompt(session) {
  const parts = [];
  const settings = await getSettings();

  if (session.mode === "ai" || settings.chatMode === "ai") {
    parts.push("You are a caring and warm AI companion in a romantic relationship with the user. Be natural, affectionate, and genuine.");
  }

  if (session.characterId) {
    const char = await getCharacter(session.characterId);
    if (char) {
      const charPrompt = buildCharacterPrompt(char);
      if (charPrompt) parts.push(charPrompt);
      if (char.presetId) {
        const preset = await getPreset(char.presetId);
        if (preset?.systemPrompt) parts.push(preset.systemPrompt);
      }
    }
  }

  return parts.join("\n\n") || null;
}

/* ── DOM Helpers ── */
function appendMessageBubble(msgContainer, msg) {
  const emptyHint = msgContainer.querySelector(".chat-empty");
  if (emptyHint) emptyHint.remove();

  const row = document.createElement("div");
  row.className = `msg-row ${msg.role}`;
  row.dataset.msgid = msg.id;
  row.innerHTML = `
    <div class="msg-bubble ${msg.role}">
      <div class="msg-content">${renderMarkdown(msg.content) || "&nbsp;"}</div>
      <div class="msg-meta">
        <span class="msg-time">${formatTime(msg.timestamp)}</span>
      </div>
    </div>
  `;
  msgContainer.appendChild(row);
}

function scrollToBottom(el) {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function autoResizeInput(textarea) {
  if (!textarea) return;
  const sendBtn = textarea.closest(".chat-input-area")?.querySelector(".chat-send-btn");
  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    if (sendBtn) {
      if (textarea.value.trim()) sendBtn.classList.add("has-text");
      else sendBtn.classList.remove("has-text");
    }
  };
  textarea.addEventListener("input", resize);
}

/* ── Markdown (lightweight) ── */
function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```([\s\S]*?)```/g, '<pre class="md-code-block">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

/* ── Context Menu (long press) ── */
let longPressTimer = null;
let contextMsgId = null;

function showContextMenu(container, msgId, x, y) {
  const menu = container.querySelector("#msg-context-menu");
  contextMsgId = msgId;

  const rect = container.getBoundingClientRect();
  menu.style.left = Math.min(x - rect.left, rect.width - 140) + "px";
  menu.style.top = (y - rect.top) + "px";
  menu.classList.remove("hidden");
}

function hideContextMenu(container) {
  container.querySelector("#msg-context-menu")?.classList.add("hidden");
  contextMsgId = null;
}

/* ── Event Bindings ── */
function bindChatEvents(container) {
  initKaomojiSuggest(container);
  // New session
  container.querySelector("#new-session-btn").addEventListener("click", async () => {
    const chars = await getAllCharacters();
    if (chars.length === 0) {
      const settings = await getSettings();
      const session = createSession({ mode: settings.chatMode || "character" });
      await saveSession(session);
      await renderSessionList(container);
      openChatView(container, session.id);
    } else {
      showCharPicker(container, chars);
    }
  });

  // Click session
  container.querySelector("#session-list").addEventListener("click", (e) => {
    const card = e.target.closest(".session-card");
    if (card) openChatView(container, card.dataset.id);
  });

  // Back button
  container.querySelector("#chat-back-btn").addEventListener("click", () => {
    closeChatView(container);
  });

  // Send
  container.querySelector("#chat-send-btn").addEventListener("click", () => {
    sendMessage(container);
  });

  // Enter to send (shift+enter for newline)
  container.querySelector("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(container);
    }
  });

  // Stop streaming on send button click while streaming
  container.querySelector("#chat-send-btn").addEventListener("click", () => {
    if (isStreaming && abortController) {
      abortController.abort();
    }
  });

  // Long press on message (touch)
  container.querySelector("#chat-messages").addEventListener("touchstart", (e) => {
    const bubble = e.target.closest(".msg-bubble");
    if (!bubble) return;
    const msgId = bubble.closest(".msg-row")?.dataset.msgid;
    if (!msgId) return;

    longPressTimer = setTimeout(() => {
      const touch = e.touches[0];
      showContextMenu(container, msgId, touch.clientX, touch.clientY);
    }, 500);
  });

  container.querySelector("#chat-messages").addEventListener("touchend", () => {
    clearTimeout(longPressTimer);
  });

  // Right click on message (desktop)
  container.querySelector("#chat-messages").addEventListener("contextmenu", (e) => {
    const bubble = e.target.closest(".msg-bubble");
    if (!bubble) return;
    e.preventDefault();
    const msgId = bubble.closest(".msg-row")?.dataset.msgid;
    if (msgId) showContextMenu(container, msgId, e.clientX, e.clientY);
  });

  // Close context menu on tap elsewhere
  container.addEventListener("click", (e) => {
    if (!e.target.closest(".msg-context-menu")) {
      hideContextMenu(container);
    }
  });

  // Context menu actions
  container.querySelector("#msg-context-menu").addEventListener("click", async (e) => {
    const action = e.target.closest(".msg-ctx-item")?.dataset.action;
    if (!action || !contextMsgId) return;

    if (action === "delete") {
      await deleteMessage(contextMsgId);
      await renderMessages(container);
    } else if (action === "regen") {
      await deleteLastAssistantMessage(activeSessionId);
      await renderMessages(container);
      await generateReply(container);
    } else if (action === "edit") {
      const msgs = await getSessionMessages(activeSessionId);
      const msg = msgs.find((m) => m.id === contextMsgId);
      if (msg && msg.role === "user") {
        const newText = prompt("Edit message:", msg.content);
        if (newText !== null && newText.trim()) {
          await updateMessage(contextMsgId, { content: newText.trim() });
          await renderMessages(container);
        }
      }
    }

    hideContextMenu(container);
  });

  // Session card: swipe-to-delete + tap to open + delete button
  const sessionList = container.querySelector("#session-list");
  let swipeStartX = 0;
  let swipingCard = null;

  sessionList.addEventListener("touchstart", (e) => {
    const wrapper = e.target.closest(".session-card-wrapper");
    if (!wrapper) return;
    swipeStartX = e.touches[0].clientX;
    swipingCard = wrapper;
  });

  sessionList.addEventListener("touchmove", (e) => {
    if (!swipingCard) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const card = swipingCard.querySelector(".session-card");
    if (dx < -10) {
      const offset = Math.max(dx, -140);
      card.style.transform = `translateX(${offset}px)`;
      card.style.transition = "none";
    } else {
      card.style.transform = "";
      card.style.transition = "";
    }
  });

  sessionList.addEventListener("touchend", () => {
    if (!swipingCard) return;
    const card = swipingCard.querySelector(".session-card");
    const current = parseFloat(card.style.transform.replace(/[^-\d.]/g, "")) || 0;
    if (current < -60) {
      card.style.transform = "translateX(-140px)";
      card.style.transition = "transform 0.2s ease";
    } else {
      card.style.transform = "";
      card.style.transition = "transform 0.2s ease";
    }
    swipingCard = null;
  });

  sessionList.addEventListener("click", async (e) => {
    const pinBtn = e.target.closest(".session-pin-btn");
    if (pinBtn) {
      e.stopPropagation();
      const session = await getSession(pinBtn.dataset.id);
      if (session) {
        session.pinned = !session.pinned;
        await saveSession(session);
        await renderSessionList(container);
      }
      return;
    }
    const delBtn = e.target.closest(".session-delete-btn");
    if (delBtn) {
      e.stopPropagation();
      if (confirm("确定删除这个聊天吗？")) {
        await deleteSession(delBtn.dataset.id);
        await renderSessionList(container);
      }
      return;
    }
  });

  // Chat menu button → open detail page
  container.querySelector("#chat-menu-btn").addEventListener("click", async () => {
    if (!activeSessionId) return;
    const session = await getSession(activeSessionId);
    if (!session) return;
    let displayName = session.title;
    let avatarLetter = "?";
    if (session.characterId) {
      const char = await getCharacter(session.characterId);
      if (char?.name) { displayName = char.name; avatarLetter = char.name.charAt(0).toUpperCase(); }
    } else {
      avatarLetter = displayName.charAt(0).toUpperCase();
    }
    container.querySelector("#detail-name").textContent = displayName;
    container.querySelector("#detail-avatar").textContent = avatarLetter;
    container.querySelector("#chat-view").classList.add("hidden");
    container.querySelector("#chat-detail-page").classList.remove("hidden");
  });

  // Detail page back
  container.querySelector("#detail-back-btn")?.addEventListener("click", () => {
    container.querySelector("#chat-detail-page").classList.add("hidden");
    container.querySelector("#chat-view").classList.remove("hidden");
  });

  // Detail page actions
  container.querySelector("#chat-detail-page")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".detail-item");
    if (!item) return;
    const action = item.dataset.action;

    if (false) { /* removed old edit-title */
    } else if (action === "edit-remark") {
      const session = await getSession(activeSessionId);
      if (!session) return;
      const newRemark = prompt("修改备注：", session.title);
      if (newRemark !== null && newRemark.trim()) {
        session.title = newRemark.trim();
        await saveSession(session);
        container.querySelector("#detail-name").textContent = session.title;
        container.querySelector("#chat-topbar-title").textContent = session.title;
      }
    } else if (action === "char-info") {
      const session = await getSession(activeSessionId);
      if (session?.characterId) {
        const char = await getCharacter(session.characterId);
        if (char) {
          alert(`角色：${char.name}\n描述：${char.description || "无"}\n性格：${char.personality || "无"}`);
        }
      } else {
        alert("当前聊天未绑定角色");
      }
    } else if (action === "chat-bg") {
      alert("设置聊天背景 - Coming soon!");
    } else if (action === "export") {
      const msgs = await getSessionMessages(activeSessionId);
      const text = msgs.map(m => `[${m.role}] ${m.content}`).join("\n\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `聊天记录导出-${Date.now()}.txt`; a.click();
      URL.revokeObjectURL(url);
    } else if (action === "search") {
      container.querySelector("#chat-detail-page").classList.add("hidden");
      showSearchPage(container);
    } else if (action === "clear-history") {
      if (confirm("确定清空所有聊天记录吗？")) {
        const msgs = await getSessionMessages(activeSessionId);
        for (const m of msgs) await deleteMessage(m.id);
        await renderMessages(container);
        container.querySelector("#chat-detail-page").classList.add("hidden");
        container.querySelector("#chat-view").classList.remove("hidden");
      }
    }
  });

  // Character picker events
  container.querySelector("#char-picker-close")?.addEventListener("click", () => {
    hideCharPicker(container);
  });

  container.querySelector("#char-picker-skip")?.addEventListener("click", async () => {
    hideCharPicker(container);
    const settings = await getSettings();
    const session = createSession({ mode: settings.chatMode || "character" });
    await saveSession(session);
    await renderSessionList(container);
    openChatView(container, session.id);
  });

  container.querySelector("#char-picker-list")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".char-picker-item");
    if (!item) return;
    const charId = item.dataset.charid;
    const char = await getCharacter(charId);
    hideCharPicker(container);

    const session = createSession({
      title: char?.name || "New Chat",
      characterId: charId,
      mode: "character",
    });
    await saveSession(session);

    if (char?.firstMessage) {
      const firstMsg = createMessage({
        sessionId: session.id,
        role: "assistant",
        content: char.firstMessage,
      });
      await addMessage(firstMsg);
    }

    await renderSessionList(container);
    openChatView(container, session.id);
  });

  // Plus menu toggle
  container.querySelector("#chat-plus-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    container.querySelector("#chat-plus-menu")?.classList.toggle("hidden");
  });

  // Narrate button (Coming soon)
  container.querySelector("#chat-narrate-btn")?.addEventListener("click", () => {
    alert("旁白模式 - Coming soon!");
  });

  // Photo button (Coming soon)
  container.querySelector("#chat-photo-btn")?.addEventListener("click", () => {
    alert("发送图片 - Coming soon!");
  });

  // Voice button (Coming soon)
  container.querySelector("#chat-voice-btn")?.addEventListener("click", () => {
    alert("语音消息 - Coming soon!");
  });

  // Emoji button toggle
  container.querySelector("#chat-emoji-btn")?.addEventListener("click", () => {
    const suggest = container.querySelector("#kaomoji-suggest");
    if (suggest) {
      if (suggest.classList.contains("hidden")) {
        const allKaomoji = Object.entries(KAOMOJI).flatMap(([k, list]) => list.map(v => ({ keyword: k, kaomoji: v })));
        suggest.innerHTML = allKaomoji.slice(0, 20).map(m =>
          `<button class="kaomoji-item" data-val="${m.kaomoji.replace(/"/g, '&quot;')}">${m.kaomoji}</button>`
        ).join("");
        suggest.classList.remove("hidden");
      } else {
        suggest.classList.add("hidden");
      }
    }
  });

  // Plus menu items - coming soon handler
  container.querySelector("#chat-plus-menu")?.addEventListener("click", (e) => {
    const item = e.target.closest(".plus-menu-item");
    if (!item) return;
    const action = item.dataset.action;
    if (action === "reroll") {
      deleteLastAssistantMessage(activeSessionId).then(() => {
        renderMessages(container).then(() => generateReply(container));
      });
    } else {
      alert("Coming soon!");
    }
    container.querySelector("#chat-plus-menu")?.classList.add("hidden");
  });

  // Close plus menu when tapping elsewhere
  container.addEventListener("click", (e) => {
    if (!e.target.closest("#chat-plus-menu") && !e.target.closest("#chat-plus-btn")) {
      container.querySelector("#chat-plus-menu")?.classList.add("hidden");
    }
  });
}



/* ── 颜文字建议 ── */
function initKaomojiSuggest(container) {
  const input = container.querySelector("#chat-input");
  const suggestEl = container.querySelector("#kaomoji-suggest");
  if (!input || !suggestEl) return;

  input.addEventListener("input", () => {
    const text = input.value;
    const matches = [];
    for (const [keyword, list] of Object.entries(KAOMOJI)) {
      if (text.includes(keyword)) {
        matches.push(...list.map(k => ({ keyword, kaomoji: k })));
      }
    }
    if (matches.length === 0) {
      suggestEl.classList.add("hidden");
      return;
    }
    suggestEl.innerHTML = matches.slice(0, 8).map(m =>
      `<button class="kaomoji-item" data-val="${m.kaomoji.replace(/"/g, '&quot;')}">${m.kaomoji}</button>`
    ).join("");
    suggestEl.classList.remove("hidden");
  });

  suggestEl.addEventListener("click", (e) => {
    const item = e.target.closest(".kaomoji-item");
    if (!item) return;
    const val = item.dataset.val;
    // Replace the keyword in input with the kaomoji
    for (const keyword of Object.keys(KAOMOJI)) {
      if (input.value.includes(keyword)) {
        input.value = input.value.replace(keyword, val);
        break;
      }
    }
    suggestEl.classList.add("hidden");
    input.focus();
  });
}
/* ── Character Picker ── */
function showCharPicker(container, chars) {
  const overlay = container.querySelector("#char-picker-overlay");
  const list = container.querySelector("#char-picker-list");

  list.innerHTML = chars.map(c => {
    const letter = c.avatar || c.name.charAt(0).toUpperCase() || "?";
    const desc = c.description || c.personality || "";
    const preview = desc.length > 40 ? desc.slice(0, 40) + "..." : desc;
    return `
      <div class="char-picker-item" data-charid="${c.id}">
        <div class="session-avatar">${escHtml(letter)}</div>
        <div class="char-picker-info">
          <div class="char-picker-name">${escHtml(c.name)}</div>
          <div class="char-picker-desc">${escHtml(preview || "No description")}</div>
        </div>
      </div>
    `;
  }).join("");

  overlay.classList.remove("hidden");
}

function hideCharPicker(container) {
  container.querySelector("#char-picker-overlay")?.classList.add("hidden");
}


/* ── Contacts List ── */
async function renderContacts(container) {
  const list = container.querySelector("#contacts-list");
  const chars = await getAllCharacters();
  if (chars.length === 0) {
    list.innerHTML = '<div class="empty-hint">还没有联系人，点右上角 + 创建角色</div>';
    return;
  }
  list.innerHTML = chars.map(c => {
    const letter = c.name ? c.name.charAt(0).toUpperCase() : "?";
    return `<div class="contact-card" data-charid="${c.id}"><div class="session-avatar">${escHtml(letter)}</div><div class="contact-info"><div class="contact-name">${escHtml(c.name)}</div><div class="contact-desc">${escHtml(c.description || c.personality || "")}</div></div></div>`;
  }).join("");

  list.onclick = async (e) => {
    const card = e.target.closest(".contact-card");
    if (!card) return;
    const charId = card.dataset.charid;
    const char = await getCharacter(charId);
    const session = createSession({ title: char?.name || "New Chat", characterId: charId, mode: "character" });
    await saveSession(session);
    if (char?.firstMessage) {
      const firstMsg = createMessage({ sessionId: session.id, role: "assistant", content: char.firstMessage });
      await addMessage(firstMsg);
    }
    container.querySelector("#chat-contacts-view").classList.add("hidden");
    container.querySelector(".chat-sessions-header").classList.remove("hidden");
    container.querySelector("#session-list").classList.remove("hidden");
    container.querySelectorAll(".chat-tab").forEach(t => t.classList.remove("active"));
    container.querySelector('[data-tab="chats"]').classList.add("active");
    await renderSessionList(container);
    openChatView(container, session.id);
  };
}
/* ── Search Page (WeChat style) ── */
function showSearchPage(container) {
  const page = container.querySelector("#chat-search-page");
  const input = container.querySelector("#search-input");
  const results = container.querySelector("#search-results");
  container.querySelector("#chat-view").classList.add("hidden");
  page.classList.remove("hidden");
  results.innerHTML = "";
  input.value = "";
  setTimeout(() => input.focus(), 100);

  const doSearch = async () => {
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) { results.innerHTML = ""; return; }
    const msgs = await getSessionMessages(activeSessionId);
    const found = msgs.filter(m => m.content.toLowerCase().includes(keyword));
    if (found.length === 0) {
      results.innerHTML = '<div class="search-empty">没有找到相关消息</div>';
      return;
    }
    results.innerHTML = found.map(m => {
      const highlighted = escHtml(m.content).replace(new RegExp("(" + keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), '<mark>$1</mark>');
      const roleLabel = m.role === "user" ? "我" : "角色";
      return `<div class="search-result-item"><div class="search-result-role">${roleLabel}</div><div class="search-result-text">${highlighted}</div><div class="search-result-time">${formatTime(m.timestamp)}</div></div>`;
    }).join("");
  };

  input.oninput = doSearch;

  container.querySelector("#search-cancel").onclick = () => {
    page.classList.add("hidden");
    container.querySelector("#chat-view").classList.remove("hidden");
  };
}
/* ── Utilities ── */
function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}