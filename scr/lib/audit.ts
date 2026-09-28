export type AuditAction =
  | 'login'
  | 'question_updated'
  | 'students_imported'
  | 'university_key_rotated'
  | 'session_revoked';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actor: string;
  universityId?: string;
  details?: string;
  timestamp: string;
  deviceName: string;
  ipAddress: string;
}

export interface DeviceSession {
  id: string;
  actor: string;
  universityId?: string;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
  deviceName: string;
  ipAddress: string;
}

const AUDIT_KEY = 'anatomyzh_audit_log_v1';
const SESSIONS_KEY = 'anatomyzh_device_sessions_v1';
const CURRENT_SESSION_KEY = 'anatomyzh_current_session_v1';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value === null ? fallback : value as T;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const createId = (prefix: string) => {
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  return `${prefix}_${Date.now()}_${Array.from(values).map((value) => value.toString(36)).join('')}`;
};

const deviceName = () => {
  const electronDevice = window.electron?.deviceInfo;
  if (electronDevice?.deviceName) return electronDevice.deviceName;
  if (typeof navigator === 'undefined') return 'Electron';
  return navigator.userAgent.slice(0, 120);
};

const deviceIp = () => window.electron?.deviceInfo?.ipAddress || 'local/offline';

const normalizeEntry = (entry: AuditEntry): AuditEntry => ({
  ...entry,
  deviceName: entry.deviceName || 'Unknown device',
  ipAddress: entry.ipAddress || 'local/offline',
});

const normalizeSession = (session: DeviceSession): DeviceSession => ({
  ...session,
  deviceName: session.deviceName || 'Unknown device',
  ipAddress: session.ipAddress || 'local/offline',
});

export const audit = {
  record(action: AuditAction, actor: string, universityId?: string, details?: string) {
    const entries = read<AuditEntry[]>(AUDIT_KEY, []).map(normalizeEntry);
    entries.unshift({
      id: createId('audit'),
      action,
      actor,
      universityId,
      details,
      timestamp: new Date().toISOString(),
      deviceName: deviceName(),
      ipAddress: deviceIp(),
    });
    write(AUDIT_KEY, entries.slice(0, 500));
  },
  list(): AuditEntry[] {
    return read<AuditEntry[]>(AUDIT_KEY, []).map(normalizeEntry);
  },
  sessions(): DeviceSession[] {
    return read<DeviceSession[]>(SESSIONS_KEY, []).map(normalizeSession);
  },
  startSession(actor: string, universityId?: string): DeviceSession | null {
    const now = new Date().toISOString();
    const session: DeviceSession = {
      id: createId('device'),
      actor,
      universityId,
      createdAt: now,
      lastSeenAt: now,
      revoked: false,
      deviceName: deviceName(),
      ipAddress: deviceIp(),
    };
    write(SESSIONS_KEY, [...read<DeviceSession[]>(SESSIONS_KEY, []), session].slice(-20));
    sessionStorage.setItem(CURRENT_SESSION_KEY, session.id);
    return session;
  },
  revokeSession(id: string) {
    const sessions = this.sessions().map((session) => session.id === id ? { ...session, revoked: true } : session);
    write(SESSIONS_KEY, sessions);
    audit.record('session_revoked', 'superadmin', undefined, id);
  },
  activeSessions(): DeviceSession[] {
    return this.sessions().filter((session) => !session.revoked);
  },
  isCurrentSessionActive(): boolean {
    const currentId = sessionStorage.getItem(CURRENT_SESSION_KEY);
    return !!currentId && this.activeSessions().some((session) => session.id === currentId);
  },
  hasCurrentSession(): boolean {
    return !!sessionStorage.getItem(CURRENT_SESSION_KEY);
  },
  touchCurrentSession() {
    const currentId = sessionStorage.getItem(CURRENT_SESSION_KEY);
    if (!currentId) return;
    const sessions = this.sessions().map((session) => session.id === currentId
      ? { ...session, lastSeenAt: new Date().toISOString() }
      : session);
    write(SESSIONS_KEY, sessions);
  },
  prune(days = 90) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    write(AUDIT_KEY, this.list().filter((entry) => Date.parse(entry.timestamp) >= cutoff));
  },
  clearOld(days = 90) {
    this.prune(days);
  },
  exportJson() {
    return JSON.stringify(this.list(), null, 2);
  },
  clearCurrentSession() {
    const currentId = sessionStorage.getItem(CURRENT_SESSION_KEY);
    if (currentId) {
      const sessions = this.sessions().map((session) => session.id === currentId
        ? { ...session, revoked: true, lastSeenAt: new Date().toISOString() }
        : session);
      write(SESSIONS_KEY, sessions);
    }
    sessionStorage.removeItem(CURRENT_SESSION_KEY);
  },
};
