import { University } from '../types';

type ElectronSecurity = {
  encryptField: (value: string) => string;
  decryptField: (value: string) => string;
  verifyAdmin: (password: string, universities: University[]) => Promise<{ ok: boolean; role?: 'super' | 'admin' | 'university'; universityId?: string; reason?: string }>;
  encryptSyncPayload: (payload: unknown, channelKey: string) => Promise<{ v: number; enc: string }>;
  decryptSyncPayload: (payload: unknown, channelKey: string) => Promise<unknown>;
};

declare global {
  interface Window {
    electron?: {
      deviceInfo?: { deviceName: string; ipAddress: string };
      security?: ElectronSecurity;
    };
  }
}

const ENC_PREFIX = 'enc:';
const PINFL_ATTEMPTS_KEY = 'pinfl_login_attempts';
const ADMIN_ATTEMPTS_KEY = 'admin_login_attempts';
const browserSuperPasswordHash = '06ef64bd13b5a4c6b3fd2c75cd26adddc05995f768282036c473cf20d04dfef1';

const electronSecurity = (): ElectronSecurity | null => window.electron?.security || null;

const verifyBrowserSuperPassword = async (password: string) => {
  const data = new TextEncoder().encode(`anatomyzh-dev-v1:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  return hash === browserSuperPasswordHash;
};

export const security = {
  encryptField(value: string): string {
    return electronSecurity()?.encryptField(value) || value;
  },
  decryptField(value: string): string {
    return electronSecurity()?.decryptField(value) || value;
  },
  getRememberedUniversityPassword(universityId: string): string {
    try {
      const rememberedIds = JSON.parse(localStorage.getItem('saved_university_passwords_v1') || '[]');
      if (!Array.isArray(rememberedIds) || !rememberedIds.includes(universityId)) return '';

      const passwords = JSON.parse(localStorage.getItem('saved_university_password_values_v1') || '{}');
      const savedPassword = passwords?.[universityId];
      return typeof savedPassword === 'string' ? security.decryptField(savedPassword) : '';
    } catch (error) {
      console.warn('Could not read the remembered university password:', error);
      return '';
    }
  },
  async verifyAdminLogin(password: string, universities: University[]) {
    const electron = electronSecurity();
    if (electron) return electron.verifyAdmin(password, universities);
    const clean = password.trim();
    if (!clean) return { ok: false, reason: 'invalid' as const };
    if (import.meta.env.DEV && await verifyBrowserSuperPassword(clean)) {
      return { ok: true, role: 'super' as const };
    }
    const matched = universities.find((uni) => (uni.key || '').toUpperCase() === clean.toUpperCase());
    if (matched && (!matched.expiresAt || new Date(matched.expiresAt).getTime() >= Date.now())) {
      return { ok: true, role: 'university' as const, universityId: matched.id };
    }
    return { ok: false, reason: matched ? 'expired' : 'invalid' };
  },
  async wrapSyncPayload(payload: unknown, channelKey: string) {
    const electron = electronSecurity();
    if (electron) return electron.encryptSyncPayload(payload, channelKey);
    return { v: 1, enc: JSON.stringify(payload) };
  },
  async unwrapSyncPayload(payload: unknown, channelKey: string) {
    const electron = electronSecurity();
    if (electron) return electron.decryptSyncPayload(payload, channelKey);
    if (payload && typeof payload === 'object' && 'enc' in payload) return JSON.parse(String((payload as { enc: string }).enc));
    return payload;
  },
  maskPinfl(pinfl?: string) {
    return pinfl && pinfl.length >= 8 ? `${pinfl.slice(0, 4)}****${pinfl.slice(-4)}` : pinfl;
  },
  isEncrypted(value?: string) {
    return !!value && typeof value === 'string' && value.startsWith(ENC_PREFIX);
  },
};

export const pinflRateLimit = {
  canAttempt() {
    try {
      const state = JSON.parse(sessionStorage.getItem(PINFL_ATTEMPTS_KEY) || '{}');
      return state.lockedUntil > Date.now() ? { allowed: false, waitMs: state.lockedUntil - Date.now() } : { allowed: (state.count || 0) < 5, waitMs: 0 };
    } catch {
      return { allowed: true, waitMs: 0 };
    }
  },
  recordFailure() {
    const state = JSON.parse(sessionStorage.getItem(PINFL_ATTEMPTS_KEY) || '{"count":0}');
    state.count = (state.count || 0) + 1;
    if (state.count >= 5) { state.count = 0; state.lockedUntil = Date.now() + 60000; }
    sessionStorage.setItem(PINFL_ATTEMPTS_KEY, JSON.stringify(state));
  },
  reset() { sessionStorage.removeItem(PINFL_ATTEMPTS_KEY); },
};

const createRateLimit = (key: string, maxAttempts: number, lockDurationMs: number) => ({
  canAttempt() {
    try {
      const state = JSON.parse(sessionStorage.getItem(key) || '{}');
      return state.lockedUntil > Date.now()
        ? { allowed: false, waitMs: state.lockedUntil - Date.now() }
        : { allowed: (state.count || 0) < maxAttempts, waitMs: 0 };
    } catch {
      return { allowed: true, waitMs: 0 };
    }
  },
  recordFailure() {
    const state = JSON.parse(sessionStorage.getItem(key) || '{"count":0}');
    state.count = (state.count || 0) + 1;
    if (state.count >= maxAttempts) {
      state.count = 0;
      state.lockedUntil = Date.now() + lockDurationMs;
    }
    sessionStorage.setItem(key, JSON.stringify(state));
  },
  reset() {
    sessionStorage.removeItem(key);
  },
});

export const adminRateLimit = createRateLimit(ADMIN_ATTEMPTS_KEY, 5, 60000);

export const migrateLegacyRememberKey = async () => {
  localStorage.removeItem('saved_admin_password');
  localStorage.removeItem('saved_admin_key');
  localStorage.removeItem('saved_admin_session');
};
