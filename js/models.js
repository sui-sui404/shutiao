/**
 * Models — 统一数据模型定义
 * 所有模块使用这些工厂函数创建标准数据结构
 */

/**
 * 生成唯一 ID
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * API 配置
 */
export function createApiConfig(overrides = {}) {
  return {
    id: uid(),
    name: "New API",
    baseUrl: "",
    apiKey: "",
    model: "",
    temperature: 0.7,
    stream: true,
    isActive: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * 角色卡
 */
export function createCharacter(overrides = {}) {
  return {
    id: uid(),
    name: "",
    avatar: "",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleMessages: "",
    systemPrompt: "",
    presetId: null,
    parentId: null,
    variantLabel: "",
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * 聊天会话
 */
export function createSession(overrides = {}) {
  return {
    id: uid(),
    title: "New Chat",
    characterId: null,
    mode: "character",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * 聊天消息
 */
export function createMessage(overrides = {}) {
  return {
    id: uid(),
    sessionId: "",
    role: "user",
    content: "",
    timestamp: Date.now(),
    isEdited: false,
    ...overrides,
  };
}

/**
 * 预设模板
 */
export function createPreset(overrides = {}) {
  return {
    id: uid(),
    name: "",
    systemPrompt: "",
    isBuiltin: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * 应用全局设置
 */
export function createSettings(overrides = {}) {
  return {
    id: "global",
    chatMode: "character",
    activeApiId: null,
    defaultCharacterId: null,
    theme: "light",
    wallpaper: "",
    normLevel: "standard",
    ...overrides,
  };
}
