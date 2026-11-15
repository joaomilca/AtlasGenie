import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, CheckCircle2, UserCheck, LogOut, ShieldCheck, Compass, Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { useAuth, mapFirebaseAuthError } from '../context/AuthContext';
import { PWAInstallButton, OfflineIndicator } from '../components/PWAInstallControl';
import { SPECIAL_PREFERENCE_CHIPS, SpecialPreferenceChipOption } from '../services/api';
import { getUserProfile } from '../services/firebase';
import {
  DEFAULT_TRAVELER_PROFILE_PREFERENCES,
  INTEREST_OPTION_ITEMS,
  doesRestrictionMatchChip,
  toggleRestrictionInList,
} from '../utils/domainLogic';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage, theme, setTheme } = useI18n();
  const { showToast } = useAtlas();
  const { user, userProfile, loading: authLoading, login, signup, logout, updateUserProfile } = useAuth();
  const isPt = language === 'pt';

  // Conta de Utilizador (User Account) Form State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // O Meu Perfil de Viajante (Traveler Profile) State — Sprint 25
  const [defaultGroupSize, setDefaultGroupSize] = useState<number>(
    userProfile?.defaultGroupSize ?? DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultGroupSize
  );
  const [defaultPaceLevel, setDefaultPaceLevel] = useState<number>(
    userProfile?.defaultPaceLevel ?? DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultPaceLevel
  );
  const [savedInterests, setSavedInterests] = useState<string[]>(
    userProfile?.savedInterests ?? [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedInterests]
  );
  const [savedRestrictions, setSavedRestrictions] = useState<string[]>(
    userProfile?.savedRestrictions ?? [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedRestrictions]
  );
  const [profileSaving, setProfileSaving] = useState<boolean>(false);

  const [email, setEmail] = useState(user?.email || 'traveller@atlasgenie.eu');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState(3);
  const [confirmationPreview, setConfirmationPreview] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (userProfile) {
      setDefaultGroupSize(userProfile.defaultGroupSize);
      setDefaultPaceLevel(userProfile.defaultPaceLevel);
      setSavedInterests([...userProfile.savedInterests]);
      setSavedRestrictions([...userProfile.savedRestrictions]);
      return;
    }
    if (!user?.uid) return;
    let active = true;
    (async () => {
      const fetched = await getUserProfile(user.uid, user.email || undefined, user.displayName || undefined);
      if (active && fetched) {
        setDefaultGroupSize(fetched.defaultGroupSize);
        setDefaultPaceLevel(fetched.defaultPaceLevel);
        setSavedInterests([...fetched.savedInterests]);
        setSavedRestrictions([...fetched.savedRestrictions]);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid, user?.email, user?.displayName, userProfile]);

  const handleToggleProfileInterest = (interestId: string) => {
    setSavedInterests((prev) =>
      prev.includes(interestId) ? prev.filter((item) => item !== interestId) : [...prev, interestId]
    );
  };

  const handleToggleProfileRestriction = (chip: SpecialPreferenceChipOption) => {
    setSavedRestrictions((prev) => toggleRestrictionInList(prev, chip));
  };

  const handleSaveTravelerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setProfileSaving(true);
    try {
      await updateUserProfile({
        defaultGroupSize: Math.min(50, Math.max(1, Number(defaultGroupSize) || 2)),
        defaultPaceLevel: Math.min(5, Math.max(1, Number(defaultPaceLevel) || 3)),
        savedInterests,
        savedRestrictions,
      });
      showToast(t('settings.profileSavedToast'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === 'signup') {
        await signup(authEmail, authPassword);
        showToast(t('settings.accountSignupSuccess'));
      } else {
        await login(authEmail, authPassword);
        showToast(t('settings.accountLoginSuccess'));
      }
      setAuthPassword('');
    } catch (err: unknown) {
      setAuthError(mapFirebaseAuthError(err, language));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
    try {
      await logout();
      showToast(t('settings.accountLogoutSuccess'));
    } catch (err: unknown) {
      setAuthError(mapFirebaseAuthError(err, language));
    }
  };

  const handleSaveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          destination: 'Lisbon',
          startDate: '2026-11-18',
          daysBefore,
          unconfirmedCount: 1,
        }),
      });
      const data = await res.json();
      setConfirmationPreview(
        `${data.email} (${data.daysBefore}d) — "${data.previewSubject || t('settings.remindersTitle')}"`
      );
      showToast(t('toast.preferencesSaved'));
    } catch {
      showToast(t('toast.preferencesSaved'));
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-0 md:px-8 py-6 md:py-10 space-y-6 md:space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif-atlas text-xl md:text-3xl font-bold text-slate-900 dark:text-white">
          {t('settings.title')}
        </h1>
        <OfflineIndicator />
      </div>

      {/* Conta de Utilizador (User Account Section — Sprint 22 & Sprint 24 i18n) */}
      <section
        data-testid="settings-account-section"
        aria-labelledby="settings-account-heading"
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#D97706] mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2
                id="settings-account-heading"
                className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white"
              >
                {t('settings.accountTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.accountSubtitle')}
              </p>
            </div>
          </div>

          {user && (
            <span
              data-testid="settings-auth-status-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 self-start sm:self-center"
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t('settings.accountStatusAuthenticated')}</span>
            </span>
          )}
        </div>

        {authLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('settings.accountCheckingSession')}
          </p>
        ) : user ? (
          <div
            data-testid="settings-authenticated-view"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
          >
            <div className="space-y-1 min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.accountActiveEmailLabel')}
              </p>
              <p
                data-testid="settings-auth-user-email"
                className="text-sm font-mono-tabular font-semibold text-slate-900 dark:text-white break-all"
              >
                {user.email}
              </p>
            </div>

            <button
              type="button"
              data-testid="settings-auth-logout-btn"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('settings.accountLogoutBtn')}</span>
            </button>
          </div>
        ) : (
          <form
            data-testid="settings-auth-form"
            onSubmit={handleAuthSubmit}
            noValidate
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="settings-auth-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1"
                >
                  {t('settings.accountEmailLabel')}
                </label>
                <input
                  id="settings-auth-email"
                  data-testid="settings-auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t('settings.accountEmailPlaceholder')}
                  value={authEmail}
                  onChange={(e) => {
                    setAuthEmail(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-auth-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1"
                >
                  {t('settings.accountPasswordLabel')}
                </label>
                <input
                  id="settings-auth-password"
                  data-testid="settings-auth-password"
                  type="password"
                  required
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={t('settings.accountPasswordPlaceholder')}
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {authError && (
              <p
                data-testid="settings-auth-error"
                role="alert"
                className="text-xs font-medium text-red-600 dark:text-red-400"
              >
                {authError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="submit"
                data-testid="settings-auth-submit"
                disabled={authSubmitting}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-500 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {authMode === 'login'
                  ? t('settings.accountLoginBtn')
                  : t('settings.accountSignupBtn')}
              </button>

              <button
                type="button"
                data-testid="settings-auth-mode-toggle"
                onClick={() => {
                  setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'));
                  setAuthError(null);
                }}
                className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-1 py-0.5"
              >
                {authMode === 'login'
                  ? t('settings.accountNeedSignupToggle')
                  : t('settings.accountHaveAccountToggle')}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* O Meu Perfil de Viajante (My Traveler Profile — Sprint 25, visible ONLY when logged in) */}
      {user && (
        <section
          data-testid="settings-traveler-profile-section"
          aria-labelledby="settings-profile-heading"
          className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-6 shadow-2xs"
        >
          <div className="flex items-start gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <Compass className="w-5 h-5 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2
                id="settings-profile-heading"
                className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white"
              >
                {t('settings.profileTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('settings.profileSubtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveTravelerProfile} className="space-y-6">
            {/* Default Group Size & Default Daily Pace */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label
                  htmlFor="profile-group-size"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1"
                >
                  {t('settings.profileGroupSizeLabel')}
                </label>
                <input
                  id="profile-group-size"
                  data-testid="profile-default-group-size"
                  type="number"
                  min={1}
                  max={12}
                  value={defaultGroupSize}
                  onChange={(e) => setDefaultGroupSize(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium mb-1">
                  <label
                    htmlFor="profile-pace-slider"
                    className="text-slate-700 dark:text-slate-200"
                  >
                    {t('settings.profilePaceLabel')}
                  </label>
                  <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-300">
                    {t('wizard.level')} {defaultPaceLevel}/5 (
                    {defaultPaceLevel <= 2
                      ? t('trip.paceRelaxed')
                      : defaultPaceLevel === 3
                      ? t('trip.paceBalanced')
                      : t('trip.pacePacked')}
                    )
                  </span>
                </div>
                <input
                  id="profile-pace-slider"
                  data-testid="profile-default-pace"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={defaultPaceLevel}
                  onChange={(e) => setDefaultPaceLevel(Number(e.target.value))}
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Saved Interests (matching New Trip Form Step 2) */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {t('settings.profileInterestsLabel')}
              </p>
              <div
                data-testid="profile-interests-grid"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              >
                {INTEREST_OPTION_ITEMS.map((item) => {
                  const active = savedInterests.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`profile-interest-${item.id}`}
                      aria-pressed={active}
                      onClick={() => handleToggleProfileInterest(item.id)}
                      className={`p-3 rounded-xl border text-left transition-colors flex items-center gap-2.5 cursor-pointer ${
                        active
                          ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500'
                          : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <span className="text-lg" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="text-xs font-medium leading-tight">
                        {t(`interest.${item.id}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Saved Restrictions (matching New Trip Form Step 3) */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {t('settings.profileRestrictionsLabel')}
              </p>
              <div
                data-testid="profile-restrictions-chips"
                className="flex flex-wrap gap-2.5"
              >
                {SPECIAL_PREFERENCE_CHIPS.map((chip) => {
                  const isSelected = doesRestrictionMatchChip(savedRestrictions, chip);
                  const displayLabel = t(
                    `wizard.prefChip.${chip.id}`,
                    isPt ? chip.labelPt : chip.labelEn
                  );
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      data-testid={`profile-restriction-${chip.id}`}
                      aria-pressed={isSelected}
                      onClick={() => handleToggleProfileRestriction(chip)}
                      className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500 shadow-sm'
                          : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                      }`}
                    >
                      <span aria-hidden="true">{chip.icon}</span>
                      <span>{displayLabel}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-amber-400 dark:text-white shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                type="submit"
                data-testid="profile-save-preferences-btn"
                disabled={profileSaving}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {profileSaving ? t('settings.profileSavingBtn') : t('settings.profileSaveBtn')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Language & Theme */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-serif-atlas text-base md:text-lg font-semibold">{t('settings.language')}</h2>
            <p className="text-xs text-slate-500">{t('settings.languageSub')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                language === 'en'
                  ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            >
              {t('settings.langOptionEn')}
            </button>
            <button
              type="button"
              onClick={() => setLanguage('pt')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                language === 'pt'
                  ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            >
              {t('settings.langOptionPt')}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-serif-atlas text-base md:text-lg font-semibold">{t('settings.theme')}</h2>
            <p className="text-xs text-slate-500">{t('settings.themeSub')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                theme === 'light'
                  ? 'bg-[#0F172A] text-white border-[#0F172A]'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            >
              {t('settings.themeLight')}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                theme === 'dark'
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            >
              {t('settings.themeDark')}
            </button>
          </div>
        </div>

        {/* PWA & Offline Airplane Mode Readiness */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Wifi className="w-4 h-4 text-teal-600 dark:text-teal-400 mt-1 shrink-0" />
            <div>
              <h2 className="font-serif-atlas text-base md:text-lg font-semibold">{t('settings.pwaTitle')}</h2>
              <p className="text-xs text-slate-500">{t('pwa.readyBadge')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t('settings.pwaCacheActive')}</span>
            </span>
            <PWAInstallButton />
          </div>
        </div>
      </section>

      {/* Departure Email Reminders (Feature A9) */}
      <form
        onSubmit={handleSaveReminders}
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div>
          <h2 className="font-serif-atlas text-lg font-semibold">{t('settings.remindersTitle')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('settings.remindersDesc')}</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(e) => setRemindersEnabled(e.target.checked)}
            className="w-4 h-4 accent-amber-600"
          />
          <span className="text-xs font-medium">{t('settings.enableCheckbox')}</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rem-email" className="block text-xs font-medium mb-1">
              {t('settings.recipientEmail')}
            </label>
            <input
              id="rem-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
            />
          </div>

          <div>
            <label htmlFor="rem-days" className="block text-xs font-medium mb-1">
              {t('settings.daysBefore')}
            </label>
            <input
              id="rem-days"
              type="number"
              min={1}
              max={14}
              value={daysBefore}
              onChange={(e) => setDaysBefore(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
            />
          </div>
        </div>

        {confirmationPreview && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
            ✓ {confirmationPreview}
          </div>
        )}

        <button
          type="submit"
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer"
        >
          {t('settings.saveBtn')}
        </button>
      </form>
    </main>
  );
};

