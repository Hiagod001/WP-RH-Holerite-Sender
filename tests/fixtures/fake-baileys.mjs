import fs from 'node:fs/promises';

// This adapter is loaded only by isolated API tests; it never connects to WhatsApp.
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-05T12:00:00-03:00'])); }
  static now() { return new NativeDate('2026-11-05T12:00:00-03:00').getTime(); }
};
export const Browsers = { windows: () => ['Test', 'Test', '1'] };
export const DisconnectReason = { loggedOut: 401 };
export async function fetchLatestWaWebVersion() { return { version: [0, 0, 0] }; }
export async function useMultiFileAuthState() { return { state: {}, saveCreds: async () => {} }; }
export default function makeWASocket() {
  return {
    ev: { on: (event, handler) => { if (event === 'connection.update') queueMicrotask(() => handler({ connection: 'open' })); } },
    onWhatsApp: async (jid) => [{ exists: true, jid }],
    sendMessage: async (jid, message) => {
      const pdf = await fs.readFile(message.document.url, 'utf8');
      await fs.appendFile(process.env.RH_TEST_CAPTURE, JSON.stringify({ jid, message, pdf }) + '\n');
      return { key: { id: 'test-message' } };
    }
  };
}
