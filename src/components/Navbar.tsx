import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, User as UserIcon, UserCheck, ChevronDown, Settings } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { useAuth, mapFirebaseAuthError } from '../context/AuthContext';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallControl';
import { ToastViewport } from './ToastViewport';
import { LoginModal } from './LoginModal';

export const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage, theme, setTheme } = useI18n();
  const { showToast } = useAtlas();
  const { user, userProfile, logout } = useAuth();
  const location = useLocation();
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      await logout();
      showToast(t('settings.accountLogoutSuccess'));
    } catch (err: unknown) {
      showToast(mapFirebaseAuthError(err, language), 'alert');
    }
  };

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const displayIdentifier =
    userProfile?.name || user?.displayName || user?.email?.split('@')[0] || user?.email || '';
  const avatarInitial = (displayIdentifier.trim()[0] || 'U').toUpperCase();

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
      <header className="print:hidden sticky top-0 z-40 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-8 py-3.5 bg-[#FAF6F0]/95 dark:bg-[#0B1120]/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
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
            data-testid="language-toggle-btn"
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

        {/* Zone 3: Quick-Access Auth Trigger + Primary Action + Offline/Install Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <OfflineIndicator />
          <PWAInstallButton />

          {user ? (
            <div
              ref={profileMenuRef}
              data-testid="navbar-authenticated-controls"
              className="relative flex items-center gap-2"
            >
              {/* Profile Avatar / Icon with Dropdown Trigger */}
              <button
                type="button"
                data-testid="navbar-profile-avatar"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                title={user.email || displayIdentifier}
                className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 hover:border-amber-500/70 text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <span className="w-6 h-6 rounded-md bg-amber-600 text-white font-mono-tabular font-bold text-[11px] inline-flex items-center justify-center shrink-0">
                  {avatarInitial}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate font-mono-tabular text-xs">
                  {displayIdentifier}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              </button>

              {/* Small Direct Log Out Button */}
              <button
                type="button"
                data-testid="navbar-logout-btn"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('nav.logout')}</span>
              </button>

              {/* Profile Dropdown Menu */}
              {profileMenuOpen && (
                <div
                  role="menu"
                  data-testid="navbar-profile-dropdown"
                  className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 space-y-1"
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t('settings.accountStatusAuthenticated')}</span>
                    </div>
                    <p
                      data-testid="navbar-dropdown-email"
                      className="text-xs font-mono-tabular font-semibold text-slate-900 dark:text-white truncate mt-0.5"
                    >
                      {user.email}
                    </p>
                  </div>

                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <span>{t('settings.profileTitle')}</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    data-testid="navbar-dropdown-logout-btn"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('settings.accountLogoutBtn')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              data-testid="navbar-signin-btn"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/90 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <UserIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span>{t('nav.login')}</span>
            </button>
          )}

          <Link
            to="/trips/new"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
          >
            {t('nav.signup')}
          </Link>
        </div>
      </header>

      {/* Shared Auth Modal wired to the exact same AuthContext login/signup functions as Settings */}
      <LoginModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Non-intrusive stacked toast notifications */}
      <ToastViewport />
    </>
  );
};


