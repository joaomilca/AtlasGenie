import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAtlas } from '../context/AtlasContext';

export const ToastViewport: React.FC = () => {
  const { toasts, dismissToast } = useAtlas();
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="print:hidden fixed bottom-16 md:bottom-5 right-4 sm:right-6 z-50 flex flex-col gap-2.5 items-end pointer-events-none max-w-sm w-[calc(100vw-2rem)] sm:w-auto"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((toast) => {
          const isAlert = toast.variant === 'alert';
          return (
            <motion.div
              key={toast.id}
              layout
              role="status"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border text-xs font-medium min-w-[260px] max-w-sm ${
                isAlert
                  ? 'bg-[#FEF3C7] text-[#78350F] border-[#F59E0B]/50 shadow-amber-950/10'
                  : 'bg-[#0F172A] text-[#F8FAFC] border-slate-700/90 shadow-slate-950/25'
              }`}
            >
              {isAlert ? (
                <AlertTriangle
                  className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}

              <span className="flex-1 leading-relaxed">{toast.message}</span>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label={t('toast.dismissAria')}
                className={`p-0.5 rounded-md transition-colors cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  isAlert
                    ? 'text-amber-800/70 hover:text-amber-950 hover:bg-amber-200/60'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
