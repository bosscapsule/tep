import React, { type ErrorInfo, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { AdminAuth } from '../components/AdminAuth';
import { AdminPanel } from '../components/AdminPanel';
import { StudentMode } from '../components/StudentMode';
import { useAppShell } from './useAppShell';
import { EntryScreen } from './EntryScreen';
import { storage } from '../lib/storage';
import { audit } from '../lib/audit';

interface StudentModeBoundaryProps {
  children: ReactNode;
  onExit: () => void;
  errorHeading: string;
  backLabel: string;
}

interface StudentModeBoundaryState {
  error: Error | null;
  componentStack: string;
}

class StudentModeErrorBoundary extends React.Component<
  StudentModeBoundaryProps,
  StudentModeBoundaryState
> {
  state: StudentModeBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): StudentModeBoundaryState {
    return { error, componentStack: '' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Student mode render failed:', error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack || '' });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="min-h-screen bg-bento-bg text-bento-text-main flex items-center justify-center p-6">
        <section className="w-full max-w-xl rounded-2xl border border-red-500/30 bg-bento-card p-6 shadow-xl">
          <h1 className="text-lg font-bold text-red-500">{this.props.errorHeading}</h1>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bento-bg p-4 text-sm">
            {[error.message, error.stack, this.state.componentStack].filter(Boolean).join('\n')}
          </pre>
          <button
            type="button"
            onClick={this.props.onExit}
            className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700"
          >
            {this.props.backLabel}
          </button>
        </section>
      </main>
    );
  }
}

export function AppShell() {
  const {
    view,
    setView,
    language,
    setLanguage,
    theme,
    isSuperAdmin,
    setIsSuperAdmin,
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
          <StudentModeErrorBoundary
            key="student"
            onExit={() => setView('entry')}
            errorHeading={t.studentModeError}
            backLabel={t.goBack}
          >
            <StudentMode
              language={language}
              setLanguage={setLanguage}
              onExit={() => setView('entry')}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </StudentModeErrorBoundary>
        )}
      </AnimatePresence>
    </div>
  );
}
