import type { ReactNode } from 'react';
import { Question, QuestionStatus, Theme, Language } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronRight, ChevronLeft, Box } from 'lucide-react';
import { useTranslation } from '../i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface QuestionPanelProps {
  question: Question;
  selectedAnswerId: string | null;
  onSelectAnswer: (id: string) => void;
  status: QuestionStatus;
  onNext: () => void;
  onPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
  onFinish?: () => void;
  hasAnswerSelected?: boolean;
  className?: string;
  isCentered?: boolean;
  mediaContent?: ReactNode;
  zoom?: number;
  theme?: Theme;
  language: Language;
}

export default function QuestionPanel({
  question,
  selectedAnswerId,
  onSelectAnswer,
  status,
  onNext,
  onPrev,
  canNext,
  canPrev,
  onFinish,
  hasAnswerSelected,
  className,
  isCentered,
  mediaContent,
  zoom = 1,
  theme,
  language
}: QuestionPanelProps) {
  const t = useTranslation(language);
  const selectedAnswers = selectedAnswerId ? selectedAnswerId.split(',') : [];

  return (
    <aside
      className={cn(
        isCentered
          ? "w-full h-full flex flex-col justify-between text-bento-text-main relative overflow-hidden"
          : "w-[380px] bg-bento-card border-l border-bento-border flex flex-col p-5 overflow-y-auto overflow-x-hidden text-bento-text-main transition-all duration-300 h-full custom-scrollbar",
        className
      )}
    >
      {/* 1. Медиа-блок и вопрос: статичная высота сохраняет положение ответов и кнопок */}
      <div className={cn(
        "w-full transition-colors flex flex-col shrink-0",
        isCentered
          ? "h-[50vh] min-h-[350px] max-h-[500px] rounded-none border-t-0 border-x-0 border-b pt-0 pb-0 px-4 sm:px-8"
          : "rounded-3xl p-6 md:p-8 border shadow-sm mb-6",
        "bg-bento-card border-bento-border text-bento-text-main"
      )}>
        {mediaContent || question.imageUrl ? (
          <>
            <div className="w-full flex-1 min-h-0 overflow-hidden bg-transparent border-0 flex items-center justify-center p-1 sm:p-2">
              {mediaContent ? (
                <div className="w-full h-full min-h-0 overflow-hidden rounded-2xl">
                  {mediaContent}
                </div>
              ) : (
                <img
                  src={question.imageUrl}
                  alt="Question visual"
                  className="h-full w-auto max-w-full object-contain rounded-none sm:rounded-b-xl"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            {/* Вопрос занимает фиксированную область под изображением или 3D-моделью */}
            <div className="shrink-0 w-full min-h-[64px] py-3 flex items-center">
              <h2 className={cn(
                "font-black leading-relaxed flex flex-wrap items-baseline gap-2.5 m-0 w-full",
                theme === 'dark' ? "text-white" : "text-zinc-900"
              )}>
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs sm:text-sm uppercase tracking-wide font-black shrink-0 border",
                  theme === 'dark'
                    ? "bg-indigo-950/80 text-indigo-400 border-indigo-800/50"
                    : "bg-indigo-50 text-indigo-600 border-indigo-200"
                )}>
                  {language === 'ru' ? 'Вопрос' : language === 'uz' ? 'Savol' : 'Question'} {question.id}:
                </span>
                <span className={cn(
                  "text-base font-black flex-1 min-w-0",
                  theme === 'dark' ? "text-white" : "text-zinc-900"
                )}>
                  {question.text}
                </span>
              </h2>
            </div>
          </>
        ) : (
          /* Без изображения и 3D-модели вопрос размещается по центру блока */
          <div className="w-full flex-1 min-h-[180px] flex flex-col items-center justify-center text-center px-4 sm:px-10 py-6">
            <span className={cn(
              "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm uppercase tracking-wide font-black shrink-0 border mb-4 shadow-xs",
              theme === 'dark'
                ? "bg-indigo-950/80 text-indigo-400 border-indigo-800/50"
                : "bg-indigo-50 text-indigo-600 border-indigo-200"
            )}>
              {language === 'ru' ? 'Вопрос' : language === 'uz' ? 'Savol' : 'Question'} {question.id}
            </span>
            <h2 className={cn(
              "text-base font-black leading-snug max-w-4xl",
              theme === 'dark' ? "text-white" : "text-zinc-900"
            )}>
              {question.text}
            </h2>
          </div>
        )}
      </div>

      {/* 2. Ответы: одинаковый минимальный отступ от блока вопроса (как при 8 ответах), строго по центру по горизонтали */}
      <div className="w-full max-w-3xl mx-auto px-4 flex-1 flex flex-col justify-start items-center pt-3 sm:pt-4 pb-2 min-h-[140px]">
        {question.type === 'find_on_model' ? (
          <div className="flex flex-col items-center gap-6 py-6 text-center bg-white/50 dark:bg-zinc-900/50 rounded-3xl p-6 border border-bento-border w-full">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 border-2 border-indigo-500/20 shadow-inner">
              <div className="relative">
                <Box size={32} className="animate-bounce" />
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                </div>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <h3 className={cn("text-xs font-black uppercase tracking-widest", theme === 'dark' ? "text-white" : "text-indigo-600")}>
                {t.interactiveQuestion}
              </h3>
              <p className="text-xs font-bold leading-relaxed max-w-xs text-zinc-500 dark:text-zinc-300">
                {selectedAnswerId ? t.objectSelectedDesc : t.clickOnModelDesc}
              </p>
            </div>

            <div className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
              selectedAnswerId 
                ? "bg-[#00c27a] text-white shadow-lg shadow-[#00c27a]/20" 
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
            )}>
              {selectedAnswerId ? `${t.selected}: ${selectedAnswerId}` : t.waitingForSelection}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
            {Object.entries(question.options).map(([key, text], idx) => {
              if (!text) return null;
              const isSelected = selectedAnswers.includes(key);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectAnswer(key)}
                  className={cn(
                    "w-full h-[62px] sm:h-[66px] min-h-[62px] max-h-[66px] text-left px-4 py-2.5 rounded-2xl border-2 transition-colors duration-150 flex items-center justify-between group relative overflow-hidden select-none cursor-pointer shadow-sm",
                    isSelected
                      ? theme === 'dark'
                        ? "bg-[#18181b] border-indigo-500 text-white"
                        : "bg-white border-indigo-500 text-zinc-900"
                      : theme === 'dark'
                        ? "bg-[#18181b] border-zinc-800 text-white hover:border-indigo-500 hover:bg-zinc-800/90"
                        : "bg-white border-zinc-200 text-zinc-900 hover:border-indigo-400 hover:bg-indigo-50/50"
                  )}
                >
                  <div className="flex items-center gap-3 pr-2 min-w-0 flex-1">
                    <div className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-colors shrink-0",
                      isSelected
                        ? "bg-indigo-600 text-white border border-indigo-600"
                        : theme === 'dark'
                          ? "bg-white/10 text-zinc-300 group-hover:bg-indigo-600 group-hover:text-white"
                          : "bg-zinc-100 text-zinc-700 border border-zinc-200 group-hover:bg-indigo-600 group-hover:text-white"
                    )}>
                      {question.type === 'true_false' ? (idx === 0 ? '✓' : '✗') : (question.type === 'multiple' ? (idx + 1) : key)}
                    </div>
                    <span className={cn(
                      "font-bold text-base leading-snug line-clamp-2 break-words",
                      theme === 'dark' ? "text-zinc-100" : "text-zinc-800"
                    )}>
                      {text}
                    </span>
                  </div>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ml-2",
                    isSelected ? "border-white bg-white" : "border-zinc-300 dark:border-zinc-600 group-hover:border-indigo-400"
                  )} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Кнопки «Вернуться» и «Далее» - фиксированы внизу */}
      <div className="mt-auto pb-5 pt-2 px-4 grid grid-cols-2 gap-3 w-full max-w-3xl mx-auto shrink-0">
        <button
          onClick={onPrev}
          disabled={!canPrev}
          className={cn(
            "flex items-center justify-center gap-2 h-11 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all",
            canPrev 
              ? "bg-white dark:bg-zinc-800/80 border border-bento-border text-bento-text-main hover:bg-zinc-50 dark:hover:bg-zinc-700 active:scale-[0.98] shadow-sm cursor-pointer" 
              : "bg-zinc-100/40 dark:bg-zinc-800/20 opacity-40 cursor-not-allowed border border-bento-border"
          )}
        >
          <ChevronLeft size={16} />
          {t.back}
        </button>
        {canNext ? (
          <button
            onClick={onNext}
            className="flex items-center justify-center gap-2 h-11 px-4 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            {t.next}
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={onFinish}
            disabled={!hasAnswerSelected}
            className={cn(
              "flex items-center justify-center gap-2 h-11 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md",
              hasAnswerSelected 
                ? "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-red-600/20 cursor-pointer" 
                : "bg-zinc-100/40 dark:bg-zinc-800/20 opacity-40 cursor-not-allowed border border-bento-border"
            )}
          >
            {t.finishExam}
          </button>
        )}
      </div>
    </aside>
  );
}
