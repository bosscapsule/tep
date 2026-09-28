import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, GraduationCap, ShieldCheck } from 'lucide-react';
import React from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSelector } from '../components/LanguageSelector';
import { Language, Theme, University } from '../types';
import { cn } from '../lib/utils';

const ViewWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ type: 'tween', ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
    className="requested-surface min-h-screen flex items-center justify-center p-6 transition-colors duration-300"
  >
    {children}
  </motion.div>
);

type EntryScreenProps = {
  activeUniversity: University | null;
  language: Language;
  theme: Theme;
  onStudent: () => void;
  onAdmin: () => void;
  onLanguageChange: (language: Language) => void;
  onToggleTheme: () => void;
  t: {
    student: string;
    studentSub: string;
    admin: string;
    adminSub: string;
  };
};

type ActionCardProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  theme: Theme;
  onClick: () => void;
  accentClassName: string;
};

function ActionCard({ title, subtitle, icon, theme, onClick, accentClassName }: ActionCardProps) {
  return (
    <motion.button
      initial="rest"
      whileHover="hover"
      whileTap="pressed"
      onClick={onClick}
      className={cn(
        'group relative py-3.5 px-5 rounded-[22px] border transition-all duration-300 flex items-center gap-4 overflow-hidden shadow-sm cursor-pointer',
        theme === 'dark'
          ? 'bg-[#0f172a] border-white/10 hover:border-indigo-500 text-white'
          : 'bg-zinc-50 border-zinc-200 hover:border-indigo-500 text-zinc-900 hover:bg-zinc-100/80'
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 flex-shrink-0',
          accentClassName
        )}
      >
        {icon}
      </div>
      <div className="text-left flex-1">
        <h3 className={cn('text-lg font-black tracking-tight leading-none', theme === 'dark' ? 'text-white' : 'text-zinc-900')}>{title}</h3>
        <p className={cn('font-bold uppercase text-[10px] tracking-wider mt-1.5 opacity-80', theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}>{subtitle}</p>
      </div>
      <motion.div
        variants={{
          rest: { x: 0, scale: 1 },
          hover: { x: 6, scale: 1.15 },
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className="text-indigo-600 dark:text-indigo-400"
      >
        <ArrowRight size={18} />
      </motion.div>
    </motion.button>
  );
}

export function EntryScreen({
  activeUniversity,
  language,
  theme,
  onStudent,
  onAdmin,
  onLanguageChange,
  onToggleTheme,
  t,
}: EntryScreenProps) {
  return (
    <ViewWrapper>
      <div className={cn(
        'w-[616px] min-h-[576px] md:min-h-[700px] h-auto max-w-full backdrop-blur-md rounded-[40px] pt-0 px-[20px] pb-[20px] flex flex-col justify-between shadow-2xl relative overflow-hidden group transition-colors duration-300 z-10 animate-fade-in border',
        theme === 'dark'
          ? 'bg-[#0f172a] border-white/10 text-white'
          : 'bg-white/95 border-zinc-200 text-zinc-900'
      )}>
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full -mr-40 -mt-40 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/5 dark:bg-purple-500/10 rounded-full -ml-40 -mb-40 blur-[100px] pointer-events-none" />

        <div className="flex-grow flex flex-col items-center justify-center z-10 py-6">
          {activeUniversity ? (
            <div className="relative flex flex-col items-center animate-fade-in">
              <div className="relative bg-transparent p-0 flex items-center justify-center w-[360px] h-[180px] md:w-[576px] md:h-[380px] overflow-hidden z-10 rounded-[20px]">
                {activeUniversity.logoUrl ? (
                  <img
                    src={activeUniversity.logoUrl}
                    className="w-full h-full object-cover object-[center_top]"
                    alt={activeUniversity.name}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-8xl text-indigo-500 animate-fade-in">🏛️</span>
                )}
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col items-center select-none animate-fade-in py-1">
              <div className="relative bg-transparent p-0 flex items-center justify-center w-[360px] h-[180px] md:w-[576px] md:h-[380px] overflow-hidden z-10 rounded-[20px]">
                <span className="text-8xl">🏛️</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[20px] w-full z-10 mt-auto mb-[8px]">
          <ActionCard
            title={t.student}
            subtitle={t.studentSub}
            icon={<GraduationCap size={24} />}
            theme={theme}
            onClick={onStudent}
            accentClassName={theme === 'dark' ? 'bg-[#1d345f] text-[#6c6cf6]' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}
          />
          <ActionCard
            title={t.admin}
            subtitle={t.adminSub}
            icon={<ShieldCheck size={24} />}
            theme={theme}
            onClick={onAdmin}
            accentClassName={theme === 'dark' ? 'bg-[#1d345f] text-[#6c6cf6]' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}
          />
        </div>

        <div className="flex items-center justify-center gap-3 z-10 pt-2 border-t border-bento-border/40 w-full">
          <LanguageSelector
            currentLanguage={language}
            onLanguageChange={onLanguageChange}
            className="shadow-none bg-bento-bg/50 dark:bg-zinc-900/30 border border-bento-border flex-1 max-w-[200px]"
          />
          <ThemeToggle
            theme={theme}
            toggle={onToggleTheme}
            className="h-[43px] w-[43px] bg-bento-bg/50 dark:bg-zinc-900/30 border border-bento-border flex-shrink-0"
          />
        </div>
      </div>
    </ViewWrapper>
  );
}

export function AppEntryShell(props: EntryScreenProps) {
  return (
    <AnimatePresence mode="wait">
      <EntryScreen {...props} />
    </AnimatePresence>
  );
}
