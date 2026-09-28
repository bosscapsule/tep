import { useState, useEffect } from 'react';
import { Question, QuestionStatus, Theme, Language } from '../types';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from '../i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SidebarUser {
  id?: string;
  name: string;
  avatar: string;
  group: string;
  subgroup?: string;
  isLegend?: boolean;
}

interface SidebarProps {
  user: SidebarUser;
  questions: Question[];
  currentQuestionId: string;
  onSelectQuestion: (id: string) => void;
  statuses: Record<string, QuestionStatus>;
  onFinish: () => void;
  timeRemaining: number;
  theme?: Theme;
  language: Language;
}

export default function Sidebar({
  user,
  questions,
  currentQuestionId,
  onSelectQuestion,
  statuses,
  onFinish,
  timeRemaining,
  theme,
  language
}: SidebarProps) {
  const t = useTranslation(language);
  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      transition={{ duration: 0 }}
      className={cn(
        "absolute left-0 top-0 bottom-0 w-60 z-30 border-r shadow-2xl backdrop-blur-md flex flex-col transition-colors duration-300",
        theme === 'dark' 
          ? "bg-[#0a0a0c]/95 border-white/10 text-white" 
          : "bg-white/95 border-zinc-200 text-zinc-800"
      )}
    >
      {/* User Block */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white shrink-0">
            {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {user.isLegend && (
              <span className="text-[9px] font-black text-yellow-500 uppercase tracking-[0.2em] leading-none mb-0.5 block animate-pulse drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]">{t.legend}</span>
            )}
            <h3 className={cn("font-bold text-[13px] leading-tight mb-1 truncate", theme === 'dark' ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]" : "text-zinc-900")}>{user.name}</h3>
            <div className="flex flex-wrap items-center gap-x-1.5 opacity-80">
              <span className={cn("text-[9px] font-black uppercase tracking-wider truncate", theme === 'dark' ? "text-indigo-300 drop-shadow-[0_0_3px_rgba(165,180,252,0.3)]" : "text-indigo-600")}>
                {user.group} {user.subgroup}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Timer */}
      <div className="px-4 mb-4">
        <div className={cn(
          "rounded-xl p-3 text-center border transition-all",
          theme === 'dark'
            ? "bg-black/40 border-white/10 shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]"
            : "bg-bento-bg border-bento-border"
        )}>
          <div className={cn("text-[9px] uppercase font-bold mb-1 tracking-widest opacity-80", theme === 'dark' ? "text-white/60" : "text-zinc-400")}>{t.timeRemaining}</div>
          <div className={cn(
            "font-mono text-xl font-black tracking-wider py-0.5 transition-none duration-0",
            theme === 'dark' ? "text-white" : "text-indigo-600"
          )}>
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>

      {/* Question Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 mb-4 custom-scrollbar pt-2">
        <div className="grid grid-cols-4 gap-2">
          {questions.map((q, idx) => {
            const status = statuses[q.id] || 'unanswered';
            const isActive = q.id === currentQuestionId;
            
            return (
              <button
                key={q.id}
                onClick={() => onSelectQuestion(q.id)}
                className={cn(
                  "aspect-square rounded-lg flex items-center justify-center text-[12px] font-black transition-all duration-300 relative",
                  isActive 
                    ? "ring-2 ring-indigo-600 ring-offset-2 ring-offset-bento-bg z-10 scale-110" 
                    : "hover:scale-105",
                  status === 'correct' && "bg-indigo-600 text-white",
                  status === 'wrong' && "bg-indigo-600 text-white",
                  status === 'answered' && "bg-indigo-600 text-white",
                  status === 'unanswered' && "bg-bento-bg border border-bento-border text-zinc-400 hover:border-indigo-400 hover:text-indigo-600",
                  status === 'current' && !isActive && "bg-indigo-600 text-white",
                  isActive && status === 'unanswered' && "bg-indigo-600 text-white"
                )}
              >
                {idx + 1}
                {isActive && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute -inset-1 border border-indigo-600/20 rounded-xl"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 mt-auto space-y-3">
        <button
          onClick={onFinish}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all active:scale-[0.98]"
        >
          {t.finishExam}
        </button>
      </div>

    </motion.div>
  );
}
