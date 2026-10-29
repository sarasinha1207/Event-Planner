// Keeps the chat conversation for the length of the browser tab, so it survives
// moving between pages. Everything read back is validated.

export const CHAT_STORAGE_KEY = 'celebration-planner:chat:v1';
export const MAX_STORED_MESSAGES = 30;

const ROLES = ['user', 'model'];

/**
 * Whether a value is a well-formed chat message.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMessage(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    ROLES.includes(value.role) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    (value.source === undefined || typeof value.source === 'string') &&
    (value.model === undefined || typeof value.model === 'string')
  );
}

/**
 * The tab's session storage, or null when it is missing or blocked.
 *
 * @returns {Storage | null}
 */
export function sessionStorageOrNull() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates the store that keeps the conversation for the length of the tab.
 *
 * @param {Storage | null} storage
 * @returns {{ load: Function, save: Function, clear: Function }}
 */
export function createChatStore(storage) {
  function load() {
    if (!storage) return [];
    try {
      const saved = JSON.parse(storage.getItem(CHAT_STORAGE_KEY));
      return Array.isArray(saved) ? saved.filter(isMessage).slice(-MAX_STORED_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  function save(messages) {
    if (!storage) return;
    try {
      storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      // The conversation simply will not be remembered.
    }
  }

  function clear() {
    if (!storage) return;
    try {
      storage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Nothing useful can be done if storage is unavailable.
    }
  }

  return { load, save, clear };
}
