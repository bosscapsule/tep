import React from 'react';
import { Theme } from '../types';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Props {
  theme: Theme;
  toggle: () => void;
  className?: string;
}

export const ThemeToggle: React.FC<Props> = ({ theme, toggle, className }) => (
  <button
    onClick={toggle}
    className={cn(
      "relative p-2.5 bg-white dark:bg-bento-card border border-bento-border rounded-xl hover:border-bento-accent transition-all group active:scale-95 overflow-hidden flex items-center justify-center",
      className
    )}
    title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
  >
    <div className="relative w-5 h-5 flex items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: 15, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -15, opacity: 0, rotate: 90 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="absolute inset-0 flex items-center justify-center text-bento-accent"
        >
          {theme === 'light' ? (
            <Moon size={18} fill="currentColor" className="opacity-80" />
          ) : (
            <Sun size={18} fill="currentColor" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    
    {/* Animated background glow */}
    <div className="absolute inset-0 bg-bento-accent opacity-0 group-hover:opacity-[0.03] transition-opacity" />
  </button>
);
