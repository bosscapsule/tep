import { Question, Student, Group, ExamResult, Theme, GlobalSettings, ExamTheme, University } from '../types';
import { security } from './security';

const STORAGE_KEYS = {
  QUESTIONS: 'exam_system_questions',
  STUDENTS: 'exam_system_students',
  GROUPS: 'exam_system_groups',
  RESULTS: 'exam_system_results',
  SETTINGS: 'exam_system_global_settings',
  THEME: 'exam_system_theme',
  EXAM_THEMES: 'exam_system_exam_themes',
  UNIVERSITIES: 'exam_system_universities',
  ACTIVE_UNIVERSITY: 'exam_system_active_university',
  INTERRUPTED_EXAM: 'exam_system_interrupted_exam',
};

const CONTENT_RESET_KEY = 'anatomyzh_custom_content_reset_v1';

const getScopedKey = (baseKey: string): string => {
  const activeUniRaw = localStorage.getItem(STORAGE_KEYS.ACTIVE_UNIVERSITY);
  if (activeUniRaw) {
    try {
      const activeUni = JSON.parse(activeUniRaw);
      if (activeUni && activeUni.id) {
        return `${baseKey}_${activeUni.id}`;
      }
    } catch (e) {
      // ignore
    }
  }
  return baseKey;
};

const protectStudent = (student: Student): Student => {
  if (!student) return student;
  const next = { ...student };
  for (const key of ['pinfl', 'firstName', 'lastName'] as const) {
    const value = next[key];
    if (typeof value === 'string' && value.trim() && !security.isEncrypted(value)) {
      next[key] = security.encryptField(value) as never;
    }
  }
  return next;
};

const exposeStudent = (student: Student): Student => {
  if (!student) return student;
  const next = { ...student };
  for (const key of ['pinfl', 'firstName', 'lastName'] as const) {
    const value = next[key];
    if (typeof value === 'string' && value.trim() && security.isEncrypted(value)) {
      next[key] = security.decryptField(value) as never;
    }
  }
  return next;
};

const protectUniversity = (uni: University): University => {
  if (!uni?.key || security.isEncrypted(uni.key)) return uni;
  return { ...uni, key: security.encryptField(uni.key) };
};

const exposeUniversity = (uni: University): University => {
  if (!uni?.key) return uni;
  return { ...uni, key: security.decryptField(uni.key) };
};

const protectStudents = (students: Student[]) => (students || []).map(protectStudent);
const exposeStudents = (students: Student[]) => (students || []).map(exposeStudent);
const protectUniversities = (unis: University[]) => (unis || []).map(protectUniversity);
const exposeUniversities = (unis: University[]) => (unis || []).map(exposeUniversity);

export interface InterruptedExamSession {
  questions: Question[];
  currentQuestionIdx: number;
  statuses: Record<string, string>;
  answers: Record<string, string>;
  timeLeft: number;
  student: Student;
  theme: string;
  groupId: string;
  language: 'uz' | 'ru' | 'en';
  savedAt: string;
}

const protectExamResult = (result: ExamResult): ExamResult => {
  if (!result) return result;
  if (typeof result.studentName === 'string' && result.studentName.trim() && !security.isEncrypted(result.studentName)) {
    return { ...result, studentName: security.encryptField(result.studentName) };
  }
  return result;
};

const exposeExamResult = (result: ExamResult): ExamResult => {
  if (!result) return result;
  if (typeof result.studentName === 'string' && result.studentName.trim() && security.isEncrypted(result.studentName)) {
    return { ...result, studentName: security.decryptField(result.studentName) };
  }
  return result;
};

// Questions are created by administrators. The former built-in demo questions
// opened placeholder 3D models during student testing.
const INITIAL_ANATOMY_QUESTIONS: Question[] = [];

const isLegacyDemoQuestion = (question: Question) =>
  ['1', '2', '3'].includes(question.id) &&
  question.theme === 'Anatomy (3D)' &&
  ['skull', 'jaw', 'brain'].includes(String(question.modelId || ''));

export const storage = {
  getInterruptedExamSession: (): InterruptedExamSession | null => {
    const raw = localStorage.getItem(STORAGE_KEYS.INTERRUPTED_EXAM);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as InterruptedExamSession;
      if (
        !session ||
        !Array.isArray(session.questions) ||
        !session.student ||
        typeof session.timeLeft !== 'number'
      ) {
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  saveInterruptedExamSession: (session: InterruptedExamSession) => {
    localStorage.setItem(STORAGE_KEYS.INTERRUPTED_EXAM, JSON.stringify(session));
  },

  clearInterruptedExamSession: () => {
    localStorage.removeItem(STORAGE_KEYS.INTERRUPTED_EXAM);
  },

  clearCustomContent: () => {
    const prefixes = [
      STORAGE_KEYS.QUESTIONS,
      STORAGE_KEYS.STUDENTS,
      STORAGE_KEYS.RESULTS,
      STORAGE_KEYS.EXAM_THEMES,
    ];

    Object.keys(localStorage).forEach((key) => {
      if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}_`))) {
        localStorage.removeItem(key);
      }
    });

    [
      'tester_pro_custom_models',
      'tester_pro_media',
      'tester_pro_3d_labels',
      'tester_pro_3d_pins',
      'tester_pro_3d_free_annotations',
    ].forEach((key) => localStorage.removeItem(key));

    localStorage.setItem(CONTENT_RESET_KEY, '1');
  },

  hasClearedCustomContent: () => localStorage.getItem(CONTENT_RESET_KEY) === '1',

  getCurrentUniversity: (): University | null => {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_UNIVERSITY);
    if (!raw) return null;
    try {
      const uni = JSON.parse(raw);
      return uni ? exposeUniversity(uni) : null;
    } catch {
      return null;
    }
  },
  setCurrentUniversity: (uni: University | null) => {
    if (uni) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_UNIVERSITY, JSON.stringify(protectUniversity(uni)));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_UNIVERSITY);
    }
  },
  getUniversities: (): University[] => {
    const raw = localStorage.getItem(STORAGE_KEYS.UNIVERSITIES);
    if (!raw) return [];
    try {
      return exposeUniversities(JSON.parse(raw));
    } catch {
      return [];
    }
  },
  saveUniversities: (unis: University[]) => {
    localStorage.setItem(STORAGE_KEYS.UNIVERSITIES, JSON.stringify(protectUniversities(unis || [])));
  },
  rotateUniversityKey: (universityId: string, nextKey: string): University | null => {
    const universities = storage.getUniversities();
    const index = universities.findIndex((university) => university.id === universityId);
    if (index < 0 || !nextKey.trim()) return null;
    const normalizedKey = nextKey.trim().toUpperCase();
    if (universities.some((university, currentIndex) => currentIndex !== index && university.key.toUpperCase() === normalizedKey)) {
      return null;
    }
    const updated = { ...universities[index], key: normalizedKey };
    universities[index] = updated;
    storage.saveUniversities(universities);
    const active = storage.getCurrentUniversity();
    if (active?.id === universityId) storage.setCurrentUniversity(updated);
    return updated;
  },

  getQuestions: (): Question[] => {
    const key = getScopedKey(STORAGE_KEYS.QUESTIONS);
    const raw = localStorage.getItem(key);
    if (!raw) {
      storage.saveQuestions(INITIAL_ANATOMY_QUESTIONS);
      return INITIAL_ANATOMY_QUESTIONS;
    }
    try {
      const questions = JSON.parse(raw);
      if (!Array.isArray(questions)) {
        storage.saveQuestions(INITIAL_ANATOMY_QUESTIONS);
        return INITIAL_ANATOMY_QUESTIONS;
      }
      const cleanedQuestions = questions.map((q: any) => ({
        ...q,
        type: q?.type || 'single'
      })).filter(Boolean).filter((question: Question) => !isLegacyDemoQuestion(question));
      if (cleanedQuestions.length !== questions.length) {
        storage.saveQuestions(cleanedQuestions);
      }
      return cleanedQuestions;
    } catch {
      storage.saveQuestions(INITIAL_ANATOMY_QUESTIONS);
      return INITIAL_ANATOMY_QUESTIONS;
    }
  },
  saveQuestions: (questions: Question[]) => localStorage.setItem(getScopedKey(STORAGE_KEYS.QUESTIONS), JSON.stringify(questions || [])),
  
  getStudents: (): Student[] => {
    const key = getScopedKey(STORAGE_KEYS.STUDENTS);
    const raw = localStorage.getItem(key);
    if (!raw) {
      const defaults: Student[] = [];
      const protectedDefaults = protectStudents(defaults);
      localStorage.setItem(key, JSON.stringify(protectedDefaults));
      return defaults;
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? exposeStudents(parsed.filter(Boolean)) : [];
    } catch {
      return [];
    }
  },
  saveStudents: (students: Student[]) =>
    localStorage.setItem(getScopedKey(STORAGE_KEYS.STUDENTS), JSON.stringify(protectStudents(students || []))),
  
  getGroups: (): Group[] => {
    const key = getScopedKey(STORAGE_KEYS.GROUPS);
    const stored = localStorage.getItem(key);
    const defaults = [
      { id: '1', name: 'Группа A' },
      { id: '2', name: 'Группа B' }
    ];
    if (!stored) {
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        localStorage.setItem(key, JSON.stringify(defaults));
        return defaults;
      }
      return parsed.filter(g => g && g.id && g.name);
    } catch {
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
  },
  saveGroups: (groups: Group[]) => localStorage.setItem(getScopedKey(STORAGE_KEYS.GROUPS), JSON.stringify(groups || [])),
  
  getResults: (): ExamResult[] => {
    const key = getScopedKey(STORAGE_KEYS.RESULTS);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(exposeExamResult) : [];
    } catch {
      return [];
    }
  },
  saveResults: (results: ExamResult[]) => localStorage.setItem(getScopedKey(STORAGE_KEYS.RESULTS), JSON.stringify((results || []).map(protectExamResult))),

  getExamThemes: (): ExamTheme[] => {
    const key = getScopedKey(STORAGE_KEYS.EXAM_THEMES);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  },
  saveExamThemes: (themes: ExamTheme[]) => localStorage.setItem(getScopedKey(STORAGE_KEYS.EXAM_THEMES), JSON.stringify(themes || [])),
  addResult: (result: ExamResult) => {
    const results = storage.getResults();
    results.push(result);
    storage.saveResults(results);
  },
  
  getSettings: (): GlobalSettings => {
    const key = getScopedKey(STORAGE_KEYS.SETTINGS);
    const stored = localStorage.getItem(key);
    const defaults: GlobalSettings = {
      randomizeQuestions: false,
      randomizeOptions: false,
      antiCheatEnabled: false,
      timerMinutes: 25,
      show3D: true,
      showImages: true,
      scheduledExams: [],
    };
    if (!stored) {
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') {
        localStorage.setItem(key, JSON.stringify(defaults));
        return defaults;
      }
      return {
        ...defaults,
        ...parsed,
      };
    } catch {
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
  },
  saveSettings: (settings: GlobalSettings) => localStorage.setItem(getScopedKey(STORAGE_KEYS.SETTINGS), JSON.stringify(settings || {})),

  getTheme: (): Theme => (localStorage.getItem(STORAGE_KEYS.THEME) as Theme) || 'light',
  saveTheme: (theme: Theme) => localStorage.setItem(STORAGE_KEYS.THEME, theme),

  migrateSensitiveData: () => {
    const unis = storage.getUniversities();
    if (unis.length > 0) storage.saveUniversities(unis);

    const active = storage.getCurrentUniversity();
    if (active) storage.setCurrentUniversity(active);

    const students = storage.getStudents();
    if (students.length > 0) storage.saveStudents(students);
  },
};

