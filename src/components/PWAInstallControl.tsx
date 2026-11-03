import React, { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer print:hidden"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{t('pwa.installBtn')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer print:hidden"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t('pwa.installIosBtn')}</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 print:hidden"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-3">
              <h3 className="font-serif-atlas text-lg font-bold text-slate-900 dark:text-white">
                {t('pwa.iosTitle')}
              </h3>
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                <p>{t('pwa.iosStep1')}</p>
                <p>{t('pwa.iosStep2')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-2 w-full rounded-lg bg-[#0F172A] dark:bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {t('pwa.closeBtn')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-mode-banner"
      className="fixed bottom-16 md:bottom-5 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg border border-amber-400/50 print:hidden"
    >
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>{t('pwa.offlineBanner')}</span>
    </div>
  );
};
