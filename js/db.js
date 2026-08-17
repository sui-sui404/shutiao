/**
 * DB — IndexedDB 数据层（基于 Dexie.js）
 * 所有持久化数据通过这个模块读写
 */
import Dexie from "https://cdn.jsdelivr.net/npm/dexie@4/+esm";
import { createSettings } from "./models.js";
import bus from "./eventBus.js";

const db = new Dexie("MiMaShu");

db.version(1).stores({
  settings: "id",
  apiConfigs: "id, name, isActive",
  characters: "id, name, parentId, createdAt",
  sessions: "id, characterId, mode, updatedAt",
  messages: "id, sessionId, timestamp",
  presets: "id, name, isBuiltin",
});

/**
 * 初始化默认数据（首次运行时调用）
 */
export async function initDefaults() {
  const existing = await db.settings.get("global");
  if (!existing) {
    await db.settings.put(createSettings());
  }
}

/**
 * Settings CRUD
 */
export async function getSettings() {
  return (await db.settings.get("global")) || createSettings();
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const updated = { ...current, ...patch, id: "global" };
  await db.settings.put(updated);
  bus.emit("settings:changed", updated);
  return updated;
}

/**
 * API Configs CRUD
 */
export async function getAllApiConfigs() {
  return db.apiConfigs.toArray();
}

export async function getApiConfig(id) {
  return db.apiConfigs.get(id);
}

export async function saveApiConfig(config) {
  await db.apiConfigs.put(config);
  bus.emit("api:changed", config);
  return config;
}

export async function deleteApiConfig(id) {
  await db.apiConfigs.delete(id);
  bus.emit("api:deleted", id);
}

export async function getActiveApi() {
  const settings = await getSettings();
  if (!settings.activeApiId) return null;
  return db.apiConfigs.get(settings.activeApiId);
}

/**
 * Characters CRUD
 */
export async function getAllCharacters() {
  return db.characters.orderBy("createdAt").toArray();
}

export async function getCharacter(id) {
  return db.characters.get(id);
}

export async function saveCharacter(character) {
  character.updatedAt = Date.now();
  await db.characters.put(character);
  bus.emit("character:changed", character);
  return character;
}

export async function deleteCharacter(id) {
  await db.characters.delete(id);
  bus.emit("character:deleted", id);
}

export async function getCharacterVariants(parentId) {
  return db.characters.where("parentId").equals(parentId).toArray();
}

/**
 * Sessions CRUD
 */
export async function getAllSessions() {
  return db.sessions.orderBy("updatedAt").reverse().toArray();
}

export async function getSession(id) {
  return db.sessions.get(id);
}

export async function saveSession(session) {
  session.updatedAt = Date.now();
  await db.sessions.put(session);
  bus.emit("session:changed", session);
  return session;
}

export async function deleteSession(id) {
  await db.transaction("rw", db.sessions, db.messages, async () => {
    await db.messages.where("sessionId").equals(id).delete();
    await db.sessions.delete(id);
  });
  bus.emit("session:deleted", id);
}

/**
 * Messages CRUD
 */
export async function getSessionMessages(sessionId) {
  return db.messages.where("sessionId").equals(sessionId).sortBy("timestamp");
}

export async function addMessage(message) {
  await db.messages.put(message);
  await db.sessions.update(message.sessionId, { updatedAt: Date.now() });
  bus.emit("message:added", message);
  return message;
}

export async function updateMessage(id, patch) {
  await db.messages.update(id, { ...patch, isEdited: true });
  const msg = await db.messages.get(id);
  bus.emit("message:updated", msg);
  return msg;
}

export async function deleteMessage(id) {
  const msg = await db.messages.get(id);
  await db.messages.delete(id);
  if (msg) bus.emit("message:deleted", msg);
}

export async function deleteLastAssistantMessage(sessionId) {
  const messages = await getSessionMessages(sessionId);
  const last = messages.filter((m) => m.role === "assistant").pop();
  if (last) await deleteMessage(last.id);
  return last;
}

/**
 * Presets CRUD
 */
export async function getAllPresets() {
  return db.presets.toArray();
}

export async function getPreset(id) {
  return db.presets.get(id);
}

export async function savePreset(preset) {
  preset.updatedAt = Date.now();
  await db.presets.put(preset);
  bus.emit("preset:changed", preset);
  return preset;
}

export async function deletePreset(id) {
  await db.presets.delete(id);
  bus.emit("preset:deleted", id);
}

/**
 * 数据导出（一键备份）
 */
export async function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    apiConfigs: await db.apiConfigs.toArray(),
    characters: await db.characters.toArray(),
    sessions: await db.sessions.toArray(),
    messages: await db.messages.toArray(),
    presets: await db.presets.toArray(),
  };
}

/**
 * 数据导入（一键恢复）
 */
export async function importAll(data) {
  if (!data || data.version !== 1) {
    throw new Error("Invalid backup file format");
  }
  await db.transaction(
    "rw",
    db.settings,
    db.apiConfigs,
    db.characters,
    db.sessions,
    db.messages,
    db.presets,
    async () => {
      await db.settings.clear();
      await db.apiConfigs.clear();
      await db.characters.clear();
      await db.sessions.clear();
      await db.messages.clear();
      await db.presets.clear();

      if (data.settings?.length) await db.settings.bulkPut(data.settings);
      if (data.apiConfigs?.length) await db.apiConfigs.bulkPut(data.apiConfigs);
      if (data.characters?.length) await db.characters.bulkPut(data.characters);
      if (data.sessions?.length) await db.sessions.bulkPut(data.sessions);
      if (data.messages?.length) await db.messages.bulkPut(data.messages);
      if (data.presets?.length) await db.presets.bulkPut(data.presets);
    }
  );
  bus.emit("data:imported");
}

export { db };
export default db;
