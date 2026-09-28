import React from 'react';
import { Language } from '../types';
import { cn } from '../lib/utils';
import { Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  className?: string;
}

export const LanguageSelector: React.FC<Props> = ({ currentLanguage, onLanguageChange, className }) => {
  const languages: { code: Language; label: string }[] = [
    { code: 'uz', label: 'UZ' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
  ];

  const currentIndex = languages.findIndex(l => l.code === currentLanguage);
  const current = languages[currentIndex];

  const handleToggle = () => {
    const nextIndex = (currentIndex + 1) % languages.length;
    onLanguageChange(languages[nextIndex].code);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "requested-surface group relative flex items-center gap-2.5 px-4 py-2 border border-bento-border rounded-xl hover:border-bento-accent transition-all active:scale-95",
        className
      )}
    >
      <div className="requested-surface p-1.5 rounded-lg group-hover:bg-bento-accent-soft transition-colors text-bento-text-muted group-hover:text-bento-accent">
        <Globe size={16} />
      </div>
      
      <div className="flex items-center gap-2 overflow-hidden h-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.code}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex items-center"
          >
            <span className="text-[13px] font-bold text-bento-text-main tracking-wide uppercase">{current.label}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-1 ml-1 opacity-20 group-hover:opacity-40 transition-opacity">
        {languages.map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "w-1 h-1 rounded-full transition-all", 
              i === currentIndex ? "bg-bento-accent w-2" : "bg-gray-400"
            )} 
          />
        ))}
      </div>
    </button>
  );
}
