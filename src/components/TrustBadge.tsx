import React, { useState } from 'react';
import { ConfidenceInfo } from '../types/models';
import { useI18n } from '../i18n/I18nContext';

interface TrustBadgeProps {
  type: 'price' | 'hours';
  confidence: ConfidenceInfo;
  valueText: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ type, confidence, valueText }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const icon =
    confidence.status === 'verified'
      ? '🟢'
      : confidence.status === 'estimated'
      ? '🟡'
      : '⚪';

  const label =
    confidence.status === 'verified'
      ? t('trip.verified')
      : confidence.status === 'estimated'
      ? t('trip.estimated')
      : t('trip.toConfirm');

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`${type === 'price' ? 'Price' : 'Opening hours'} ${label}: ${valueText}`}
        className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors underline decoration-dotted underline-offset-4 whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">{icon}</span>
        <span className="font-mono-tabular font-medium">{valueText}</span>
        <span className="text-slate-500 dark:text-slate-400">({label})</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Verification source details"
          className="absolute left-0 top-full mt-1.5 z-30 w-64 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-xs text-slate-700 dark:text-slate-200"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">
              {icon} {label} ({type === 'price' ? 'Price' : 'Opening Hours'})
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close verification tooltip"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
          {confidence.verifiedAt && (
            <p className="text-slate-500 dark:text-slate-400 font-mono-tabular mb-1">
              Checked on {confidence.verifiedAt}
            </p>
          )}
          {confidence.notes && <p className="mb-1.5">{confidence.notes}</p>}
          {confidence.sourceUrl ? (
            <a
              href={confidence.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-700 dark:text-teal-400 font-medium underline break-all"
            >
              Official source link ↗
            </a>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">
              AI estimate (~) — always confirm before booking.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
