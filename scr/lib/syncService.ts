import { storage } from './storage';
import { ExamResult } from '../types';
import { security } from './security';

export interface SyncData {
  questions: any[];
  students: any[];
  groups: any[];
  examThemes: any[];
  settings: any;
  results?: any[];
  timestamp: number;
}

const REGISTRY_CHANNEL = 'universities-registry';
const FALLBACK_RESULTS_PREFIX = 'tester_pro_fallback_results_';

const readSyncPayload = async <T>(raw: string | null, channelKey: string): Promise<T | null> => {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  return await security.unwrapSyncPayload(parsed, channelKey) as T;
};

const writeSyncPayload = async (key: string, payload: unknown, channelKey: string) => {
  const encrypted = await security.wrapSyncPayload(payload, channelKey);
  localStorage.setItem(key, JSON.stringify(encrypted));
};

const isSyncData = (value: unknown): value is SyncData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<SyncData>;
  return Array.isArray(data.questions)
    && Array.isArray(data.students)
    && Array.isArray(data.groups)
    && Array.isArray(data.examThemes)
  && !!data.settings
  && typeof data.settings === 'object'
  && typeof data.timestamp === 'number';
};

export const syncService = {
  generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  packLocalData(): SyncData {
    return {
      questions: storage.getQuestions(),
      students: storage.getStudents(),
      groups: storage.getGroups(),
      examThemes: storage.getExamThemes(),
      settings: storage.getSettings(),
      results: storage.getResults(),
      timestamp: Date.now(),
    };
  },

  unpackToLocal(data: SyncData) {
    if (data.questions) storage.saveQuestions(data.questions);
    if (data.students) storage.saveStudents(data.students);
    if (data.groups) storage.saveGroups(data.groups);
    if (data.examThemes) storage.saveExamThemes(data.examThemes);
    if (data.settings) storage.saveSettings(data.settings);
    if (data.results) storage.saveResults(data.results);
  },

  async createSyncSession(): Promise<{ code: string; success: boolean }> {
    const code = this.generateCode();
    const data = this.packLocalData();

    await writeSyncPayload(`tester_pro_room_${code}`, data, `room:${code}`);
    return { code, success: true };
  },

  async joinSyncSession(code: string): Promise<{ success: boolean; error?: string }> {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) return { success: false, error: 'invalid_code' };

    const localRef = localStorage.getItem(`tester_pro_room_${cleanCode}`);
    if (localRef) {
      try {
        const data = await readSyncPayload<SyncData>(localRef, `room:${cleanCode}`);
        if (!isSyncData(data)) return { success: false, error: 'corrupt_data' };
        this.unpackToLocal(data);
        localStorage.setItem('tester_pro_active_room', cleanCode);
        return { success: true };
      } catch {
        return { success: false, error: 'corrupt_data' };
      }
    }

    return { success: false, error: 'not_found' };
  },

  async uploadResultToSession(result: ExamResult): Promise<boolean> {
    const activeRoom = localStorage.getItem('tester_pro_active_room');
    if (!activeRoom) return false;

    const localRef = localStorage.getItem(`tester_pro_room_${activeRoom}`);
    if (localRef) {
      try {
        const data = await readSyncPayload<SyncData>(localRef, `room:${activeRoom}`);
        if (!isSyncData(data)) return false;
        const currentResults = data.results || [];
        if (!currentResults.some((r) => r.id === result.id)) {
          currentResults.push(result);
          data.results = currentResults;
          data.timestamp = Date.now();
          await writeSyncPayload(`tester_pro_room_${activeRoom}`, data, `room:${activeRoom}`);
        }
        return true;
      } catch (e) {
        console.error(e);
      }
    }

    return false;
  },

  async pullSessionResults(code: string): Promise<{ success: boolean; count: number; error?: string }> {
    const cleanCode = code.trim().toUpperCase();
    try {
      const localRef = localStorage.getItem(`tester_pro_room_${cleanCode}`);
      const data = await readSyncPayload<SyncData>(localRef, `room:${cleanCode}`);

      if (isSyncData(data) && data.results) {
        const cloudResults = data.results;
        const localResults = storage.getResults();
        let newCount = 0;
        cloudResults.forEach((cr: ExamResult) => {
          if (!localResults.some((lr) => lr.id === cr.id)) {
            localResults.push(cr);
            newCount++;
          }
        });

        if (newCount > 0) storage.saveResults(localResults);
        return { success: true, count: newCount };
      }
    } catch (e) {
      console.error(e);
    }

    return { success: false, count: 0, error: 'no_results_or_failed' };
  },

  async publishUniversities(universities: any[]): Promise<boolean> {
    await writeSyncPayload('tester_pro_universities_registry', universities, REGISTRY_CHANNEL);
    return true;
  },

  async pullUniversities(): Promise<any[]> {
    try {
      const data = await readSyncPayload<any[]>(localStorage.getItem('tester_pro_universities_registry'), REGISTRY_CHANNEL);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Failed to read university registry', error);
      return [];
    }
  },

  async publishUniversityData(uniKey: string): Promise<boolean> {
    const data = this.packLocalData();
    const cleanKey = uniKey.trim().toUpperCase();
    await writeSyncPayload(`tester_pro_uni_local_${cleanKey}`, data, `university:${cleanKey}`);
    return true;
  },

  async pullUniversityData(uniKey: string): Promise<{ success: boolean; data?: SyncData }> {
    const cleanKey = uniKey.trim().toUpperCase();
    const localRef = localStorage.getItem(`tester_pro_uni_local_${cleanKey}`);
    if (localRef) {
      try {
          const data = await readSyncPayload<SyncData>(localRef, `university:${cleanKey}`);
          if (!isSyncData(data)) return { success: false };
        this.unpackToLocal(data);
        return { success: true, data };
      } catch (e) {
        console.error(e);
      }
    }
    return { success: false };
  },

  async uploadStudentResult(uniKey: string, result: ExamResult): Promise<boolean> {
    const cleanKey = uniKey.trim().toUpperCase();
    try {
      const fallbackKey = `${FALLBACK_RESULTS_PREFIX}${cleanKey}`;
      const raw = localStorage.getItem(fallbackKey);
      const currentResults = await readSyncPayload<ExamResult[]>(raw, `university-results:${cleanKey}`) || [];
      if (!currentResults.some((r) => r.id === result.id)) currentResults.push(result);
      await writeSyncPayload(fallbackKey, currentResults, `university-results:${cleanKey}`);
      return true;
    } catch (e) {
      console.warn('Failed to upload student result to university key channel', e);

      const fallbackKey = `${FALLBACK_RESULTS_PREFIX}${cleanKey}`;
      try {
        const localResultsRaw = localStorage.getItem(fallbackKey);
        const localResults = await readSyncPayload<ExamResult[]>(localResultsRaw, `university-results:${cleanKey}`) || [];
        if (!localResults.some((r) => r.id === result.id)) {
          localResults.push(result);
          await writeSyncPayload(fallbackKey, localResults, `university-results:${cleanKey}`);
        }
      } catch (err) {
        console.error(err);
      }
      return false;
    }
  },

  async pullStudentResults(uniKey: string): Promise<{ success: boolean; count: number }> {
    const cleanKey = uniKey.trim().toUpperCase();
    try {
      let cloudResults: ExamResult[] = [];

      const fallbackKey = `${FALLBACK_RESULTS_PREFIX}${cleanKey}`;
      const localFallbackRaw = localStorage.getItem(fallbackKey);
      if (localFallbackRaw) {
        try {
          const localFallback = await readSyncPayload<ExamResult[]>(localFallbackRaw, `university-results:${cleanKey}`) || [];
          localFallback.forEach((fr) => {
            if (!cloudResults.some((cr) => cr.id === fr.id)) cloudResults.push(fr);
          });
        } catch (e) {
          console.error(e);
        }
      }

      if (cloudResults.length > 0) {
        const localResults = storage.getResults();
        let newCount = 0;
        cloudResults.forEach((cr: ExamResult) => {
          if (!localResults.some((lr) => lr.id === cr.id)) {
            localResults.push(cr);
            newCount++;
          }
        });

        if (newCount > 0) storage.saveResults(localResults);
        return { success: true, count: newCount };
      }
    } catch (e) {
      console.error(e);
    }
    return { success: false, count: 0 };
  },
};
