import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { logoutUser } from '../services/firebase';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallControl';
import { ToastViewport } from './ToastViewport';

export const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage, theme, setTheme } = useI18n();
  const { currentUser } = useAtlas();
  const location = useLocation();
  const navigate = useNavigate();
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/');
  };

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <>
      {gmpQuotaExceeded && (
        <div className="print:hidden bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            {t('nav.quotaNotice')}{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              {t('nav.quotaLink')}
            </a>{' '}
            {t('nav.quotaSuffix')}
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract (hidden in print mode) */}
      <header className="print:hidden sticky top-0 z-40 flex items-center justify-between gap-8 px-4 sm:px-8 py-3.5 bg-[#FAF6F0]/95 dark:bg-[#0B1120]/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="font-serif-atlas text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          AtlasGenie
        </Link>

        {/* Zone 2: 4–5 concise single-line text navigation links */}
        <nav
          aria-label={t('nav.mainNavAria')}
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <Link
            to="/demo"
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isActive('/demo') ? 'text-amber-700 dark:text-amber-400 underline underline-offset-4' : ''
            }`}
          >
            {t('nav.demo')}
          </Link>
          <Link
            to="/dashboard"
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isActive('/dashboard') ? 'text-amber-700 dark:text-amber-400 underline underline-offset-4' : ''
            }`}
          >
            {t('nav.dashboard')}
          </Link>
          <Link
            to="/trips/new"
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isActive('/trips/new') ? 'text-amber-700 dark:text-amber-400 underline underline-offset-4' : ''
            }`}
          >
            {t('nav.newTrip')}
          </Link>
          <Link
            to="/settings"
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              isActive('/settings') ? 'text-amber-700 dark:text-amber-400 underline underline-offset-4' : ''
            }`}
          >
            {t('nav.settings')}
          </Link>
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'pt' : 'en')}
            aria-label={t('nav.switchLangAria')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 font-mono-tabular text-xs uppercase cursor-pointer"
          >
            {language === 'en' ? 'PT-PT' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={t('nav.toggleThemeAria')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 text-xs cursor-pointer"
          >
            {theme === 'light' ? t('nav.themeDark') : t('nav.themeLight')}
          </button>
        </nav>

        {/* Zone 3: Primary action + conditional offline/install controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <OfflineIndicator />
          <PWAInstallButton />
          {currentUser ? (
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav.logout')}
            </button>
          ) : (
            <Link
              to="/trips/new"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav.signup')}
            </Link>
          )}
        </div>
      </header>

      {/* Non-intrusive stacked toast notifications */}
      <ToastViewport />
    </>
  );
};

