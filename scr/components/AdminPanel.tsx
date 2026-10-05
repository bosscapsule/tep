import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  BookOpen, 
  Settings, 
  LogOut, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Search,
  Timer,
  FileSpreadsheet,
  FileText,
  UserPlus,
  Edit2,
  Trophy,
  BarChart2,
  X,
  Image,
  Box,
  Globe,
  Clock,
  Calendar,
  School,
  Palette,
  GraduationCap,
  ShieldCheck,
  Check
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { ThemeToggle } from './ThemeToggle';
import { storage } from '../lib/storage';
import { Question, QuestionType, Student, Group, Language, ExamResult, GlobalSettings, Theme, ExamTheme, University } from '../types';
import { useTranslation, translations } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { security } from '../lib/security';
import { audit, AuditEntry, DeviceSession } from '../lib/audit';

// Maps a given model URL or base64 data string to a small, safe, unique storage key.
// This prevents QuotaExceededError when using massive data URIs or long names as JSON keys inside localStorage.
const getModelStorageKey = (modelId: string, mediaLibrary?: { id: string; url: string }[]): string => {
  if (!modelId) return '';
  if (['skull', 'jaw', 'brain'].includes(modelId)) return modelId;
  
  // Try using passed mediaLibrary
  if (mediaLibrary) {
    const item = mediaLibrary.find(m => m.url === modelId || m.id === modelId);
    if (item) return item.id;
  }

  // Try loading from localStorage
  try {
    const savedMedia = localStorage.getItem('tester_pro_media');
    if (savedMedia) {
      const parsed = JSON.parse(savedMedia) as { id: string; url: string }[];
      const item = parsed.find(m => m.url === modelId || m.id === modelId);
      if (item) return item.id;
    }
  } catch (e) {
    // ignore
  }

  if (modelId.startsWith('data:')) {
    let hash = 0;
    for (let i = 0; i < modelId.length; i++) {
      const char = modelId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `b64_${Math.abs(hash)}_${modelId.length}`;
  }
  
  return modelId;
};

const compressImage = (file: File, maxDimension: number, quality: number = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mimeType, quality));
      };
      img.onerror = () => {
        resolve(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      resolve('');
    };
    reader.readAsDataURL(file);
  });
};

import { Skeleton } from './Skeleton';
import Viewer3D from './Viewer3D';
import { mediaStore } from '../lib/mediaStore';
import { syncService } from '../lib/syncService';

type AdminTab = 'students' | 'questions' | 'stats' | 'media' | 'models3d' | 'settings' | 'sync' | 'universities' | 'branding' | 'security';

interface Props {
  onLogout: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
  isSuperAdmin?: boolean;
  activeUniversity?: University | null;
  onUniversityUpdate?: (uni: University) => void;
}

const ResolvedMediaImage: React.FC<{ value: string; alt: string; className: string }> = ({ value, alt, className }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    void mediaStore.resolve(value).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => { cancelled = true; };
  }, [value]);

  return <img src={src} alt={alt} className={className} />;
};

const formatStudentCount = (count: number, language: Language) => {
  if (language === 'uz') return `${count} nafar talaba`;
  if (language === 'en') return `${count} ${count === 1 ? 'student' : 'students'}`;

  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'студентов'
    : lastDigit === 1
      ? 'студент'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'студента'
        : 'студентов';
  return `${count} ${noun}`;
};

const formatQuestionCount = (count: number, language: Language) => {
  if (language === 'uz') return `${count} ta savol`;
  if (language === 'en') return `${count} ${count === 1 ? 'question' : 'questions'}`;

  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'вопросов'
    : lastDigit === 1
      ? 'вопрос'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'вопроса'
        : 'вопросов';
  return `${count} ${noun}`;
};

export const AdminPanel: React.FC<Props> = ({ 
  onLogout, 
  language, 
  setLanguage, 
  theme, 
  toggleTheme,
  isSuperAdmin = false,
  activeUniversity = null,
  onUniversityUpdate
}) => {
  const t = useTranslation(language);
  const isDarkTheme = theme === 'dark';
  const locale = language === 'ru' ? 'ru-RU' : language === 'uz' ? 'uz-UZ' : 'en-US';
  const groupListRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const modelSelectRef = useRef<HTMLDivElement>(null);
  const imageSelectRef = useRef<HTMLDivElement>(null);
  const themeSelectRef = useRef<HTMLDivElement>(null);
  const languageSelectRef = useRef<HTMLDivElement>(null);
  const correctAnswerSelectRef = useRef<HTMLDivElement>(null);
  const scheduledThemeSelectRef = useRef<HTMLDivElement>(null);
  const scheduledGroupSelectRef = useRef<HTMLDivElement>(null);
  const groupSelectRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>(isSuperAdmin ? 'universities' : 'students');
  const [mediaLibrary, setMediaLibrary] = useState<{id: string, name: string, type: 'image' | 'model', url: string}[]>([]);
  const [examThemes, setExamThemes] = useState<ExamTheme[]>([]);

  // Universities management states
  const [universities, setUniversities] = useState<University[]>(() => storage.getUniversities());
  const [newUniName, setNewUniName] = useState('');
  const [newUniKey, setNewUniKey] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // Branding states for adding a university
  const [newUniLogoUrl, setNewUniLogoUrl] = useState('');
  const [newUniBgUrl, setNewUniBgUrl] = useState('');
  const [newUniBgType, setNewUniBgType] = useState<'image' | 'video'>('image');

  // Branding states for inline editing
  const [editingUniId, setEditingUniId] = useState<string | null>(null);
  const [editUniLogoUrl, setEditUniLogoUrl] = useState('');
  const [editUniBgUrl, setEditUniBgUrl] = useState('');
  const [editUniBgType, setEditUniBgType] = useState<'image' | 'video'>('image');

  // Superadmin standalone branding page states
  const [selectedBrandingUniId, setSelectedBrandingUniId] = useState<string>('');
  const [brandName, setBrandName] = useState('');
  const [brandLogo, setBrandLogo] = useState('');
  const [brandBg, setBrandBg] = useState('');
  const [brandBgType, setBrandBgType] = useState<'image' | 'video'>('image');

  const universitiesRef = useRef(universities);
  useEffect(() => {
    universitiesRef.current = universities;
  }, [universities]);

  useEffect(() => {
    if (activeTab === 'branding' && universitiesRef.current.length > 0) {
      const selectedId = selectedBrandingUniId || universitiesRef.current[0].id;
      if (!selectedBrandingUniId) {
        setSelectedBrandingUniId(selectedId);
      }
      const targetUni = universitiesRef.current.find(u => u.id === selectedId);
      if (targetUni) {
        setBrandName(targetUni.name || '');
        setBrandLogo(targetUni.logoUrl || '');
        setBrandBg(targetUni.bgUrl || '');
        setBrandBgType(targetUni.bgType || 'image');
      }
    }
  }, [selectedBrandingUniId, activeTab]);

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomValues = new Uint32Array(8);
    crypto.getRandomValues(randomValues);
    let result = 'UNI-';
    for (const value of randomValues) {
      result += chars[value % chars.length];
    }
    setNewUniKey(result);
    return result;
  };

  const handleAddUniversity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUniName.trim()) return;
    if (!expiryDate) {
      alert(t.chooseKeyExpirationDate);
      return;
    }
    const finalKey = newUniKey.trim().toUpperCase() || generateRandomKey();
    
    if (universities.some(u => u.key === finalKey)) {
      alert(t.keyAlreadyInUse);
      return;
    }

    // Set to end of selected day (23:59:59)
    const expiresAt = new Date(expiryDate + 'T23:59:59').toISOString();

    const newUni: University = {
      id: 'uni_' + Date.now(),
      name: newUniName.trim(),
      key: finalKey,
      createdAt: new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'uz' ? 'uz-UZ' : 'en-US'),
      expiresAt,
      logoUrl: newUniLogoUrl.trim() || undefined,
      bgUrl: newUniBgUrl.trim() || undefined,
      bgType: newUniBgUrl.trim() ? newUniBgType : undefined,
    };

    const updated = [...universities, newUni];
    setUniversities(updated);
    storage.saveUniversities(updated);
    syncService.publishUniversities(updated);
    
    setNewUniName('');
    setNewUniKey('');
    setExpiryDate('');
    setNewUniLogoUrl('');
    setNewUniBgUrl('');
    setNewUniBgType('image');
  };

  const handleDeleteUniversity = (uni: University) => {
    setUniToDelete(uni);
  };

  const executeDeleteUniversity = (uni: University) => {
    const updated = universities.filter(u => u.id !== uni.id && u.key !== uni.key);
    setUniversities(updated);
    storage.saveUniversities(updated);
    syncService.publishUniversities(updated);
    
    const currentActive = storage.getCurrentUniversity();
    if (currentActive && (currentActive.id === uni.id || currentActive.key === uni.key)) {
      storage.setCurrentUniversity(null);
    }
    setUniToDelete(null);
  };

  useEffect(() => {
    const initializeMedia = async () => {
      await mediaStore.migrateLegacyMedia();

      const savedMedia = localStorage.getItem('tester_pro_media');
      if (savedMedia) {
        let parsed: typeof mediaLibrary;
        try {
          parsed = JSON.parse(savedMedia);
        } catch {
          parsed = [];
        }

        const migrated = await Promise.all(parsed
          .filter((item) => !['skull', 'jaw', 'brain'].includes(item?.id) && !['skull', 'jaw', 'brain'].includes(item?.url))
          .map(async (item) => {
          const url = item?.url || '';
          if (item && (url.startsWith('data:') || url.startsWith('blob:'))) {
            const stableId = item.id || `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await mediaStore.save(stableId, url);
            return { ...item, id: stableId, url: mediaStore.reference(stableId) };
          }
          return item;
          }));

        setMediaLibrary(migrated);
        localStorage.setItem('tester_pro_media', JSON.stringify(migrated));
      } else {
        setMediaLibrary([]);
        localStorage.setItem('tester_pro_media', JSON.stringify([]));
      }
    };
    void initializeMedia();

    const handleLabelsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ modelId: string; labels: any }>;
      if (customEvent.detail) {
        const { modelId, labels } = customEvent.detail;
        setModelLabels(prev => ({
          ...prev,
          [modelId]: labels
        }));
      }
    };
    window.addEventListener('tester_pro_labels_updated', handleLabelsUpdate as EventListener);
    return () => {
      window.removeEventListener('tester_pro_labels_updated', handleLabelsUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      syncService.pullUniversities().then((cloudUnis) => {
        if (cloudUnis && Array.isArray(cloudUnis) && cloudUnis.length > 0) {
          const localUnis = storage.getUniversities() || [];
          const merged = [...localUnis];
          cloudUnis.forEach((cu) => {
            const idx = merged.findIndex((lu) => lu && (lu.id === cu.id || lu.key.toUpperCase() === cu.key.toUpperCase()));
            if (idx > -1) {
              // Prefer local branding over cloud since size limits on the shared cloud registry might strip large base64 strings
              merged[idx] = {
                ...cu,
                ...merged[idx],
                name: cu.name || merged[idx].name,
                expiresAt: merged[idx].expiresAt || cu.expiresAt,
              };
            } else {
              merged.push(cu);
            }
          });
          setUniversities(merged);
          storage.saveUniversities(merged);
        }
      });
    }
  }, [isSuperAdmin]);

  const saveMedia = (media: typeof mediaLibrary) => {
    const normalized = media.map((item) => {
      if (!item.url || item.url.startsWith('data:') || item.url.startsWith('blob:')) {
        const id = item.id || `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return { ...item, id, url: mediaStore.reference(id) };
      }
      return item;
    });

    setMediaLibrary(normalized);
    localStorage.setItem('tester_pro_media', JSON.stringify(normalized));
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const saveUniversitiesSafe = (updated: University[]) => {
    try {
      storage.saveUniversities(updated);
      syncService.publishUniversities(updated);
    } catch (error) {
      console.error('Failed to save university branding', error);
      alert(t.failedSaveBranding);
    }
  };

  const updateCurrentUniversityIfActive = (updated: University[]) => {
    const current = storage.getCurrentUniversity();
    if (!current) return;
    const match = updated.find(u => u.id === selectedBrandingUniId);
    if (match && current.id === selectedBrandingUniId) {
      storage.setCurrentUniversity(match);
      if (onUniversityUpdate) {
        onUniversityUpdate(match);
      }
    }
  };

  const handleResultsLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert(t.chooseLogoImage);
      return;
    }

    const logo = file.type === 'image/svg+xml'
      ? await readFileAsDataUrl(file)
      : await compressImage(file, 300, 0.75);
    if (logo) setResultsUniversityLogo(logo);
  };

  const saveResultsUniversityBranding = () => {
    if (!activeUniversity) return;
    const updatedUniversity = {
      ...activeUniversity,
      name: resultsUniversityName.trim() || activeUniversity.name,
      logoUrl: resultsUniversityLogo.trim() || undefined,
    };
    const updatedUniversities = universities.map((university) =>
      university.id === activeUniversity.id ? updatedUniversity : university,
    );
    setUniversities(updatedUniversities);
    saveUniversitiesSafe(updatedUniversities);
    storage.setCurrentUniversity(updatedUniversity);
    onUniversityUpdate?.(updatedUniversity);
  };

  const handleBrandLogoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(t.chooseLogoImage);
      return;
    }

    try {
      if (file.type === 'image/svg+xml') {
        const dataUrl = await readFileAsDataUrl(file);
        setBrandLogo(dataUrl);
        return;
      }

      const compressed = await compressImage(file, 300, 0.75);
      if (!compressed) {
        alert(t.failedProcessLogo);
        return;
      }

      setBrandLogo(compressed);
    } catch (error) {
      console.error('Logo upload failed', error);
      alert(t.failedUploadLogo);
    }
  };

  const handleBrandBackgroundUpload = async (file: File) => {
    if (!file) return;

    try {
      if (file.type.startsWith('video/')) {
        const dataUrl = await readFileAsDataUrl(file);
        setBrandBg(dataUrl);
        setBrandBgType('video');
        return;
      }

      if (!file.type.startsWith('image/')) {
        alert(t.chooseImageOrVideo);
        return;
      }

      const compressed = await compressImage(file, 800, 0.65);
      if (!compressed) {
        alert(t.failedProcessBackground);
        return;
      }

      setBrandBg(compressed);
      setBrandBgType('image');
    } catch (error) {
      console.error('Background upload failed', error);
      alert(t.failedUploadBackground);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'model', callback?: (item: {id: string, url: string}) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const id = Math.random().toString(36).substr(2, 9);
      await mediaStore.save(id, event.target?.result as string);
      const newMedia = {
        id,
        name: file.name,
        type: type,
        url: mediaStore.reference(id)
      };
      saveMedia([...mediaLibrary, newMedia]);
      if (callback) callback({ id: newMedia.id, url: newMedia.url });
    };
    reader.readAsDataURL(file);
  };
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [resultsUniversityName, setResultsUniversityName] = useState('');
  const [resultsUniversityLogo, setResultsUniversityLogo] = useState('');
  const [isResultsBrandingOpen, setIsResultsBrandingOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [settings, setSettings] = useState<GlobalSettings>(() => storage.getSettings());
  const [groupSearch, setGroupSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [subgroupSearch, setSubgroupSearch] = useState('');
  const [isImageSelectOpen, setIsImageSelectOpen] = useState(false);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const [modelPanelSearch, setModelPanelSearch] = useState('');
  const [themeSearch, setThemeSearch] = useState('');
  const [isThemeSelectOpen, setIsThemeSelectOpen] = useState(false);
  const [isLanguageSelectOpen, setIsLanguageSelectOpen] = useState(false);
  const [isCorrectAnswerSelectOpen, setIsCorrectAnswerSelectOpen] = useState(false);
  const [isScheduledThemeSelectOpen, setIsScheduledThemeSelectOpen] = useState(false);
  const [isScheduledGroupSelectOpen, setIsScheduledGroupSelectOpen] = useState(false);
  const [isQuestionTypeSelectOpen, setIsQuestionTypeSelectOpen] = useState(false);
  const questionTypeSelectRef = useRef<HTMLDivElement>(null);
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<string[]>([]);
  const [expandedThemes, setExpandedThemes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [autoBackups, setAutoBackups] = useState<any[]>([]);
  const [uniToDelete, setUniToDelete] = useState<University | null>(null);
  const [isSuperAdminDatePickerOpen, setIsSuperAdminDatePickerOpen] = useState(false);
  const [currentSuperAdminCalendarDate, setCurrentSuperAdminCalendarDate] = useState(new Date());
  const [superAdminCalendarView, setSuperAdminCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const [expiryExtensionTargetId, setExpiryExtensionTargetId] = useState<string | null>(null);
  const [isExpiryExtensionPickerOpen, setIsExpiryExtensionPickerOpen] = useState(false);
  const [currentExpiryExtensionCalendarDate, setCurrentExpiryExtensionCalendarDate] = useState(new Date());
  const [expiryExtensionCalendarView, setExpiryExtensionCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() => audit.list());
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>(() => audit.sessions());
  const [auditActionFilter, setAuditActionFilter] = useState<'all' | AuditEntry['action']>('all');
  const [auditUniversityFilter, setAuditUniversityFilter] = useState('all');
  const [activeDeviceSearch, setActiveDeviceSearch] = useState('');
  const [auditEntrySearch, setAuditEntrySearch] = useState('');
  const superAdminDatePickerRef = useRef<HTMLDivElement>(null);
  const expiryExtensionPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResultsUniversityName(activeUniversity?.name || '');
    setResultsUniversityLogo(activeUniversity?.logoUrl || '');
    setIsResultsBrandingOpen(false);
  }, [activeUniversity]);

  const refreshAuditState = () => {
    setAuditEntries(audit.list());
    setDeviceSessions(audit.sessions());
  };

  const exportAuditLog = () => {
    const blob = new Blob([audit.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anatomyzh-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const auditUniversityName = (universityId?: string) =>
    universities.find((university) => university.id === universityId)?.name || '—';

  const auditActionLabel = (action: AuditEntry['action']) => {
    const labels: Record<AuditEntry['action'], string> = {
      login: language === 'ru' ? 'Вход' : language === 'uz' ? 'Kirish' : 'Login',
      question_updated: language === 'ru' ? 'Изменение вопроса' : language === 'uz' ? 'Savol o‘zgartirildi' : 'Question updated',
      students_imported: language === 'ru' ? 'Импорт студентов' : language === 'uz' ? 'Talabalar importi' : 'Students imported',
      university_key_rotated: language === 'ru' ? 'Продление срока' : language === 'uz' ? 'Muddat uzaytirildi' : 'Expiry extended',
      session_revoked: language === 'ru' ? 'Сессия отозвана' : language === 'uz' ? 'Sessiya bekor qilindi' : 'Session revoked',
    };
    return labels[action];
  };

  const filteredAuditEntries = auditEntries.filter((entry) => {
    const actionMatches = auditActionFilter === 'all' || entry.action === auditActionFilter;
    const universityMatches = auditUniversityFilter === 'all' || entry.universityId === auditUniversityFilter;
    const search = auditEntrySearch.trim().toLocaleLowerCase();
    const searchMatches = !search || [
      auditActionLabel(entry.action),
      entry.actor,
      auditUniversityName(entry.universityId),
      entry.details || '',
      new Date(entry.timestamp).toLocaleString(),
    ].some((value) => value.toLocaleLowerCase().includes(search));
    return actionMatches && universityMatches && searchMatches;
  });

  const filteredActiveDeviceSessions = deviceSessions.filter((session) => {
    if (session.revoked) return false;
    const search = activeDeviceSearch.trim().toLocaleLowerCase();
    return !search || [
      session.actor,
      session.deviceName,
      session.ipAddress,
      auditUniversityName(session.universityId),
      new Date(session.lastSeenAt).toLocaleString(),
    ].some((value) => value.toLocaleLowerCase().includes(search));
  });

  const openUniversityExpiryPicker = (university: University) => {
    const monthDate = university.expiresAt ? new Date(university.expiresAt) : new Date();
    setExpiryExtensionTargetId(university.id);
    setCurrentExpiryExtensionCalendarDate(monthDate);
    setExpiryExtensionCalendarView('days');
    setIsExpiryExtensionPickerOpen(true);
  };

  const applyUniversityExpiryDate = async (university: University, dateStr: string) => {
    const parsedDate = new Date(dateStr + 'T23:59:59');
    if (Number.isNaN(parsedDate.getTime())) return;

    const updated = storage.extendUniversityExpiry(university.id, parsedDate.toISOString());
    if (!updated) {
      alert(t.expiryUpdateFailed);
      return;
    }

    const updatedUniversities = storage.getUniversities();
    setUniversities(updatedUniversities);
    try {
      await syncService.publishUniversities(updatedUniversities);
    } catch (error) {
      console.error('Failed to sync university expiry date:', error);
      alert(t.expirySyncFailed);
    }
    setIsExpiryExtensionPickerOpen(false);
    setExpiryExtensionTargetId(null);
    audit.record('university_key_rotated', 'superadmin', university.id, `expiry extended to ${dateStr}`);
    refreshAuditState();
  };

  const [rememberedUniversityIds, setRememberedUniversityIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('saved_university_passwords_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to load remembered university passwords:', error);
      return [];
    }
  });

  const isUniversitySavedBySuperAdmin = (universityId: string) =>
    rememberedUniversityIds.includes(universityId);

  const toggleRememberUniversity = (university: University) => {
    const isRemembered = isUniversitySavedBySuperAdmin(university.id);
    const nextIds = isRemembered
      ? rememberedUniversityIds.filter((id) => id !== university.id)
      : [...rememberedUniversityIds, university.id];

    try {
      const savedPasswords = JSON.parse(localStorage.getItem('saved_university_password_values_v1') || '{}') as Record<string, string>;
      if (isRemembered) {
        delete savedPasswords[university.id];
      } else {
        savedPasswords[university.id] = security.encryptField(university.key);
      }
      localStorage.setItem('saved_university_password_values_v1', JSON.stringify(savedPasswords));
      localStorage.setItem('saved_university_passwords_v1', JSON.stringify(nextIds));
    } catch (error) {
      console.error('Failed to save remembered university password:', error);
      alert(t.rememberPasswordFailed);
      return;
    }
    setRememberedUniversityIds(nextIds);
  };

  const rememberActiveUniversity = () => {
    if (!activeUniversity) return;
    try {
      const savedPasswords = JSON.parse(localStorage.getItem('saved_university_password_values_v1') || '{}') as Record<string, string>;
      savedPasswords[activeUniversity.id] = security.encryptField(activeUniversity.key);
      localStorage.setItem('saved_university_password_values_v1', JSON.stringify(savedPasswords));
    } catch (error) {
      console.error('Failed to remember active university password:', error);
      alert(t.rememberPasswordFailed);
      return;
    }
  };

  const [selectedModelId3D, setSelectedModelId3D] = useState<string>('');
  const [selectedPartId3D, setSelectedPartId3D] = useState<string>('');
  const [isLeftPanelOpen3D, setIsLeftPanelOpen3D] = useState<boolean>(true);
  const [terminalBg3D, setTerminalBg3D] = useState<'dark' | 'white'>('dark');

  const activeModelKey3D = getModelStorageKey(selectedModelId3D, mediaLibrary);

  // Custom uploaded 3D Models
  const [customModels, setCustomModels] = useState<{ id: string; label: string; nameRu: string; nameUz: string; url: string; type: 'file' | 'url' }[]>(() => {
    try {
      const saved = localStorage.getItem('tester_pro_custom_models');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const saveCustomModels = (models: typeof customModels) => {
    setCustomModels(models);
    localStorage.setItem('tester_pro_custom_models', JSON.stringify(models));
  };

  const [showAddCustomModelModal, setShowAddCustomModelModal] = useState(false);
  const [customModelName, setCustomModelName] = useState('');
  const [customModelSource, setCustomModelSource] = useState<'file' | 'url'>('url');
  const [customModelUrl, setCustomModelUrl] = useState('');
  const [customModelLabelIcon, setCustomModelLabelIcon] = useState('📦');

  const [modelLabels, setModelLabels] = useState<Record<string, Record<string, {nameRu: string, nameUz: string, nameEn?: string, color: string, description?: string, showArrow?: boolean}>>>(() => {
    const DEFAULT_MODEL_LABELS: Record<string, Record<string, {nameRu: string, nameUz: string, nameEn?: string, color: string, description?: string, showArrow?: boolean}>> = {
      skull: {
        cranium: { 
          nameRu: 'Теменная и лобная кость (Cranium)', 
          nameUz: 'Tepalik va peshona suyagi (Cranium)', 
          nameEn: 'Cranial vault and frontal bones (Cranium)',
          color: '#10b981',
          description: 'Верхняя часть человеческого черепа, защищающая головной мозг.'
        },
        mandible: { 
          nameRu: 'Нижняя челюсть (Mandibula)', 
          nameUz: 'Pastki jag\' (Mandibula)', 
          nameEn: 'Mandible',
          color: '#3b82f6',
          description: 'Единственная кость черепа, способная совершать активные движения.'
        }
      },
      jaw: {
        mandible: { 
          nameRu: 'Нижняя челюсть со стоп-зубами (Mandibula)', 
          nameUz: 'Tishli pastki jag\' (Mandibula)', 
          nameEn: 'Mandible with teeth',
          color: '#f59e0b',
          description: 'Нижняя челюстная кость человека с зубными рядами.'
        }
      },
      brain: {
        left: { 
          nameRu: 'Левое полушарие (Hemispherium sinistrum)', 
          nameUz: 'Chap yarim shar (Hemispherium sinistrum)', 
          nameEn: 'Left cerebral hemisphere',
          color: '#a855f7',
          description: 'Отвечает за логическое и критическое мышление, математические вычисления.'
        },
        right: { 
          nameRu: 'Правое полушарие (Hemispherium dextrum)', 
          nameUz: 'O\'ng yarim shar (Hemispherium dextrum)', 
          nameEn: 'Right cerebral hemisphere',
          color: '#ec4899',
          description: 'Отвечает за обработку невербальной информации, пространственную ориентацию.'
        },
        cerebellum: { 
          nameRu: 'Мозжечок (Cerebellum)', 
          nameUz: 'Miyacha (Cerebellum)', 
          nameEn: 'Cerebellum',
          color: '#10b981',
          description: 'Отдел головного мозга, играющий решающую роль в координации движений.'
        }
      }
    };
    const saved = localStorage.getItem('tester_pro_3d_labels');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return DEFAULT_MODEL_LABELS;
  });

  const saveModelLabels = (newLabels: typeof modelLabels) => {
    const sanitized: typeof modelLabels = {};
    Object.entries(newLabels).forEach(([key, value]) => {
      const cleanKey = getModelStorageKey(key, mediaLibrary);
      sanitized[cleanKey] = value;
    });
    setModelLabels(sanitized);
    localStorage.setItem('tester_pro_3d_labels', JSON.stringify(sanitized));
  };

  const handleGLBFileUpload = async (file: File) => {
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const mediaId = Math.random().toString(36).substr(2, 9);
    await mediaStore.save(mediaId, dataUrl);
    const url = mediaStore.reference(mediaId);
    
    // Create a new model entity
    const newModel = {
      id: mediaId,
      label: customModelLabelIcon || '📦',
      nameRu: customModelName || file.name.replace('.glb', '').replace('.gltf', ''),
      nameUz: customModelName || file.name.replace('.glb', '').replace('.gltf', ''),
      url: url,
      type: 'file' as const
    };

    saveMedia([...mediaLibrary, {
      id: mediaId,
      name: file.name,
      type: 'model' as const,
      url,
    }]);
    
    const updated = [...customModels, newModel];
    saveCustomModels(updated);
    
    // Select this model instantly
    setSelectedModelId3D(url);
    setSelectedPartId3D('');
    
    // Reset modal fields
    setCustomModelName('');
    setCustomModelUrl('');
    setCustomModelLabelIcon('📦');
    setShowAddCustomModelModal(false);
  };

  const handleGLBUrlAdd = () => {
    if (!customModelUrl) return;
    
    // For general link persistence, we use the URL
    const newModel = {
      id: customModelUrl,
      label: customModelLabelIcon || '📦',
      nameRu: customModelName || 'Кастомная 3D Модель',
      nameUz: customModelName || 'Maxsus 3D model',
      url: customModelUrl,
      type: 'url' as const
    };
    
    const updated = [...customModels, newModel];
    saveCustomModels(updated);
    
    setSelectedModelId3D(customModelUrl);
    setSelectedPartId3D('');
    
    setCustomModelName('');
    setCustomModelUrl('');
    setCustomModelLabelIcon('📦');
    setShowAddCustomModelModal(false);
  };

  const CLINICAL_PALETTES = [
    { nameRu: 'Классик', nameUz: 'Klassik', nameEn: 'Classic', colors: ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899'] },
    { nameRu: 'Неон', nameUz: 'Neon', nameEn: 'Neon', colors: ['#ff0055', '#00ffcc', '#ffcc00', '#9900ff', '#ff6600'] },
    { nameRu: 'Свежий', nameUz: 'Yorqin', nameEn: 'Fresh', colors: ['#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'] },
    { nameRu: 'Теплый', nameUz: 'Issiq', nameEn: 'Warm', colors: ['#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5'] }
  ];

  const applyCuratedPalette = (colors: string[]) => {
    const updated = { ...modelLabels };
    let idx = 0;
    Object.keys(updated[selectedModelId3D] || {}).forEach((partKey) => {
      if (updated[selectedModelId3D][partKey]) {
        updated[selectedModelId3D][partKey] = {
          ...updated[selectedModelId3D][partKey],
          color: colors[idx % colors.length]
        };
        idx++;
      }
    });
    saveModelLabels(updated);
  };

  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [editNameRu, setEditNameRu] = useState('');
  const [editNameUz, setEditNameUz] = useState('');
  const [editColor, setEditColor] = useState('#10b981');

  // Premium 3D control states
  const [autoRotate3D, setAutoRotate3D] = useState(false);
  const [lightingPreset3D, setLightingPreset3D] = useState<'clinical' | 'xray' | 'cinematic'>('clinical');
  const [showGrid3D, setShowGrid3D] = useState(false);
  const [explodeFactor3D, setExplodeFactor3D] = useState(0);
  const [isolateMode3D, setIsolateMode3D] = useState(false);
  const [cameraPreset3D, setCameraPreset3D] = useState('');

  // 3D HUD self-testing simulator states
  const [simulatorMode3D, setSimulatorMode3D] = useState(false);
  const [simulatorTargetPart, setSimulatorTargetPart] = useState<string | null>(null);
  const [simulatorScore, setSimulatorScore] = useState({ correct: 0, total: 0 });
  const [simulatorFeedback, setSimulatorFeedback] = useState<{ type: 'success' | 'error' | null, message: string | null }>({ type: null, message: null });

  // Word-style Ribbon selection tab
  const [activeRibbon3D, setActiveRibbon3D] = useState<'palettes' | 'segments' | 'shader' | 'hud'>('palettes');
  const [blenderLoopMode, setBlenderLoopMode] = useState<boolean>(false);

  // Update simulation when simulatorMode3D or selectedModelId3D changes
  useEffect(() => {
    if (simulatorMode3D) {
      const parts = Object.keys(modelLabels[getModelStorageKey(selectedModelId3D, mediaLibrary)] || {});
      if (parts.length > 0) {
        const randomPart = parts[Math.floor(Math.random() * parts.length)];
        setSimulatorTargetPart(randomPart);
        setSimulatorFeedback({ type: null, message: null });
      } else {
        setSimulatorTargetPart(null);
      }
    } else {
      setSimulatorTargetPart(null);
      setSimulatorFeedback({ type: null, message: null });
    }
  }, [simulatorMode3D, selectedModelId3D, mediaLibrary, modelLabels]);

  const handleSimulatorPartClick = (clickedPart: string) => {
    if (!simulatorMode3D || !simulatorTargetPart) return;
    
    if (clickedPart === simulatorTargetPart) {
      setSimulatorScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      
      const currentLabel = modelLabels[getModelStorageKey(selectedModelId3D, mediaLibrary)]?.[simulatorTargetPart];
      const partName = currentLabel
        ? language === 'en' ? currentLabel.nameEn || currentLabel.nameUz : language === 'ru' ? currentLabel.nameRu : currentLabel.nameUz
        : simulatorTargetPart;
      
      setSimulatorFeedback({
        type: 'success',
        message: t.correctModelAnswer.replace('{part}', partName)
      });

      // Automatically load the next part after 1800ms
      setTimeout(() => {
        const parts = Object.keys(modelLabels[getModelStorageKey(selectedModelId3D, mediaLibrary)] || {});
        const remaining = parts.filter(p => p !== clickedPart);
        const nextPool = remaining.length > 0 ? remaining : parts;
        const randomPart = nextPool[Math.floor(Math.random() * nextPool.length)];
        setSimulatorTargetPart(randomPart);
        setSimulatorFeedback({ type: null, message: null });
      }, 1800);
      
    } else {
      setSimulatorScore(prev => ({ ...prev, total: prev.total + 1 }));
      
      const clickedLabel = modelLabels[getModelStorageKey(selectedModelId3D, mediaLibrary)]?.[clickedPart];
      const clickedName = clickedLabel ? (language === 'ru' ? clickedLabel.nameRu : clickedLabel.nameUz) : clickedPart;
      
      setSimulatorFeedback({
        type: 'error',
        message: t.incorrectModelAnswer.replace('{part}', clickedName)
      });
    }
  };

  useEffect(() => {
    // Instant loading
    setIsLoading(false);
  }, []);

  const toggleThemeAccordion = (themeKey: string) => {
    setExpandedThemes(prev => ({
      ...prev,
      [themeKey]: !prev[themeKey]
    }));
  };

  // Form states
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [adminCalendarView, setAdminCalendarView] = useState<'days' | 'months' | 'years'>('days');
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (imageSelectRef.current && !imageSelectRef.current.contains(e.target as Node)) {
        setIsImageSelectOpen(false);
      }
      if (modelSelectRef.current && !modelSelectRef.current.contains(e.target as Node)) {
        setIsModelSelectOpen(false);
      }
      if (themeSelectRef.current && !themeSelectRef.current.contains(e.target as Node)) {
        setIsThemeSelectOpen(false);
      }
      if (languageSelectRef.current && !languageSelectRef.current.contains(e.target as Node)) {
        setIsLanguageSelectOpen(false);
      }
      if (correctAnswerSelectRef.current && !correctAnswerSelectRef.current.contains(e.target as Node)) {
        setIsCorrectAnswerSelectOpen(false);
      }
      if (scheduledThemeSelectRef.current && !scheduledThemeSelectRef.current.contains(e.target as Node)) {
        setIsScheduledThemeSelectOpen(false);
      }
      if (scheduledGroupSelectRef.current && !scheduledGroupSelectRef.current.contains(e.target as Node)) {
        setIsScheduledGroupSelectOpen(false);
      }
      if (questionTypeSelectRef.current && !questionTypeSelectRef.current.contains(e.target as Node)) {
        setIsQuestionTypeSelectOpen(false);
      }
      if (groupSelectRef.current && !groupSelectRef.current.contains(e.target as Node)) {
        setIsGroupListOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
        setAdminCalendarView('days');
      }
      if (superAdminDatePickerRef.current && !superAdminDatePickerRef.current.contains(e.target as Node)) {
        setIsSuperAdminDatePickerOpen(false);
        setSuperAdminCalendarView('days');
      }
      if (expiryExtensionPickerRef.current && !expiryExtensionPickerRef.current.contains(e.target as Node)) {
        setIsExpiryExtensionPickerOpen(false);
        setExpiryExtensionTargetId(null);
        setExpiryExtensionCalendarView('days');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [newGroupName, setNewGroupName] = useState('');
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [isGroupListOpen, setIsGroupListOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', groupId: '', language: 'ru' as Language, subgroup: '', pinfl: '' });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});
  const [newQuestion, setNewQuestion] = useState<Partial<Question>>({
    theme: '',
    language: 'ru',
    text: '',
    options: { A: '', B: '', C: '', D: '', E: '' },
    correctAnswer: 'A',
    type: 'single'
  });

  const [newGroupLang, setNewGroupLang] = useState<Language>('ru');
  const [creationLanguage, setCreationLanguage] = useState<Language>('ru');
  const [logo, setLogo] = useState(settings.logo || '');
  const [logoType, setLogoType] = useState<'text' | 'image'>(settings.logoType || 'text');

  const [scheduleForm, setScheduleForm] = useState({
    theme: '',
    groupId: 'all',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    duration: 480
  });

  const handleAddSchedule = () => {
    if (!scheduleForm.theme) return;
    const newSchedule = {
      id: Math.random().toString(36).substr(2, 9),
      ...scheduleForm,
      isActive: true
    };
    const updatedExams = [...(settings.scheduledExams || []), newSchedule];
    updateSettings({ ...settings, scheduledExams: updatedExams });
    setScheduleForm({
       theme: '',
       groupId: 'all',
       date: new Date().toISOString().split('T')[0],
       startTime: '09:00',
       duration: 480
    });
  };

  const handleDeleteSchedule = (id: string) => {
    const updatedExams = (settings.scheduledExams || []).filter(e => e.id !== id);
    updateSettings({ ...settings, scheduledExams: updatedExams });
  };

  const handleUpdateLogo = (newLogo: string, type: 'text' | 'image') => {
    setLogo(newLogo);
    setLogoType(type);
    updateSettings({ ...settings, logo: newLogo, logoType: type });
  };

  useEffect(() => {
    // Auto-delete expired scheduled exams (10 hours after start time)
    const cleanupExpiredExams = () => {
      const now = new Date();
      const currentExams = settings.scheduledExams || [];
      const validExams = currentExams.filter(exam => {
        try {
          const [hours, minutes] = exam.startTime.split(':').map(Number);
          const examDate = new Date(exam.date);
          examDate.setHours(hours, minutes, 0, 0);
          
          // Add 8 hours
          const expiryDate = new Date(examDate.getTime() + 8 * 60 * 60 * 1000);
          return expiryDate > now;
        } catch (e) {
          return true;
        }
      });

      if (validExams.length !== currentExams.length) {
        updateSettings({ ...settings, scheduledExams: validExams });
      }
    };

    cleanupExpiredExams();
    const interval = setInterval(cleanupExpiredExams, 15 * 60 * 1000); // Check every 15 mins
    return () => clearInterval(interval);
  }, [settings.scheduledExams]);

  const runAutoBackup = () => {
    try {
      const data = {
        questions: storage.getQuestions(),
        students: storage.getStudents(),
        groups: storage.getGroups(),
        examThemes: storage.getExamThemes(),
        settings: storage.getSettings(),
        results: storage.getResults(),
        timestamp: Date.now()
      };
      
      const rawBackups = localStorage.getItem('tester_pro_auto_backups');
      let backupsList = rawBackups ? JSON.parse(rawBackups) : [];
      if (!Array.isArray(backupsList)) backupsList = [];
      
      // Add new backup
      backupsList.unshift({
        timestamp: Date.now(),
        data
      });
      
      // Keep only last 5
      backupsList = backupsList.slice(0, 5);
      localStorage.setItem('tester_pro_auto_backups', JSON.stringify(backupsList));
      setAutoBackups(backupsList);
    } catch (e) {
      console.error("Auto backup failed:", e);
    }
  };

  const loadAutoBackups = () => {
    try {
      const rawBackups = localStorage.getItem('tester_pro_auto_backups');
      let backupsList = rawBackups ? JSON.parse(rawBackups) : [];
      if (Array.isArray(backupsList)) {
        setAutoBackups(backupsList);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadBackup = () => {
    try {
      const data = {
        questions: storage.getQuestions(),
        students: storage.getStudents(),
        groups: storage.getGroups(),
        examThemes: storage.getExamThemes(),
        settings: storage.getSettings(),
        results: storage.getResults(),
        timestamp: Date.now()
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tester_pro_database_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Error generating backup file");
    }
  };

  const handleRestoreBackupData = (data: any) => {
    if (!data || !data.questions || !data.students || !data.groups) {
      alert(t.invalidBackupFormat);
      return false;
    }
    
    // Unpack data
    if (data.questions) storage.saveQuestions(data.questions);
    if (data.students) storage.saveStudents(data.students);
    if (data.groups) storage.saveGroups(data.groups);
    if (data.examThemes) storage.saveExamThemes(data.examThemes);
    if (data.settings) storage.saveSettings(data.settings);
    if (data.results) storage.saveResults(data.results);
    
    // Reload state
    setGroups(storage.getGroups().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    setStudents(storage.getStudents());
    setQuestions(storage.getQuestions());
    setResults(storage.getResults());
    setExamThemes(storage.getExamThemes());
    setSettings(storage.getSettings());
    setTimerMinutes(storage.getSettings().timerMinutes);
    
    alert(t.backupRestored);
    return true;
  };

  const handleUploadBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        handleRestoreBackupData(parsed);
      } catch (err) {
        alert(t.backupReadFailed);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    setGroups(storage.getGroups().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    setStudents(storage.getStudents());
    setQuestions(storage.getQuestions());
    setResults(storage.getResults());
    setExamThemes(storage.getExamThemes());
    setSettings(storage.getSettings());
    setTimerMinutes(storage.getSettings().timerMinutes);
    loadAutoBackups();
    setTimeout(runAutoBackup, 1500); // Trigger non-blocking auto-backup on mount
  }, []);

  useEffect(() => {
    setNewQuestion(prev => {
      if (prev.type === 'true_false') {
        const trans = translations[creationLanguage];
        return { ...prev, options: { ...prev.options, A: trans.true, B: trans.false } };
      }
      return prev;
    });
  }, [creationLanguage]);

  useEffect(() => {
    setNewQuestion(prev => ({ ...prev, language: creationLanguage }));
  }, [creationLanguage]);

  useEffect(() => {
    setNewGroupLang(creationLanguage);
  }, [creationLanguage]);

  useEffect(() => {
    if (activeTab === 'stats') {
      const activeUni = storage.getCurrentUniversity();
      if (activeUni && activeUni.key) {
        syncService.pullStudentResults(activeUni.key).then((res) => {
          if (res && res.success && res.count > 0) {
            setResults(storage.getResults());
          }
        });
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isSuperAdmin) {
      const activeUni = storage.getCurrentUniversity();
      if (activeUni && activeUni.key) {
        const timer = setTimeout(() => {
          syncService.publishUniversityData(activeUni.key).catch(err => console.error("Cloud publish error:", err));
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [groups, students, questions, examThemes, settings, isSuperAdmin]);

  const updateSettings = (newSettings: GlobalSettings) => {
    setSettings(newSettings);
    storage.saveSettings(newSettings);
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    const group = { id: `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: newGroupName, language: newGroupLang };
    const updated = [...groups, group].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setGroups(updated);
    storage.saveGroups(updated);
    setNewGroupName('');
  };

  const handleAddStudent = () => {
    if (!newStudent.firstName || !newStudent.groupId) return;
    const student = { ...newStudent, id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` } as Student;
    const updated = [...students, student];
    setStudents(updated);
    storage.saveStudents(updated);
    setNewStudent({ firstName: '', lastName: '', groupId: '', language: 'ru', subgroup: '', pinfl: '' });
    setShowAddStudentForm(false);
  };

  const handleAddTheme = (name: string) => {
    if (!name.trim()) return;
    if (examThemes.some(t => t.name.toLowerCase() === name.trim().toLowerCase())) return;
    const newTheme = { id: `t-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: name.trim() };
    const updated = [...examThemes, newTheme];
    setExamThemes(updated);
    storage.saveExamThemes(updated);
  };

  const handleDeleteTheme = (id: string) => {
    const updated = examThemes.filter(t => t.id !== id);
    setExamThemes(updated);
    storage.saveExamThemes(updated);
  };

  const handleAddQuestion = () => {
    if (!newQuestion.text || !newQuestion.theme) return;
    const q = { 
      ...newQuestion, 
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: newQuestion.type || 'single',
      correctAnswer: newQuestion.type === 'multiple' ? selectedMultiOptions.sort().join(',') : newQuestion.correctAnswer
    } as Question;
    const updated = [...questions, q];
    setQuestions(updated);
    storage.saveQuestions(updated);
    audit.record('question_updated', isSuperAdmin ? 'superadmin' : 'university-admin', activeUniversity?.id, q.id);
    refreshAuditState();
    setNewQuestion({
      theme: '',
      language: creationLanguage,
      text: '',
      options: { A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '' },
      correctAnswer: 'A',
      type: 'single'
    });
    setSelectedMultiOptions([]);
  };

  const handleDeleteGroup = (id: string) => {
    const updated = groups.filter(g => g.id !== id);
    setGroups(updated);
    storage.saveGroups(updated);
  };

  const handleDeleteStudent = (id: string) => {
    const updated = students.filter(s => s.id !== id);
    setStudents(updated);
    storage.saveStudents(updated);
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedStudentIds.size === 0) return;
    if (!confirm(t.confirmDeleteStudents.replace('{count}', String(selectedStudentIds.size)))) return;
    
    const updated = students.filter(s => !selectedStudentIds.has(s.id));
    setStudents(updated);
    storage.saveStudents(updated);
    setSelectedStudentIds(new Set());
  };


  const handleBulkMove = (targetGroupId: string) => {
    if (selectedStudentIds.size === 0) return;
    const updated = students.map(s => 
      selectedStudentIds.has(s.id) ? { ...s, groupId: targetGroupId } : s
    );
    setStudents(updated);
    storage.saveStudents(updated);
    setSelectedStudentIds(new Set());
  };

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteQuestion = (id: string) => {
    const updated = questions.filter(q => q.id !== id);
    setQuestions(updated);
    storage.saveQuestions(updated);
  };

  const handleRenameGroup = (id: string, currentName: string) => {
    const newName = prompt('Enter new group name:', currentName);
    if (newName && newName.trim()) {
      const updated = groups.map(g => g.id === id ? { ...g, name: newName.trim() } : g);
      setGroups(updated);
      storage.saveGroups(updated);
    }
  };

  const handleRenameSubgroup = (groupId: string, oldName: string) => {
    const newName = prompt('New Subgroup Name:', oldName);
    if (newName && newName.trim() && newName !== oldName) {
      const updated = students.map(s => 
        (s.groupId === groupId && s.subgroup === oldName) 
          ? { ...s, subgroup: newName.trim() } 
          : s
      );
      setStudents(updated);
      storage.saveStudents(updated);
    }
  };

  const normalizeImportHeader = (value: string | undefined) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .replace(/^_+|_+$/g, '');

  const parseQuestionRows = (rows: any[][]) => {
    if (!rows || rows.length === 0) return [];

    const headerRow = rows[0].map((cell) => normalizeImportHeader(String(cell ?? '')));
    const questionIndex = headerRow.findIndex((header) => ['question','questiontext','text','vopros','savol'].includes(header));
    const themeIndex = headerRow.findIndex((header) => ['theme','tema','mavzu'].includes(header));
    const languageIndex = headerRow.findIndex((header) => ['language','lang','til','yazyk'].includes(header));
    const typeIndex = headerRow.findIndex((header) => ['type','questiontype','tip','turi'].includes(header));
    const correctIndex = headerRow.findIndex((header) => ['correctanswer','correct','answer','otvet','javob','pravotvet'].includes(header));

    const optionIndexes: Record<string, number> = {};
    ['a','b','c','d','e','f','g','h'].forEach((key) => {
      const index = headerRow.findIndex((header) => [key, `option${key.toUpperCase()}`, `variant${key.toUpperCase()}`, `${key}option`, `${key}variant`].includes(header));
      if (index >= 0) optionIndexes[key] = index;
    });

    const importedQuestions: Question[] = [];

    rows.slice(1).forEach((row, rowIndex) => {
      const text = questionIndex >= 0 ? String(row[questionIndex] ?? '').trim() : '';
      const theme = themeIndex >= 0 ? String(row[themeIndex] ?? '').trim() : 'Импортированная тема';
      const rawLanguage = languageIndex >= 0 ? String(row[languageIndex] ?? 'ru').trim().toLowerCase() : 'ru';
      const language: Language = rawLanguage === 'uz' || rawLanguage === 'ru' || rawLanguage === 'en' ? rawLanguage : 'ru';
      const rawType = typeIndex >= 0 ? String(row[typeIndex] ?? 'single').trim().toLowerCase() : 'single';
      const type: QuestionType = ['single', 'multiple', 'true_false', 'text_input', 'matching', 'find_on_model'].includes(rawType)
        ? rawType as QuestionType
        : 'single';
      const options: Question['options'] = { A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '' };
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((key) => {
        const index = optionIndexes[key];
        const value = index >= 0 ? String(row[index] ?? '').trim() : '';
        if (value) options[key.toUpperCase() as keyof typeof options] = value;
      });

      const correctValue = correctIndex >= 0 ? String(row[correctIndex] ?? '').trim() : '';
      if (!text || !theme) return;

      const question: Question = {
        id: `q-${Date.now()}-${rowIndex}-${Math.random().toString(36).substr(2, 8)}`,
        text,
        theme,
        language,
        type,
        options,
        correctAnswer: correctValue || 'A',
      };

      importedQuestions.push(question);
    });

    return importedQuestions;
  };

  const exportTemplate = () => {
    const templateSheets = {
      ru: [
        ['№', 'Вопрос', 'Тема', 'Язык', 'Тип', 'A', 'B', 'C', 'D', 'E', 'Правильный ответ'],
        [1, 'Как называется структура?', 'Анатомия', 'ru', 'single', 'Лоб', 'Глаз', 'Челюсть', 'Череп', 'Нос', 'A'],
      ],
      uz: [
        ['№', 'Savol', 'Mavzu', 'Til', 'Tur', 'A', 'B', 'C', 'D', 'E', 'To\'g\'ri javob'],
        [1, 'Ushbu tuzilma qanday nomlanadi?', 'Anatomiya', 'uz', 'single', 'Peshona', 'Ko\'z', 'Jag\' ', 'Kalla', 'Burun', 'A'],
      ],
      en: [
        ['№', 'Question', 'Theme', 'Language', 'Type', 'A', 'B', 'C', 'D', 'E', 'Correct answer'],
        [1, 'What is this structure called?', 'Anatomy', 'en', 'single', 'Forehead', 'Eye', 'Jaw', 'Skull', 'Nose', 'A'],
      ],
    } as const;

    const wb = XLSX.utils.book_new();
    (Object.entries(templateSheets) as unknown as Array<[string, any[]]>).forEach(([sheetName, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName.toUpperCase());
    });

    XLSX.writeFile(wb, 'exam_questions_template.xlsx');
  };

  const exportResults = () => {
    const getResultStudent = (result: ExamResult) => students.find((student) =>
      (result.studentId && student.id === result.studentId) ||
      `${student.firstName} ${student.lastName}`.trim() === result.studentName.trim()
    );
    const getResultRows = (sourceResults: ExamResult[]) => sourceResults.map((result) => {
      const student = getResultStudent(result);
      return {
        'Язык / Language / Til': (result.language || student?.language || 'ru').toUpperCase(),
        'ПИНФЛ / PINFL / JSHSHIR': student?.pinfl || '',
        'Тема / Theme / Mavzu': result.theme || 'N/A',
        'Группа / Group / Guruh': result.groupName,
        'Студент / Student / Talaba': result.studentName,
        'Результат / Score / Natija': `${result.score}/${result.totalQuestions}`,
        'Процент / Percentage / Foiz': `${result.percentage}%`,
        'Дата / Date / Sana': new Date(result.timestamp).toLocaleString(),
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getResultRows(results)), 'Все результаты');
    (['ru', 'uz', 'en'] as Language[]).forEach((resultLanguage) => {
      const languageResults = results.filter((result) => (result.language || 'ru') === resultLanguage);
      if (languageResults.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getResultRows(languageResults)), resultLanguage.toUpperCase());
      }
    });
    XLSX.writeFile(wb, "exam_results.xlsx");
  };

  const exportResultsPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const reportLabels = {
      ru: { title: 'Отчёт по результатам экзаменов', language: 'Язык', pinfl: 'ПИНФЛ', theme: 'Тема', group: 'Группа', student: 'Студент', score: 'Результат', percentage: 'Процент', date: 'Дата', generated: 'Сформировано', total: 'Всего результатов' },
      uz: { title: 'Imtihon natijalari hisoboti', language: 'Til', pinfl: 'JSHSHIR', theme: 'Mavzu', group: 'Guruh', student: 'Talaba', score: 'Natija', percentage: 'Foiz', date: 'Sana', generated: 'Yaratildi', total: 'Jami natijalar' },
      en: { title: 'Exam Results Report', language: 'Language', pinfl: 'PINFL', theme: 'Theme', group: 'Group', student: 'Student', score: 'Score', percentage: 'Percentage', date: 'Date', generated: 'Generated', total: 'Total results' },
    }[language];
    const title = reportLabels.title;
    const universityName = activeUniversity?.name || 'Университет';
    const universityLogo = activeUniversity?.logoUrl || '';
    const getResultStudent = (result: ExamResult) => students.find((student) =>
      (result.studentId && student.id === result.studentId) ||
      `${student.firstName} ${student.lastName}`.trim() === result.studentName.trim()
    );

    const rows = results.map((r, i) => `
      <tr style="border-bottom: 1px solid #e4e4e7;">
        <td>${i + 1}</td>
        <td>${(r.language || getResultStudent(r)?.language || 'ru').toUpperCase()}</td>
        <td>${getResultStudent(r)?.pinfl || '-'}</td>
        <td>${r.theme || 'N/A'}</td>
        <td>${r.groupName}</td>
        <td class="student">${r.studentName}</td>
        <td>${r.score}/${r.totalQuestions}</td>
        <td class="percentage">${r.percentage}%</td>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
      </tr>
    `).join('');

    const htmlContent = '<html>' +
      '<head>' +
        '<title>' + title + '</title>' +
        '<style>' +
          'body { min-height: 277mm; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; padding: 18mm 12mm 20mm; }' +
          '.header { display: flex; justify-content: flex-end; align-items: flex-start; min-height: 24mm; margin-bottom: 8mm; }' +
          '.university { display: flex; align-items: center; gap: 8px; max-width: 70%; text-align: right; font-size: 11px; font-weight: 700; }' +
          '.university img { width: 18mm; height: 18mm; object-fit: contain; }' +
          '.footer-title { position: fixed; left: 0; right: 0; bottom: 5mm; text-align: center; font-size: 9px; font-weight: 700; color: #52525b; }' +
          'table { width: 100%; border-collapse: collapse; margin-top: 4mm; table-layout: fixed; }' +
          'th { background: #f4f4f5; text-align: left; padding: 5px 4px; font-size: 8px; text-transform: uppercase; color: #71717a; border-bottom: 2px solid #e4e4e7; }' +
          'td { padding: 4px; font-size: 8px; vertical-align: middle; overflow-wrap: anywhere; }' +
          'td.student { font-weight: 700; } td.percentage { font-weight: 700; color: #4f46e5; }' +
          'thead { display: table-header-group; } tr { page-break-inside: avoid; }' +
          '@media print {' +
            '@page { size: A4 portrait; margin: 0; }' +
            'body { padding: 0; }' +
            'button { display: none; }' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<div class="university">' +
            (universityLogo ? '<img src="' + universityLogo + '" alt="Logo" />' : '') +
            '<span>' + universityName + '</span>' +
          '</div>' +
        '</div>' +
        '<table>' +
          '<thead>' +
            '<tr>' +
              '<th style="width: 28px;">№</th>' +
              '<th style="width: 42px;">' + reportLabels.language + '</th>' +
              '<th style="width: 105px;">' + reportLabels.pinfl + '</th>' +
              '<th>' + reportLabels.theme + '</th>' +
              '<th>' + reportLabels.group + '</th>' +
              '<th>' + reportLabels.student + '</th>' +
              '<th style="width: 70px;">' + reportLabels.score + '</th>' +
              '<th style="width: 65px;">' + reportLabels.percentage + '</th>' +
              '<th style="width: 110px;">' + reportLabels.date + '</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rows +
          '</tbody>' +
        '</table>' +
        '<div class="footer-title">' + title + '</div>' +
        '<script>' +
          'window.onload = function() {' +
            'window.print();' +
            'setTimeout(function() { window.close(); }, 500);' +
          '};' +
        '</script>' +
      '</body>' +
    '</html>';

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.json')) {
      reader.onload = (evt) => {
        try {
          const json = JSON.parse(evt.target?.result as string);
          if (Array.isArray(json)) {
            const importedQuestions = json.map(q => ({
              ...q,
              id: q.id || `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }));
            const updated = [...questions, ...importedQuestions];
            setQuestions(updated);
            storage.saveQuestions(updated);
          }
        } catch (e) {
          alert("Ошибка при разборе JSON файла");
        }
      };
      reader.readAsText(file);
      return;
    }

    if (file.name.endsWith('.docx')) {
      reader.onload = async (evt) => {
        try {
          const arrayBuffer = evt.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          const text = result.value;
          
          // Basic parser for DOCX questions
          // Expected format: Questions separated by double newlines
          // Each question block:
          // Question text
          // A) Option 1
          // B) Option 2
          // ...
          // Correct: A
          // Theme: Anatomy
          
          const blocks = text.split(/\n\s*\n/);
          const importedQuestions: Question[] = [];
          
          blocks.forEach(block => {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length < 3) return;

            const questionText = lines[0];
            const options: Question['options'] = { A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '' };
            let correctAnswer: any = 'A';
            let theme = t.imported;
            let type: 'single' | 'multiple' | 'true_false' = 'single';
            let lang: Language = 'ru';

            lines.slice(1).forEach(line => {
              if (line.toLowerCase().startsWith('correct:') || line.toLowerCase().startsWith('ответ:')) {
                correctAnswer = line.split(':')[1].trim().toUpperCase();
              } else if (line.toLowerCase().startsWith('theme:') || line.toLowerCase().startsWith('тема:')) {
                theme = line.split(':')[1].trim();
              } else if (line.toLowerCase().startsWith('lang:') || line.toLowerCase().startsWith('язык:')) {
                lang = (line.split(':')[1].trim().toLowerCase() as Language) || 'ru';
              } else if (line.match(/^[A-H][).]\s*(.*)/i)) {
                const match = line.match(/^([A-H])[).]\s*(.*)/i);
                if (match) {
                  const optionKey = match[1].toUpperCase() as keyof typeof options;
                  options[optionKey] = match[2];
                }
              }
            });

            if (questionText && (options.A || options.B)) {
              importedQuestions.push({
                id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text: questionText,
                theme,
                language: lang,
                options,
                correctAnswer,
                type
              });
            }
          });

          if (importedQuestions.length > 0) {
            const updated = [...questions, ...importedQuestions];
            setQuestions(updated);
            storage.saveQuestions(updated);
            alert(`Успешно импортировано ${importedQuestions.length} вопросов`);
          } else {
            alert(t.questionImportNoQuestions);
          }
        } catch (e) {
          alert("Ошибка при разборе DOCX файла");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const importedQuestions: Question[] = [];
      data.slice(1).forEach((row) => {
        if (row[1] && row[2]) {
          importedQuestions.push({
            id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: row[1],
            theme: row[2],
            language: (row[3] as Language) || 'ru',
            options: {
              A: String(row[4] || ''),
              B: String(row[5] || ''),
              C: String(row[6] || ''),
              D: String(row[7] || ''),
              E: String(row[8] || ''),
              F: String(row[9] || ''),
              G: String(row[10] || ''),
              H: String(row[11] || ''),
            },
            correctAnswer: (row[12] as any) || 'A',
            type: 'single'
          });
        }
      });

      const updated = [...questions, ...importedQuestions];
      setQuestions(updated);
      storage.saveQuestions(updated);
    };
    reader.readAsBinaryString(file);
  };

  const handleStudentImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const importedStudents: Student[] = [];
      const currentGroups = [...groups];

      const headerRow = (data[0] || []).map((cell) => normalizeImportHeader(String(cell ?? '')));
      const nameIndex = headerRow.findIndex((header) => ['fio', 'fullname', 'name', 'student', 'talaba'].includes(header));
      const groupIndex = headerRow.findIndex((header) => ['group', 'guruh', 'gruppa'].includes(header));
      const subgroupIndex = headerRow.findIndex((header) => ['subgroup', 'subguruh', 'podgruppa'].includes(header));
      const pinflIndex = headerRow.findIndex((header) => ['pinfl', 'jshshir'].includes(header));
      const languageIndex = headerRow.findIndex((header) => ['language', 'lang', 'til', 'yazyk'].includes(header));
      const hasRecognizedHeaders = nameIndex >= 0 || groupIndex >= 0 || languageIndex >= 0;

      data.slice(1).forEach((row) => {
        const fullName = String(row[hasRecognizedHeaders && nameIndex >= 0 ? nameIndex : 0] || '').trim();
        if (fullName) {
          const groupName = String(row[hasRecognizedHeaders && groupIndex >= 0 ? groupIndex : 1] || 'Default').trim();
          const subgroupName = String(row[hasRecognizedHeaders && subgroupIndex >= 0 ? subgroupIndex : 2] || '').trim();
          const pinfl = String(row[hasRecognizedHeaders && pinflIndex >= 0 ? pinflIndex : 3] || '').trim();
          const rawLanguage = String(row[hasRecognizedHeaders && languageIndex >= 0 ? languageIndex : 4] || '').trim().toLowerCase();
          const language: Language = rawLanguage === 'uz' || rawLanguage === 'en' || rawLanguage === 'ru'
            ? rawLanguage
            : currentGroups.find((group) => group.name.toLowerCase() === groupName.toLowerCase())?.language || 'ru';
          
          let group = currentGroups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
          if (!group) {
            group = { id: `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: groupName };
            currentGroups.push(group); 
          }

          importedStudents.push({
            id: `s-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            firstName: fullName,
            lastName: '',
            groupId: group.id,
            language,
            subgroup: subgroupName,
            pinfl: pinfl.replace(/\D/g, '').slice(0, 14)
          });
        }
      });

      setGroups(currentGroups);
      storage.saveGroups(currentGroups);
      const updated = [...students, ...importedStudents];
      setStudents(updated);
      storage.saveStudents(updated);
      audit.record('students_imported', isSuperAdmin ? 'superadmin' : 'university-admin', activeUniversity?.id, `${importedStudents.length} students`);
      refreshAuditState();
    };
    reader.readAsBinaryString(file);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const downloadStudentTemplate = () => {
    const templateData = [
      ["ФИО", "Группа", "Подгруппа", "ПИНФЛ", "Язык (ru/uz/en)"],
      ["Иванов Иван", "602", "A1", "12345678901234", "ru"],
      ["Петров Петр", "602", "B2", "98765432109876", "uz"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_import_template.xlsx");
  };

  const SidebarItem = ({ id, label, icon: Icon }: { id: AdminTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
        activeTab === id 
          ? "bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 font-black" 
          : "text-bento-text-muted hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400"
      )}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  const groupedStudents = groups
    .sort((a, b) => {
      // Natural sorting for numbers in strings
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map(group => {
    const groupStudents = students.filter(s => s.groupId === group.id);
    const subgroupsMap: Record<string, Student[]> = {};
    groupStudents.forEach(s => {
      const sg = s.subgroup || 'Без подгруппы';
      if (studentSearch === '' || (s.firstName + s.lastName).toLowerCase().includes(studentSearch.toLowerCase())) {
        if (!subgroupsMap[sg]) subgroupsMap[sg] = [];
        subgroupsMap[sg].push(s);
      }
    });

    return {
      ...group,
      subgroups: Object.entries(subgroupsMap).map(([name, list]) => ({ name, list }))
    };
  }).filter(g => 
    groupSearch === '' || 
    g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.subgroups.some(sg => sg.list.length > 0)
  );

  return (
    <div className="flex h-screen bg-bento-bg text-bento-text-main overflow-hidden">
      {/* Superadmin University Deletion Confirm Modal */}
      <AnimatePresence>
        {uniToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="w-full max-w-md bg-bento-card border border-bento-border rounded-[24px] p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
              
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mb-4">
                <Trash2 size={24} />
              </div>

              <h3 className="text-lg font-extrabold text-bento-text-main uppercase tracking-tight mb-2">
                {language === 'ru' ? 'Подтверждение удаления' : 'Oʻchirishni tasdiqlash'}
              </h3>
              
              <p className="text-xs text-bento-text-muted leading-relaxed font-bold uppercase tracking-wider mb-6">
                {language === 'ru' 
                  ? `Вы уверены, что хотите удалить университет "${uniToDelete.name}"? Все связанные данные будут стерты.` 
                  : `Ushbu "${uniToDelete.name}" universitetini oʻchirishga ishonchingiz komilmi? Barcha tegishli maʼlumotlar oʻchiriladi.`}
              </p>

              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setUniToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-bento-border hover:bg-zinc-100 dark:hover:bg-zinc-800 text-bento-text-main font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="button"
                  onClick={() => executeDeleteUniversity(uniToDelete)}
                  className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-red-500/10"
                >
                  {language === 'ru' ? 'Удалить' : 'Oʻchirish'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-[200px] bg-bento-card border-r border-bento-border flex flex-col shrink-0">
        <div className="flex-1 p-4 flex flex-col gap-6 overflow-y-auto">
          <div className="logo text-lg font-bold text-bento-accent flex items-center gap-2">
            <BookOpen size={20} />
            <span>TESTER PRO</span>
          </div>

          <nav className="flex flex-col gap-1.5">
            {isSuperAdmin ? (
              <>
                <SidebarItem id="universities" label={language === 'ru' ? '🏛️ ВУЗы / Ключи' : '🏛️ OTM / Kalitlar'} icon={School} />
                <SidebarItem id="branding" label={language === 'ru' ? '🎨 Брендинг и дизайн' : '🎨 Brending va dizayn'} icon={Palette} />
                <SidebarItem id="security" label={language === 'ru' ? '🔐 Сессии и журнал' : '🔐 Sessiyalar va jurnal'} icon={ShieldCheck} />
              </>
            ) : (
              <>
                <SidebarItem id="students" label={t.students} icon={Users} />
                <SidebarItem id="questions" label={t.questions} icon={BookOpen} />
                <SidebarItem id="media" label="Медиа" icon={Upload} />
                <SidebarItem id="models3d" label={t.models3DTab} icon={Box} />
                <SidebarItem id="stats" label={t.results} icon={BarChart3} />
                <SidebarItem id="settings" label={t.settings} icon={Settings} />
              </>
            )}
          </nav>
        </div>

        <div className="p-4 pt-3 border-t border-bento-border space-y-3">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-bento-text-muted hover:text-red-500 transition-colors font-bold text-sm"
          >
            <LogOut size={18} />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t.admin}</h1>
          <div className="flex items-center gap-3">
            <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} className="bg-bento-card" />
            <ThemeToggle theme={theme} toggle={toggleTheme} className="w-11 h-11" />
            {!isSuperAdmin && activeUniversity && isUniversitySavedBySuperAdmin(activeUniversity.id) && (
              <button
                type="button"
                onClick={rememberActiveUniversity}
                className="px-3 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-black text-[10px] uppercase tracking-wider transition-all hover:bg-emerald-500/20 cursor-pointer"
                title={t.rememberUniversityPassword}
              >
                {t.rememberMe}
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="card bg-bento-card border border-bento-border rounded-[24px] p-6 min-h-[calc(100vh-160px)] relative"
          >
            {isLoading ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <Skeleton className="w-48 h-8" />
                  <div className="flex gap-2">
                    <Skeleton className="w-32 h-10" />
                    <Skeleton className="w-32 h-10" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="w-full h-24" />
                  ))}
                </div>
              </div>
            ) : activeTab === 'universities' && isSuperAdmin ? (
              <div className="flex-1 space-y-8 select-text">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-bento-border pb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-bento-text-main leading-none uppercase tracking-tight">
                      {language === 'ru' ? '🏛️ Управление ВУЗами и Ключами' : '🏛️ OTM va Kalitlar boshqaruvi'}
                    </h2>
                    <p className="text-bento-text-muted text-xs font-semibold leading-relaxed mt-1.5">
                      {language === 'ru' 
                        ? 'Создавайте уникальные профили для институтов и генерируйте индивидуальные ключи для полной изоляции данных.' 
                        : 'Institutlar uchun noyob profillar yarating va ma\'lumotlarni to\'liq izolyatsiya qilish uchun shaxsiy kalitlarni yarating.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Row 1: Create Form (Full Width) */}
                  <div className="bg-bento-bg/30 dark:bg-zinc-900/10 border border-bento-border rounded-2xl p-6 animate-fade-in space-y-4">
                    <h3 className="text-sm font-black tracking-tight text-bento-text-main uppercase">
                      {language === 'ru' ? '➕ Добавить ВУЗ' : '➕ OTM qoʻshish'}
                    </h3>
                    
                    <form onSubmit={handleAddUniversity} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                          {language === 'ru' ? 'Название Университета' : 'Universitet nomi'}
                        </label>
                        <input
                          type="text"
                          required
                          value={newUniName}
                          onChange={(e) => setNewUniName(e.target.value)}
                          placeholder={language === 'ru' ? 'Напр: Ташкентский Государственный Юридический Университет' : 'Masalan: Toshkent Davlat Yuridik Universiteti'}
                          className="w-full px-4 py-3 bg-bento-bg border border-bento-border rounded-xl font-medium text-xs text-bento-text-main focus:border-bento-accent outline-none"
                        />
                      </div>

                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                          {language === 'ru' ? 'Ключ Доступа' : 'Kirish kaliti'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            required
                            value={newUniKey}
                            onChange={(e) => setNewUniKey(e.target.value.toUpperCase())}
                            placeholder="UNI-XXXX-XXXX"
                            className="flex-1 px-4 py-3 bg-bento-bg border border-bento-border rounded-xl font-mono text-xs text-bento-text-main focus:border-bento-accent outline-none"
                          />
                          <button
                            type="button"
                            onClick={generateRandomKey}
                            className="px-3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-xl transition-all uppercase tracking-wider shrink-0 cursor-pointer"
                          >
                            {language === 'ru' ? 'Ключ' : 'Kalit'}
                          </button>
                        </div>
                      </div>

                      <div className="md:col-span-3 space-y-1.5 relative" ref={superAdminDatePickerRef}>
                        <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                          {t.keyExpiryDateLabel}
                        </label>
                        <div className="relative group/date">
                          <button 
                            type="button"
                            onClick={() => setIsSuperAdminDatePickerOpen(!isSuperAdminDatePickerOpen)}
                            className="w-full bg-picker-bg hover:bg-picker-hover border-2 border-picker-border rounded-xl px-4 py-3 text-xs font-black text-picker-text transition-all pr-10 flex items-center text-left cursor-pointer outline-none focus:border-indigo-500 shadow-sm"
                          >
                            {expiryDate ? new Date(expiryDate).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : t.chooseDate}
                          </button>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500 transition-colors">
                            <Calendar size={14} />
                          </div>

                          <AnimatePresence>
                            {isSuperAdminDatePickerOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute bottom-full md:top-full left-0 md:bottom-auto w-72 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-[110] overflow-hidden p-4"
                              >
                                {/* Calendar Header */}
                                <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                  {superAdminCalendarView === 'days' ? (
                                    <button
                                      type="button"
                                      onClick={() => setCurrentSuperAdminCalendarDate(new Date(currentSuperAdminCalendarDate.getFullYear(), currentSuperAdminCalendarDate.getMonth() - 1))}
                                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                                    >
                                      <ChevronLeft size={16} />
                                    </button>
                                  ) : (
                                    <div className="w-7 h-7" />
                                  )}
                                  
                                  <div className="flex gap-1 items-center">
                                    <button
                                      type="button"
                                      onClick={() => setSuperAdminCalendarView(superAdminCalendarView === 'months' ? 'days' : 'months')}
                                      className={cn(
                                        "text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer",
                                        superAdminCalendarView === 'months' 
                                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]" 
                                          : "text-[#1e293b] dark:text-[#f8fafc] hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                      )}
                                    >
                                      {currentSuperAdminCalendarDate.toLocaleDateString(locale, { month: 'long' })}
                                    </button>
                                    <span className="text-zinc-300 dark:text-zinc-700 text-xs font-bold">/</span>
                                    <button
                                      type="button"
                                      onClick={() => setSuperAdminCalendarView(superAdminCalendarView === 'years' ? 'days' : 'years')}
                                      className={cn(
                                        "text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer",
                                        superAdminCalendarView === 'years' 
                                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]" 
                                          : "text-[#1e293b] dark:text-[#f8fafc] hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                      )}
                                    >
                                      {currentSuperAdminCalendarDate.getFullYear()}
                                    </button>
                                  </div>

                                  {superAdminCalendarView === 'days' ? (
                                    <button
                                      type="button"
                                      onClick={() => setCurrentSuperAdminCalendarDate(new Date(currentSuperAdminCalendarDate.getFullYear(), currentSuperAdminCalendarDate.getMonth() + 1))}
                                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                                    >
                                      <ChevronRight size={16} />
                                    </button>
                                  ) : (
                                    <div className="w-7 h-7" />
                                  )}
                                </div>

                                {superAdminCalendarView === 'days' && (
                                  <>
                                    {/* Week Days */}
                                    <div className="grid grid-cols-7 gap-1 mb-2">
                                      {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(day => (
                                        <div key={day} className="text-[10px] font-bold text-center text-zinc-400 uppercase tracking-wider">
                                          {day}
                                        </div>
                                      ))}
                                    </div>

                                    {/* Dates Grid */}
                                    <div className="grid grid-cols-7 gap-1">
                                      {(() => {
                                        const year = currentSuperAdminCalendarDate.getFullYear();
                                        const month = currentSuperAdminCalendarDate.getMonth();
                                        const firstDay = new Date(year, month, 1).getDay();
                                        // Adjust for Monday start (JS days are 0-Sun to 6-Sat)
                                        const shift = firstDay === 0 ? 6 : firstDay - 1;
                                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                                        const prevMonthDays = new Date(year, month, 0).getDate();
                                        
                                        const items = [];
                                        
                                        // Fill prev month days
                                        for (let i = shift - 1; i >= 0; i--) {
                                          items.push(
                                            <div key={`p-${i}`} className="h-8 flex items-center justify-center text-xs font-bold text-zinc-350 dark:text-zinc-650">
                                              {prevMonthDays - i}
                                            </div>
                                          );
                                        }
                                        
                                        // Fill current month days
                                        for (let d = 1; d <= daysInMonth; d++) {
                                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                          const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                          const isSelected = expiryDate === dateStr;
                                          
                                          items.push(
                                            <button
                                              key={d}
                                              type="button"
                                              onClick={() => {
                                                setExpiryDate(dateStr);
                                                setIsSuperAdminDatePickerOpen(false);
                                              }}
                                              className={cn(
                                                "h-8 w-full rounded-xl flex items-center justify-center text-xs font-bold transition-all cursor-pointer",
                                                isSelected 
                                                  ? "bg-[#4f46e5] text-white shadow-lg shadow-indigo-600/35" 
                                                  : isToday 
                                                    ? "text-[#4f46e5] border border-indigo-600/20 bg-indigo-50/50 dark:bg-indigo-950/20"
                                                    : "text-zinc-800 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                                              )}
                                            >
                                              {d}
                                            </button>
                                          );
                                        }
                                        
                                        return items;
                                      })()}
                                    </div>
                                  </>
                                )}

                                {superAdminCalendarView === 'months' && (
                                  <div className="grid grid-cols-3 gap-2 py-1">
                                    {Array.from({ length: 12 }).map((_, i) => {
                                      const monthName = new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' });
                                      const isSelected = currentSuperAdminCalendarDate.getMonth() === i;
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => {
                                            setCurrentSuperAdminCalendarDate(new Date(currentSuperAdminCalendarDate.getFullYear(), i, 1));
                                            setSuperAdminCalendarView('days');
                                          }}
                                          className={cn(
                                            "py-3 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer",
                                            isSelected
                                              ? "bg-[#4f46e5] text-white shadow-lg shadow-indigo-600/35"
                                              : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                                          )}
                                        >
                                          {monthName}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {superAdminCalendarView === 'years' && (
                                  <div className="grid grid-cols-3 gap-2 py-1">
                                    {Array.from({ length: 12 }).map((_, i) => {
                                      const year = new Date().getFullYear() - 5 + i;
                                      const isSelected = currentSuperAdminCalendarDate.getFullYear() === year;
                                      return (
                                        <button
                                          key={year}
                                          type="button"
                                          onClick={() => {
                                            setCurrentSuperAdminCalendarDate(new Date(year, currentSuperAdminCalendarDate.getMonth(), 1));
                                            setSuperAdminCalendarView('days');
                                          }}
                                          className={cn(
                                            "py-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                                            isSelected
                                              ? "bg-[#4f46e5] text-white shadow-lg shadow-indigo-600/35"
                                              : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                                          )}
                                        >
                                          {year}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="md:col-span-12 mt-2">
                        <button
                          type="submit"
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all uppercase tracking-wider text-xs cursor-pointer shadow-sm shadow-indigo-600/10"
                        >
                          {language === 'ru' ? 'Добавить ВУЗ' : 'OTM qoʻshish'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Row 2: Universities List (Full Width) */}
                  <div className="bg-bento-bg/30 dark:bg-zinc-900/10 border border-bento-border rounded-2xl p-6 flex flex-col min-h-[400px]">
                    <h3 className="text-base font-black tracking-tight text-bento-text-main uppercase mb-4">
                      {language === 'ru' ? '🏛️ Зарегистрированные ВУЗы' : '🏛️ Roʻyxatdan oʻtgan OTMlar'}
                    </h3>

                    {universities.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-bento-text-muted">
                        <span className="text-4xl mb-3">📭</span>
                        <p className="font-bold text-sm">
                          {language === 'ru' ? 'ВУЗы еще не зарегистрированы' : 'Hali OTMlar roʻyxatdan oʻtkazilmagan'}
                        </p>
                        <p className="text-xs mt-1">
                          {language === 'ru' ? 'Используйте форму слева, чтобы добавить свой первый институт.' : 'Birinchi OTMni qoʻshish uchun chapdagi formadan foydalaning.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-3">
                        {universities.map((uni) => {
                          const uniQuestionsCount = (() => {
                            try {
                              const q = localStorage.getItem(`exam_system_questions_${uni.id}`);
                              return q ? JSON.parse(q).length : 0;
                            } catch { return 0; }
                          })();
                          const uniStudentsCount = (() => {
                            try {
                              const s = localStorage.getItem(`exam_system_students_${uni.id}`);
                              return s ? JSON.parse(s).length : 0;
                            } catch { return 0; }
                          })();
                          const uniResultsCount = (() => {
                            try {
                              const r = localStorage.getItem(`exam_system_results_${uni.id}`);
                              return r ? JSON.parse(r).length : 0;
                            } catch { return 0; }
                          })();

                          const isExpired = uni.expiresAt ? new Date(uni.expiresAt).getTime() < Date.now() : false;

                          const isEditingBranding = editingUniId === uni.id;

                          return (
                            <div key={uni.id} className="border border-bento-border rounded-xl bg-bento-card overflow-visible transition-all shadow-sm">
                              <div
                                className={cn(
                                  "p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group",
                                  isExpired ? "bg-red-500/[0.01]" : ""
                                )}
                              >
                                <div className="space-y-1">
                                  <h4 className="font-extrabold text-sm text-bento-text-main flex items-center gap-2">
                                    <span>🏛️ {uni.name}</span>
                                    {uni.logoUrl && (
                                      <img 
                                        src={uni.logoUrl} 
                                        className="w-5 h-5 object-contain rounded-md" 
                                        alt="Logo"
                                        referrerPolicy="no-referrer"
                                      />
                                    )}
                                  </h4>
                                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-bento-text-muted font-bold">
                                    <span className={cn(
                                      "px-2.5 py-1 rounded-lg font-mono text-xs select-all border",
                                      isExpired 
                                        ? "bg-red-500/10 text-red-500 border-red-500/20" 
                                        : "bg-indigo-500/10 text-indigo-500 border-indigo-500/10"
                                    )}>
                                      {uni.key}
                                    </span>
                                    <span>•</span>
                                    <span>{language === 'ru' ? `Создан: ${uni.createdAt}` : `Yaratilgan: ${uni.createdAt}`}</span>
                                    {uni.expiresAt && (
                                      <>
                                        <span>•</span>
                                        {(() => {
                                          const expTime = new Date(uni.expiresAt).getTime();
                                          const timeLeft = expTime - Date.now();
                                          
                                          if (isExpired) {
                                            return (
                                              <span className="text-red-500 font-black uppercase tracking-wider bg-red-500/15 px-2 py-0.5 rounded-lg border border-red-500/20 text-[9px]">
                                                🛑 {language === 'ru' ? 'Срок действия истек' : 'Muddati tugagan'}
                                              </span>
                                            );
                                          } else {
                                            const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                                            const daysLeft = Math.floor(hoursLeft / 24);
                                            const displayStr = daysLeft > 0 
                                              ? (language === 'ru' ? `Осталось: ${daysLeft} дн` : `Qoldi: ${daysLeft} kun`)
                                              : (language === 'ru' ? `Осталось: ${hoursLeft} ч` : `Qoldi: ${hoursLeft} soat`);
                                            return (
                                              <span className="text-emerald-500 font-black uppercase tracking-wider bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/20 text-[9px]">
                                                ⏳ {displayStr}
                                              </span>
                                            );
                                          }
                                        })()}
                                      </>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-4 mt-2 text-[11px] font-bold text-zinc-400">
                                    <span>📝 {language === 'ru' ? 'Вопросов' : 'Savollar'}: <b className="text-bento-text-main">{uniQuestionsCount}</b></span>
                                    <span>👥 {language === 'ru' ? 'Студентов' : 'Talabalar'}: <b className="text-bento-text-main">{uniStudentsCount}</b></span>
                                    <span>🏆 {language === 'ru' ? 'Результатов' : 'Natijalar'}: <b className="text-bento-text-main">{uniResultsCount}</b></span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleRememberUniversity(uni)}
                                    className={cn(
                                      "relative overflow-hidden px-3 py-2 font-bold text-[10px] rounded-lg transition-all uppercase tracking-wider border cursor-pointer",
                                      rememberedUniversityIds.includes(uni.id)
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                                        : "bg-bento-bg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-bento-text-main border-bento-border"
                                    )}
                                    title={t.rememberUniversityPassword}
                                  >
                                    <AnimatePresence mode="wait">
                                      <motion.span
                                        key={rememberedUniversityIds.includes(uni.id) ? 'saved' : 'save'}
                                        initial={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
                                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
                                        transition={{ duration: 0.18, ease: 'easeInOut' }}
                                        className="inline-flex items-center justify-center"
                                      >
                                        {rememberedUniversityIds.includes(uni.id) ? t.saved : t.save}
                                      </motion.span>
                                    </AnimatePresence>
                                  </button>

                                  <div ref={expiryExtensionPickerRef} className="relative inline-block">
                                    <button
                                      type="button"
                                      onClick={() => openUniversityExpiryPicker(uni)}
                                      className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px] rounded-lg transition-all uppercase tracking-wider border border-amber-500/20 cursor-pointer"
                                    >
                                      {language === 'ru' ? 'Дата' : language === 'uz' ? 'Sana' : 'Date'}
                                    </button>

                                    {isExpiryExtensionPickerOpen && expiryExtensionTargetId === uni.id && (
                                      <div className="absolute right-0 top-full mt-2 z-[110] w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-4">
                                        <div className="flex items-center justify-between mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                          <button
                                            type="button"
                                            onClick={() => setCurrentExpiryExtensionCalendarDate(new Date(currentExpiryExtensionCalendarDate.getFullYear(), currentExpiryExtensionCalendarDate.getMonth() - 1))}
                                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                                          >
                                            <ChevronLeft size={16} />
                                          </button>

                                          <div className="flex gap-1 items-center">
                                            <button
                                              type="button"
                                              onClick={() => setExpiryExtensionCalendarView(expiryExtensionCalendarView === 'months' ? 'days' : 'months')}
                                              className={cn(
                                                'text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer',
                                                expiryExtensionCalendarView === 'months' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]' : 'text-[#1e293b] dark:text-[#f8fafc] hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                              )}
                                            >
                                              {currentExpiryExtensionCalendarDate.toLocaleDateString(locale, { month: 'long' })}
                                            </button>
                                            <span className="text-zinc-300 dark:text-zinc-700 text-xs font-bold">/</span>
                                            <button
                                              type="button"
                                              onClick={() => setExpiryExtensionCalendarView(expiryExtensionCalendarView === 'years' ? 'days' : 'years')}
                                              className={cn(
                                                'text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer',
                                                expiryExtensionCalendarView === 'years' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]' : 'text-[#1e293b] dark:text-[#f8fafc] hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                              )}
                                            >
                                              {currentExpiryExtensionCalendarDate.getFullYear()}
                                            </button>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => setCurrentExpiryExtensionCalendarDate(new Date(currentExpiryExtensionCalendarDate.getFullYear(), currentExpiryExtensionCalendarDate.getMonth() + 1))}
                                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                                          >
                                            <ChevronRight size={16} />
                                          </button>
                                        </div>

                                        {expiryExtensionCalendarView === 'days' && (
                                          <>
                                            <div className="grid grid-cols-7 gap-1 mb-2">
                                              {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => (
                                                <div key={day} className="text-[10px] font-bold text-center text-zinc-400 uppercase tracking-wider">
                                                  {day}
                                                </div>
                                              ))}
                                            </div>
                                            <div className="grid grid-cols-7 gap-1">
                                              {(() => {
                                                const year = currentExpiryExtensionCalendarDate.getFullYear();
                                                const month = currentExpiryExtensionCalendarDate.getMonth();
                                                const firstDay = new Date(year, month, 1).getDay();
                                                const shift = firstDay === 0 ? 6 : firstDay - 1;
                                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                const prevMonthDays = new Date(year, month, 0).getDate();
                                                const items: React.ReactNode[] = [];

                                                for (let i = shift - 1; i >= 0; i--) {
                                                  items.push(
                                                    <div key={`prev-${i}`} className="h-8 flex items-center justify-center text-xs font-bold text-zinc-350 dark:text-zinc-650">
                                                      {prevMonthDays - i}
                                                    </div>
                                                  );
                                                }

                                                for (let d = 1; d <= daysInMonth; d++) {
                                                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                  const isSelected = uni.expiresAt && new Date(uni.expiresAt).toISOString().slice(0, 10) === dateStr;
                                                  items.push(
                                                    <button
                                                      key={d}
                                                      type="button"
                                                      onClick={() => applyUniversityExpiryDate(uni, dateStr)}
                                                      className={cn(
                                                        'h-8 w-full rounded-xl flex items-center justify-center text-xs font-bold transition-all cursor-pointer',
                                                        isSelected ? 'bg-[#4f46e5] text-white shadow-lg shadow-indigo-600/35' : 'text-zinc-800 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                                                      )}
                                                    >
                                                      {d}
                                                    </button>
                                                  );
                                                }

                                                return items;
                                              })()}
                                            </div>
                                          </>
                                        )}

                                        {expiryExtensionCalendarView === 'months' && (
                                          <div className="grid grid-cols-3 gap-2 py-1">
                                            {Array.from({ length: 12 }).map((_, i) => {
                                              const monthName = new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' });
                                              const isSelected = currentExpiryExtensionCalendarDate.getMonth() === i;
                                              return (
                                                <button
                                                  key={i}
                                                  type="button"
                                                  onClick={() => {
                                                    setCurrentExpiryExtensionCalendarDate(new Date(currentExpiryExtensionCalendarDate.getFullYear(), i, 1));
                                                    setExpiryExtensionCalendarView('days');
                                                  }}
                                                  className={cn(
                                                    'rounded-xl px-2 py-2 text-xs font-bold transition-all cursor-pointer',
                                                    isSelected ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                                                  )}
                                                >
                                                  {monthName}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {expiryExtensionCalendarView === 'years' && (
                                          <div className="grid grid-cols-3 gap-2 py-1">
                                            {Array.from({ length: 12 }).map((_, idx) => {
                                              const year = currentExpiryExtensionCalendarDate.getFullYear() - 5 + idx;
                                              const isSelected = currentExpiryExtensionCalendarDate.getFullYear() === year;
                                              return (
                                                <button
                                                  key={year}
                                                  type="button"
                                                  onClick={() => {
                                                    setCurrentExpiryExtensionCalendarDate(new Date(year, currentExpiryExtensionCalendarDate.getMonth(), 1));
                                                    setExpiryExtensionCalendarView('days');
                                                  }}
                                                  className={cn(
                                                    'rounded-xl px-2 py-2 text-xs font-bold transition-all cursor-pointer',
                                                    isSelected ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                                                  )}
                                                >
                                                  {year}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUniversity(uni)}
                                    className="p-2 text-zinc-400 hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-500/20 hover:bg-red-500/5 cursor-pointer"
                                    title={language === 'ru' ? 'Удалить ВУЗ' : 'Oʻchirish'}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              {/* Removed inline branding drawer */}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : activeTab === 'security' && isSuperAdmin ? (
              <div className="flex-1 space-y-8 select-text animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-bento-border pb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-bento-text-main leading-none uppercase tracking-tight">
                      {language === 'ru' ? '🔐 Сессии и журнал действий' : '🔐 Sessiyalar va harakatlar jurnali'}
                    </h2>
                    <p className="text-bento-text-muted text-xs font-semibold leading-relaxed mt-1.5">
                      {language === 'ru'
                        ? `Активных устройств: ${deviceSessions.filter((session) => !session.revoked).length}`
                        : `Faol qurilmalar: ${deviceSessions.filter((session) => !session.revoked).length}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportAuditLog}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    <Download size={15} />
                    {language === 'ru' ? 'Экспорт журнала' : 'Jurnalni eksport qilish'}
                  </button>
                </div>

                <section className="space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-tight">{t.activeDevices}</h3>
                    <div className="relative w-full md:w-72">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bento-text-muted" />
                      <input
                        type="search"
                        value={activeDeviceSearch}
                        onChange={(event) => setActiveDeviceSearch(event.target.value)}
                        placeholder={t.searchActiveDevices}
                        aria-label={t.searchActiveDevices}
                        className="w-full rounded-lg border border-bento-border bg-bento-bg py-2 pl-9 pr-3 text-xs font-bold text-bento-text-main placeholder:text-bento-text-muted outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredActiveDeviceSessions.map((session) => (
                      <div key={session.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl border border-bento-border bg-bento-bg/30 p-4">
                        <div className="min-w-0">
                          <p className="text-xs font-black truncate">{session.actor} · {session.deviceName}</p>
                          <p className="text-[10px] text-bento-text-muted mt-1">
                            {session.ipAddress} · {new Date(session.lastSeenAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { audit.revokeSession(session.id); refreshAuditState(); }}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-[10px] uppercase tracking-wider"
                        >
                          <X size={13} />
                          {language === 'ru' ? 'Отозвать' : 'Bekor qilish'}
                        </button>
                      </div>
                    ))}
                    {filteredActiveDeviceSessions.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-bento-border p-6 text-center text-xs text-bento-text-muted">
                        {deviceSessions.some((session) => !session.revoked) ? t.noMatchingDevices : t.noActiveDevices}
                      </p>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-black uppercase tracking-tight">{t.recentActions}</h3>
                    <div className="flex flex-col md:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bento-text-muted" />
                        <input
                          type="search"
                          value={auditEntrySearch}
                          onChange={(event) => setAuditEntrySearch(event.target.value)}
                          placeholder={t.searchActions}
                          aria-label={t.searchActions}
                          className="w-full rounded-lg border border-bento-border bg-bento-bg py-2 pl-9 pr-3 text-xs font-bold text-bento-text-main placeholder:text-bento-text-muted outline-none focus:border-indigo-500"
                        />
                      </div>
                      <select
                        value={auditActionFilter}
                        onChange={(event) => setAuditActionFilter(event.target.value as typeof auditActionFilter)}
                        className="px-3 py-2 rounded-lg border border-bento-border bg-bento-bg text-xs font-bold"
                      >
                        <option value="all">{t.allActions}</option>
                        <option value="login">{auditActionLabel('login')}</option>
                        <option value="question_updated">{auditActionLabel('question_updated')}</option>
                        <option value="students_imported">{auditActionLabel('students_imported')}</option>
                        <option value="university_key_rotated">{auditActionLabel('university_key_rotated')}</option>
                        <option value="session_revoked">{auditActionLabel('session_revoked')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-auto rounded-2xl border border-bento-border">
                    <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-bento-border text-[10px] uppercase tracking-wider text-bento-text-muted">
                        <th className="p-3">{t.auditAction}</th>
                        <th className="p-3">{t.auditActor}</th>
                        <th className="p-3">{t.university}</th>
                        <th className="p-3">{t.date}</th>
                      </tr>
                    </thead>
                    <tbody>
                        {filteredAuditEntries.slice(0, 100).map((entry) => (
                          <tr key={entry.id} className="border-b border-bento-border last:border-0">
                            <td className="p-3 font-bold">{auditActionLabel(entry.action)}</td>
                            <td className="p-3 text-bento-text-muted">{entry.actor}</td>
                            <td className="p-3 text-bento-text-muted">{auditUniversityName(entry.universityId)}</td>
                            <td className="p-3 text-bento-text-muted whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                          </tr>
                        ))}
                        {filteredAuditEntries.length === 0 && (
                          <tr><td colSpan={4} className="p-6 text-center text-bento-text-muted">{auditEntries.length ? t.noMatchingActions : t.noAuditEntries}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : activeTab === 'branding' && isSuperAdmin ? (
              <div className="flex-1 space-y-8 select-text animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-bento-border pb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-bento-text-main leading-none uppercase tracking-tight">
                      {language === 'ru' ? '🎨 Брендинг и Оформление ВУЗов' : '🎨 OTM Brendingi va Dizayni'}
                    </h2>
                    <p className="text-bento-text-muted text-xs font-semibold leading-relaxed mt-1.5">
                      {language === 'ru' 
                        ? 'Настройте индивидуальные логотипы, фоны и стили для каждого ВУЗа с интерактивным просмотром в реальном времени.' 
                        : 'Har bir OTM uchun shaxsiy logotip, fon va dizaynlarni jonli efirda sinab koʻring.'}
                    </p>
                  </div>
                </div>

                {universities.length === 0 ? (
                  <div className="bg-bento-card border border-bento-border rounded-2xl p-8 text-center space-y-4">
                    <span className="text-4xl">🏛️</span>
                    <p className="text-bento-text-muted text-xs font-semibold">
                      {language === 'ru' 
                        ? 'Сначала добавьте хотя бы один университет в разделе «ВУЗы / Ключи».' 
                        : 'Avval «OTMlar / Kalitlar» boʻlimida kamida bitta universitet yarating.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    {/* Controls Panel (Left) */}
                    <div className="xl:col-span-5 bg-bento-card border border-bento-border rounded-2xl p-6 space-y-6">
                      <div className="space-y-4">
                        {/* Select University */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                            {t.chooseUniversityToEdit}
                          </label>
                          <select
                            value={selectedBrandingUniId}
                            onChange={(e) => setSelectedBrandingUniId(e.target.value)}
                            className="w-full px-4 py-3 bg-bento-bg border border-bento-border rounded-xl font-medium text-xs text-bento-text-main focus:border-indigo-500 outline-none cursor-pointer"
                          >
                            {universities.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.key})</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                            {t.reportUniversityName}
                          </label>
                          <input
                            type="text"
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder={t.enterUniversityName}
                            className="w-full px-4 py-3 bg-bento-bg border border-bento-border rounded-xl font-medium text-xs text-bento-text-main focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Logo Upload Zone */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                            {t.universityLogoImage}
                          </label>
                          
                          {brandLogo ? (
                            <div className="relative border border-bento-border rounded-xl p-3 bg-bento-bg/50 flex items-center gap-3 animate-fade-in">
                              <img src={brandLogo} className="w-12 h-12 object-contain bg-white dark:bg-zinc-800 p-1 rounded-lg border border-bento-border" alt="Uploaded Logo" />
                              <div className="flex-1 overflow-hidden">
                                <p className="text-[10px] font-bold text-bento-text-main truncate">
                                  {t.uploadedLogo}
                                </p>
                                <p className="text-[8px] text-bento-text-muted">Base64 Data URL</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBrandLogo('')}
                                className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-bold rounded-lg transition-all uppercase cursor-pointer"
                              >
                                {language === 'ru' ? 'Удалить' : 'Oʻchirish'}
                              </button>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-bento-border hover:border-indigo-500/50 rounded-xl p-4 bg-bento-bg/30 text-center space-y-1.5 transition-all relative group cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleBrandLogoUpload(file);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <span className="text-xl">🖼️</span>
                              <p className="text-[10px] font-bold text-bento-text-main">
                                {language === 'ru' ? 'Нажмите для загрузки логотипа' : 'Logotip yuklash uchun bosing'}
                              </p>
                              <p className="text-[8px] text-bento-text-muted">
                                {language === 'ru' ? 'Рекомендуется квадратный PNG или SVG' : 'Kvadrat PNG yoki SVG tavsiya etiladi'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Background Upload Zone */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                            {language === 'ru' ? 'Фон входного экрана (Фото или Видео)' : 'Kirish ekrani foni (Rasm yoki Video)'}
                          </label>

                          {brandBg ? (
                            <div className="relative border border-bento-border rounded-xl p-3 bg-bento-bg/50 flex items-center gap-3 animate-fade-in">
                              <div className="w-12 h-12 rounded-lg border border-bento-border bg-black overflow-hidden flex items-center justify-center">
                                {brandBgType === 'video' ? (
                                  <video src={brandBg} className="w-full h-full object-cover opacity-80" muted loop playsInline />
                                ) : (
                                  <img src={brandBg} className="w-full h-full object-cover" alt="Uploaded BG" />
                                )}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <p className="text-[10px] font-bold text-bento-text-main truncate">
                                  {brandBgType === 'video' 
                                    ? (language === 'ru' ? 'Загруженное фоновое видео' : 'Yuklangan fon videosi')
                                    : (language === 'ru' ? 'Загруженное фоновое фото' : 'Yuklangan fon rasmi')}
                                </p>
                                <p className="text-[8px] text-bento-text-muted uppercase font-black">{brandBgType}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setBrandBg('');
                                }}
                                className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-bold rounded-lg transition-all uppercase cursor-pointer"
                              >
                                {language === 'ru' ? 'Удалить' : 'Oʻchirish'}
                              </button>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-bento-border hover:border-indigo-500/50 rounded-xl p-4 bg-bento-bg/30 text-center space-y-1.5 transition-all relative group cursor-pointer">
                              <input
                                type="file"
                                accept="image/*,video/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleBrandBackgroundUpload(file);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <span className="text-xl">🎬</span>
                              <p className="text-[10px] font-bold text-bento-text-main">
                                {language === 'ru' ? 'Нажмите для загрузки фото/видео' : 'Rasm/video yuklash uchun bosing'}
                              </p>
                              <p className="text-[8px] text-bento-text-muted">
                                {language === 'ru' ? 'Изображения (PNG/JPG) или короткие видео (MP4)' : 'Tasvirlar (PNG/JPG) yoki qisqa videolar (MP4)'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Background Type fallbacks */}
                        {brandBg && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-bento-text-muted uppercase tracking-wider block">
                              {language === 'ru' ? 'Тип фонового медиа' : 'Fon media turi'}
                            </label>
                            <select
                              value={brandBgType}
                              onChange={(e) => setBrandBgType(e.target.value as 'image' | 'video')}
                              className="w-full px-4 py-3 bg-bento-bg border border-bento-border rounded-xl font-medium text-xs text-bento-text-main focus:border-indigo-500 outline-none cursor-pointer"
                            >
                              <option value="image">{language === 'ru' ? 'Фото (Изображение)' : 'Rasm (Tasvir)'}</option>
                              <option value="video">{language === 'ru' ? 'Видео (без звука)' : 'Video (tovussiz)'}</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-bento-border/40">
                        <button
                          type="button"
                          onClick={() => {
                            const target = universities.find(u => u.id === selectedBrandingUniId);
                            if (target) {
                              setBrandName(target.name || '');
                              setBrandLogo(target.logoUrl || '');
                              setBrandBg(target.bgUrl || '');
                              setBrandBgType(target.bgType || 'image');
                            }
                          }}
                          className="flex-1 px-4 py-3 bg-bento-bg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-bento-text-muted font-bold text-xs rounded-xl transition-all uppercase tracking-wider border border-bento-border cursor-pointer"
                        >
                          {language === 'ru' ? 'Сбросить' : 'Qayta tiklash'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = universities.map(u => {
                              if (u.id === selectedBrandingUniId) {
                                return {
                                  ...u,
                                  name: brandName.trim() || u.name,
                                  logoUrl: brandLogo.trim() || undefined,
                                  bgUrl: brandBg.trim() || undefined,
                                  bgType: brandBg.trim() ? brandBgType : undefined,
                                };
                              }
                              return u;
                            });
                            setUniversities(updated);
                            saveUniversitiesSafe(updated);
                            updateCurrentUniversityIfActive(updated);
                          }}
                          className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-600/10"
                        >
                          {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                        </button>
                      </div>
                    </div>

                    {/* Real-time Preview Panel (Right) */}
                    <div className="xl:col-span-7 space-y-4">
                      <h3 className="text-xs font-black text-bento-text-muted uppercase tracking-wider">
                        {language === 'ru' ? '👁️ Превью входного экрана (Симулятор)' : '👁️ Kirish ekrani simulyatori'}
                      </h3>

                      {/* Device Frame Wrapper */}
                      <div className="relative min-h-[480px] w-full bg-zinc-950 rounded-3xl border border-bento-border overflow-hidden shadow-2xl flex items-center justify-center select-none py-4">
                        {/* Immersive Mock Background */}
                        {brandBg ? (
                          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                            {brandBgType === 'video' ? (
                              <div className="w-full h-full bg-zinc-900 flex items-center justify-center animate-fade-in">
                                <video
                                  src={brandBg}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover opacity-20 filter blur-[1px]"
                                />
                              </div>
                            ) : (
                              <img
                                src={brandBg}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover opacity-20 filter blur-[1px] animate-fade-in"
                                alt="Mock BG"
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950 opacity-80" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-zinc-950 to-purple-950/20 z-0" />
                        )}

                        {/* Simulated Entry Card */}
                        <div className="relative w-[380px] h-[400px] bg-bento-card/90 dark:bg-zinc-900/80 backdrop-blur-md border border-bento-border/70 rounded-[28px] pt-4 px-4 pb-4 flex flex-col justify-between shadow-xl overflow-hidden z-10 transition-all duration-300">
                          {/* Simulated Atmospheric Glows */}
                          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full -mr-24 -mt-24 blur-[60px]" />
                          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full -ml-24 -mb-24 blur-[60px]" />

                          {/* Mock Header Logo */}
                          <div className="flex flex-col items-center justify-center z-10 mt-1">
                            <div className="relative flex flex-col items-center">
                              <div className="relative bg-transparent p-2 flex items-center justify-center w-[240px] h-[120px] overflow-hidden z-10">
                                {brandLogo ? (
                                  <img 
                                    src={brandLogo} 
                                    className="w-full h-full object-contain" 
                                    alt="Mock Logo"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-7xl">🏛️</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Mock Buttons (Stacked Vertically) */}
                          <div className="flex flex-col gap-2.5 w-full z-10 my-1 mt-auto">
                            <div className="group/stud bg-bento-bg/30 border border-bento-border px-3 py-2 rounded-xl flex items-center gap-3 text-left w-full hover:border-indigo-500 transition-all duration-300 cursor-pointer">
                              <div className="p-1 bg-indigo-500/10 rounded-md flex-shrink-0">
                                <GraduationCap size={16} className="text-indigo-400" />
                              </div>
                              <div className="flex-1">
                                <div className="text-[12px] font-black tracking-tight leading-none text-bento-text-main">
                                  {language === 'ru' ? 'Студент' : 'Talaba'}
                                </div>
                                <div className="text-[9px] text-bento-text-muted mt-1 leading-none">
                                  {language === 'ru' ? 'Вход для студентов' : 'Talabalar kirishi'}
                                </div>
                              </div>
                              <span className="text-[10px] text-indigo-400 transition-transform duration-300 group-hover/stud:translate-x-1">➔</span>
                            </div>

                            <div className="group/adm bg-bento-bg/30 border border-bento-border px-3 py-2 rounded-xl flex items-center gap-3 text-left w-full hover:border-indigo-500 transition-all duration-300 cursor-pointer">
                              <div className="p-1 bg-zinc-500/10 rounded-md flex-shrink-0">
                                <ShieldCheck size={16} className="text-zinc-400" />
                              </div>
                              <div className="flex-1">
                                <div className="text-[12px] font-black tracking-tight leading-none text-bento-text-main">
                                  {language === 'ru' ? 'Админ-панель' : 'Admin paneli'}
                                </div>
                                <div className="text-[9px] text-bento-text-muted mt-1 leading-none">
                                  {language === 'ru' ? 'Администрирование' : 'Boshqaruv paneli'}
                                </div>
                              </div>
                              <span className="text-[10px] text-zinc-400 transition-transform duration-300 group-hover/adm:translate-x-1">➔</span>
                            </div>
                          </div>

                          {/* Mock Footer switchers */}
                          <div className="flex items-center justify-center gap-2 pt-1.5 border-t border-bento-border/20">
                            <div className="px-2 py-1 bg-bento-bg/30 border border-bento-border rounded-lg text-[8px] font-black text-bento-text-muted uppercase flex-1 text-center scale-95">
                              {language === 'ru' ? 'Русский' : "O'zbekcha"}
                            </div>
                            <div className="h-5 w-5 bg-bento-bg/30 border border-bento-border rounded-lg flex items-center justify-center text-[10px] text-bento-text-muted scale-95">
                              🌓
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'students' && (
              <div className="space-y-6">
                {/* Bulk Actions Toolbar */}
                <AnimatePresence>
                  {selectedStudentIds.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center">
                          {selectedStudentIds.size}
                        </span>
                        <span className="text-xs font-black uppercase tracking-widest">Выбрано</span>
                      </div>
                      
                      <div className="h-6 w-[1px] bg-white/20 dark:bg-black/10" />
                      
                      <div className="flex items-center gap-3">
                        <div className="relative group/move">
                          <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest">
                            <Users size={14} /> Переместить
                          </button>
                          <div className="absolute bottom-full mb-2 left-0 w-48 bg-zinc-800 dark:bg-zinc-100 rounded-2xl shadow-xl border border-white/10 p-2 hidden group-hover/move:block max-h-60 overflow-y-auto custom-scrollbar">
                            {groups.map(g => (
                              <button
                                key={g.id}
                                onClick={() => handleBulkMove(g.id)}
                                className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-[10px] font-bold"
                              >
                                {g.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={handleBulkDelete}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest"
                        >
                          <Trash2 size={14} /> {t.delete}
                        </button>

                        <button 
                          onClick={() => setSelectedStudentIds(new Set())}
                          className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-black tracking-tight">{t.studentManagement}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <div className="relative flex items-center h-[38px] flex-1 lg:flex-initial">
                      <Search size={14} className="absolute left-3 text-zinc-400" />
                      <input 
                        type="text" 
                        placeholder={t.searchPlaceholder}
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full pl-9 pr-4 h-full bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl text-[11px] outline-none focus:border-zinc-400 dark:focus:border-zinc-500 lg:min-w-[150px] text-bento-text-main transition-all"
                      />
                    </div>
                    <button 
                      onClick={downloadStudentTemplate}
                      className="flex items-center gap-2 px-3 h-[38px] bg-bento-bg border border-bento-border rounded-xl hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 text-[10px] font-black transition-colors uppercase tracking-widest whitespace-nowrap"
                    >
                      <Download size={14} className="text-indigo-600" />
                      {t.template}
                    </button>
                    <label className="flex items-center gap-2 px-3 h-[38px] bg-bento-bg border border-bento-border rounded-xl hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 cursor-pointer text-[10px] font-black transition-colors uppercase tracking-widest whitespace-nowrap">
                      <FileSpreadsheet size={14} className="text-green-600" />
                      {t.import}
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleStudentImport} />
                    </label>
                    <button 
                      onClick={() => setShowAddStudentForm(!showAddStudentForm)}
                      className="bg-bento-accent text-white px-4 h-[38px] rounded-xl font-black flex items-center gap-2 hover:opacity-90 text-[10px] uppercase tracking-widest whitespace-nowrap"
                    >
                      <UserPlus size={14} />
                      {t.addStudent}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showAddStudentForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-6 relative z-50"
                    >
                      <div className="bg-bento-card dark:bg-zinc-900 p-4 rounded-2xl border border-bento-border flex flex-wrap gap-3 items-center shadow-xl">
                        <div className="flex-[1] min-w-[150px] max-w-[220px]">
                          <input
                            type="text"
                            value={newStudent.firstName}
                            onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})}
                            placeholder={t.fullNamePlaceholder}
                            autoComplete="off"
                            className="w-full bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl px-4 py-2 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all text-bento-text-main h-[42px]"
                          />
                        </div>
                        
                        <div className="flex-[0.8] min-w-[160px] relative" ref={groupSelectRef}>
                          <div className="flex items-stretch -space-x-[1px]">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={newGroupName}
                                onFocus={() => setIsGroupListOpen(true)}
                                onChange={(e) => {
                                  setNewGroupName(e.target.value);
                                  const g = groups.find(x => x.name === e.target.value);
                                  if (g) setNewStudent({...newStudent, groupId: g.id});
                                }}
                                placeholder="Группа..."
                                className={cn(
                                  "w-full bg-transparent dark:bg-zinc-900/40 border-2 border-bento-border px-4 py-2.5 text-sm outline-none font-bold focus:border-zinc-400 dark:focus:border-zinc-500 focus:z-10 transition-all h-[42px] text-bento-text-main dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                                  isGroupListOpen ? "rounded-tl-xl" : "rounded-l-xl"
                                )}
                              />
                            </div>
                            <div 
                              className="flex items-center gap-1 px-1.5 bg-bento-bg/80 dark:bg-zinc-900/40 border-2 border-x-0 border-bento-border h-[42px]"
                            >
                              {(['ru', 'uz', 'en'] as Language[]).map(lang => (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCreationLanguage(lang);
                                  }}
                                  className={cn(
                                    "w-7 h-7 flex items-center justify-center rounded-lg text-[9px] font-black uppercase transition-all",
                                    creationLanguage === lang 
                                      ? "bg-indigo-600 text-white shadow-md" 
                                      : "text-zinc-400 dark:text-zinc-500 hover:text-indigo-500"
                                  )}
                                >
                                  {lang}
                                </button>
                              ))}
                            </div>
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                handleAddGroup();
                              }}
                              className={cn(
                                "flex-[0.6] min-w-[60px] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all h-[42px] z-20",
                                isGroupListOpen ? "rounded-tr-xl" : "rounded-r-xl"
                              )}
                            >
                              {t.add}
                            </button>
                          </div>
                          
                          <AnimatePresence>
                            {isGroupListOpen && (
                              <motion.div 
                                initial={{ opacity: 0, y: -5, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.98 }}
                                className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl z-[60] overflow-hidden -mt-1"
                              >
                                <div className="max-h-[180px] overflow-y-auto p-1 py-1.5 space-y-0.5">
                                  {groups.filter(g => g.name.toLowerCase().includes(newGroupName.toLowerCase())).length > 0 ? (
                                    groups.filter(g => g.name.toLowerCase().includes(newGroupName.toLowerCase())).map(g => (
                                      <button
                                        key={g.id}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setNewGroupName(g.name);
                                          setNewStudent({...newStudent, groupId: g.id});
                                          setIsGroupListOpen(false);
                                        }}
                                        className={cn(
                                          "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between shadow-none focus:outline-none focus:ring-0 border",
                                          newStudent.groupId === g.id 
                                            ? (theme === 'dark' ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black")
                                            : theme === 'dark'
                                              ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                              : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                        )}
                                      >
                                        <span>{g.name}</span>
                                        <span className={cn(
                                          "text-[8px] font-black px-1.5 py-0.5 rounded border transition-colors",
                                          newStudent.groupId === g.id
                                            ? "bg-white/20 text-white border-white/30"
                                            : theme === 'dark'
                                              ? "bg-white/5 text-zinc-300 border-white/10"
                                              : "bg-zinc-100 text-zinc-700 border-zinc-200"
                                        )}>
                                          {g.language?.toUpperCase() || 'RU'}
                                        </span>
                                      </button>
                                    ))
                                  ) : (
                                    <p className="px-4 py-3 text-[10px] text-zinc-400 font-bold italic uppercase tracking-widest text-center">Группы не найдены</p>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="w-[110px] shrink-0">
                          <input
                            type="text"
                            value={newStudent.subgroup}
                            onChange={(e) => setNewStudent({...newStudent, subgroup: e.target.value})}
                            placeholder="Подгруппа"
                            className="w-full bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl px-3 py-2 text-sm outline-none font-bold focus:border-zinc-400 dark:focus:border-zinc-500 transition-all text-bento-text-main h-[42px]"
                          />
                        </div>
                        <div className="flex items-center gap-1 px-1.5 bg-bento-bg/80 dark:bg-zinc-900/40 border border-bento-border rounded-xl h-[42px] shrink-0">
                          {(['ru', 'uz', 'en'] as Language[]).map((lang) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setNewStudent({ ...newStudent, language: lang })}
                              className={cn(
                                "w-7 h-7 flex items-center justify-center rounded-lg text-[9px] font-black uppercase transition-all",
                                newStudent.language === lang
                                  ? "bg-indigo-600 text-white shadow-md"
                                  : "text-zinc-400 dark:text-zinc-500 hover:text-indigo-500"
                              )}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                        <div className="w-[210px] shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={newStudent.pinfl || ''}
                            onChange={(e) => setNewStudent({...newStudent, pinfl: e.target.value.replace(/\D/g, '').slice(0, 14)})}
                            placeholder="ПИНФЛ (14 цифр)"
                            autoComplete="off"
                            className="w-full bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl px-4 py-2 text-sm outline-none font-mono tabular-nums focus:border-zinc-400 dark:focus:border-zinc-500 transition-all text-bento-text-main h-[42px]"
                          />
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.preventDefault();
                            handleAddStudent(); 
                            setIsGroupListOpen(false); 
                          }} 
                          className="bg-indigo-600 text-white px-6 rounded-xl font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all h-[42px] shrink-0 hover:bg-indigo-700 shadow-lg shadow-indigo-600/10"
                        >
                          {t.add}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={groupListRef} className="space-y-6">
                  {students.reduce((acc, student) => {
                    const group = groups.find(g => g.id === student.groupId);
                    if (!group) return acc;
                    if (!acc[group.id]) acc[group.id] = { name: group.name, subgroups: {} };
                    const subgroup = student.subgroup || t.generalGroup;
                    if (!acc[group.id].subgroups[subgroup]) acc[group.id].subgroups[subgroup] = [];
                    acc[group.id].subgroups[subgroup].push(student);
                    return acc;
                  }, {} as Record<string, {name: string, subgroups: Record<string, Student[]>}>) && Object.entries(students.reduce((acc, student) => {
                    const group = groups.find(g => g.id === student.groupId);
                    if (!group) return acc;
                    if (!acc[group.id]) acc[group.id] = { name: group.name, subgroups: {} };
                    const subgroup = student.subgroup || t.generalGroup;
                    if (!acc[group.id].subgroups[subgroup]) acc[group.id].subgroups[subgroup] = [];
                    acc[group.id].subgroups[subgroup].push(student);
                    return acc;
                  }, {} as Record<string, {name: string, subgroups: Record<string, Student[]>}>)).map(([groupId, groupData], gIdx) => (
                    <div key={`${groupId}-${gIdx}`} className="border border-bento-border rounded-2xl overflow-hidden bg-bento-card">
                      <div className="flex items-center bg-transparent border-b border-bento-border group/header">
                        <button onClick={() => handleDeleteGroup(groupId)} className="p-4 hover:text-red-500 text-bento-text-muted transition-colors"><Trash2 size={18} /></button>
                        <div 
                          role="button"
                          onClick={() => toggleGroup(groupId)}
                          className="flex-1 flex items-center justify-between p-4 group cursor-pointer outline-none"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm uppercase tracking-tight text-bento-text-main dark:text-zinc-200">{groupData.name}</span>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase">{groups.find(g => g.id === groupId)?.language || 'ru'}</span>
                            </div>
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{formatStudentCount(Object.values(groupData.subgroups).flat().length, language)}</span>
                          </div>
                          <ChevronDown className={cn("transition-transform duration-300", expandedGroups[groupId] && "rotate-180")} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedGroups[groupId] && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="p-2 space-y-2">
                              {Object.entries(groupData.subgroups).map(([subgroup, subgroupStudents], subIdx) => (
                                <div key={`${subgroup}-${subIdx}`} className="rounded-xl border border-bento-border bg-bento-bg/30 dark:bg-bento-card">
                                  <div className="p-3 dark:bg-transparent border-b border-bento-border/50">
                                    <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em]">{subgroup}</h4>
                                  </div>
                                  <div className="divide-y divide-bento-border/30">
                                    {subgroupStudents.map((s, sIdx) => (
                                      <div key={`s-${s.id}-${sIdx}`} className="flex items-center justify-between p-2 px-3 bg-transparent dark:bg-bento-card hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors group rounded-xl">
                                        <div className="flex items-center gap-3">
                                          <input 
                                            type="checkbox"
                                            checked={selectedStudentIds.has(s.id)}
                                            onChange={() => toggleStudentSelection(s.id)}
                                            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                          />
                                          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center font-bold text-[10px] text-zinc-500 border border-bento-border/50">
                                            {(s.firstName[0] || '?').toUpperCase()}
                                          </div>
                                          <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-bento-text-main">{s.firstName} {s.lastName}</span>
                                              {s.pinfl && (
                                                <span className="text-[10px] text-zinc-400/80 dark:text-zinc-500 font-mono bg-transparent ml-6">
                                                  ({security.maskPinfl(s.pinfl)})
                                                </span>
                                              )}
                                              {s.id && storage.getResults().some(r => {
                                                const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
                                                const isRecent = Date.now() - new Date(r.timestamp).getTime() < ONE_MONTH;
                                                return r.studentId === s.id && r.groupId === s.groupId && r.percentage === 100 && isRecent;
                                              }) && (
                                                <span className="text-[8px] font-black text-yellow-500 uppercase tracking-widest animate-pulse border border-yellow-500/30 px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(234,179,8,0.2)]">{t.legend}</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <button onClick={() => handleDeleteStudent(s.id)} className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                  {groups.filter(g => !students.some(s => s.groupId === g.id)).map(group => (
                    <div key={group.id} className="flex items-center justify-between p-4 border border-bento-border rounded-xl bg-bento-card opacity-60">
                       <span className="font-bold text-sm uppercase">{group.name} (пустая)</span>
                       <button onClick={() => handleDeleteGroup(group.id)} className="text-red-500 hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="space-y-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">{t.questionsBase}</h2>
                    <p className="text-sm text-bento-text-muted">{t.manageQuestionsDesc}</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto items-center">
                    <div className="relative flex-1 md:w-64">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        type="text"
                        value={questionSearch}
                        onChange={(e) => setQuestionSearch(e.target.value)}
                        placeholder={t.searchPlaceholder}
                        className="w-full pl-10 pr-4 py-2.5 bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl text-xs outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all"
                      />
                    </div>
                    <div className="flex gap-2">
                    <button onClick={exportTemplate} className="flex items-center gap-2 px-4 py-2 bg-bento-bg dark:bg-zinc-950 border border-bento-border rounded-xl text-xs font-bold hover:border-indigo-500 transition-all"><Download size={14} /> {t.template}</button>
                    <label className="flex items-center gap-2 px-4 py-2 bg-bento-bg dark:bg-zinc-950 border border-bento-border rounded-xl cursor-pointer text-xs font-bold hover:border-indigo-500 transition-colors">
                       <Upload size={14} /> {t.import}
                       <input type="file" className="hidden" accept=".xlsx,.xls,.json,.docx" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>
              </div>

                    <div className="requested-surface p-6 rounded-2xl border border-bento-border space-y-5 min-h-[220px]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">{t.testSettings}</h3>
                        </div>
                        <div className="requested-surface flex items-center gap-3 px-5 h-[42px] rounded-xl border-2 border-bento-border transition-all focus-within:border-indigo-500 dark:focus-within:shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                            <Timer size={18} className="text-indigo-600" />
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={settings.timerMinutes}
                                onChange={(e) => updateSettings({...settings, timerMinutes: Math.max(1, Number(e.target.value))})}
                                className="w-12 bg-transparent text-center font-black text-lg outline-none text-bento-text-main"
                              />
                          <div className="flex flex-col gap-0 justify-center">
                            <button 
                              onClick={() => updateSettings({...settings, timerMinutes: settings.timerMinutes + 1})}
                              className="text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 leading-none h-4 flex items-center"
                            >
                              <ChevronUp size={16} className="stroke-[4]" />
                            </button>
                            <button 
                              onClick={() => updateSettings({...settings, timerMinutes: Math.max(1, settings.timerMinutes - 1)})}
                              className="text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 leading-none h-4 flex items-center"
                            >
                              <ChevronDown size={16} className="stroke-[4]" />
                            </button>
                          </div>
                        </div>
                        <span className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400 ml-1">{t.min}</span>
                      </div>
                  </div>
                  
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                   {/* Theme Field */}
                   <div className="lg:col-span-2">
                     <p className="text-[10px] font-black uppercase text-zinc-400 px-1 mb-2">{t.theme}</p>
                     <div className="relative" ref={themeSelectRef}>
                       <div className="relative">
                         <input
                           type="text"
                           value={isThemeSelectOpen ? themeSearch : newQuestion.theme}
                           placeholder={t.searchTheme}
                           onFocus={() => {
                             setIsThemeSelectOpen(true);
                             setThemeSearch("");
                           }}
                           onChange={(e) => {
                             if (!isThemeSelectOpen) setIsThemeSelectOpen(true);
                             setThemeSearch(e.target.value);
                           }}
                           className={cn(
                             "requested-surface dark:bg-bento-card w-full h-[42px] border-2 border-bento-border px-5 flex items-center justify-between text-sm font-black text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                             isThemeSelectOpen ? "rounded-t-xl" : "rounded-xl"
                           )}
                         />
                         <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                           <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", isThemeSelectOpen && "rotate-180")} />
                         </div>
                       </div>

                         <AnimatePresence>
                           {isThemeSelectOpen && (
                             <motion.div
                               initial={{ opacity: 0, y: -5 }}
                               animate={{ opacity: 1, y: 0 }}
                               exit={{ opacity: 0, y: -5 }}
                               className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl overflow-hidden z-[110] -mt-0.5 flex flex-col"
                             >
                               <div className="max-h-[200px] overflow-y-auto p-1 py-1.5 space-y-0.5 custom-scrollbar">
                                 {themeSearch.trim() && !examThemes.some(t => t.name.toLowerCase() === themeSearch.toLowerCase()) && (
                                   <button 
                                     onClick={() => {
                                       setNewQuestion({...newQuestion, theme: themeSearch.trim()});
                                       handleAddTheme(themeSearch.trim());
                                       setIsThemeSelectOpen(false);
                                     }}
                                     className="w-full text-left px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-1"
                                   >
                                     <Plus size={14} /> Добавить "{themeSearch}"
                                   </button>
                                 )}
                                 {examThemes
                                   .filter(t => t.name.toLowerCase().includes(themeSearch.toLowerCase()))
                                   .map(theme => (
                                     <div 
                                       key={theme.id}
                                       className={cn(
                                         "w-full flex items-center group rounded-lg transition-all text-xs border",
                                         newQuestion.theme === theme.name 
                                           ? (isDarkTheme ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black") 
                                           : isDarkTheme
                                              ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                              : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                       )}
                                     >
                                       <button
                                         onClick={() => {
                                           setNewQuestion({...newQuestion, theme: theme.name});
                                           setIsThemeSelectOpen(false);
                                         }}
                                         className="flex-1 text-left px-3 py-2 font-black outline-none truncate flex items-center justify-between gap-2"
                                       >
                                         <span>{theme.name}</span>
                                       </button>
                                       <button 
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           handleDeleteTheme(theme.id);
                                         }}
                                         className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-lg transition-opacity mr-1"
                                       >
                                         <Trash2 size={12} className={newQuestion.theme === theme.name ? (isDarkTheme ? "text-indigo-300" : "text-indigo-700") : "text-red-500"} />
                                       </button>
                                     </div>
                                   ))}

                                 {examThemes.filter(t => t.name.toLowerCase().includes(themeSearch.toLowerCase())).length === 0 && !themeSearch.trim() && (
                                   <p className="px-4 py-3 text-[10px] text-zinc-400 font-bold italic uppercase tracking-widest text-center">Темы не найдены</p>
                                 )}
                               </div>
                             </motion.div>
                           )}
                         </AnimatePresence>
                       </div>
                   </div>

                   {/* Language Field */}
                   <div className="lg:col-span-1">
                     <p className="text-[10px] font-black uppercase text-zinc-400 px-1 mb-2">{t.language}</p>
                     <div className="relative" ref={languageSelectRef}>
                       <button
                         onClick={() => setIsLanguageSelectOpen(!isLanguageSelectOpen)}
                         className={cn(
                           "requested-surface dark:bg-bento-card w-full h-[42px] border-2 border-bento-border px-5 flex items-center justify-between text-[11px] font-black text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                           isLanguageSelectOpen ? "rounded-t-xl border-b-transparent" : "rounded-xl"
                         )}
                       >
                         <span className="uppercase">{creationLanguage}</span>
                         <ChevronDown size={14} className={cn("text-zinc-400 transition-transform", isLanguageSelectOpen && "rotate-180")} />
                       </button>

                       <AnimatePresence>
                         {isLanguageSelectOpen && (
                           <motion.div
                             initial={{ opacity: 0, y: -5 }}
                             animate={{ opacity: 1, y: 0 }}
                             exit={{ opacity: 0, y: -5 }}
                             className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl overflow-hidden z-[110] -mt-0.5"
                           >
                             {(['ru', 'uz', 'en'] as Language[]).map(lang => (
                               <button
                                 key={lang}
                                 onClick={() => {
                                   setCreationLanguage(lang);
                                   setIsLanguageSelectOpen(false);
                                 }}
                                 className={cn(
                                   "w-full px-5 py-3 text-left text-xs font-black uppercase transition-all border flex items-center justify-between",
                                   creationLanguage === lang ? (isDarkTheme ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black") : isDarkTheme ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10" : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                 )}
                               >
                                 <span>{lang === 'ru' ? 'RU' : lang === 'uz' ? 'UZ' : 'EN'}</span>
                               </button>
                             ))}
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                   </div>

                    {/* Question Type Field */}
                   <div className="lg:col-span-6">
                      <p className="text-[10px] font-black uppercase text-zinc-400 px-1 mb-2">{t.questionType}</p>
                      <div className="relative" ref={questionTypeSelectRef}>
                        <button
                          onClick={() => setIsQuestionTypeSelectOpen(!isQuestionTypeSelectOpen)}
                          className={cn(
                            "requested-surface dark:bg-bento-card w-full h-[42px] border-2 border-bento-border px-5 flex items-center justify-between text-[11px] font-black text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                            isQuestionTypeSelectOpen ? "rounded-t-xl border-b-transparent" : "rounded-xl"
                          )}
                        >
                          <span className="uppercase">
                            {t.questionType}: {newQuestion.type === 'single' ? t.singleAnswer : newQuestion.type === 'multiple' ? t.multipleAnswer : `${t.true} / ${t.false}`}
                          </span>
                          <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", isQuestionTypeSelectOpen && "rotate-180")} />
                        </button>
                        
                        <AnimatePresence>
                          {isQuestionTypeSelectOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl overflow-hidden z-[110] -mt-0.5"
                            >
                              <div className="p-1 py-1.5 space-y-0.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                                {[
                                  { id: 'single', label: t.singleAnswer },
                                  { id: 'multiple', label: t.multipleAnswer },
                                  { id: 'true_false', label: t.trueFalse },
                                  { id: 'find_on_model', label: t.findOnModel }
                                ].map((type) => (
                                  <button
                                    key={type.id}
                                    onClick={() => {
                                      setNewQuestion({...newQuestion, type: type.id as any, correctAnswer: type.id === 'single' ? 'A' : ''});
                                      setSelectedMultiOptions([]);
                                      setIsQuestionTypeSelectOpen(false);
                                    }}
                                    className={cn(
                                      "w-full px-3 py-2 text-left text-xs font-black transition-all rounded-lg flex items-center justify-between group border",
                                      newQuestion.type === type.id 
                                        ? isDarkTheme 
                                          ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" 
                                          : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black"
                                        : isDarkTheme
                                          ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                          : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                    )}
                                  >
                                    <span>{type.label}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                   </div>

                   {/* Correct Answer Field */}
                   <div className="lg:col-span-3">
                      <p className="text-[10px] font-black uppercase text-zinc-400 px-1 mb-2">{t.answer}</p>
                      <div className="relative" ref={correctAnswerSelectRef}>
                        <button
                          onClick={() => setIsCorrectAnswerSelectOpen(!isCorrectAnswerSelectOpen)}
                          className={cn(
                            "requested-surface dark:bg-bento-card w-full h-[42px] border-2 border-bento-border px-5 flex items-center justify-between text-sm font-black text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                            isCorrectAnswerSelectOpen ? "rounded-t-xl border-b-transparent" : "rounded-xl"
                          )}
                        >
                          <span className="truncate">
                            {newQuestion.type === 'multiple' 
                              ? (selectedMultiOptions.length > 0 ? `Ответы: ${selectedMultiOptions.map(opt => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(opt) + 1).join(', ')}` : 'Выберите ответы')
                              : (newQuestion.type === 'true_false' 
                                ? `Ответ: ${newQuestion.correctAnswer === 'A' ? 'Верно' : 'Не верно'}` 
                                : (newQuestion.type === 'find_on_model'
                                  ? `Часть: ${newQuestion.correctAnswer || 'Выберите часть'}`
                                  : `Ответ: ${newQuestion.correctAnswer}`))}
                          </span>
                          <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", isCorrectAnswerSelectOpen && "rotate-180")} />
                        </button>
                        
                        <AnimatePresence>
                          {isCorrectAnswerSelectOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl overflow-hidden z-[110] -mt-0.5"
                            >
                      <div className="p-1 py-1.5 space-y-0.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                        {newQuestion.type === 'find_on_model' ? (
                          ['cranium', 'mandible', 'left', 'right', 'cerebellum'].map((part) => (
                            <button
                              key={part}
                              onClick={() => {
                                setNewQuestion({...newQuestion, correctAnswer: part});
                                setIsCorrectAnswerSelectOpen(false);
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-left text-xs font-black transition-all rounded-lg flex items-center justify-between group border",
                                newQuestion.correctAnswer === part
                                  ? isDarkTheme 
                                    ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" 
                                    : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black"
                                  : isDarkTheme
                                    ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                    : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                              )}
                            >
                              <span className="capitalize">{part}</span>
                            </button>
                          ))
                        ) : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
                          .filter((_, idx) => {
                            if (newQuestion.type === 'true_false') return idx < 2;
                            if (newQuestion.type === 'single') return idx < 6;
                            return true;
                          })
                          .map((opt, idx) => (
                          <button
                            key={opt}
                            onClick={() => {
                              if (newQuestion.type === 'multiple') {
                                setSelectedMultiOptions(prev => 
                                  prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt].sort()
                                );
                              } else {
                                setNewQuestion({...newQuestion, correctAnswer: opt as any});
                                setIsCorrectAnswerSelectOpen(false);
                              }
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-xs font-black transition-all rounded-lg flex items-center justify-between group border",
                              (newQuestion.type === 'multiple' ? selectedMultiOptions.includes(opt) : newQuestion.correctAnswer === opt) 
                                ? isDarkTheme 
                                  ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" 
                                  : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black"
                                : isDarkTheme
                                  ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                  : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span>{newQuestion.type === 'true_false' ? (idx === 0 ? 'Верно' : 'Не верно') : (newQuestion.type === 'multiple' ? (idx + 1) : opt)}</span>
                            </span>
                          </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                   </div>
                </div>

                <div className="flex flex-col gap-5">
                    <textarea
                      value={newQuestion.text}
                      onChange={(e) => setNewQuestion({...newQuestion, text: e.target.value})}
                      placeholder={t.questionText}
                      className="w-full bg-bento-bg/50 dark:bg-zinc-900/40 border-2 border-bento-border rounded-2xl px-5 py-4 text-sm font-bold min-h-[120px] outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all text-bento-text-main resize-none"
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-zinc-400 px-1">{t.mediaImage}</p>
                      <div className="relative" ref={imageSelectRef}>
                        <div className="relative">
                          <input
                            type="text"
                            value={isImageSelectOpen ? mediaSearch : (mediaLibrary.find(m => m.url === newQuestion.imageUrl)?.name || "")}
                            placeholder={t.searchImages}
                            onFocus={() => {
                              setIsImageSelectOpen(true);
                              setMediaSearch("");
                            }}
                            onChange={(e) => {
                              if (!isImageSelectOpen) setIsImageSelectOpen(true);
                              setMediaSearch(e.target.value);
                            }}
                            className={cn(
                              "requested-surface dark:bg-bento-card w-full border-2 border-bento-border px-4 py-2.5 text-sm font-bold text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all pr-24 h-[42px]",
                              isImageSelectOpen ? "rounded-t-xl" : "rounded-xl"
                            )}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                imageInputRef.current?.click();
                              }}
                              className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
                              title="Загрузить"
                            >
                              <Plus size={14} />
                            </button>
                            <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", isImageSelectOpen && "rotate-180")} />
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {isImageSelectOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: -5, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -5, scale: 0.98 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl z-50 overflow-hidden flex flex-col -mt-1"
                            >
                              <div className="max-h-[180px] overflow-y-auto p-1 py-1.5 space-y-0.5 custom-scrollbar">
                                {mediaLibrary
                                  .filter(m => m.type === 'image' && m.name.toLowerCase().includes(mediaSearch.toLowerCase()))
                                  .length > 0 ? (
                                  mediaLibrary
                                    .filter(m => m.type === 'image' && m.name.toLowerCase().includes(mediaSearch.toLowerCase()))
                                    .map(m => (
                                    <button
                                      key={m.id}
                                      onClick={() => {
                                        setNewQuestion({...newQuestion, imageUrl: m.url});
                                        setIsImageSelectOpen(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all border flex items-center justify-between group",
                                        newQuestion.imageUrl === m.url 
                                          ? isDarkTheme 
                                            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" 
                                            : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black"
                                          : isDarkTheme
                                            ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                            : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                      )}
                                    >
                                      <span>{m.name}</span>
                                    </button>
                                  ))
                                ) : (
                                  <p className="px-4 py-3 text-[10px] text-zinc-400 font-bold italic uppercase tracking-widest text-center">Изображения не найдены</p>
                                )}
                              </div>
                              <input 
                                type="file" 
                                ref={imageInputRef}
                                className="hidden" 
                                accept="image/*" 
                                onChange={(e) => handleMediaUpload(e, 'image', (item) => {
                                  setNewQuestion(prev => ({...prev, imageUrl: item.url}));
                                  setIsImageSelectOpen(false);
                                })} 
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-zinc-400 px-1">{t.media3D}</p>
                      <div className="relative" ref={modelSelectRef}>
                        <div className="relative">
                          <input
                            type="text"
                            value={isModelSelectOpen ? mediaSearch : (mediaLibrary.find(m => m.url === newQuestion.modelId)?.name || "")}
                            placeholder={t.search3D}
                            onFocus={() => {
                              setIsModelSelectOpen(true);
                              setMediaSearch("");
                            }}
                            onChange={(e) => {
                              if (!isModelSelectOpen) setIsModelSelectOpen(true);
                              setMediaSearch(e.target.value);
                            }}
                            className={cn(
                              "requested-surface dark:bg-bento-card w-full border-2 border-bento-border px-4 py-2.5 text-sm font-bold text-bento-text-main outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all pr-24 h-[42px]",
                              isModelSelectOpen ? "rounded-t-xl" : "rounded-xl"
                            )}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                modelInputRef.current?.click();
                              }}
                              className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
                              title="Загрузить"
                            >
                              <Plus size={14} />
                            </button>
                            <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", isModelSelectOpen && "rotate-180")} />
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {isModelSelectOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: -5, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -5, scale: 0.98 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl z-50 overflow-hidden flex flex-col -mt-1"
                            >
                              <div className="max-h-[180px] overflow-y-auto p-1 py-1.5 space-y-0.5 custom-scrollbar">
                                {mediaLibrary
                                  .filter(m => m.type === 'model' && m.name.toLowerCase().includes(mediaSearch.toLowerCase()))
                                  .length > 0 ? (
                                  mediaLibrary
                                    .filter(m => m.type === 'model' && m.name.toLowerCase().includes(mediaSearch.toLowerCase()))
                                    .map(m => (
                                    <button
                                      key={m.id}
                                      onClick={() => {
                                        setNewQuestion({...newQuestion, modelId: m.url as any});
                                        setIsModelSelectOpen(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all border flex items-center justify-between group",
                                        newQuestion.modelId === m.url 
                                          ? isDarkTheme 
                                            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" 
                                            : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black"
                                          : isDarkTheme
                                            ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                            : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                      )}
                                    >
                                      <span>{m.name}</span>
                                    </button>
                                  ))
                                ) : (
                                  <p className="px-4 py-3 text-[10px] text-zinc-400 font-bold italic uppercase tracking-widest text-center">Модели не найдены</p>
                                )}
                              </div>
                              <input 
                                type="file" 
                                ref={modelInputRef}
                                className="hidden" 
                                accept=".glb" 
                                onChange={(e) => handleMediaUpload(e, 'model', (item) => {
                                  setNewQuestion(prev => ({...prev, modelId: item.url as any}));
                                  setIsModelSelectOpen(false);
                                })} 
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <style>{`
                          .admin-option-input::placeholder {
                            color: ${isDarkTheme ? '#ffffff' : '#000000'} !important;
                            opacity: 1 !important;
                          }
                        `}</style>
                        <AnimatePresence mode="popLayout">
                          {newQuestion.type !== 'find_on_model' && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
                            .filter((_, idx) => {
                              if (newQuestion.type === 'true_false') return idx < 2;
                              if (newQuestion.type === 'single') return idx < 6;
                              return true;
                            })
                            .map((opt, idx) => (
                              <motion.div 
                                key={opt}
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                transition={{ duration: 0.3, delay: idx * 0.05 }}
                                className="group relative"
                              >
                                <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                                <div 
                                  onClick={(e) => {
                                    const input = e.currentTarget.querySelector('input');
                                    if (input) input.focus();
                                  }}
                                  className="requested-surface dark:bg-bento-card relative flex items-center gap-3 border border-bento-border rounded-2xl p-2 transition-all hover:border-indigo-400 group-hover:border-indigo-500/50 overflow-hidden cursor-text"
                                >
                                  <div className={cn(
                                    "w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-black transition-all shrink-0",
                                    (newQuestion.type === 'multiple' ? selectedMultiOptions.includes(opt) : newQuestion.correctAnswer === opt)
                                      ? (isDarkTheme ? "bg-zinc-800/40 border-zinc-700/30 text-white" : "bg-white/50 border-white/40 text-zinc-950")
                                      : theme === 'dark'
                                        ? "bg-white/15 border-zinc-800 text-white group-hover:bg-white/20"
                                        : "bg-black/10 border-zinc-200 text-zinc-950 group-hover:bg-black/15"
                                  )}>
                                    {newQuestion.type === 'true_false' ? (idx === 0 ? '✓' : '✗') : (newQuestion.type === 'multiple' ? (idx + 1) : opt)}
                                  </div>
                                  <input
                                    type="text"
                                    value={newQuestion.options?.[opt as keyof typeof newQuestion.options] || ''}
                                    onChange={(e) => setNewQuestion({
                                      ...newQuestion, 
                                      options: { ...newQuestion.options!, [opt]: e.target.value }
                                    })}
                                    placeholder={newQuestion.type === 'true_false' ? (idx === 0 ? (language === 'ru' ? 'Верно' : 'To\'g\'ri') : (language === 'ru' ? 'Не верно' : 'Noto\'g\'ri')) : (newQuestion.type === 'multiple' ? `${t.answerLabel} ${idx + 1}...` : `${t.answerLabel} ${opt}...`)}
                                    className="flex-1 bg-transparent border-none px-2 text-xs font-bold outline-none focus:ring-0 text-black dark:text-white admin-option-input"
                                  />
                                </div>
                              </motion.div>
                            ))}
                        </AnimatePresence>
                      </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      onClick={() => {
                        setNewQuestion({
                          theme: '',
                          language: creationLanguage,
                          text: '',
                          options: { A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '' },
                          correctAnswer: 'A',
                          type: 'single'
                        });
                        setSelectedMultiOptions([]);
                      }}
                      className="px-6 py-3 bg-zinc-500/5 dark:bg-zinc-950 text-zinc-500 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 transition-all border border-transparent dark:border-bento-border"
                    >
                      {t.reset}
                    </button>
                    <button 
                      onClick={handleAddQuestion} 
                      className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      {t.addQuestionBtn}
                    </button>
                  </div>
                </div>
              </div>

                <div className="space-y-12">
                  {(() => {
                    const filteredQuestions = questions.filter(q => {
                      const searchLower = questionSearch.toLowerCase().trim();
                      if (!searchLower) return true;
                      return (
                        q.text.toLowerCase().includes(searchLower) || 
                        q.theme.toLowerCase().includes(searchLower) ||
                        Object.values(q.options).some(opt => opt.toLowerCase().includes(searchLower))
                      );
                    });

                    if (questions.length > 0 && filteredQuestions.length === 0) {
                      return (
                        <div className="py-20 text-center space-y-4 bg-bento-card/50 rounded-3xl border border-dashed border-bento-border">
                          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-950 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                            <Search size={32} />
                          </div>
                          <div>
                            <p className="text-sm font-bold">{t.noQuestionsFound}</p>
                            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">{t.noQuestionsFoundDesc}</p>
                          </div>
                        </div>
                      );
                    }

                    const rendered = (['ru', 'uz', 'en'] as Language[]).map(lang => {
                      const langQuestions = filteredQuestions.filter(q => q.language === lang);
                      if (langQuestions.length === 0) return null;

                      const groupedThemes = Object.entries(langQuestions.reduce((acc, q) => {
                        if (!acc[q.theme]) acc[q.theme] = [];
                        acc[q.theme].push(q);
                        return acc;
                      }, {} as Record<string, typeof questions>));

                      return (
                        <div key={lang} className="space-y-6">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                               <span className="font-black text-xs uppercase">{lang}</span>
                             </div>
                             <h3 className="text-lg font-black uppercase tracking-widest text-bento-text-main">{t.questionsBase} {lang.toUpperCase()}</h3>
                             <div className="flex-1 h-px bg-bento-border" />
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {groupedThemes.map(([themeName, themeQuestions]) => {
                              const themeKey = `${lang}-${themeName}`;
                              const isExpanded = expandedThemes[themeKey];
                              
                              return (
                                <div key={themeKey} className="bg-bento-card border border-bento-border rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5">
                                  <button 
                                    onClick={() => toggleThemeAccordion(themeKey)}
                                    className="w-full flex items-center justify-between p-3 px-5 hover:bg-indigo-500/5 dark:hover:bg-white/[0.02] transition-colors text-left"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                        <BookOpen size={20} />
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-black uppercase tracking-widest text-bento-text-main">{themeName}</h4>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase mt-0.5">
                                          {formatQuestionCount(themeQuestions.length, language)}
                                        </p>
                                      </div>
                                    </div>
                                    <motion.div 
                                      animate={{ rotate: isExpanded ? 180 : 0 }}
                                      className="text-zinc-400"
                                    >
                                      <ChevronDown size={20} />
                                    </motion.div>
                                  </button>

                                  <AnimatePresence>
                                    {isExpanded && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                      >
                                        <div className="p-4 pt-1 space-y-2 border-t border-bento-border bg-bento-bg/50 dark:bg-zinc-900/60">
                                          {themeQuestions.map((q, idx) => (
                                            <div key={q.id} className="p-2.5 bg-bento-card dark:border-zinc-800 rounded-2xl border border-bento-border transition-all hover:border-indigo-500/30 group shadow-sm">
                                              <div className="flex justify-between items-start gap-4 mb-2">
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[9px] font-black text-white bg-indigo-600 dark:bg-white/20 px-2.5 py-0.5 rounded-full uppercase tracking-widest border border-indigo-600/20 dark:border-white/30 shadow-sm">
                                                      {language === 'ru' ? 'Вопрос' : language === 'uz' ? 'Savol' : 'Question'} {idx + 1}
                                                    </span>
                                                    <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 bg-zinc-400/10 px-2.5 py-0.5 rounded-full uppercase tracking-widest border border-zinc-400/20">
                                                      {q.type === 'single' ? t.singleAnswer : q.type === 'multiple' ? t.multipleAnswer : q.type === 'find_on_model' ? t.findOnModel : t.trueFalse}
                                                    </span>
                                                  </div>
                                                  <h4 className={cn("font-bold leading-tight text-xs", theme === 'dark' ? "text-white" : "text-zinc-900")}>{q.text}</h4>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                                    <Trash2 size={14} />
                                                  </button>
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 ml-1">
                                                {q.type === 'find_on_model' ? (
                                                  <div className="col-span-full p-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] flex items-center gap-2 max-w-fit">
                                                    <div className="w-5 h-5 flex items-center justify-center rounded-md bg-emerald-600 text-white font-black text-[9px]">✓</div>
                                                    <span className="uppercase tracking-widest text-[9px]">{t.correctPart}: {q.correctAnswer}</span>
                                                  </div>
                                                ) : Object.entries(q.options).map(([key, value], oIdx) => {
                                                  if (!value) return null;
                                                  const isCorrect = q.type === 'multiple' 
                                                    ? q.correctAnswer.split(',').includes(key)
                                                    : q.correctAnswer === key;
                                                  
                                                  return (
                                                    <div 
                                                      key={key} 
                                                      className={cn(
                                                        "p-1.5 px-2 rounded-xl border transition-all flex items-center justify-between gap-2 text-[9px]",
                                                        isCorrect 
                                                          ? "border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400 font-bold" 
                                                          : (theme === 'dark' ? "border-zinc-800 bg-zinc-900/50 text-zinc-200" : "border-bento-border bg-indigo-600/5 text-zinc-550")
                                                      )}
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                          "w-4.5 h-4.5 flex items-center justify-center rounded-md font-black text-[8px]",
                                                          isCorrect ? "bg-green-600 text-white" : (theme === 'dark' ? "bg-zinc-850 text-zinc-300 border border-zinc-700/60" : "bg-zinc-200 text-zinc-500")
                                                        )}>
                                                          {q.type === 'true_false' ? (oIdx === 0 ? '✓' : '✗') : (q.type === 'multiple' ? (oIdx + 1) : key)}
                                                        </span>
                                                        <span className="line-clamp-1 leading-tight">{value}</span>
                                                      </div>
                                                      {isCorrect && <CheckCircle2 size={10} className="shrink-0 text-green-600 dark:text-green-400" />}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    );
                  });
                  return rendered;
                })()}

                  {questions.length === 0 && (
                    <div className="py-20 text-center space-y-4 bg-bento-card rounded-3xl border border-dashed border-bento-border">
                      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-950 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                        <Search size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.noQuestionsFound}</p>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">{t.noQuestionsFoundDesc}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-8">
                <div className="flex justify-between items-center bg-bento-card p-6 rounded-3xl border border-bento-border">
                  <div className="flex-1 min-w-0">
                    {activeUniversity && isResultsBrandingOpen ? (
                      <div className="flex flex-wrap items-center gap-4">
                        <input
                          type="text"
                          value={resultsUniversityName}
                          onChange={(event) => setResultsUniversityName(event.target.value)}
                          className="min-w-[200px] flex-1 px-4 py-3 bg-bento-bg border border-bento-border rounded-xl text-xs font-medium text-bento-text-main focus:border-indigo-500 outline-none"
                          style={{ maxWidth: 'calc(100% - 20px)' }}
                          placeholder={t.universityName}
                          aria-label={t.universityName}
                        />
                        <label className="relative flex items-center gap-2 px-4 py-3 bg-bento-bg border border-bento-border rounded-xl text-xs font-bold cursor-pointer hover:border-indigo-500 transition-colors">
                          <Upload size={15} />
                          <span>{t.logoPhoto}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleResultsLogoUpload(file);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            saveResultsUniversityBranding();
                            setIsResultsBrandingOpen(false);
                          }}
                          className="ml-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          {t.save}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-xl font-bold text-bento-text-main">{activeUniversity?.name || t.finalResults}</h3>
                        {!activeUniversity?.name && (
                          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1 opacity-60">{t.performanceMonitoring}</p>
                        )}
                      </div>
                    )}
                  </div>
                  {activeUniversity && resultsUniversityLogo ? (
                    <button
                      type="button"
                      onClick={() => setIsResultsBrandingOpen(true)}
                      className="shrink-0 ml-6 rounded-2xl cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-all"
                      title={t.editLogoAndName}
                    >
                      <img
                        src={resultsUniversityLogo}
                        alt={activeUniversity.name || 'University logo'}
                        className="w-14 h-14 object-contain rounded-2xl border border-bento-border bg-white p-1.5"
                      />
                    </button>
                  ) : activeUniversity ? (
                    <button
                      type="button"
                      onClick={() => setIsResultsBrandingOpen(true)}
                      className="shrink-0 ml-6 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      {t.add}
                    </button>
                  ) : (
                    <Trophy size={32} className="text-yellow-500" />
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {[
                    { label: t.averageResult, value: results.length ? (results.reduce((a, b) => a + b.percentage, 0) / results.length).toFixed(1) + '%' : '0%', icon: BarChart3, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                    { label: t.totalTestsCount, value: results.length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
                    { label: t.bestResult, value: results.length ? Math.max(...results.map(r => r.score)) : '0', icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                  ].map((stat, i) => (
                    <div key={i} className={cn("requested-surface p-6 rounded-2xl border border-bento-border flex items-center gap-5")}>
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-white dark:bg-zinc-800", stat.color)}>
                        <stat.icon size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-bento-text-muted opacity-70">{stat.label}</p>
                        <p className="text-2xl font-black text-bento-text-main">{stat.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input 
                      type="text" 
                      placeholder={t.searchStudents} 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-bento-bg/50 dark:bg-zinc-900/40 border border-bento-border rounded-xl text-xs outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={exportResults} className="bg-bento-card text-bento-text-main px-4 py-2.5 rounded-xl font-black flex items-center gap-2 border border-bento-border text-xs uppercase tracking-widest hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer"><Download size={16} /> Excel</button>
                    <button onClick={exportResultsPDF} className="bg-bento-card text-bento-text-main px-4 py-2.5 rounded-xl font-black flex items-center gap-2 border border-bento-border text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white hover:border-red-600 transition-all cursor-pointer"><Download size={16} /> PDF</button>
                  </div>
                </div>

                <div className="space-y-6">
                  {results.reduce((acc, result) => {
                    const group = result.groupName;
                    const student = students.find(s => (s.firstName + ' ' + s.lastName).trim() === result.studentName.trim());
                    const subgroup = student?.subgroup || t.generalGroup;
                    
                    if (!acc[group]) acc[group] = {};
                    if (!acc[group][subgroup]) acc[group][subgroup] = [];
                    acc[group][subgroup].push(result);
                    return acc;
                  }, {} as Record<string, Record<string, typeof results>>) && Object.entries(results.reduce((acc, result) => {
                    const group = result.groupName;
                    const student = students.find(s => (s.firstName + ' ' + s.lastName).trim() === result.studentName.trim());
                    const subgroup = student?.subgroup || t.generalGroup;
                    
                    if (!acc[group]) acc[group] = {};
                    if (!acc[group][subgroup]) acc[group][subgroup] = [];
                    acc[group][subgroup].push(result);
                    return acc;
                  }, {} as Record<string, Record<string, typeof results>>))
                  .filter(([groupName]) => groupName.toLowerCase().includes(studentSearch.toLowerCase()))
                  .map(([groupName, subgroups], gIdx) => (
                    <div key={`${groupName}-${gIdx}`} className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden">
                      <div className="p-4 bg-transparent border-b border-bento-border flex justify-between items-center">
                        <div className="flex items-center gap-3">
                           <Users size={18} className="text-zinc-400" />
                           <h4 className="font-black text-sm uppercase tracking-tight">
                             {groupName} {subgroups && Object.values(subgroups)[0] && Object.values(subgroups)[0][0] && (
                               <span className="text-indigo-500 ml-1">
                                 {(Object.values(subgroups)[0][0] as ExamResult).language.toUpperCase()}
                               </span>
                             )}
                           </h4>
                        </div>
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t.resultsCount.replace('{count}', String(Object.values(subgroups).flat().length))}</span>
                      </div>
                      <div className="p-4 space-y-4">
                        {Object.entries(subgroups).map(([subgroupName, subgroupResults], sIdx) => (
                          <div key={`${subgroupName}-${sIdx}`} className="space-y-2">
                            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">{subgroupName}</p>
                            <div className="overflow-x-auto rounded-xl border border-bento-border/50 bg-bento-bg/30">
                              <table className="w-full text-left text-xs bg-bento-card">
                                <thead className="bg-transparent text-[9px] font-black uppercase text-zinc-500 border-b border-bento-border/30">
                                  <tr>
                                    <th className="px-4 py-3">                                    {t.students}</th>
                                    <th className="px-4 py-3">{t.theme}</th>
                                    <th className="px-4 py-3">{t.score}</th>
                                    <th className="px-4 py-3">{t.percentage}</th>
                                    <th className="px-4 py-3">{t.date}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 bg-bento-card dark:bg-transparent">
                                  {subgroupResults.map((r, idx) => (
                                    <tr key={`${r.id}-${idx}`} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors border-b border-bento-border/20 last:border-0 font-bold group">
                                      <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-bento-text-main text-xs">{r.studentName}</span>
                                            <span className="text-[10px] text-indigo-500 font-black uppercase">{r.groupName} / {subgroupName} {r.language?.toUpperCase()}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-bento-text-muted text-[11px]">{r.theme}</td>
                                      <td className="px-4 py-3 font-mono font-bold text-bento-text-main italic">{r.score}/{r.totalQuestions}</td>
                                      <td className="px-4 py-3">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded-full font-black text-[9px]",
                                          r.percentage >= 80 ? "bg-green-500/10 text-green-500" : r.percentage >= 60 ? "bg-indigo-500/10 text-indigo-600" : "bg-red-500/10 text-red-500"
                                        )}>{r.percentage}%</span>
                                      </td>
                                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 font-bold text-[10px]">{new Date(r.timestamp).toLocaleDateString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="space-y-8">
                <div className="flex justify-between items-center bg-bento-card p-6 rounded-3xl border border-bento-border">
                  <div>
                    <h3 className="text-xl font-bold text-bento-text-main">{t.mediaLibrary}</h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1 opacity-60">{t.manageMedia}</p>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-bento-bg border border-bento-border text-bento-text-main rounded-xl hover:bg-bento-accent hover:text-white cursor-pointer text-[10px] font-black transition-all uppercase tracking-widest">
                      <Image size={14} />
                      {t.addImage}
                      <input type="file" className="hidden" accept="image/jpeg,image/png" onChange={(e) => handleMediaUpload(e, 'image')} />
                    </label>
                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:opacity-90 cursor-pointer text-[10px] font-black transition-all uppercase tracking-widest">
                      <Box size={14} />
                      {t.addModel}
                      <input type="file" className="hidden" accept=".glb" onChange={(e) => handleMediaUpload(e, 'model')} />
                    </label>
                  </div>
                </div>

                <div className="space-y-12">
                   {/* Images Section */}
                   <div className="space-y-4">
                     <div className="flex items-center gap-3 px-2">
                        <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-500">
                           <Image size={18} />
                        </div>
                        <h4 className="text-sm font-black uppercase tracking-widest text-bento-text-main">{t.imagesSection}</h4>
                        <div className="flex-1 h-px bg-bento-border opacity-50" />
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                       {mediaLibrary.filter(m => m.type === 'image').map(item => (
                         <div key={item.id} className="group relative bg-bento-card border border-bento-border rounded-2xl overflow-hidden aspect-square transition-all duration-300">
                           <ResolvedMediaImage value={item.url} alt={item.name} className="w-full h-full object-cover" />
                           <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center">
                             <p className="text-[10px] font-bold text-white mb-2 truncate w-full">{item.name}</p>
                             <button onClick={() => saveMedia(mediaLibrary.filter(m => m.id !== item.id))} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"><Trash2 size={14} /></button>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>

                    {/* Models Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                             <Box size={18} />
                          </div>
                          <h4 className="text-sm font-black uppercase tracking-widest text-bento-text-main">{t.modelsSection}</h4>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                       {mediaLibrary.filter(m => m.type === 'model').map(item => (
                         <div key={item.id} className="group relative bg-bento-card border border-bento-border rounded-2xl overflow-hidden aspect-square flex items-center justify-center transition-all duration-300">
                           <div className="flex flex-col items-center gap-2">
                             <Box size={32} className="text-indigo-600" />
                             <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">3D Object</span>
                           </div>
                           <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center">
                             <p className="text-[10px] font-bold text-white mb-2 truncate w-full">{item.name}</p>
                             <button onClick={() => saveMedia(mediaLibrary.filter(m => m.id !== item.id))} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-650"><Trash2 size={14} /></button>
                           </div>
                         </div>
                       ))}
                      </div>
                    </div>
                 </div>
               </div>
             )}

             {activeTab === 'models3d' && (/* models3d active */
               <div className="space-y-4 animate-fade-in text-bento-text-main dark:text-zinc-100 flex flex-col h-[940px] xl:h-[1020px] overflow-hidden">
                {/* Promo / Banner Card */}
                <div className="hidden">
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none hidden md:block">
                    <Box size={130} className="text-indigo-500" style={{ transform: 'rotate(25deg)' }} />
                  </div>
                  <div className="relative z-10 space-y-3 max-w-3xl">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-extrabold text-[9px] uppercase tracking-wider rounded-full border border-indigo-500/20">
                      ⚡ {language === 'ru' ? 'Интерактивная 3D Среда' : language === 'uz' ? 'Interaktiv 3D Muhit' : 'Interactive 3D Workspace'}
                    </span>
                    <h3 className="text-xl md:text-2xl font-black text-bento-text-main dark:text-white leading-tight">
                      {language === 'ru' ? 'Редактор и Картограф 3D Анатомии' : language === 'uz' ? '3D Anatomiya Tahrirlovchisi' : '3D Anatomy Editor & Mapper'}
                    </h3>
                    <p className="text-xs font-semibold leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-2xl">
                      {language === 'ru' 
                        ? 'Просматривайте 3D-модели в реальном времени, настраивайте названия анатомических частей, задавайте кастомные цвета подсветки и сразу конструируйте вопросы на визуальное опознание деталей.' 
                        : language === 'uz'
                        ? '3D modellarini real vaqt rejimida kuuring, anatomik qismlar nomlarini sozlang, maxsus ranglarni o‘rnating va vizual savollarni darhol yarating.'
                        : 'View 3D models in real-time, configure names of anatomical parts, map custom glowing highlight colors, and immediately build structural identification exam questions.'}
                    </p>
                  </div>
                </div>

                  {/* Unified Desktop-Style Workspace Window */}
                  <div className={cn(
                    "flex-1 flex flex-col min-h-0 rounded-3xl border overflow-hidden transition-all duration-300 shadow-lg select-none relative",
                    isDarkTheme 
                      ? "bg-bento-card border-zinc-800/40 text-zinc-100"
                      : "bg-white/95 border-zinc-200/80 text-zinc-800 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
                  )}>
                    {/* 1. Word Menu Header Tabs Row */}
                    <div className={cn(
                      "flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 border-b transition-all duration-300",
                      isDarkTheme 
                        ? "bg-bento-card border-zinc-800/50"
                        : "bg-zinc-50 border-zinc-200/80"
                    )}>
                      <div className="flex items-center gap-1">
                        {[
                          { id: 'palettes' as const, label: `🎨 ${t.medicalPalettes}` },
                          { id: 'segments' as const, label: `🗂️ ${t.modelSegments}` },
                          { id: 'shader' as const, label: `🌌 ${t.shaderLightingModes}` },
                          { id: 'hud' as const, label: '⚙️ HUD' }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveRibbon3D(tab.id)}
                            className={cn(
                              "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider relative transition-all cursor-pointer border-b-2",
                              activeRibbon3D === tab.id
                                ? isDarkTheme
                                  ? "border-indigo-500 text-indigo-455 bg-bento-card font-extrabold"
                                  : "border-indigo-600 text-indigo-650 bg-indigo-50 font-extrabold"
                                : isDarkTheme
                                  ? "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-bento-card"
                                  : "border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* General header utilities shifted directly inside the ribbon line */}
                      <div className="flex items-center gap-3">
                        <div className="flex bg-zinc-150 dark:bg-bento-card p-1 rounded-xl border border-zinc-800/50 text-xs">
                          <button
                            onClick={() => setTerminalBg3D('dark')}
                            className={cn(
                              "py-0.5 px-2 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              terminalBg3D === 'dark' 
                                ? "bg-indigo-600/10 text-indigo-400"
                                : "text-zinc-500 hover:text-indigo-400"
                            )}
                          >
                            🌌
                          </button>
                          <button
                            onClick={() => setTerminalBg3D('white')}
                            className={cn(
                              "py-0.5 px-2 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              terminalBg3D === 'white' 
                                ? "bg-white text-zinc-900 shadow-sm"
                                : "text-zinc-550 dark:text-zinc-400 hover:text-indigo-400"
                            )}
                          >
                            ☀️
                          </button>
                        </div>

                        {/* Question builder trigger - static placeholder */}
                        <button
                          onClick={() => {
                            const currentPart = modelLabels[activeModelKey3D]?.[selectedPartId3D];
                            const name = currentPart ? (language === 'ru' ? currentPart.nameRu : currentPart.nameUz) : selectedPartId3D;
                            
                            setNewQuestion({
                              text: t.findNextModelPart.replace('{part}', name),
                              theme: 'Anatomy (3D)',
                              language: language,
                              type: 'find_on_model',
                              modelId: selectedModelId3D as any,
                              correctAnswer: selectedPartId3D,
                              options: { A: 'A', B: 'B', C: 'C', D: 'D', E: '' }
                            });

                            setActiveTab('questions');
                            setTimeout(() => {
                              window.scrollTo({ top: 300, behavior: 'smooth' });
                            }, 100);
                          }}
                          className="flex items-center justify-center gap-1 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-xl shadow-[0_2px_12px_rgba(99,102,241,0.2)] hover:shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <Plus size={11} />
                          {t.createModelQuestion}
                        </button>
                      </div>
                    </div>

                    {/* 2. Word Sub-Toolbar Body Panel */}
                    <div className={cn(
                      "p-3 min-h-[84px] flex items-center border-t transition-all duration-300",
                      isDarkTheme
                        ? "bg-bento-card border-zinc-800/40"
                        : "bg-white border-zinc-200/80 text-zinc-850"
                    )}>
                      <AnimatePresence mode="wait">
                        {activeRibbon3D === 'palettes' && (
                          <motion.div
                            key="palettes"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-2.5 w-full overflow-x-auto py-1"
                          >
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest shrink-0 select-none mr-2",
                              isDarkTheme ? "text-[#a5b4fc]" : "text-indigo-600"
                            )}>
                              🎨 {t.medicalPalettes}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {CLINICAL_PALETTES.map((pal) => (
                                <button
                                  key={pal.nameRu}
                                  onClick={() => applyCuratedPalette(pal.colors)}
                                  className={cn(
                                    "px-3 py-1.5 border rounded-xl text-[9px] font-black uppercase tracking-wide transition-all flex items-center gap-2 cursor-pointer active:scale-95",
                                    isDarkTheme
                                      ? "bg-bento-card hover:bg-indigo-500/15 border-zinc-800 hover:border-indigo-500/30 text-zinc-400 hover:text-indigo-400"
                                      : "bg-zinc-50 hover:bg-indigo-50 border-zinc-200 hover:border-indigo-200 text-zinc-600 hover:text-indigo-700"
                                  )}
                                  title={t.applyPalette}
                                >
                                  <div className="flex gap-0.5">
                                    {pal.colors.slice(0, 3).map((col) => (
                                      <span key={col} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                                    ))}
                                  </div>
                                  <span>{language === 'ru' ? pal.nameRu : language === 'uz' ? pal.nameUz : pal.nameEn}</span>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}

                        {activeRibbon3D === 'segments' && (
                          <motion.div
                            key="segments"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="grid grid-cols-1 xl:grid-cols-12 gap-4 w-full"
                          >
                            {/* Left: list of segments selection */}
                            <div className="xl:col-span-5 flex flex-col gap-1">
                              <span className="text-[8px] font-black text-zinc-550 uppercase tracking-widest block mb-1">
                                {t.chooseSegment}
                              </span>
                              <div className="flex items-center gap-2 overflow-x-auto py-0.5 max-w-full">
                                {Object.entries(modelLabels[activeModelKey3D] || {}).map(([partKey, info]) => {
                                  const isActive = selectedPartId3D === partKey;
                                  return (
                                    <button
                                      key={partKey}
                                      onClick={() => setSelectedPartId3D(partKey)}
                                      className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shrink-0 text-left cursor-pointer",
                                        isActive
                                          ? "bg-indigo-500/15 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.1)]"
                                          : isDarkTheme
                                            ? "bg-bento-card border-zinc-800 hover:border-zinc-700 hover:bg-bento-card text-zinc-400"
                                            : "bg-zinc-50 border-zinc-200 hover:border-zinc-350 hover:bg-zinc-100/50 text-zinc-655"
                                      )}
                                    >
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: info.color }} />
                                      <div className="leading-none text-[9px]">
                                        <p className="font-extrabold truncate max-w-[120px]">{language === 'en' ? info.nameEn || info.nameUz : language === 'ru' ? info.nameRu : info.nameUz}</p>
                                        <span className="text-[7px] font-mono text-zinc-500 block">ID: {partKey}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Center: editing naming/color */}
                            <div className="xl:col-span-4 flex items-center gap-2 border-l border-zinc-800/40 pl-3">
                              {selectedPartId3D ? (
                                <div className="flex flex-col gap-1.5 w-full">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input 
                                      type="text" 
                                      value={modelLabels[activeModelKey3D]?.[selectedPartId3D]?.nameRu || ''}
                                      onChange={(e) => {
                                        const updated = { ...modelLabels };
                                        if (updated[activeModelKey3D]?.[selectedPartId3D]) {
                                          updated[activeModelKey3D][selectedPartId3D].nameRu = e.target.value;
                                          saveModelLabels(updated);
                                        }
                                      }}
                                      placeholder={t.nameInRussian}
                                      className={cn(
                                        "px-2 py-1 text-[10px] rounded-lg font-bold outline-none border transition-all",
                                        isDarkTheme
                                          ? "bg-bento-card border-zinc-800 text-zinc-300 focus:border-indigo-500"
                                          : "bg-zinc-50 border-zinc-200 text-zinc-800 focus:border-indigo-500 focus:bg-white"
                                      )}
                                    />
                                    <input 
                                      type="text" 
                                      value={modelLabels[activeModelKey3D]?.[selectedPartId3D]?.nameUz || ''}
                                      onChange={(e) => {
                                        const updated = { ...modelLabels };
                                        if (updated[activeModelKey3D]?.[selectedPartId3D]) {
                                          updated[activeModelKey3D][selectedPartId3D].nameUz = e.target.value;
                                          saveModelLabels(updated);
                                        }
                                      }}
                                      placeholder={t.nameInUzbek}
                                      className={cn(
                                        "px-2 py-1 text-[10px] rounded-lg font-bold outline-none border transition-all",
                                        isDarkTheme
                                          ? "bg-bento-card border-zinc-800 text-zinc-300 focus:border-indigo-500"
                                          : "bg-zinc-50 border-zinc-200 text-zinc-800 focus:border-indigo-500 focus:bg-white"
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[7.5px] font-black text-zinc-550 uppercase tracking-widest">{t.segmentColor}</span>
                                    {['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#ef4444', '#a855f7'].map((col) => (
                                      <button
                                        key={col}
                                        onClick={() => {
                                          const updated = { ...modelLabels };
                                          if (updated[activeModelKey3D]?.[selectedPartId3D]) {
                                            updated[activeModelKey3D][selectedPartId3D].color = col;
                                            saveModelLabels(updated);
                                          }
                                        }}
                                        className={cn(
                                          "w-4 h-4 rounded-full border transition-all cursor-pointer",
                                          modelLabels[activeModelKey3D]?.[selectedPartId3D]?.color === col ? "border-white scale-125 shadow" : "border-transparent"
                                        )}
                                        style={{ backgroundColor: col }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[9px] text-zinc-550 italic font-semibold">{t.selectSegmentToEdit}</span>
                              )}
                            </div>

                            {/* Right: clinical description field */}
                            <div className="xl:col-span-3 flex items-center border-l border-zinc-800/40 pl-3">
                              {selectedPartId3D ? (
                                <textarea
                                  value={modelLabels[activeModelKey3D]?.[selectedPartId3D]?.description || ''}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    const updated = { ...modelLabels };
                                    if (updated[activeModelKey3D]?.[selectedPartId3D]) {
                                      updated[activeModelKey3D][selectedPartId3D].description = text;
                                      saveModelLabels(updated);
                                    }
                                  }}
                                  placeholder={t.medicalNotesPlaceholder}
                                  className={cn(
                                    "w-full h-11 p-1.5 rounded-lg text-[9px] outline-none border resize-none font-medium leading-none text-left transition-all",
                                    isDarkTheme
                                      ? "bg-bento-card border-zinc-850 text-zinc-300 placeholder:text-zinc-650 focus:border-indigo-500"
                                      : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white"
                                  )}
                                />
                              ) : null}
                            </div>
                          </motion.div>
                        )}

                        {activeRibbon3D === 'shader' && (
                          <motion.div
                            key="shader"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-2.5 w-full overflow-x-auto py-1"
                          >
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#10b981] shrink-0 select-none mr-2">
                              🌌 {t.shaderLightingModes}
                            </span>
                            {[
                              { id: 'clinical', label: '☀️', text: t.clinicalLighting },
                              { id: 'xray', label: '🧬', text: t.xrayLighting },
                              { id: 'cinematic', label: '🌌', text: t.neonLighting }
                            ].map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => setLightingPreset3D(preset.id as any)}
                                className={cn(
                                  "px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 font-black uppercase text-[9.5px] tracking-wider cursor-pointer shadow-sm shrink-0 active:scale-95",
                                  lightingPreset3D === preset.id
                                    ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-600 dark:text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                    : isDarkTheme
                                      ? "bg-bento-card border-zinc-800 hover:bg-bento-card text-zinc-500 hover:text-zinc-350"
                                      : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-800"
                                )}
                              >
                                <span className="text-sm">{preset.label}</span>
                                <span>{preset.text}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}

                        {activeRibbon3D === 'hud' && (
                          <motion.div
                            key="hud"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-3 w-full overflow-x-auto py-1"
                          >
                            {/* Blender loop selector toggle */}
                            <button
                              type="button"
                              onClick={() => setBlenderLoopMode(!blenderLoopMode)}
                              className={cn(
                                "px-3.5 py-1.5 rounded-xl border transition-all flex items-center gap-2 font-black uppercase text-[9.5px] tracking-wider cursor-pointer shadow-sm shrink-0 active:scale-95",
                                blenderLoopMode
                                  ? "bg-indigo-500/15 border-indigo-500 text-indigo-650 dark:text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                                  : isDarkTheme
                                    ? "bg-bento-card border-zinc-800 text-zinc-500 hover:border-zinc-750 hover:text-zinc-350"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-800"
                              )}
                            >
                              <span className="relative flex h-2 w-2">
                                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-indigo-400", !blenderLoopMode && "hidden")}></span>
                                <span className={cn("relative inline-flex rounded-full h-2 w-2", blenderLoopMode ? "bg-indigo-500" : "bg-zinc-650")}></span>
                              </span>
                              <span>🔄 {t.blenderLoops}</span>
                            </button>

                            <div className="h-6 w-px bg-zinc-800 shrink-0" />

                            {/* Focus Button */}
                            <button
                              type="button"
                              onClick={() => setIsolateMode3D(!isolateMode3D)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 font-black uppercase text-[9.5px] tracking-wider cursor-pointer shadow-sm shrink-0 active:scale-95",
                                isolateMode3D
                                  ? "bg-indigo-500/15 border-indigo-500/60 text-indigo-600 dark:text-indigo-400"
                                  : isDarkTheme
                                    ? "bg-bento-card border-zinc-805 hover:bg-bento-card text-zinc-400 hover:text-white"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-800"
                              )}
                            >
                              <span className="text-sm">🎯</span>
                              <span>{t.isolationMode}</span>
                            </button>

                            {/* Spin Button */}
                            <button
                              type="button"
                              onClick={() => setAutoRotate3D(!autoRotate3D)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 font-black uppercase text-[9.5px] tracking-wider cursor-pointer shadow-sm shrink-0 active:scale-95",
                                autoRotate3D
                                  ? "bg-amber-500/15 border-amber-500/60 text-amber-600 dark:text-amber-450"
                                  : isDarkTheme
                                    ? "bg-bento-card border-zinc-805 hover:bg-bento-card text-zinc-405 hover:text-white"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-800"
                              )}
                            >
                              <span className={cn("text-sm inline-block", autoRotate3D && "animate-spin")}>🔄</span>
                              <span>{t.autoRotation}</span>
                            </button>

                            {/* Simulator Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setSimulatorMode3D(!simulatorMode3D);
                                if (!simulatorMode3D) {
                                  setSimulatorScore({ correct: 0, total: 0 });
                                  setSimulatorFeedback({ type: null, message: null });
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2 font-black uppercase text-[9.5px] tracking-wider cursor-pointer shadow-sm shrink-0 active:scale-95",
                                simulatorMode3D
                                  ? "bg-rose-500/15 border-rose-500/65 text-rose-600 dark:text-rose-400 animate-pulse"
                                  : isDarkTheme
                                    ? "bg-bento-card border-zinc-808 hover:bg-bento-card text-zinc-405 hover:text-white"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-655 hover:bg-zinc-100 hover:text-zinc-800"
                              )}
                            >
                              <span className="text-sm">🎮</span>
                              <span>{t.selfCheck}</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  {/* Split Workspace Flex Layout: locked height */}
                  <div className="flex-1 flex gap-5 h-full min-h-0 items-stretch overflow-hidden select-none relative">
                    
                    {/* Collapsible Left Panel Overlay (Absolute positioned to keep the 3D canvas container perfectly static) */}
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: isLeftPanelOpen3D ? 0 : 'calc(-100% + 8px)' }}
                      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                      className={cn(
                        "absolute left-0 top-0 bottom-0 z-30 flex flex-col min-h-0 shadow-xl border-r backdrop-blur-md w-72 md:w-80 p-4 transition-colors duration-300",
                        isDarkTheme
                          ? "bg-bento-card border-zinc-800/80 text-zinc-100"
                          : "bg-white/95 border-zinc-200/80 text-zinc-800"
                      )}
                    >
                      {/* Toggle Tab Button attached on the right of the side panel */}
                      <button
                        type="button"
                        onClick={() => setIsLeftPanelOpen3D(!isLeftPanelOpen3D)}
                        className={cn(
                          "absolute right-[-24px] top-1/2 -translate-y-1/2 w-6 h-14 rounded-r-xl border-r border-y flex items-center justify-center cursor-pointer shadow-md select-none focus:outline-none transition-colors z-[100]",
                          isDarkTheme
                            ? "bg-bento-card border-zinc-800 text-zinc-400 hover:text-white"
                            : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-800"
                        )}
                      >
                        {isLeftPanelOpen3D ? <ChevronLeft size={12} className="stroke-[2.5]" /> : <ChevronRight size={12} className="stroke-[2.5]" />}
                      </button>

                      <div className="flex flex-col gap-4 overflow-y-auto max-h-full h-full custom-scrollbar pr-1">
                          
                          {/* 1. ВЫБОР МОДЕЛИ at the very top of Left panel */}
                          <div className="bg-transparent border-transparent p-0 space-y-3 shrink-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                                🧠 1. {t.select3DModel}
                              </span>
                            </div>

                            {/* Search bar inside choice board */}
                            <div className="relative">
                              <input
                                type="text"
                                value={modelPanelSearch}
                                onChange={(e) => setModelPanelSearch(e.target.value)}
                                placeholder={t.search3D}
                                className={cn(
                                  "w-full px-3 py-1.5 text-xs font-bold outline-none rounded-xl transition-all font-sans pl-8 border",
                                  isDarkTheme
                                    ? "bg-bento-card border-zinc-850 text-zinc-200 focus:border-indigo-500/50"
                                    : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:bg-white"
                                )}
                              />
                              <Search className={cn("absolute left-2.5 top-1/2 -translate-y-1/2", isDarkTheme ? "text-zinc-500" : "text-zinc-400")} size={12} />
                              {modelPanelSearch && (
                                <button
                                  onClick={() => setModelPanelSearch('')}
                                  className={cn("absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold", isDarkTheme ? "text-zinc-400 hover:text-white" : "text-zinc-400 hover:text-zinc-700")}
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {/* Search-capable Model selection list */}
                            {(() => {
                              const libraryModels3D = mediaLibrary
                                .filter(m => m.type === 'model' && m.id !== 'skull' && m.id !== 'jaw' && m.id !== 'brain' && m.url !== 'skull' && m.url !== 'jaw' && m.url !== 'brain')
                                .map(m => ({
                                  id: m.url,
                                  label: '📦',
                                  nameRu: m.name,
                                  nameUz: m.name
                                }));

                              const customModels3D = customModels
                                .filter(m => m.type === 'file' && !libraryModels3D.some(item => item.id === m.url))
                                .map(m => ({
                                  id: m.url,
                                  label: m.label,
                                  nameRu: m.nameRu,
                                  nameUz: m.nameUz,
                                }));
                                
                              const allModels = [...libraryModels3D, ...customModels3D];
                              const filtered = allModels.filter(m => {
                                const q = modelPanelSearch.toLowerCase();
                                return m.nameRu.toLowerCase().includes(q) || m.nameUz.toLowerCase().includes(q);
                              });
                              
                              return (
                                <div className="grid grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                  {filtered.map((item) => (
                                    <button
                                      key={item.id}
                                      onClick={() => {
                                        setSelectedModelId3D(item.id);
                                        const cleanId = getModelStorageKey(item.id, mediaLibrary);
                                        const parts = Object.keys(modelLabels[cleanId] || {});
                                        if (parts.length > 0) {
                                          setSelectedPartId3D(parts[0]);
                                        } else {
                                          setSelectedPartId3D('');
                                        }
                                      }}
                                      className={cn(
                                        "flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all text-center relative text-[9px] font-black uppercase tracking-wider cursor-pointer min-h-[64px]",
                                        selectedModelId3D === item.id
                                          ? "bg-indigo-50/10 border-indigo-500/60 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                          : isDarkTheme
                                            ? "bg-bento-card border-zinc-800/50 hover:bg-bento-card hover:border-zinc-700 text-zinc-500"
                                            : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 text-zinc-600 hover:text-zinc-800"
                                      )}
                                      title={language === 'ru' ? item.nameRu : item.nameUz}
                                    >
                                      <span className="text-xl mb-1">{item.label}</span>
                                      <span className="truncate max-w-full block px-0.5">{language === 'ru' ? item.nameRu : item.nameUz}</span>
                                      {selectedModelId3D === item.id && (
                                        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-550 shadow-[0_0_8px_rgba(99,102,241,1)]" />
                                      )}
                                    </button>
                                  ))}
                                  {filtered.length === 0 && (
                                    <p className="text-[10px] text-zinc-550 text-center col-span-3 py-4 italic uppercase tracking-widest leading-none">
                                      {t.noModelsFound}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                  {/* 2. АНАТОМИЧЕСКИЕ ДЕТАЛИ. Flat nested directly into Left scroll panel (HIDDEN) */}
                  <div className="hidden">
                    {/* Labeled Segment Configuration Panel */}
                    <div className="bg-bento-card border border-bento-border p-5 rounded-3xl space-y-4 flex-1">
                      <div className="flex items-center justify-between pb-3 border-b border-bento-border/50">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                            {language === 'ru' ? '2. Анатомические Детали' : language === 'uz' ? '2. Anatomik segmentlar' : '2. Anatomical Parts'}
                          </h4>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                            {language === 'ru' ? 'Нажмите на деталь для выбора, редактируйте имена и цвета' : language === 'uz' ? 'Tahrirlash va rang berish uchun bosing' : 'Manage names and colors'}
                          </p>
                        </div>
                        
                        <button 
                          onClick={() => {
                            if (confirm(language === 'ru' ? 'Сбросить все названия к исходным?' : 'Nomlarni qayta tiklashni xohlaysizmi?')) {
                              localStorage.removeItem('tester_pro_3d_labels');
                              window.location.reload();
                            }
                          }}
                          className="text-[9px] font-black uppercase tracking-wider text-red-500 hover:text-red-600 dark:hover:text-red-400 py-1 px-2.5 rounded-lg hover:bg-red-500/5 transition-all"
                        >
                          {language === 'ru' ? 'Сбросить' : 'Qayta tiklash'}
                        </button>
                      </div>

                      {/* Editing panel input block */}
                      {editingPartId && (
                        <div className="p-4 bg-indigo-600/5 dark:bg-indigo-600/10 border border-indigo-500/20 rounded-2xl space-y-3 animate-fade-in text-bento-text-main">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
                              ✏️ {language === 'ru' ? `ID детали: [${editingPartId}]` : `Detal ID: [${editingPartId}]`}
                            </span>
                            <button 
                              onClick={() => setEditingPartId(null)}
                              className="text-zinc-400 hover:text-zinc-655 dark:hover:text-zinc-200"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            <div>
                              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                                {language === 'ru' ? 'Название на русском (RU)' : 'Nomlanishi rus tilida (RU)'}
                              </label>
                              <input 
                                type="text" 
                                value={editNameRu}
                                onChange={(e) => setEditNameRu(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs rounded-xl border font-bold focus:ring-1 focus:ring-indigo-500 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-bento-text-main"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
                                {language === 'ru' ? 'Название на узбекском (UZ)' : 'Nomlanishi o‘zbek tilida (UZ)'}
                              </label>
                              <input 
                                type="text" 
                                value={editNameUz}
                                onChange={(e) => setEditNameUz(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs rounded-xl border font-bold focus:ring-1 focus:ring-indigo-500 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-bento-text-main"
                              />
                            </div>

                            {/* Color Selector */}
                            <div>
                              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-1.5">
                                {language === 'ru' ? 'Цвет Подсветки' : 'Yoritish rangi'}
                              </label>
                              <div className="flex items-center gap-2">
                                {['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#ef4444', '#a855f7'].map((col) => (
                                  <button
                                    key={col}
                                    onClick={() => setEditColor(col)}
                                    className={cn(
                                      "w-6 h-6 rounded-full border-2 transition-transform",
                                      editColor === col ? "border-zinc-600 dark:border-white scale-110 shadow-md" : "border-transparent hover:scale-105"
                                    )}
                                    style={{ backgroundColor: col }}
                                  />
                                ))}
                                 <input 
                                   type="color" 
                                   value={editColor} 
                                   onChange={(e) => setEditColor(e.target.value)}
                                   className="w-7 h-7 bg-transparent cursor-pointer rounded overflow-hidden" 
                                 />
                               </div>
                             </div>
                           </div>
 
                           <div className="pt-2 flex justify-end gap-2">
                             <button
                               onClick={() => setEditingPartId(null)}
                               className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200"
                             >
                               {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                             </button>
                             <button
                               onClick={() => {
                                 const updated = { ...modelLabels };
                                 updated[selectedModelId3D][editingPartId] = {
                                   nameRu: editNameRu,
                                   nameUz: editNameUz,
                                   color: editColor
                                 };
                                 saveModelLabels(updated);
                                 setEditingPartId(null);
                               }}
                               className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] uppercase tracking-wider font-extrabold transition-all"
                             >
                               {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                             </button>
                           </div>
                         </div>
                       )}
 
                       {/* Quick Palette Tool */}
                       <div className="mt-3 p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-2.5">
                         <div className="flex items-center justify-between">
                           <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">
                             🎨 {language === 'ru' ? 'Предустановленные мед-палитры' : 'Tibbiy rangli palitralar'}
                           </span>
                         </div>
                         <div className="flex flex-wrap gap-1.5">
                           {CLINICAL_PALETTES.map((pal) => (
                             <button
                               key={pal.nameRu}
                               onClick={() => applyCuratedPalette(pal.colors)}
                               className="px-2 py-1 bg-bento-bg/50 hover:bg-indigo-500/15 border border-bento-border/50 hover:border-indigo-500/30 text-zinc-400 hover:text-indigo-400 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                               title={language === 'ru' ? `Применить: ${pal.nameRu}` : `Palitrani qo'llash`}
                             >
                               <div className="flex gap-px">
                                 {pal.colors.slice(0, 3).map((col) => (
                                   <span key={col} className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: col }} />
                                 ))}
                               </div>
                               <span>{language === 'ru' ? pal.nameRu : pal.nameUz}</span>
                             </button>
                           ))}
                         </div>
                       </div>
 
                       {/* Segments list header */}
                       <div className="mt-4 flex items-center justify-between border-b border-bento-border/20 pb-1">
                         <span className="text-[9.5px] font-black uppercase tracking-wider text-zinc-450">
                           🦴 {language === 'ru' ? 'Сегменты модели:' : 'Model segmentlari:'}
                         </span>
                       </div>
 
                       {/* Segments list */}
                       <div className="space-y-2 mt-2 max-h-[290px] overflow-y-auto pr-1">
                         {Object.entries(modelLabels[activeModelKey3D] || {}).map(([partKey, info]) => {
                           const isActive = selectedPartId3D === partKey;
                           return (
                             <div
                               key={partKey}
                               onClick={() => setSelectedPartId3D(partKey)}
                               className={cn(
                                 "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group select-none",
                                 isActive
                                   ? "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500 text-bento-text-main shadow-none"
                                   : "bg-bento-bg/30 border-bento-border/50 hover:border-bento-border/80"
                               )}
                             >
                               <div className="flex items-center gap-3 min-w-0">
                                 <span 
                                   className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm animate-pulse" 
                                   style={{ backgroundColor: info.color }} 
                                 />
                                 <div className="space-y-0.5 truncate min-w-0">
                                   <p className="text-xs font-black text-bento-text-main group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors truncate">
                                     {language === 'en' ? info.nameEn || info.nameUz : language === 'ru' ? info.nameRu : info.nameUz}
                                   </p>
                                   <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest truncate">
                                     Segment ID: <span className="font-bold text-zinc-500 dark:text-zinc-350">{partKey}</span>
                                   </p>
                                 </div>
                               </div>
 
                               <div className="flex items-center gap-1 shrink-0 ml-2">
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setEditingPartId(partKey);
                                     setEditNameRu(info.nameRu);
                                    setEditNameUz(info.nameUz);
                                    setEditColor(info.color);
                                  }}
                                  className="p-1.5 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                                  title={t.editName}
                                >
                                  <Edit2 size={13} />
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(t.confirmDeleteModelLabel)) {
                                      const updated = { ...modelLabels };
                                      updated[selectedModelId3D][partKey] = {
                                        nameRu: `${selectedModelId3D} - ${partKey}`,
                                        nameUz: `${selectedModelId3D} - ${partKey}`,
                                        color: info.color
                                      };
                                      saveModelLabels(updated);
                                    }
                                  }}
                                  className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title={t.deleteLabel}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Clinical Notepad Instructor Notes */}
                      {selectedPartId3D && (
                        <div className="mt-4 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3 relative overflow-hidden">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                              📋 {t.clinicalNotes}
                            </span>
                            <span className="text-[9px] uppercase font-serif italic text-zinc-400">
                              {selectedPartId3D}
                            </span>
                          </div>

                          <textarea
                            value={modelLabels[activeModelKey3D]?.[selectedPartId3D]?.description || ''}
                            onChange={(e) => {
                              const text = e.target.value;
                              const updated = { ...modelLabels };
                              if (updated[activeModelKey3D]?.[selectedPartId3D]) {
                                updated[activeModelKey3D][selectedPartId3D] = {
                                  ...updated[activeModelKey3D][selectedPartId3D],
                                  description: text
                                };
                                saveModelLabels(updated);
                              }
                            }}
                            placeholder={t.medicalNotesPlaceholder}
                            className="w-full text-xs bg-zinc-950/40 p-2.5 rounded-xl border border-bento-border/70 text-zinc-350 placeholder:text-zinc-650 min-h-[85px] outline-none focus:border-indigo-500/50 transition-all resize-none font-medium text-left"
                          />
                          <p className="text-[9px] text-zinc-550 leading-tight text-left">
                            💡 {t.autosaveRealtime}
                          </p>
                          {/* Hide deprecated contents */}
                          <div className="hidden">

                          <div className="space-y-1">
                            <div className="text-[10.5px] font-serif italic text-zinc-300 flex items-center gap-1.5">
                              <span className="font-sans font-bold text-zinc-550 text-[8.5px] uppercase tracking-wider not-italic">Latin:</span>{" "}
                              {selectedModelId3D === 'skull' && selectedPartId3D === 'cranium' ? 'Os cranium' :
                               selectedModelId3D === 'skull' && selectedPartId3D === 'mandible' ? 'Mandibula' :
                               selectedModelId3D === 'jaw' && selectedPartId3D === 'mandible' ? 'Arcus dentalis inferior' :
                               selectedModelId3D === 'brain' && selectedPartId3D === 'left' ? 'Hemispherium sinistrum' :
                               selectedModelId3D === 'brain' && selectedPartId3D === 'right' ? 'Hemispherium dextrum' :
                               selectedModelId3D === 'brain' && selectedPartId3D === 'cerebellum' ? 'Cerebellum' : 'Structura anatomica'}
                            </div>

                            <p className="text-[11px] text-zinc-400 leading-snug font-medium">
                               {selectedModelId3D === 'skull' && selectedPartId3D === 'cranium' 
                                 ? (language === 'ru' 
                                     ? 'Верхняя сводчатая часть черепа, защищающая головной мозг от внешних воздействий и травм, включающая лобную и теменные кости.'
                                     : 'Miyani tashqi ta’sirlardan va shikastlanishdan himoya qiluvchi kalla suyagi gumbazi qismi, peshona va tepa suyaklarini o‘z ichiga oladi.')
                                 : selectedModelId3D === 'skull' && selectedPartId3D === 'mandible'
                                 ? (language === 'ru'
                                     ? 'Единственная кость черепа, способная совершать активные движения, обеспечивая жевательные функции и артикуляцию речи.'
                                     : 'Kalladagi yagona faol harakatlanuvchi suyak turi. Chaynash va nutq artikulyatsiyasini amalga oshirish funksiyasini bajaradi.')
                                 : selectedModelId3D === 'jaw' && selectedPartId3D === 'mandible'
                                 ? (language === 'ru'
                                     ? 'Нижняя челюстная кость человека с лунками для тридцати двух постоянных зубов в норме. Главный двигательный аппарат зубочелюстной системы.'
                                     : 'Odamning pastki jag‘ suyagi bo‘lib, 32 ta doimiy tish uchun tish kataklariga ega. Chaynash tizimining asosiy harakatlantiruvchi apparatidir.')
                                 : selectedModelId3D === 'brain' && selectedPartId3D === 'left'
                                 ? (language === 'ru'
                                     ? 'Левое полушарие специализируется на вербальных функциях, логическом и критическом мышлении, математических вычислениях и языках.'
                                     : 'Chap yarim shar nutq (verbal) funksiyalari, mantiqiy, tahliliy fikrlash, aniq hisob-kitoblar va tillarni o‘zlashtirishga javobgardir.')
                                 : selectedModelId3D === 'brain' && selectedPartId3D === 'right'
                                 ? (language === 'ru'
                                     ? 'Правое полушарие отвечает за обработку невербальной информации, пространственную ориентацию, интуицию, творчество и эмоции.'
                                     : 'O‘ng yarim shar vizual va fazoviy ma’lumotlarni tahlil qilish, tasavvur, sezgi, ijodiy ko‘nikmalar va emotsiyalar bilan shug‘ullanadi.')
                                 : selectedModelId3D === 'brain' && selectedPartId3D === 'cerebellum'
                                 ? (language === 'ru'
                                     ? 'Отдел головного мозга, играющий решающую роль в поддержании равновесия, координации точных произвольных движений и тонусе мышц.'
                                     : 'Tana muvozanatini saqlash, ixtiyoriy harakatlar aniqligi va muvofiqligini hamda mushak tonusini boshqaradigan miyadagi muborak soha.')
                                 : (language === 'ru' ? 'Выбранный анатомический сегмент поддерживает клиническую разметку.' : 'Tanlangan anatomik qism klinik belgilashni qo‘llab-kuvvatlaydi.')}
                             </p>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

                    {/* Right Column: Scaled Real 3D Preview Engine - flex-grow static pane */}
                    <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden h-full">

                    {/* Frame container for ThreeJS canvas */}
                    <div className={cn(
                      "flex-1 min-h-[560px] xl:min-h-[640px] overflow-hidden relative group transition-all duration-300",
                      isDarkTheme ? "bg-bento-card" : "bg-zinc-50"
                    )}>
                      
                      {/* Active Quiz HUD Simulator Header overlay */}
                      {simulatorMode3D && simulatorTargetPart && (
                        <div className={cn(
                          "absolute top-4 right-4 z-20 flex flex-col gap-2 p-3 bg-zinc-950/90 backdrop-blur-md rounded-2xl border border-emerald-500/30 shadow-2xl animate-fade-in text-white transition-all duration-300",
                          isLeftPanelOpen3D ? "left-[300px] md:left-[340px]" : "left-6"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[8px] uppercase tracking-widest font-black rounded-lg">
                              🟢 {t.simulatorMode}
                            </span>
                            <div className="text-[10px] font-mono text-zinc-350 font-black uppercase tracking-widest">
                              {t.score}: <span className="text-emerald-400 text-xs font-black">{simulatorScore.correct}</span> / {simulatorScore.total}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/40">
                            <div className="text-xs font-bold leading-relaxed text-zinc-300">
                              {t.findAndClickPart}{' '}
                              <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-xl border border-indigo-500/20 shadow-sm">
                                {modelLabels[activeModelKey3D]?.[simulatorTargetPart] 
                                  ? (language === 'ru' ? modelLabels[activeModelKey3D][simulatorTargetPart].nameRu : modelLabels[activeModelKey3D][simulatorTargetPart].nameUz) 
                                  : simulatorTargetPart}
                              </span>
                            </div>

                            <button
                              onClick={() => setSimulatorMode3D(false)}
                              className="self-end sm:self-auto px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[8.5px] font-black uppercase tracking-wider text-red-400 transition-all cursor-pointer"
                            >
                              {t.finish}
                            </button>
                          </div>

                          {/* Instant Feedback Notice */}
                          {simulatorFeedback.type && (
                            <div 
                              className={cn(
                                "mt-1.5 p-2 rounded-xl text-[10.5px] font-bold text-center border animate-bounce shadow-sm",
                                simulatorFeedback.type === 'success' 
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                              )}
                            >
                              {simulatorFeedback.message}
                            </div>
                          )}
                        </div>
                      )}

                      <Viewer3D 
                        activeModel={selectedModelId3D}
                        highlightPart={simulatorMode3D ? "" : selectedPartId3D}
                        onModelChange={(m) => {
                          setSelectedModelId3D(m);
                          const parts = Object.keys(modelLabels[m] || {});
                          if (parts.length > 0) {
                            setSelectedPartId3D(parts[0]);
                          } else {
                            setSelectedPartId3D('');
                          }
                        }}
                        onPartClick={(part, point) => {
                          if (simulatorMode3D) {
                            handleSimulatorPartClick(part);
                          } else {
                            // If this part isn't configured in modelLabels, auto-create a beautiful default entry!
                            if (!modelLabels[activeModelKey3D]?.[part]) {
                              const updated = { ...modelLabels };
                              updated[activeModelKey3D] = updated[activeModelKey3D] || {};
                              
                              const colors = CLINICAL_PALETTES[0]?.colors || ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899'];
                              const partsCount = Object.keys(updated[activeModelKey3D]).length;
                              const color = colors[partsCount % colors.length];
                              
                              const cleanName = part.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                              
                              updated[activeModelKey3D][part] = {
                                nameRu: `${cleanName} (Разметка)`,
                                nameUz: `${cleanName} (Belgilangan)`,
                                color: color,
                                description: ''
                              };
                              saveModelLabels(updated);
                            }
                            setSelectedPartId3D(part);
                          }
                        }}
                        autoRotate={autoRotate3D}
                        lightingPreset={lightingPreset3D}
                        showGrid={showGrid3D}
                        customColors={Object.fromEntries(
                          Object.entries(modelLabels[activeModelKey3D] || {}).map(([k, v]) => [k, v.color])
                        )}
                        explodeFactor={explodeFactor3D}
                        isolateMode={isolateMode3D}
                        cameraPreset={cameraPreset3D}
                        onCameraPresetReset={() => setCameraPreset3D('')}
                        language={language}
                        theme={theme}
                      />
                    </div>

                    {/* Quick educational integration banner */}
                    <div className="p-4 m-4 mt-0 bg-zinc-55 dark:bg-zinc-800/10 rounded-2xl border border-bento-border/50 text-[10.5px] leading-relaxed text-zinc-500 dark:text-zinc-400 font-medium font-bold shrink-0">
                      💡 {t.simulatorHelp}
                    </div>

                  </div>
                </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="requested-surface p-6 rounded-2xl border border-bento-border space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">{t.examPlanning}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-zinc-400 px-1">{t.theme}</p>
                      <div className="relative" ref={scheduledThemeSelectRef}>
                        <div 
                          className="relative cursor-text"
                          onClick={() => {
                            const input = scheduledThemeSelectRef.current?.querySelector('input');
                            input?.focus();
                          }}
                        >
                          <input
                            type="text"
                            value={isScheduledThemeSelectOpen ? themeSearch : scheduleForm.theme}
                            placeholder={t.searchTheme}
                            onFocus={() => {
                              setIsScheduledThemeSelectOpen(true);
                              setThemeSearch("");
                            }}
                            onChange={(e) => {
                              if (!isScheduledThemeSelectOpen) setIsScheduledThemeSelectOpen(true);
                              setThemeSearch(e.target.value);
                            }}
                            className={cn(
                              "requested-surface dark:bg-bento-card w-full h-[38px] border-2 border-bento-border px-4 text-xs font-black text-bento-text-main placeholder:text-zinc-400 dark:placeholder:text-zinc-500 placeholder:opacity-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                              isScheduledThemeSelectOpen ? "rounded-t-xl" : "rounded-xl"
                            )}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronDown size={14} className={cn("text-zinc-400 transition-transform", isScheduledThemeSelectOpen && "rotate-180")} />
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {isScheduledThemeSelectOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl shadow-xl overflow-hidden z-[120] -mt-[1px] flex flex-col"
                            >
                              <div className="max-h-[200px] overflow-y-auto p-1 py-1.5 space-y-0.5 custom-scrollbar">
                                {examThemes.filter(t => t.name.toLowerCase().includes(themeSearch.toLowerCase())).map(t => (
                                  <div key={t.id} className="group/item relative">
                                    <button
                                      onClick={() => {
                                        setScheduleForm({...scheduleForm, theme: t.name});
                                        setIsScheduledThemeSelectOpen(false);
                                      }}
                                      className={cn(
                                        "w-full px-3 py-2 text-left text-[11px] font-bold transition-all rounded-lg pr-8 border",
                                        scheduleForm.theme === t.name 
                                          ? (isDarkTheme ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black") 
                                          : theme === 'dark'
                                            ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                            : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                      )}
                                    >
                                      {t.name}
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTheme(t.id);
                                      }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-red-500 opacity-0 group-hover/item:opacity-100 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-zinc-400 px-1">{t.group}</p>
                      <div className="relative" ref={scheduledGroupSelectRef}>
                        <div 
                          className="relative cursor-text"
                          onClick={() => {
                            const input = scheduledGroupSelectRef.current?.querySelector('input');
                            input?.focus();
                          }}
                        >
                          <input
                            type="text"
                            value={isScheduledGroupSelectOpen ? groupSearch : (scheduleForm.groupId === 'all' ? '' : groups.find(g => g.id === scheduleForm.groupId)?.name || '')}
                            placeholder={t.searchGroup}
                            onFocus={() => {
                              setIsScheduledGroupSelectOpen(true);
                              setGroupSearch("");
                            }}
                            onChange={(e) => {
                              if (!isScheduledGroupSelectOpen) setIsScheduledGroupSelectOpen(true);
                              setGroupSearch(e.target.value);
                            }}
                            className={cn(
                              "requested-surface dark:bg-bento-card w-full h-[38px] border-2 border-bento-border px-4 text-xs font-black text-bento-text-main placeholder:text-zinc-400 dark:placeholder:text-zinc-500 placeholder:opacity-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all",
                              isScheduledGroupSelectOpen ? "rounded-t-xl" : "rounded-xl"
                            )}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronDown size={14} className={cn("text-zinc-400 transition-transform", isScheduledGroupSelectOpen && "rotate-180")} />
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {isScheduledGroupSelectOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute left-0 right-0 top-full bg-bento-card dark:bg-bento-card border-2 border-t-0 border-bento-border rounded-b-xl shadow-xl overflow-hidden z-[120] -mt-[1px] flex flex-col"
                            >
                              <div className="max-h-[200px] overflow-y-auto p-1 py-1.5 space-y-0.5 custom-scrollbar">
                                {groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).map(g => (
                                  <button
                                    key={g.id}
                                    onClick={() => {
                                      setScheduleForm({...scheduleForm, groupId: g.id});
                                      setIsScheduledGroupSelectOpen(false);
                                    }}
                                    className={cn(
                                      "w-full px-3 py-2 text-left text-[11px] font-bold transition-all rounded-lg flex items-center justify-between border",
                                      scheduleForm.groupId === g.id 
                                        ? (isDarkTheme ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-black" : "bg-indigo-600/10 border-indigo-600/20 text-indigo-700 font-black") 
                                        : theme === 'dark'
                                          ? "bg-bento-card border-transparent text-bento-text-main hover:border-indigo-500/35 hover:bg-indigo-500/10"
                                          : "bg-transparent border-transparent text-bento-text-main hover:border-indigo-400/50 hover:bg-indigo-50"
                                    )}
                                  >
                                    <span>{g.name}</span>
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded border transition-colors",
                                      scheduleForm.groupId === g.id
                                        ? "bg-white/20 text-white border-white/30"
                                        : theme === 'dark'
                                          ? "bg-white/5 text-zinc-300 border-white/10"
                                          : "bg-zinc-100 text-zinc-700 border-zinc-200"
                                    )}>{g.language?.toUpperCase() || 'RU'}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-zinc-400 px-1">{t.date}</p>
                      <div className="relative group/date" ref={datePickerRef}>
                        <button 
                          type="button"
                          onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                          className="requested-surface w-full border-2 border-bento-border rounded-xl px-4 py-2 h-[38px] text-xs font-black outline-none hover:border-indigo-500 focus:border-indigo-500 text-bento-text-main transition-all pr-10 flex items-center text-left"
                        >
                          {scheduleForm.date ? new Date(scheduleForm.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : t.chooseDate}
                        </button>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover/date:text-indigo-500 transition-colors">
                          <Calendar size={14} />
                        </div>

                        <AnimatePresence>
                          {isDatePickerOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-0 w-full mt-2 bg-bento-card border-2 border-bento-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-[100] overflow-hidden p-4"
                            >
                              {/* Calendar Header */}
                              <div className="flex items-center justify-between mb-4 border-b border-bento-border pb-3">
                                {adminCalendarView === 'days' ? (
                                  <button
                                    type="button"
                                    onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1))}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors text-bento-text-main"
                                  >
                                    <ChevronLeft size={16} />
                                  </button>
                                ) : (
                                  <div className="w-7 h-7" />
                                )}
                                
                                <div className="flex gap-1 items-center">
                                  <button
                                    type="button"
                                    onClick={() => setAdminCalendarView(adminCalendarView === 'months' ? 'days' : 'months')}
                                    className={cn(
                                      "text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer",
                                      adminCalendarView === 'months' 
                                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]" 
                                        : "text-bento-text-main hover:bg-zinc-100 dark:hover:bg-white/5"
                                    )}
                                  >
                                    {currentCalendarDate.toLocaleDateString(locale, { month: 'long' })}
                                  </button>
                                  <span className="text-zinc-300 dark:text-zinc-700 text-xs font-bold">/</span>
                                  <button
                                    type="button"
                                    onClick={() => setAdminCalendarView(adminCalendarView === 'years' ? 'days' : 'years')}
                                    className={cn(
                                      "text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer",
                                      adminCalendarView === 'years' 
                                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-[#4f46e5]" 
                                        : "text-bento-text-main hover:bg-zinc-100 dark:hover:bg-white/5"
                                    )}
                                  >
                                    {currentCalendarDate.getFullYear()}
                                  </button>
                                </div>

                                {adminCalendarView === 'days' ? (
                                  <button
                                    type="button"
                                    onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1))}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors text-bento-text-main"
                                  >
                                    <ChevronRight size={16} />
                                  </button>
                                ) : (
                                  <div className="w-7 h-7" />
                                )}
                              </div>

                              {adminCalendarView === 'days' && (
                                <>
                                  {/* Week Days */}
                                  <div className="grid grid-cols-7 gap-1 mb-2">
                                    {Array.from({ length: 7 }, (_, index) =>
                                      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, index + 1))
                                    ).map(day => (
                                      <div key={day} className="text-[8px] font-black text-center text-zinc-400 uppercase tracking-tighter">
                                        {day}
                                      </div>
                                    ))}
                                  </div>

                                  {/* Dates Grid */}
                                  <div className="grid grid-cols-7 gap-1">
                                    {(() => {
                                      const year = currentCalendarDate.getFullYear();
                                      const month = currentCalendarDate.getMonth();
                                      const firstDay = new Date(year, month, 1).getDay();
                                      // Adjust for Monday start (JS days are 0-Sun to 6-Sat)
                                      const shift = firstDay === 0 ? 6 : firstDay - 1;
                                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                                      const prevMonthDays = new Date(year, month, 0).getDate();
                                      
                                      const items = [];
                                      
                                      // Fill prev month days
                                      for (let i = shift - 1; i >= 0; i--) {
                                        items.push(
                                          <div key={`p-${i}`} className="h-7 flex items-center justify-center text-[9px] font-bold text-zinc-300 dark:text-zinc-650">
                                            {prevMonthDays - i}
                                          </div>
                                        );
                                      }
                                      
                                      // Fill current month days
                                      for (let d = 1; d <= daysInMonth; d++) {
                                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                        const isSelected = scheduleForm.date === dateStr;
                                        
                                        items.push(
                                          <button
                                            key={d}
                                            type="button"
                                            onClick={() => {
                                              setScheduleForm({...scheduleForm, date: dateStr});
                                              setIsDatePickerOpen(false);
                                            }}
                                            className={cn(
                                              "h-7 w-full rounded-lg flex items-center justify-center text-[10px] font-black transition-all cursor-pointer",
                                              isSelected 
                                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                                                : isToday 
                                                  ? "bg-indigo-600/10 text-indigo-600 border border-indigo-600/20"
                                                  : "text-bento-text-main hover:bg-indigo-500/10 hover:shadow-sm"
                                            )}
                                          >
                                            {d}
                                          </button>
                                        );
                                      }
                                      
                                      return items;
                                    })()}
                                  </div>
                                </>
                              )}

                              {adminCalendarView === 'months' && (
                                <div className="grid grid-cols-3 gap-2 py-1">
                                  {Array.from({ length: 12 }).map((_, i) => {
                                    const monthName = new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' });
                                    const isSelected = currentCalendarDate.getMonth() === i;
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                          setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), i, 1));
                                          setAdminCalendarView('days');
                                        }}
                                        className={cn(
                                          "py-2.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer",
                                          isSelected
                                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                                            : "text-bento-text-main hover:bg-indigo-500/10"
                                        )}
                                      >
                                        {monthName}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {adminCalendarView === 'years' && (
                                <div className="grid grid-cols-3 gap-2 py-1">
                                  {Array.from({ length: 12 }).map((_, i) => {
                                    const year = new Date().getFullYear() - 5 + i;
                                    const isSelected = currentCalendarDate.getFullYear() === year;
                                    return (
                                      <button
                                        key={year}
                                        type="button"
                                        onClick={() => {
                                          setCurrentCalendarDate(new Date(year, currentCalendarDate.getMonth(), 1));
                                          setAdminCalendarView('days');
                                        }}
                                        className={cn(
                                          "py-2.5 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                                          isSelected
                                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                                            : "text-bento-text-main hover:bg-indigo-500/10"
                                        )}
                                      >
                                        {year}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-zinc-400 px-1">{t.time}</p>
                      <div className="relative group/time">
                        <input 
                          type="text"
                          value={scheduleForm.startTime}
                          placeholder="09:00"
                          maxLength={5}
                          onChange={(e) => {
                            const raw = e.target.value;
                            // Allow backspace to work normally if deleting colon
                            if (scheduleForm.startTime.endsWith(':') && raw.length < scheduleForm.startTime.length) {
                              setScheduleForm({...scheduleForm, startTime: raw.slice(0, -1)});
                              return;
                            }

                            let val = raw.replace(/\D/g, '');
                            if (val.length > 4) val = val.slice(0, 4);
                            
                            let formatted = "";
                            if (val.length > 0) {
                              let h = val.slice(0, 2);
                              if (parseInt(h) > 23) h = '23';
                              formatted = h;
                              
                              if (val.length > 2) {
                                let m = val.slice(2, 4);
                                if (parseInt(m) > 59) m = '59';
                                formatted += ':' + m;
                              } else if (val.length === 2) {
                                formatted += ':';
                              }
                            }
                            setScheduleForm({...scheduleForm, startTime: formatted});
                          }}
                          onBlur={() => {
                            if (scheduleForm.startTime) {
                              const parts = scheduleForm.startTime.split(':');
                              const h = (parts[0] || '').padStart(2, '0');
                              const m = (parts[1] || '').padEnd(2, '0');
                              setScheduleForm({...scheduleForm, startTime: `${h}:${m}`});
                            }
                          }}
                          className="requested-surface w-full border-2 border-bento-border rounded-xl px-4 py-2 h-[38px] text-xs font-black outline-none focus:border-indigo-500 text-bento-text-main transition-all pr-10 group-hover/time:border-indigo-500/50"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 group-hover/time:text-indigo-500 transition-colors">
                          <Clock size={14} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button 
                         onClick={handleAddSchedule}
                         className="w-full bg-bento-accent text-white h-[38px] rounded-xl font-bold text-xs hover:opacity-90 transition-opacity"
                      >
                        {t.schedule}
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2">
                    {(settings.scheduledExams || []).map(exam => (
                      <div key={exam.id} className="requested-surface flex items-center justify-between p-4 border border-bento-border rounded-xl group">
                        <div className="flex items-center gap-6">
                           <div className="flex flex-col">
                             <span className="text-xs font-black uppercase tracking-tight">{exam.theme}</span>
                             <span className="text-[10px] text-zinc-400 font-bold">{exam.groupId === 'all' ? t.allGroups : groups.find(g => g.id === exam.groupId)?.name}</span>
                           </div>
                           <div className="flex items-center gap-4 text-bento-text-muted">
                             <div className="flex items-center gap-1">
                               <Calendar size={14} />
                               <span className="text-[11px] font-bold">{exam.date}</span>
                             </div>
                             <div className="flex items-center gap-1">
                               <Clock size={14} />
                               <span className="text-[11px] font-bold">{exam.startTime}</span>
                             </div>
                           </div>
                        </div>
                        <button onClick={() => handleDeleteSchedule(exam.id)} className="text-zinc-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(settings.scheduledExams || []).length === 0 && (
                      <div className="p-8 text-center border-2 border-dashed border-bento-border rounded-2xl">
                        <p className="text-xs text-zinc-400 font-bold italic">{t.noExams}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">{t.globalSettings}</h2>
                    <p className="text-sm text-bento-text-muted mt-1">{t.protectionAutomation}</p>
                  </div>
                  
                  <div className="p-6 bg-bento-card rounded-2xl border border-bento-border space-y-4">
                       <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">{t.integritySecurity}</h3>
                       <div className="space-y-4">
                          <label className="flex items-center justify-between cursor-pointer">
                             <span className="text-sm font-bold opacity-80">{t.shuffleQuestions}</span>
                             <input type="checkbox" checked={settings.randomizeQuestions} onChange={(e) => updateSettings({...settings, randomizeQuestions: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                             <span className="text-sm font-bold opacity-80">{t.shuffleOptions}</span>
                             <input type="checkbox" checked={settings.randomizeOptions} onChange={(e) => updateSettings({...settings, randomizeOptions: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold opacity-80">{t.antiCheat}</span>
                               <span className="text-[9px] text-zinc-400">{t.antiCheatDesc}</span>
                             </div>
                             <input type="checkbox" checked={settings.antiCheatEnabled} onChange={(e) => updateSettings({...settings, antiCheatEnabled: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                          </label>
                       </div>
                    </div>

                    <div className="p-6 bg-bento-card rounded-2xl border border-bento-border space-y-4">
                       <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">{t.manageThemes}</h3>
                       <div className="flex gap-2">
                          <input 
                             type="text" 
                             placeholder={t.newThemePlaceholder} 
                             id="new-theme-input"
                             onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                   const val = (e.target as HTMLInputElement).value;
                                   if (val) {
                                      handleAddTheme(val);
                                      (e.target as HTMLInputElement).value = '';
                                   }
                                }
                             }}
                             className="flex-1 bg-bento-bg/50 dark:bg-zinc-900/40 border-2 border-bento-border rounded-xl px-4 py-2 text-xs outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-bento-text-main placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all font-bold" 
                          />
                          <button 
                             onClick={() => {
                                const input = document.getElementById('new-theme-input') as HTMLInputElement;
                                if (input.value) {
                                   handleAddTheme(input.value);
                                   input.value = '';
                                }
                             }}
                             className="px-4 py-2 bg-bento-accent text-white rounded-xl font-bold text-xs hover:opacity-90"
                          >
                             Добавить
                          </button>
                       </div>
                       <div className="flex flex-wrap gap-2 pt-2">
                          {examThemes.map(theme => (
                             <div key={theme.id} className="flex items-center gap-2 px-3 py-1.5 bg-bento-bg/50 dark:bg-zinc-900/40 border-2 border-bento-border rounded-lg group hover:border-red-500/50 transition-all text-bento-text-main">
                                <span className="text-xs font-bold">{theme.name}</span>
                                <button onClick={() => handleDeleteTheme(theme.id)} className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <X size={14} />
                                </button>
                             </div>
                          ))}
                          {examThemes.length === 0 && <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest italic">Темы не добавлены</p>}
                       </div>
                    </div>

                    <div className="p-6 bg-bento-card rounded-2xl border border-bento-border space-y-4">
                       <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">{t.contentIntegrations}</h3>
                       <div className="space-y-4">
                          <label className="flex items-center justify-between cursor-pointer">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold opacity-80">{t.examModePinfl}</span>
                               <span className="text-[9px] text-zinc-400">{t.pinflLoginOnly}</span>
                             </div>
                             <div className="flex bg-bento-bg p-1 rounded-xl border border-bento-border">
                               <button 
                                 onClick={() => updateSettings({...settings, registrationMode: 'classic'})}
                                 className={cn(
                                   "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                   (settings.registrationMode || 'classic') === 'classic' ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-400 hover:text-indigo-400"
                                 )}
                               >
                                 {t.classic}
                               </button>
                               <button 
                                 onClick={() => updateSettings({...settings, registrationMode: 'pinfl'})}
                                 className={cn(
                                   "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                   settings.registrationMode === 'pinfl' ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-400 hover:text-indigo-400"
                                 )}
                               >
                                 {t.examModeBtn}
                               </button>
                             </div>
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold opacity-80">{t.objects3D}</span>
                               <span className="text-[9px] text-zinc-400">{t.showInteractive3D}</span>
                             </div>
                             <input type="checkbox" checked={settings.show3D} onChange={(e) => updateSettings({...settings, show3D: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold opacity-80">{t.photosImages}</span>
                               <span className="text-[9px] text-zinc-400">{t.showMediaInQuestions}</span>
                             </div>
                             <input type="checkbox" checked={settings.showImages} onChange={(e) => updateSettings({...settings, showImages: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                           </label>
                        </div>
                     </div>

                     <div className="p-6 bg-bento-card rounded-2xl border border-bento-border space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                          {t.backupRestore}
                        </h3>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-bold">
                          {t.backupDescription}
                        </p>
                        
                        <div className="flex flex-wrap gap-3">
                           <button 
                             onClick={handleDownloadBackup}
                             className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                           >
                             <Download size={14} /> 
                             {t.downloadBackup}
                           </button>

                           <label className="flex items-center gap-2 px-4 py-2.5 bg-bento-bg hover:bg-zinc-800 text-bento-text-main border border-bento-border rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer">
                             <Upload size={14} /> 
                             {t.restoreBackup}
                             <input type="file" className="hidden" accept=".json" onChange={handleUploadBackupFile} />
                           </label>
                        </div>

                        {autoBackups.length > 0 && (
                          <div className="pt-3 border-t border-bento-border/50">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 mb-2.5">
                              {t.backupHistory}:
                            </p>
                            <div className="space-y-2">
                              {autoBackups.map((backup, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-bento-bg/40 border border-bento-border/40 rounded-xl">
                                  <div>
                                    <p className="text-xs font-bold text-bento-text-main">
                                      {idx === 0 ? t.currentSession : `${t.archive} #${idx}`}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 font-mono">
                                      {new Date(backup.timestamp).toLocaleString()}
                                    </p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      if (confirm(t.confirmRestoreBackup)) {
                                        handleRestoreBackupData(backup.data);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-indigo-600 hover:text-white text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    {t.restore}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                     </div>
                 </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

    </div>
  );
};
