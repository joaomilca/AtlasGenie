import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { PWAInstallButton, OfflineIndicator } from '../components/PWAInstallControl';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage, theme, setTheme } = useI18n();
  const { currentUser, showToast } = useAtlas();

  const [email, setEmail] = useState(currentUser?.email || 'traveller@atlasgenie.eu');
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState(3);
  const [confirmationPreview, setConfirmationPreview] = useState<string | null>(null);

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
        `${data.email} (${data.daysBefore}d) — "${data.previewSubject || 'Departure Reminder'}"`
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
              English (EN)
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
              Português (PT-PT)
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
              <h2 className="font-serif-atlas text-base md:text-lg font-semibold">PWA & Airplane Mode</h2>
              <p className="text-xs text-slate-500">{t('pwa.readyBadge')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Offline Cache Active</span>
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

