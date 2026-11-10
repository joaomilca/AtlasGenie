import React, { createContext, useContext, useState, useEffect } from 'react';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { Language } from '../types/models';
import { translations } from './translations';

function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem('atlasgenie_lang');
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return 'pt';
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

// Initialize i18next with react-i18next using flat keys (keySeparator: false)
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: translations.en },
      pt: { translation: translations.pt },
      'pt-PT': { translation: translations.pt },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'pt',
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
  });
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);
  const [theme, setThemeState] = useState<'light' | 'dark'>(detectInitialTheme);
  const { t: i18nextT } = useTranslation();

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
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

  useEffect(() => {
    document.documentElement.lang = language === 'pt' ? 'pt-PT' : 'en';
  }, [language]);

  const t = (key: string, options?: Record<string, unknown>): string => {
    return String(i18nextT(key, options as any));
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

export { i18n, useTranslation };
