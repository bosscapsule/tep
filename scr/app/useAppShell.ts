import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { audit } from '../lib/audit';
import { mediaStore } from '../lib/mediaStore';
import { migrateLegacyRememberKey } from '../lib/security';
import { storage } from '../lib/storage';
import { Language, Theme, University } from '../types';

export type View = 'entry' | 'admin_auth' | 'admin_panel' | 'student';

export function useAppShell() {
  const [view, setView] = useState<View>('entry');
  const [language, setLanguage] = useState<Language>('ru');
  const [theme, setTheme] = useState<Theme>(() => storage.getTheme());
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeUniversity, setActiveUniversity] = useState<University | null>(() => storage.getCurrentUniversity());
  const t = useTranslation(language);

  useEffect(() => {
    migrateLegacyRememberKey();
    if (!storage.hasClearedCustomContent()) {
      storage.clearCustomContent();
      void mediaStore.clearCustomMedia();
    }
    storage.migrateSensitiveData();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    storage.saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    setActiveUniversity(storage.getCurrentUniversity());
  }, [view]);

  useEffect(() => {
    if (view !== 'admin_panel' || !audit.hasCurrentSession()) return;

    const checkSession = () => {
      if (audit.isCurrentSessionActive()) {
        audit.touchCurrentSession();
        return;
      }

      setIsSuperAdmin(false);
      setView('entry');
    };

    const intervalId = window.setInterval(checkSession, 5000);
    return () => window.clearInterval(intervalId);
  }, [view]);

  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'));

  return {
    view,
    setView,
    language,
    setLanguage,
    theme,
    setTheme,
    isSuperAdmin,
    setIsSuperAdmin,
    activeUniversity,
    setActiveUniversity,
    toggleTheme,
    t,
  };
}
