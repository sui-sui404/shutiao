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
  saveMoment,
  getAllMoments,
  deleteMoment,
  getMoment,
  getAllMasks,
  getMask,
  saveMask,
  deleteMask,
} from "./db.js";
import { createSession, createMessage, createMoment, createMask, createSticker } from "./models.js";
import { chatStream } from "./api.js";
import { getActivePresetId, getBuiltinPreset } from "./presets.js";
import { getLoreForPrompt } from "./lore.js";
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
          <div class="moments-scroll">
            <div class="moments-cover" id="moments-cover-area">
              <button class="moments-camera-float" id="moments-camera-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <div class="moments-cover-info">
                <span class="moments-cover-name" id="moments-cover-name">User</span>
                <div class="moments-cover-avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              </div>
            </div>
            <div class="moments-feed" id="moments-feed">
              <div class="empty-hint" style="padding:40px 0;text-align:center">还没有动态</div>
            </div>
          </div>

          <!-- FAB Post Button (角色发帖) -->
          <div class="moments-fab" id="moments-fab-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>

          <!-- Batch Character Post Picker -->
          <div class="char-post-picker hidden" id="char-post-picker">
            <div class="char-post-picker-header">
              <button class="char-post-picker-close" id="cpp-close">×</button>
              <span class="char-post-picker-title">角色发帖</span>
            </div>
            <div class="char-post-picker-list" id="cpp-list"></div>
            <div class="cpp-bottom">
              <div class="cpp-count-row">
                <span>每个角色生成</span>
                <select class="cpp-count-select" id="cpp-count">
                  <option value="1">1条</option>
                  <option value="2">2条</option>
                  <option value="3">3条</option>
                </select>
              </div>
              <div class="cpp-npc-comment-row">
                <label><input type="checkbox" id="cpp-npc-comment" checked> 同时生成NPC评论</label>
              </div>
              <div class="cpp-actions">
                <button class="settings-btn primary" id="cpp-start">开始生成</button>
                <button class="settings-btn" id="cpp-cancel2">取消</button>
              </div>
              <div class="cpp-progress hidden" id="cpp-progress">
                <span id="cpp-progress-text">生成中...</span>
              </div>
            </div>
          </div>

          <!-- Full-page Post Overlay (WeChat style) -->
          <div class="moments-post-page hidden" id="moments-post-page">
            <div class="moments-post-topbar">
              <button class="moments-post-cancel" id="mpp-cancel">取消</button>
              <button class="moments-post-submit" id="mpp-submit">发表</button>
            </div>
            <textarea class="moments-post-textarea" id="mpp-text" placeholder="这一刻的想法..." rows="5"></textarea>
            <div class="moments-post-img-area" id="mpp-images">
              <div class="moments-post-add-img" id="mpp-add-img">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
            </div>
            <div class="moments-post-options">
              <div class="mpp-option-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>所在位置</span>
                <span class="mpp-option-value">即将开放</span>
              </div>
            </div>
          </div>
        </div>

                <!-- Me View -->
        <div class="chat-me-view hidden" id="chat-me-view">
          <div class="me-scroll">
            <div class="me-profile-card">
              <div class="me-avatar">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div class="me-profile-info">
                <span class="me-nickname">User</span>
                <span class="me-id">点击编辑</span>
              </div>
              <svg class="me-profile-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg>
            </div>

            <!-- Mask Management Section -->
            <div class="me-section">
              <div class="me-section-header">
                <span class="me-section-title">面具</span>
                <button class="chat-new-btn" id="add-mask-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
              <div class="me-mask-list" id="me-mask-list">
                <div class="empty-hint">还没有面具，点 + 创建一个吧</div>
              </div>
            </div>

            <!-- Mask Edit Panel (hidden by default) -->
            <div class="me-mask-edit hidden" id="me-mask-edit">
              <div class="me-section-header">
                <span class="me-section-title" id="mask-edit-title">新建面具</span>
                <button class="chat-new-btn" id="mask-edit-close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <label class="field-label">名称</label>
              <input type="text" class="field-input" id="mask-name-input" placeholder="你的昵称" />
              <label class="field-label">描述</label>
              <textarea class="field-input field-textarea" id="mask-desc-input" placeholder="人设描述..." rows="4"></textarea>
              <div class="form-actions" style="margin-top:12px">
                <button class="settings-btn primary" id="mask-save-btn">保存</button>
                <button class="settings-btn danger hidden" id="mask-delete-btn">删除</button>
              </div>
            </div>

            <div class="me-menu">
              <div class="me-menu-item" data-action="favorites">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>收藏</span>
                <svg class="me-menu-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
                            <div class="me-menu-item" data-action="about">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>关于</span>
                <svg class="me-menu-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
        </div>
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
        <div class="emoji-panel hidden" id="emoji-panel">
          <div class="emoji-tabs">
            <button class="emoji-tab active" data-etab="emoji">Emoji</button>
            <button class="emoji-tab" data-etab="kaomoji">颜文字</button>
            <button class="emoji-tab" data-etab="sticker">表情包</button>
          </div>
          <div class="emoji-content" id="emoji-content">
            <!-- Emoji tab -->
            <div class="emoji-grid" id="emoji-grid-emoji">
              ${["😀","😂","🥹","😍","🥰","😘","😊","🤗","🤔","😏","😢","😭","😤","😡","🥺","😳","🤭","😴","🤮","👻","💀","🤡","👽","🫶","❤️","🔥","💔","✨","🎉","👍","👎","🙏","💪","🤝","👋","✌️","🫰","👀","🧠","💬","📸","🎵","🌙","☀️","🌈","🍑","🍓","🧸","🐱","🐶"].map(e => `<button class="emoji-item" data-val="${e}">${e}</button>`).join("")}
            </div>
            <!-- 颜文字 tab -->
            <div class="emoji-grid hidden" id="emoji-grid-kaomoji"></div>
            <!-- 表情包 tab -->
            <div class="emoji-sticker-tab hidden" id="emoji-grid-sticker">
              <div class="sticker-search-wrap"><input type="text" class="sticker-search" id="sticker-search" placeholder="Search stickers..." /></div>
              <div class="sticker-grid" id="sticker-grid"><div class="empty-hint">No stickers yet</div></div>
              <button class="settings-btn" id="add-sticker-btn">+ Add Stickers</button>
            </div>
          </div>
        </div>
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
            <button class="plus-menu-item" data-action="videocall"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span>视频通话</span></button>
            <button class="plus-menu-item" data-action="voicecall"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.3 1.88.56 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.93.26 1.91.44 2.81.56A2 2 0 0 1 22 16.92z"/></svg><span>语音通话</span></button>
            <button class="plus-menu-item" data-action="location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>位置</span></button>
            <button class="plus-menu-item" data-action="redpacket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="12" cy="15" r="2"/></svg><span>红包</span></button>
            <button class="plus-menu-item" data-action="transfer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>转账</span></button>
            <button class="plus-menu-item" data-action="save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>保存</span></button>
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
        <button class="msg-ctx-item" data-action="copy">复制</button>
        <button class="msg-ctx-item" data-action="quote">引用</button>
        <button class="msg-ctx-item" data-action="edit">编辑</button>
        <button class="msg-ctx-item" data-action="regen">重roll</button>
        <button class="msg-ctx-item" data-action="regen-from">从此处重roll</button>
        <button class="msg-ctx-item" data-action="delete">删除</button>
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

  try { bindChatEvents(container); } catch(e) { console.error("bindChatEvents error:", e); }
  try { await renderSessionList(container); } catch(e) { console.error("renderSessionList error:", e); }

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
        try { await renderMomentsFeed(container); } catch(e) { console.error("renderMomentsFeed error:", e); }
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

      // Me profile click -> edit user info
  container.querySelector(".me-profile-card")?.addEventListener("click", () => {
    const nickname = prompt("\u8f93\u5165\u6635\u79f0\uff1a", container.querySelector(".me-nickname")?.textContent || "User");
    if (nickname && nickname.trim()) {
      container.querySelector(".me-nickname").textContent = nickname.trim();
      localStorage.setItem("user-nickname", nickname.trim());
    }
  });

  // Restore saved nickname
  const savedNick = localStorage.getItem("user-nickname");
  if (savedNick) {
    const nickEl = container.querySelector(".me-nickname");
    if (nickEl) nickEl.textContent = savedNick;
  }

  // Me page menu handlers
  container.querySelectorAll(".me-menu-item").forEach(item => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      if (action === "about") {
        alert("Mi Ma Shu\nVersion 0.2.0");
      } else {
        alert("即将开放");
      }
    });
  });

  try {
  // ── Mask Management ──
  let editingMaskId = null;

  async function renderMaskList() {
    const listEl = container.querySelector("#me-mask-list");
    const masks = await getAllMasks();
    if (masks.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">\u8fd8\u6ca1\u6709\u9762\u5177\uff0c\u70b9 + \u521b\u5efa\u4e00\u4e2a\u5427</div>';
      return;
    }
    listEl.innerHTML = masks.map(m => `
      <div class="mask-card" data-maskid="${m.id}">
        <div class="mask-card-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="mask-card-info">
          <div class="mask-card-name">${escHtml(m.name)}</div>
          <div class="mask-card-desc">${escHtml(m.description ? m.description.slice(0, 50) : "\u65e0\u63cf\u8ff0")}</div>
        </div>
        <svg class="me-menu-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `).join("");

    listEl.querySelectorAll(".mask-card").forEach(card => {
      card.addEventListener("click", async () => {
        const mask = await getMask(card.dataset.maskid);
        if (!mask) return;
        editingMaskId = mask.id;
        container.querySelector("#mask-edit-title").textContent = "\u7f16\u8f91\u9762\u5177";
        container.querySelector("#mask-name-input").value = mask.name;
        container.querySelector("#mask-desc-input").value = mask.description || "";
        container.querySelector("#mask-delete-btn").classList.remove("hidden");
        container.querySelector("#me-mask-edit").classList.remove("hidden");
      });
    });
  }

  container.querySelector("#add-mask-btn")?.addEventListener("click", () => {
    editingMaskId = null;
    container.querySelector("#mask-edit-title").textContent = "\u65b0\u5efa\u9762\u5177";
    container.querySelector("#mask-name-input").value = "";
    container.querySelector("#mask-desc-input").value = "";
    container.querySelector("#mask-delete-btn").classList.add("hidden");
    container.querySelector("#me-mask-edit").classList.remove("hidden");
  });

  container.querySelector("#mask-edit-close")?.addEventListener("click", () => {
    container.querySelector("#me-mask-edit").classList.add("hidden");
  });

  container.querySelector("#mask-save-btn")?.addEventListener("click", async () => {
    const name = container.querySelector("#mask-name-input").value.trim();
    if (!name) { alert("\u8bf7\u8f93\u5165\u540d\u79f0"); return; }
    const desc = container.querySelector("#mask-desc-input").value.trim();
    if (editingMaskId) {
      const existing = await getMask(editingMaskId);
      if (existing) {
        existing.name = name;
        existing.description = desc;
        await saveMask(existing);
      }
    } else {
      const mask = createMask({ name, description: desc });
      await saveMask(mask);
    }
    container.querySelector("#me-mask-edit").classList.add("hidden");
    await renderMaskList();
  });

  container.querySelector("#mask-delete-btn")?.addEventListener("click", async () => {
    if (!editingMaskId) return;
    if (confirm("\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a\u9762\u5177\uff1f")) {
      await deleteMask(editingMaskId);
      editingMaskId = null;
      container.querySelector("#me-mask-edit").classList.add("hidden");
      await renderMaskList();
    }
  });

  } catch(e) { console.error("Mask init error:", e); }

  // ── Moments Post Creation (Full-page WeChat style) ──
  let mppImages = [];

  // Open post page from camera btn
  container.querySelector("#moments-camera-btn")?.addEventListener("click", (e) => {
    console.log("[MOMENTS] Camera button clicked");
    e.stopPropagation();
    openPostPage(container);
  });

  // ── FAB: Batch character post generation ──
  container.querySelector("#moments-fab-btn")?.addEventListener("click", async () => {
    const picker = container.querySelector("#char-post-picker");
    if (!picker) return;
    const list = picker.querySelector("#cpp-list");
    try {
      const allChars = await getAllCharacters();
      const mainChars = allChars.filter(c => !c.isNpc);
      if (mainChars.length === 0) {
        list.innerHTML = '<div class="empty-hint">\u8fd8\u6ca1\u6709\u89d2\u8272</div>';
      } else {
        let html = '';
        for (const ch of mainChars) {
          const npcs = allChars.filter(c => c.isNpc && c.parentId === ch.id);
          html += '<div class="cpp-group">';
          html += '<label class="cpp-check-row"><input type="checkbox" class="cpp-char-cb" data-charid="' + ch.id + '" data-name="' + (ch.name || '') + '" checked> <span class="cpp-check-name">' + (ch.name || '\u89d2\u8272') + '</span></label>';
          if (npcs.length > 0) {
            html += '<div class="cpp-npc-list">';
            for (const npc of npcs) {
              html += '<label class="cpp-check-row cpp-npc-row"><input type="checkbox" class="cpp-npc-cb" data-charid="' + npc.id + '" data-parentid="' + ch.id + '" data-name="' + (npc.name || '') + '" checked> <span class="cpp-check-name">' + (npc.name || 'NPC') + '</span><span class="cpp-check-tag">NPC</span></label>';
            }
            html += '</div>';
          }
          html += '</div>';
        }
        list.innerHTML = html;
      }
    } catch(e) {
      list.innerHTML = '<div class="empty-hint">\u52a0\u8f7d\u5931\u8d25</div>';
    }
    picker.classList.remove("hidden");
  });

  // Close picker
  container.querySelector("#cpp-close")?.addEventListener("click", () => {
    container.querySelector("#char-post-picker")?.classList.add("hidden");
  });
  container.querySelector("#cpp-cancel2")?.addEventListener("click", () => {
    container.querySelector("#char-post-picker")?.classList.add("hidden");
  });

  // Start batch generation
  container.querySelector("#cpp-start")?.addEventListener("click", async () => {
    const picker = container.querySelector("#char-post-picker");
    const count = parseInt(picker.querySelector("#cpp-count").value, 10) || 1;
    const withNpcComment = picker.querySelector("#cpp-npc-comment").checked;
    const checkedChars = Array.from(picker.querySelectorAll(".cpp-char-cb:checked")).map(cb => ({ id: cb.dataset.charid, name: cb.dataset.name }));
    const checkedNpcs = Array.from(picker.querySelectorAll(".cpp-npc-cb:checked")).map(cb => ({ id: cb.dataset.charid, name: cb.dataset.name, parentId: cb.dataset.parentid }));

    if (checkedChars.length === 0 && checkedNpcs.length === 0) { alert("\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u89d2\u8272"); return; }

    const api = await getActiveApi();
    if (!api) { alert("\u8bf7\u5148\u5728 Settings \u914d\u7f6e API"); return; }

    const progress = picker.querySelector("#cpp-progress");
    const progressText = picker.querySelector("#cpp-progress-text");
    const startBtn = picker.querySelector("#cpp-start");
    progress.classList.remove("hidden");
    startBtn.disabled = true;

    try {
      // Generate posts for each checked character
      for (const ch of checkedChars) {
        const char = await getCharacter(ch.id);
        if (!char) continue;
        for (let i = 0; i < count; i++) {
          progressText.textContent = "\u751f\u6210\u4e2d: " + char.name + " (" + (i+1) + "/" + count + ")...";
          try {
            const sysContent = "You are " + char.name + ". " + (char.description || char.systemPrompt || "") + (char.personality ? "\nPersonality: " + char.personality : "") + "\nWrite a short social media post (1-3 sentences) in character. Stay strictly in character. Post about your daily life, thoughts, feelings, or observations. Each post should be different and unique.\nReply with ONLY the post text.";
            const reply = await chatStream([
              { role: "system", content: sysContent },
              { role: "user", content: "Write social media post #" + (i+1) + " as " + char.name + "." }
            ], {}, null, null);
            const cleanReply = reply.replace(/^["“]|["”]$/g, "").trim();
            if (cleanReply) {
              const moment = createMoment({ content: cleanReply, images: [], owner: char.name, charId: char.id });
              // Generate NPC comments if enabled
              if (withNpcComment) {
                const relatedNpcs = checkedNpcs.filter(n => n.parentId === ch.id);
                for (const npcInfo of relatedNpcs) {
                  try {
                    const npc = await getCharacter(npcInfo.id);
                    if (!npc) continue;
                    progressText.textContent = "\u751f\u6210\u8bc4\u8bba: " + npc.name + "...";
                    const npcReply = await chatStream([
                      { role: "system", content: "You are " + npc.name + ". " + (npc.description || "") + (npc.personality ? "\nPersonality: " + npc.personality : "") + "\n" + char.name + " posted on social media: \"" + cleanReply + "\"\nWrite a short in-character comment (1 sentence). Reply ONLY with the comment." },
                      { role: "user", content: "Comment on this post." }
                    ], {}, null, null);
                    if (!moment.comments) moment.comments = [];
                    moment.comments.push({ name: npc.name, text: npcReply.trim(), time: Date.now(), charId: npc.id });
                  } catch(e) { console.error("NPC comment failed", e); }
                }
              }
              await saveMoment(moment);
            }
          } catch(e) { console.error("Post gen failed for", char.name, e); }
        }
      }

      // Generate posts for standalone NPCs (checked but parent not checked)
      for (const npcInfo of checkedNpcs) {
        if (checkedChars.some(c => c.id === npcInfo.parentId)) continue; // parent already handled
        const npc = await getCharacter(npcInfo.id);
        if (!npc) continue;
        for (let i = 0; i < count; i++) {
          progressText.textContent = "\u751f\u6210\u4e2d: " + npc.name + "...";
          try {
            const reply = await chatStream([
              { role: "system", content: "You are " + npc.name + ". " + (npc.description || "") + "\nWrite a short social media post in character. Reply ONLY with the post text." },
              { role: "user", content: "Write a social media post." }
            ], {}, null, null);
            const moment = createMoment({ content: reply.trim(), images: [], owner: npc.name, charId: npc.id });
            await saveMoment(moment);
          } catch(e) { console.error("NPC post failed", e); }
        }
      }

      progressText.textContent = "\u5b8c\u6210\uff01";
      setTimeout(() => {
        picker.classList.add("hidden");
        progress.classList.add("hidden");
        startBtn.disabled = false;
      }, 800);
      await renderMomentsFeed(container);
    } catch(e) {
      alert("\u751f\u6210\u5931\u8d25: " + e.message);
      progress.classList.add("hidden");
      startBtn.disabled = false;
    }
  });

  // Cancel post
  container.querySelector("#mpp-cancel")?.addEventListener("click", () => {
    container.querySelector("#moments-post-page")?.classList.add("hidden");
  });

  // Submit post
  container.querySelector("#mpp-submit")?.addEventListener("click", async () => {
    console.log("[MOMENTS] Submit button clicked");
    const page = container.querySelector("#moments-post-page");
    const text = page.querySelector("#mpp-text").value.trim();
    if (!text && mppImages.length === 0) { alert("\u8bf7\u8f93\u5165\u5185\u5bb9\u6216\u6dfb\u52a0\u56fe\u7247"); return; }
    const moment = createMoment({ content: text, images: mppImages, owner: "player" });
    await saveMoment(moment);
    page.classList.add("hidden");
    await renderMomentsFeed(container);
  });

  // Moments cover background upload (click on the cover area, NOT the info section)
  container.querySelector(".moments-cover")?.addEventListener("click", (e) => {
    // Don't trigger if clicking camera button or avatar/name area
    if (e.target.closest(".moments-camera-float") || e.target.closest(".moments-cover-info")) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (fe) => {
      const file = fe.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const cover = container.querySelector(".moments-cover");
        cover.style.backgroundImage = "url(" + ev.target.result + ")";
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
        localStorage.setItem("moments-cover-bg", ev.target.result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  // Restore saved cover bg
  const savedCoverBg = localStorage.getItem("moments-cover-bg");
  if (savedCoverBg) {
    const cover = container.querySelector(".moments-cover");
    if (cover) {
      cover.style.backgroundImage = "url(" + savedCoverBg + ")";
      cover.style.backgroundSize = "cover";
      cover.style.backgroundPosition = "center";
    }
  }

  // Restore user nickname on cover
  const savedNickname = localStorage.getItem("user-nickname");
  if (savedNickname) {
    const coverName = container.querySelector("#moments-cover-name");
    if (coverName) coverName.textContent = savedNickname;
  }

  // Initial moments render
  if (!container.querySelector("#chat-moments-view").classList.contains("hidden")) {
    renderMomentsFeed(container);
  }
  // Initial mask list render when Me tab is shown
  const meTab = container.querySelector('[data-tab="me"]');
  if (meTab) {
    const origListener = meTab.onclick;
    meTab.addEventListener("click", () => renderMaskList());
  }
}


/* ── 后台自动发帖 (Auto-Post Timer) ── */
let autoPostTimerId = null;
const AUTO_POST_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次

function startAutoPostTimer() {
  if (autoPostTimerId) return; // 已在运行
  console.log("[AutoPost] Timer started, interval:", AUTO_POST_INTERVAL / 1000, "s");
  autoPostTimerId = setInterval(runAutoPost, AUTO_POST_INTERVAL);
}

function stopAutoPostTimer() {
  if (autoPostTimerId) {
    clearInterval(autoPostTimerId);
    autoPostTimerId = null;
    console.log("[AutoPost] Timer stopped");
  }
}

async function runAutoPost() {
  try {
    const allChars = await getAllCharacters();
    const autoChars = allChars.filter(c => c.autoPost && !c.isNpc);
    if (autoChars.length === 0) return;

    const api = await getActiveApi();
    if (!api) return; // 没配置API就跳过

    for (const char of autoChars) {
      // 检查上次发帖时间（避免太频繁）
      const lastKey = "autopost-last-" + char.id;
      const lastTime = parseInt(localStorage.getItem(lastKey) || "0", 10);
      const now = Date.now();
      if (now - lastTime < AUTO_POST_INTERVAL) continue;

      // 投骰子
      const chance = char.autoPostChance || 30;
      const roll = Math.random() * 100;
      console.log("[AutoPost]", char.name, "- roll:", roll.toFixed(1), "/ chance:", chance);
      if (roll > chance) continue;

      // 生成发帖
      console.log("[AutoPost] Generating post for", char.name);
      try {
        const sysContent = "You are " + char.name + ". " + (char.description || char.systemPrompt || "") + (char.personality ? "\nPersonality: " + char.personality : "") + "\nWrite a short social media post (1-3 sentences) in character. Stay strictly in character. Post about your daily life, thoughts, feelings, or observations. Reply with ONLY the post text, nothing else.";
        const messages = [
          { role: "system", content: sysContent },
          { role: "user", content: "Write a social media post as " + char.name + ". It should feel natural and spontaneous." }
        ];
        const reply = await chatStream(messages, {}, null, null);
        const cleanReply = reply.replace(/^["“]|["”]$/g, "").trim();
        if (cleanReply) {
          const moment = createMoment({ content: cleanReply, images: [], owner: char.name });
          await saveMoment(moment);
          localStorage.setItem(lastKey, String(now));
          console.log("[AutoPost] Posted for", char.name, ":", cleanReply.substring(0, 50));
          bus.emit("moments:updated");
        }
      } catch(e) {
        console.error("[AutoPost] Failed for", char.name, e);
      }
    }
  } catch(e) {
    console.error("[AutoPost] Error:", e);
  }
}

// 启动定时器（模块加载时就开始）
startAutoPostTimer();

/* ── 会话列表渲染（Session List） ── */
async function renderSessionList(container) {
  const list = container.querySelector("#session-list");
  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-hint">还没有聊天，点 + 开始吧</div>`;
    return;
  }

  let html = "";
  for (const s of sessions) {
    const msgs = await getSessionMessages(s.id);
    const lastMsg = msgs[msgs.length - 1];
    const preview = lastMsg
      ? truncate(lastMsg.content, 40)
      : "暂无消息";
    const timeStr = formatTime(s.updatedAt);
    const charName = s.characterId
      ? (await getCharacter(s.characterId))?.name || "Unknown"
      : s.mode === "ai" ? "AI" : "Chat";

    // 每个会话卡片：外层 wrapper（用于左滑溢出裁切），内含 card 主体 + 滑动操作按钮
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
        <!-- 左滑露出的操作按钮区域 -->
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
    msgContainer.innerHTML = `<div class="chat-empty">开始对话吧...</div>`;
    return;
  }

    msgContainer.innerHTML = messages
    .map(
      (msg, idx) => {
        // Narrator detection: content wrapped in *...*  or role is narrator
        const isNarration = msg.role === "narrator" || (msg.role === "assistant" && /^\*[^*]/.test(msg.content.trim()) && msg.content.trim().endsWith("*"));
        if (isNarration) {
          const narrationText = msg.content.replace(/^\*|\*$/g, "").trim();
          return `
    <div class="msg-row narrator" data-msgid="${msg.id}">
      <div class="msg-narration">${renderMarkdown(narrationText)}</div>
    </div>`;
        }

        // Check if next message exists (for auto-collapse translation)
        const hasNextMsg = idx < messages.length - 1;
        const translationHtml = msg.translation ? `
          <div class="msg-translation ${hasNextMsg ? 'collapsed' : ''}" data-msgid="${msg.id}">
            <div class="msg-translation-content">${renderMarkdown(msg.translation)}</div>
          </div>
          <span class="msg-trans-badge" data-msgid="${msg.id}">译</span>
        ` : "";

        return `
    <div class="msg-row ${msg.role}" data-msgid="${msg.id}">
      <div class="msg-bubble ${msg.role}">
        <div class="msg-content">${renderMarkdown(msg.content)}</div>
        ${translationHtml}
        <div class="msg-meta">
          ${msg.isEdited ? '<span class="msg-edited">edited</span>' : ""}
          <span class="msg-time">${formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  `;
      }
    )
    .join("");
  
  // Bind translation toggle
  msgContainer.querySelectorAll(".msg-trans-badge").forEach(badge => {
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      const mid = badge.dataset.msgid;
      const transEl = msgContainer.querySelector(`.msg-translation[data-msgid="${mid}"]`);
      if (transEl) transEl.classList.toggle("collapsed");
    });
  });

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

  // Load active preset
  const presetId = getActivePresetId();
  let activePreset = null;
  if (presetId.startsWith("__")) {
    activePreset = getBuiltinPreset(presetId);
  } else {
    activePreset = await getPreset(presetId);
  }
  if (activePreset?.systemPrompt) {
    parts.push(activePreset.systemPrompt);
  }

  // Load user mask if bound to session
  if (session.maskId) {
    const mask = await getMask(session.maskId);
    if (mask?.description) {
      parts.push("The user's persona: " + mask.description);
    }
  }

  if (session.mode === "ai" || settings.chatMode === "ai") {
    parts.push("You are a caring and warm AI companion in a romantic relationship with the user. Be natural, affectionate, and genuine.");
  }

  if (session.characterId) {
    const char = await getCharacter(session.characterId);
    if (char) {
      const charPrompt = buildCharacterPrompt(char);
      if (charPrompt) parts.push(charPrompt);
    }
  }

  
  // Inject world book / lore entries
  try {
    const history = await getSessionMessages(session.id || activeSessionId);
    const loreEntries = await getLoreForPrompt(session.characterId, history);
    for (const entry of loreEntries) {
      if (entry.position === "before_char") {
        parts.unshift(entry.content);
      } else {
        parts.push(entry.content);
      }
    }
  } catch (e) {
    console.warn("[Lore] Failed to load lore entries:", e);
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

  // 当前已展开的滑动卡片（用于在新操作时自动关闭旧卡片）
  let openedCard = null;

  // 点击会话卡片 → 打开聊天（同时关闭已展开的滑动）
  container.querySelector("#session-list").addEventListener("click", (e) => {
    // 如果点击的是置顶或删除按钮，不做处理（由后续 handler 处理）
    if (e.target.closest(".session-pin-btn") || e.target.closest(".session-delete-btn")) return;
    const card = e.target.closest(".session-card");
    if (!card) return;
    // 关闭已展开的滑动卡片
    if (openedCard) {
      const prev = openedCard.querySelector(".session-card");
      prev.style.transform = "";
      prev.style.transition = "transform 0.2s ease";
      openedCard = null;
    }
    openChatView(container, card.dataset.id);
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

    if (action === "copy") {
      const msgs = await getSessionMessages(activeSessionId);
      const msg = msgs.find((m) => m.id === contextMsgId);
      if (msg) { navigator.clipboard?.writeText(msg.content).then(() => {}).catch(() => {}); }
    } else if (action === "quote") {
      const msgs = await getSessionMessages(activeSessionId);
      const msg = msgs.find((m) => m.id === contextMsgId);
      if (msg) {
        const chatInput = container.querySelector("#chat-input");
        if (chatInput) { chatInput.value = "> " + msg.content.split("\n")[0] + "\n" + chatInput.value; chatInput.focus(); }
      }
    } else if (action === "regen-from") {
      // Delete this message and all messages after it, then regenerate
      const allMsgs = await getSessionMessages(activeSessionId);
      const idx = allMsgs.findIndex(m => m.id === contextMsgId);
      if (idx >= 0) {
        if (confirm("\u4ece\u6b64\u5904\u91cdroll\uff1f\u6b64\u6d88\u606f\u53ca\u4e4b\u540e\u7684\u6240\u6709\u6d88\u606f\u5c06\u88ab\u5220\u9664\u5e76\u91cd\u65b0\u751f\u6210")) {
          for (let i = allMsgs.length - 1; i >= idx; i--) {
            await deleteMessage(allMsgs[i].id);
          }
          await renderMessages(container);
          await generateReply(container);
        }
      }
    } else if (action === "delete") {
      await deleteMessage(contextMsgId);
      await renderMessages(container);
    } else if (action === "regen") {
      // Show reroll options: direct or with correction
      const choice = confirm("\u76f4\u63a5\u91cdroll\uff1f\n\n\u70b9\u201c\u786e\u5b9a\u201d\u76f4\u63a5\u91cd\u65b0\u751f\u6210\n\u70b9\u201c\u53d6\u6d88\u201d\u53ef\u4ee5\u8f93\u5165\u7ea0\u9519\u63d0\u793a");
      if (choice) {
        await deleteLastAssistantMessage(activeSessionId);
        await renderMessages(container);
        await generateReply(container);
      } else {
        const correction = prompt("\u8bf7\u8f93\u5165\u7ea0\u9519\u63d0\u793a\uff08\u544a\u8bc9AI\u54ea\u91cc\u5199\u9519\u4e86\uff09\uff1a");
        if (correction && correction.trim()) {
          await deleteLastAssistantMessage(activeSessionId);
          // Add correction as a system-like user note
          const corrMsg = createMessage({ sessionId: activeSessionId, role: "user", content: "[\u7ea0\u9519] " + correction.trim() });
          await addMessage(corrMsg);
          await renderMessages(container);
          await generateReply(container);
        }
      }
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

  // ── 会话卡片左滑操作（滑动露出置顶/删除按钮） ──
  const sessionList = container.querySelector("#session-list");
  let swipeStartX = 0;        // 触摸起始 X 坐标
  let swipingCard = null;      // 当前正在滑动的卡片 wrapper
  let cardStartOffset = 0;     // 卡片开始滑动时的已有偏移量（用于右滑关闭）

  // 辅助函数：关闭已展开的卡片
  function closeOpenedCard() {
    if (openedCard) {
      const prev = openedCard.querySelector(".session-card");
      prev.style.transform = "";
      prev.style.transition = "transform 0.2s ease";
      openedCard = null;
    }
  }

  // 触摸开始：记录起点，关闭其他已展开的卡片
  sessionList.addEventListener("touchstart", (e) => {
    const wrapper = e.target.closest(".session-card-wrapper");
    if (!wrapper) return;

    // 如果触摸的不是当前已展开的卡片，先关闭旧卡片
    if (openedCard && openedCard !== wrapper) {
      closeOpenedCard();
    }

    swipeStartX = e.touches[0].clientX;
    swipingCard = wrapper;

    // 记录卡片当前的偏移量（已展开的卡片可能在 -140px）
    const card = wrapper.querySelector(".session-card");
    const curTransform = card.style.transform;
    cardStartOffset = curTransform
      ? (parseFloat(curTransform.replace(/[^\-\d.]/g, "")) || 0)
      : 0;
  });

  // 触摸移动：卡片跟随手指，限制在 [-140, 0] 范围
  sessionList.addEventListener("touchmove", (e) => {
    if (!swipingCard) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const card = swipingCard.querySelector(".session-card");
    // 新偏移 = 初始偏移 + 手指位移，clamp 到 [-140, 0]
    const newOffset = Math.max(-140, Math.min(0, cardStartOffset + dx));

    if (newOffset < 0) {
      card.style.transform = `translateX(${newOffset}px)`;
      card.style.transition = "none";
    } else {
      card.style.transform = "";
      card.style.transition = "none";
    }
  });

  // 触摸结束：根据偏移量决定吸附到展开还是关闭
  sessionList.addEventListener("touchend", () => {
    if (!swipingCard) return;
    const card = swipingCard.querySelector(".session-card");
    const current = parseFloat(card.style.transform.replace(/[^\-\d.]/g, "")) || 0;

    if (current < -60) {
      // 超过阈值 → 吸附到完全展开（-140px）
      card.style.transform = "translateX(-140px)";
      card.style.transition = "transform 0.2s ease";
      openedCard = swipingCard;
    } else {
      // 未超过阈值 → 回弹到关闭状态
      card.style.transform = "";
      card.style.transition = "transform 0.2s ease";
      if (openedCard === swipingCard) openedCard = null;
    }
    swipingCard = null;
  });

  // 点击置顶/删除按钮
  sessionList.addEventListener("click", async (e) => {
    // 置顶按钮
    const pinBtn = e.target.closest(".session-pin-btn");
    if (pinBtn) {
      e.stopPropagation();
      const session = await getSession(pinBtn.dataset.id);
      if (session) {
        session.pinned = !session.pinned;
        await saveSession(session);
        openedCard = null;
        await renderSessionList(container);
      }
      return;
    }
    // 删除按钮
    const delBtn = e.target.closest(".session-delete-btn");
    if (delBtn) {
      e.stopPropagation();
      if (confirm("确定删除这个聊天吗？")) {
        await deleteSession(delBtn.dataset.id);
        openedCard = null;
        await renderSessionList(container);
      } else {
        // 用户取消删除 → 关闭滑动
        closeOpenedCard();
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
    } else if (action === "chat-bg") {
      alert("设置聊天背景 - 即将开放");
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

  // Narrate button (即将开放)
  container.querySelector("#chat-narrate-btn")?.addEventListener("click", () => {
    alert("旁白模式 - 即将开放");
  });

  // Photo button (即将开放)
  container.querySelector("#chat-photo-btn")?.addEventListener("click", (e) => {
    // Show dual-option popup: album or text-to-image
    const existing = container.querySelector(".photo-option-popup");
    if (existing) { existing.remove(); return; }
    const popup = document.createElement("div");
    popup.className = "photo-option-popup";
    popup.innerHTML = '<button class="photo-opt" data-opt="album"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>\u76f8\u518c</button><button class="photo-opt" data-opt="textimg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>\u6587\u5b57\u63cf\u8ff0</button>';
    popup.style.cssText = "position:absolute;bottom:90px;left:50px;background:rgba(255,255,255,.95);backdrop-filter:blur(20px);border-radius:14px;padding:6px;display:flex;gap:4px;box-shadow:0 4px 20px rgba(0,0,0,.12);z-index:100";
    const inputArea = container.querySelector(".chat-input-area");
    inputArea.style.position = "relative";
    inputArea.appendChild(popup);
    popup.addEventListener("click", (ev) => {
      const opt = ev.target.closest("[data-opt]")?.dataset.opt;
      popup.remove();
      if (opt === "album") {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = "image/*";
        inp.onchange = async (fe) => {
          const file = fe.target.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (re) => {
            const chatInput = container.querySelector("#chat-input");
            if (chatInput) chatInput.value += "[image:" + file.name + "]";
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      } else if (opt === "textimg") {
        const desc = prompt("\u8f93\u5165\u56fe\u7247\u63cf\u8ff0\uff1a");
        if (desc) {
          const chatInput = container.querySelector("#chat-input");
          if (chatInput) chatInput.value += "[gen-image:" + desc + "]";
        }
      }
    });
    setTimeout(() => { document.addEventListener("click", function closePopup(ev) { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("click", closePopup); } }, { once: false }); }, 100);
  });

  // Voice button (即将开放)
  container.querySelector("#chat-voice-btn")?.addEventListener("click", () => {
    alert("语音消息 - 即将开放");
  });

  // Emoji panel toggle
  container.querySelector("#chat-emoji-btn")?.addEventListener("click", () => {
    const panel = container.querySelector("#emoji-panel");
    if (!panel) return;
    panel.classList.toggle("hidden");
    container.querySelector("#chat-plus-menu")?.classList.add("hidden");
    // 初始化颜文字 tab 内容
    const kaoGrid = container.querySelector("#emoji-grid-kaomoji");
    if (kaoGrid && !kaoGrid.dataset.init) {
      kaoGrid.dataset.init = "1";
      let html = "";
      for (const [cat, list] of Object.entries(KAOMOJI)) {
        html += `<div class="kaomoji-cat">${cat}</div>`;
        html += list.map(k => `<button class="kaomoji-item" data-val="${k.replace(/"/g, '&quot;')}">${k}</button>`).join("");
      }
      kaoGrid.innerHTML = html;
    }
  });

  // Emoji panel tab switching
  container.querySelector(".emoji-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".emoji-tab");
    if (!tab) return;
    const tabName = tab.dataset.etab;
    container.querySelectorAll(".emoji-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    container.querySelector("#emoji-grid-emoji")?.classList.toggle("hidden", tabName !== "emoji");
    container.querySelector("#emoji-grid-kaomoji")?.classList.toggle("hidden", tabName !== "kaomoji");
    container.querySelector("#emoji-grid-sticker")?.classList.toggle("hidden", tabName !== "sticker");
  });

  // Emoji/kaomoji item click → insert into input
  container.querySelector("#emoji-panel")?.addEventListener("click", (e) => {
    const item = e.target.closest(".emoji-item, .kaomoji-item");
    if (!item) return;
    const val = item.dataset.val;
    const input = container.querySelector("#chat-input");
    if (input && val) {
      input.value += val;
      input.focus();
    }
  });

  // Sticker add button
  container.querySelector("#add-sticker-btn")?.addEventListener("click", () => {
    alert("表情包管理 - 即将开放");
  });

  // Plus menu items - coming soon handler
  container.querySelector("#chat-plus-menu")?.addEventListener("click", (e) => {
    const item = e.target.closest(".plus-menu-item");
    if (!item) return;
    const action = item.dataset.action;
    if (action === "videocall") {
      alert("\u89c6\u9891\u901a\u8bdd\u529f\u80fd\u5373\u5c06\u5f00\u653e");
    } else if (action === "voicecall") {
      alert("\u8bed\u97f3\u901a\u8bdd\u529f\u80fd\u5373\u5c06\u5f00\u653e");
    } else if (action === "location") {
      alert("\u4f4d\u7f6e\u5206\u4eab\u5373\u5c06\u5f00\u653e");
    } else if (action === "redpacket") {
      alert("\u7ea2\u5305\u529f\u80fd\u5373\u5c06\u5f00\u653e");
    } else if (action === "transfer") {
      alert("\u8f6c\u8d26\u529f\u80fd\u5373\u5c06\u5f00\u653e");
    } else if (action === "save") {
      alert("\u4fdd\u5b58\u529f\u80fd\u5373\u5c06\u5f00\u653e");
    } else {
      alert("\u5373\u5c06\u5f00\u653e");
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
    const session = createSession({ title: char?.name || "New Chat", characterId: charId, maskId: char?.boundMaskId || char?.maskId || null, mode: "character" });
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


/* ── Moments Feed Rendering ── */
async function renderMomentsFeed(container) {
  const feed = container.querySelector("#moments-feed");
  const moments = await getAllMoments();
  if (moments.length === 0) {
    feed.innerHTML = '<div class="empty-hint" style="padding:40px 0;text-align:center">还没有动态</div>';
    return;
  }
  feed.innerHTML = moments.map(m => {
    const timeStr = formatTime(m.createdAt);
    const imagesHtml = m.images && m.images.length > 0
      ? '<div class="moment-images">' + m.images.map(img => '<img class="moment-img" src="' + img + '">').join("") + '</div>'
      : "";
    const likeCount = m.likes ? m.likes.length : 0;
    const isLiked = m.likes && m.likes.includes("player");
    const commentsHtml = m.comments && m.comments.length > 0
      ? '<div class="moment-comments">' + m.comments.map((c, ci) =>
          '<div class="moment-comment" data-cidx="' + ci + '" data-mid="' + m.id + '">' +
            '<span class="moment-comment-name">' + escHtml(c.name || "Anonymous") + ':</span> ' +
            escHtml(c.text) +
            (c.name !== "Me" ? '<span class="comment-actions"><button class="comment-del-btn" data-mid="' + m.id + '" data-cidx="' + ci + '" title="\u5220\u9664">\u00d7</button><button class="comment-reroll-btn" data-mid="' + m.id + '" data-cidx="' + ci + '" title="\u91cdroll">\u21bb</button></span>' : '<span class="comment-actions"><button class="comment-del-btn" data-mid="' + m.id + '" data-cidx="' + ci + '" title="\u5220\u9664">\u00d7</button></span>') +
          '</div>'
        ).join("") + '</div>'
      : "";
    const ownerName = m.owner === "player" ? (localStorage.getItem("user-nickname") || "Me") : m.owner;
    return '<div class="moment-card" data-momentid="' + m.id + '">' +
      '<div class="moment-header">' +
        '<div class="moment-avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
        '<div class="moment-header-info"><span class="moment-owner">' + escHtml(ownerName) + '</span></div>' +
      '</div>' +
      (m.content ? '<div class="moment-text">' + escHtml(m.content) + '</div>' : '') +
      imagesHtml +
      '<div class="moment-footer"><span class="moment-time">' + timeStr + '</span>' +
        '<div class="moment-action-bar">' +
          '<button class="moment-action-btn moment-like-btn' + (isLiked ? ' liked' : '') + '" data-momentid="' + m.id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="' + (isLiked ? '#636366' : 'none') + '" stroke="#636366" stroke-width="1.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' + (likeCount > 0 ? ' ' + likeCount : '') + '</button>' +
          '<button class="moment-action-btn moment-comment-btn" data-momentid="' + m.id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
          '<button class="moment-action-btn moment-ai-comment-btn" data-momentid="' + m.id + '" title="\u89d2\u8272\u8bc4\u8bba"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="1.4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></button>' +
          '<button class="moment-action-btn moment-delete-btn" data-momentid="' + m.id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="1.4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>' +
      '</div>' +
      commentsHtml +
    '</div>';
  }).join("");

  // ── Like toggle ──
  feed.querySelectorAll(".moment-like-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const mid = btn.dataset.momentid;
      const moment = await getMoment(mid);
      if (!moment) return;
      if (!moment.likes) moment.likes = [];
      const idx = moment.likes.indexOf("player");
      if (idx >= 0) moment.likes.splice(idx, 1);
      else moment.likes.push("player");
      await saveMoment(moment);
      await renderMomentsFeed(container);
    });
  });

  // ── Comment (manual) ──
  feed.querySelectorAll(".moment-comment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const mid = btn.dataset.momentid;
      const text = prompt("\u8f93\u5165\u8bc4\u8bba:");
      if (!text || !text.trim()) return;
      const moment = await getMoment(mid);
      if (!moment) return;
      if (!moment.comments) moment.comments = [];
      moment.comments.push({ name: "Me", text: text.trim(), time: Date.now() });
      await saveMoment(moment);
      await renderMomentsFeed(container);
    });
  });

  // ── AI comment (all characters comment) ──
  feed.querySelectorAll(".moment-ai-comment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const mid = btn.dataset.momentid;
      const moment = await getMoment(mid);
      if (!moment) return;
      const chars = await getAllCharacters();
      if (chars.length === 0) { alert("\u6ca1\u6709\u89d2\u8272\u53ef\u4ee5\u8bc4\u8bba"); return; }
      btn.disabled = true;
      const origHtml = btn.innerHTML;
      btn.innerHTML = "...";
      try {
        const api = await getActiveApi();
        if (!api) { alert("\u8bf7\u5148\u914d\u7f6eAPI"); return; }
        for (const char of chars.filter(c => !c.isNpc).slice(0, 3)) {
          const p = [
            { role: "system", content: "You are " + char.name + ". " + (char.description || char.systemPrompt || "") + "\nThe user posted on social media: \"" + (moment.content || "") + "\"\nWrite a short, in-character comment (1-2 sentences). Reply ONLY with the comment text." },
            { role: "user", content: "Please comment on this post." }
          ];
          try {
            const reply = await chatStream(p, {}, null, null);
            if (!moment.comments) moment.comments = [];
            moment.comments.push({ name: char.name, text: reply.trim(), time: Date.now(), charId: char.id });
          } catch(e) { console.error("Comment gen failed", e); }
        }
        await saveMoment(moment);
        await renderMomentsFeed(container);
      } catch(e) { console.error("AI comment failed", e); }
      finally { btn.disabled = false; btn.innerHTML = origHtml; }
    });
  });

  // ── Delete moment ──
  feed.querySelectorAll(".moment-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("\u5220\u9664\u8fd9\u6761\u52a8\u6001\uff1f")) return;
      await deleteMoment(btn.dataset.momentid);
      await renderMomentsFeed(container);
    });
  });

  // ── Delete individual comment ──
  feed.querySelectorAll(".comment-del-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      const cidx = parseInt(btn.dataset.cidx);
      const moment = await getMoment(mid);
      if (!moment || !moment.comments) return;
      moment.comments.splice(cidx, 1);
      await saveMoment(moment);
      await renderMomentsFeed(container);
    });
  });

  // ── Reroll individual AI comment ──
  feed.querySelectorAll(".comment-reroll-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      const cidx = parseInt(btn.dataset.cidx);
      const moment = await getMoment(mid);
      if (!moment || !moment.comments || !moment.comments[cidx]) return;
      const oldComment = moment.comments[cidx];
      const charName = oldComment.name;
      const chars = await getAllCharacters();
      const char = chars.find(c => c.name === charName);
      if (!char) { alert("\u627e\u4e0d\u5230\u89d2\u8272: " + charName); return; }
      btn.textContent = "...";
      try {
        const api = await getActiveApi();
        if (!api) { alert("\u8bf7\u5148\u914d\u7f6eAPI"); return; }
        const p = [
          { role: "system", content: "You are " + char.name + ". " + (char.description || char.systemPrompt || "") + "\nThe user posted on social media: \"" + (moment.content || "") + "\"\nWrite a different short, in-character comment (1-2 sentences). Reply ONLY with the comment text." },
          { role: "user", content: "Write a new comment, different from: \"" + oldComment.text + "\"" }
        ];
        const reply = await chatStream(p, {}, null, null);
        moment.comments[cidx] = { name: charName, text: reply.trim(), time: Date.now(), charId: char.id };
        await saveMoment(moment);
        await renderMomentsFeed(container);
      } catch(e) { alert("\u91cdroll\u5931\u8d25: " + e.message); }
    });
  });
}

/* ── Sticker Management ── */
async function renderStickerTab(container) {
  const stickerContent = container.querySelector("#sticker-content");
  if (!stickerContent) return;

  const stickers = await getAllStickers();
  stickerContent.innerHTML = '<div class="sticker-toolbar">' +
    '<input type="text" class="sticker-search" id="sticker-search-input" placeholder="Search tags...">' +
    '<button class="sticker-upload-btn" id="sticker-upload-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
    '<button class="sticker-manage-btn" id="sticker-manage-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
  '</div>';

  if (stickers.length === 0) {
    stickerContent.innerHTML += '<div class="empty-hint" style="padding:20px 0">No stickers yet. Tap + to upload.</div>';
  } else {
    const grid = document.createElement("div");
    grid.className = "sticker-grid";
    stickers.forEach(s => {
      const item = document.createElement("div");
      item.className = "sticker-item";
      item.dataset.stickerid = s.id;
      item.innerHTML = '<img src="' + s.imageData + '" alt="' + escHtml(s.name) + '">';
      item.addEventListener("click", () => {
        const input = container.querySelector("#chat-input");
        if (input) {
          input.value += "[sticker:" + s.name + "]";
          input.focus();
        }
        container.querySelector("#emoji-panel")?.classList.add("hidden");
      });
      grid.appendChild(item);
    });
    stickerContent.appendChild(grid);
  }

  // Upload stickers
  stickerContent.querySelector("#sticker-upload-btn")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async (e) => {
      for (const file of e.target.files) {
        const dataUrl = await readFileAsDataURL(file);
        const name = prompt("Name for this sticker:", file.name.replace(/\.[^.]+$/, ""));
        if (!name) continue;
        const tags = prompt("Tags (comma-separated):", "");
        const sticker = createSticker({
          name: name.trim(),
          imageData: dataUrl,
          tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        });
        await saveSticker(sticker);
      }
      await renderStickerTab(container);
    };
    input.click();
  });

  // Search stickers
  stickerContent.querySelector("#sticker-search-input")?.addEventListener("input", async (e) => {
    const keyword = e.target.value.trim();
    const grid = stickerContent.querySelector(".sticker-grid");
    if (!grid) return;
    if (!keyword) {
      grid.querySelectorAll(".sticker-item").forEach(item => item.style.display = "");
      return;
    }
    const results = await searchStickers(keyword);
    const resultIds = new Set(results.map(s => s.id));
    grid.querySelectorAll(".sticker-item").forEach(item => {
      item.style.display = resultIds.has(item.dataset.stickerid) ? "" : "none";
    });
  });

  // Manage stickers (multi-select delete)
  stickerContent.querySelector("#sticker-manage-btn")?.addEventListener("click", async () => {
    const grid = stickerContent.querySelector(".sticker-grid");
    if (!grid) { alert("No stickers to manage"); return; }
    const items = grid.querySelectorAll(".sticker-item");
    const isManaging = grid.classList.toggle("managing");
    if (!isManaging) {
      // Exit manage mode: remove checkboxes and delete selected
      const selected = grid.querySelectorAll(".sticker-item.selected");
      if (selected.length > 0 && confirm("Delete " + selected.length + " sticker(s)?")) {
        for (const item of selected) {
          await deleteSticker(item.dataset.stickerid);
        }
        await renderStickerTab(container);
      }
      items.forEach(item => item.classList.remove("selected"));
      return;
    }
    // Enter manage mode
    items.forEach(item => {
      item.addEventListener("click", function manageClick(e) {
        if (!grid.classList.contains("managing")) {
          item.removeEventListener("click", manageClick);
          return;
        }
        e.stopPropagation();
        item.classList.toggle("selected");
      });
    });
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
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
