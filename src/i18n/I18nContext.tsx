import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../types/models';
import { translations } from './translations';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem('atlasgenie_lang');
    if (saved === 'pt' || saved === 'en') return saved;
    const nav = navigator.language?.toLowerCase() || '';
    if (nav.startsWith('pt')) return 'pt';
  } catch {
    // ignore storage errors
  }
  return 'en';
}

function detectInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('atlasgenie_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);
  const [theme, setThemeState] = useState<'light' | 'dark'>(detectInitialTheme);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('atlasgenie_lang', lang);
    } catch {
      // ignore
    }
  };

  const setTheme = (nextTheme: 'light' | 'dark') => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem('atlasgenie_theme', nextTheme);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const t = (key: string): string => {
    return translations[language]?.[key] || translations.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, theme, setTheme }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
