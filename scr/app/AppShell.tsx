import React from 'react';
import { AnimatePresence } from 'motion/react';
import { AdminAuth } from '../components/AdminAuth';
import { AdminPanel } from '../components/AdminPanel';
import { StudentMode } from '../components/StudentMode';
import { useAppShell } from './useAppShell';
import { EntryScreen } from './EntryScreen';
import { storage } from '../lib/storage';
import { audit } from '../lib/audit';

export function AppShell() {
  const {
    view,
    setView,
    language,
    setLanguage,
    theme,
    isSuperAdmin,
    activeUniversity,
    setActiveUniversity,
    toggleTheme,
    t,
  } = useAppShell();

  return (
    <div className="requested-surface min-h-screen text-bento-text-main transition-colors duration-300 relative overflow-x-hidden">
      {view === 'entry' && activeUniversity?.bgUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {activeUniversity.bgType === 'video' ? (
            <video
              src={activeUniversity.bgUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover opacity-45 dark:opacity-35 transition-opacity duration-500"
            />
          ) : (
            <img
              src={activeUniversity.bgUrl}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-45 dark:opacity-35 transition-opacity duration-500 animate-fade-in"
              alt="University Background"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bento-bg via-transparent to-bento-bg opacity-75" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'entry' && (
          <EntryScreen
            key="entry"
            activeUniversity={activeUniversity}
            language={language}
            theme={theme}
            onStudent={() => setView('student')}
            onAdmin={() => setView('admin_auth')}
            onLanguageChange={setLanguage}
            onToggleTheme={toggleTheme}
            t={t}
          />
        )}

        {view === 'admin_auth' && (
          <AdminAuth
            key="admin_auth"
            language={language}
            setLanguage={setLanguage}
            onLogin={(isSuper, uni) => {
              setIsSuperAdmin(isSuper);
              setActiveUniversity(uni);
              setView('admin_panel');
            }}
          />
        )}

        {view === 'admin_panel' && (
          <AdminPanel
            key="admin_panel"
            language={language}
            setLanguage={setLanguage}
            onLogout={() => {
              audit.clearCurrentSession();
              setActiveUniversity(storage.getCurrentUniversity());
              setView('entry');
            }}
            theme={theme}
            toggleTheme={toggleTheme}
            isSuperAdmin={isSuperAdmin}
            activeUniversity={activeUniversity}
            onUniversityUpdate={(uni) => setActiveUniversity(uni)}
          />
        )}

        {view === 'student' && (
          <StudentMode
            key="student"
            language={language}
            setLanguage={setLanguage}
            onExit={() => setView('entry')}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
