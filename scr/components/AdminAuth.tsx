import React, { useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../i18n';
import { Language, University } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { LanguageSelector } from './LanguageSelector';
import { storage } from '../lib/storage';
import {
  security,
  adminRateLimit,
} from '../lib/security';
import { audit } from '../lib/audit';

interface Props {
  onLogin: (isSuperAdmin: boolean, university: University | null) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const AdminAuth: React.FC<Props> = ({ onLogin, language, setLanguage }) => {
  const t = useTranslation(language);
  const [password, setPassword] = useState(() => {
    const currentUniversity = storage.getCurrentUniversity();
    return currentUniversity
      ? security.getRememberedUniversityPassword(currentUniversity.id)
      : '';
  });
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    const rateLimit = adminRateLimit.canAttempt();
    if (!rateLimit.allowed) {
      setErrorMsg(t.adminTooManyAttempts);
      setError(true);
      setIsSubmitting(false);
      return;
    }

    const cleanPassword = password.trim();
    const universities = storage.getUniversities();
    const result = await security.verifyAdminLogin(cleanPassword, universities);

    if (!result.ok) {
      adminRateLimit.recordFailure();
      if (result.reason === 'expired') {
        setErrorMsg(t.adminKeyExpired);
      } else {
        setErrorMsg('');
      }
      setError(true);
      setTimeout(() => {
        setError(false);
        setErrorMsg('');
      }, 2500);
      setIsSubmitting(false);
      return;
    }

    adminRateLimit.reset();
    if (result.role === 'university') {
      audit.startSession(`university:${result.universityId}`, result.universityId);
    }
    audit.record('login', result.role === 'super' ? 'superadmin' : 'university-admin', result.universityId);

    if (result.role === 'super') {
      audit.clearCurrentSession();
      storage.setCurrentUniversity(null);
      onLogin(true, null);
      setIsSubmitting(false);
      return;
    }

    if (result.role === 'university' && result.universityId) {
      const matchedUni = universities.find((u) => u.id === result.universityId) || null;
      if (matchedUni) storage.setCurrentUniversity(matchedUni);
      onLogin(false, matchedUni);
      setIsSubmitting(false);
      return;
    }

    const currentActive = storage.getCurrentUniversity();
    onLogin(false, currentActive);
    setIsSubmitting(false);
  };

  return (
    <div className="requested-surface min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
        className="w-[576px] max-w-full"
      >
        <div className="requested-surface rounded-[32px] border border-bento-border p-8 md:p-10 relative overflow-hidden h-[576px] flex flex-col justify-between shadow-2xl">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 dark:bg-indigo-500/15 rounded-full -mr-40 -mt-40 blur-[100px] pointer-events-none" />
          
          <div className="relative flex flex-col h-full justify-between z-10">
            <div className="flex justify-between items-start">
              <div className="w-14 h-14 bg-bento-accent-soft rounded-2xl flex items-center justify-center">
                <ShieldCheck size={28} className="text-bento-accent" />
              </div>
              <LanguageSelector 
                currentLanguage={language} 
                onLanguageChange={setLanguage}
              />
            </div>
            
            <div className="mt-6">
              <h2 className="text-3xl font-black text-bento-text-main mb-2 leading-none uppercase tracking-tight">{t.adminLogin}</h2>
              <p className="text-bento-text-muted text-xs font-semibold leading-relaxed">{t.adminLoginDescription}</p>
              
              {(() => {
                const activeUni = storage.getCurrentUniversity();
                if (activeUni && security.isUniversityPasswordRememberEnabled(activeUni.id)) {
                  return (
                    <div className="mt-4 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      <span>🏛️</span>
                      <span className="truncate">{t.activeUniversity}: {activeUni.name}</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            <form onSubmit={handleLogin} className="flex-1 flex flex-col justify-between mt-6">
              <div className="space-y-3.5 my-auto">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] px-1">{t.password}</label>
                  <div className={cn(
                    "requested-surface flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all group",
                    error ? "border-red-500/50 bg-red-500/5" : "border-bento-border focus-within:border-bento-accent focus-within:bg-bento-card"
                  )} onMouseDown={() => passwordInputRef.current?.focus()}>
                    <Lock size={18} className={cn(error ? "text-red-500" : "text-bento-text-muted group-focus-within:text-bento-accent")} />
                    <input
                      ref={passwordInputRef}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="flex-1 bg-transparent outline-none font-mono text-lg text-bento-text-main placeholder:text-bento-text-muted/30"
                    />
                  </div>
                </div>

                {error && <p className="text-red-500 text-xs font-bold pl-1 animate-pulse">{errorMsg || t.invalidPassword}</p>}
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-bento-accent text-white py-5 rounded-xl font-bold text-lg hover:opacity-90 transition-all active:scale-[0.98] mt-6 shrink-0 disabled:opacity-60"
              >
                {t.launchDashboard}
              </button>
            </form>
          </div>
        </div>
        
        <p className="text-center mt-6 text-gray-400 text-sm font-medium">
          {t.forgotPassword}
        </p>
      </motion.div>
    </div>
  );
};
