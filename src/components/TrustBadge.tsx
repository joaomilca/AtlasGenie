import React, { useState, useId } from 'react';
import { ExternalLink, CheckCircle2, Sparkles, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfidenceInfo } from '../types/models';

interface TrustBadgeProps {
  type: 'price' | 'hours';
  confidence: ConfidenceInfo;
  valueText: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ type, confidence, valueText }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  const isVerified = confidence.status === 'verified';
  const isEstimated = confidence.status === 'estimated';

  const icon = isVerified ? '🟢' : isEstimated ? '🟡' : '⚪';

  const label = isVerified
    ? t('trip.verified')
    : isEstimated
    ? t('trip.estimated')
    : t('trip.toConfirm');

  const srConfidenceStatus = isVerified
    ? 'Verified Source'
    : isEstimated
    ? 'AI Estimated'
    : 'To Confirm';

  const badgeStyle = isVerified
    ? 'bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100/80'
    : isEstimated
    ? 'bg-amber-50/90 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-100/80'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200';

  const typeLabel = type === 'price' ? t('trust.price') : t('trust.hours');

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={popoverId}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${badgeStyle}`}
      >
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">
          {srConfidenceStatus} ({typeLabel}):{' '}
        </span>
        <span className="font-mono-tabular font-semibold">{valueText}</span>
        <span className="text-[11px] opacity-85 font-medium">· {label}</span>
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={`${srConfidenceStatus} — ${typeLabel}`}
          className="absolute left-0 top-full mt-1.5 z-30 w-72 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs text-slate-700 dark:text-slate-200 space-y-2"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="font-semibold flex items-center gap-1.5">
              {isVerified ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ) : isEstimated ? (
                <Sparkles className="w-4 h-4 text-amber-600" aria-hidden="true" />
              ) : (
                <HelpCircle className="w-4 h-4 text-slate-500" aria-hidden="true" />
              )}
              <span className="sr-only">{srConfidenceStatus}: </span>
              <span>
                <span aria-hidden="true">{icon}</span> {label} ({typeLabel})
              </span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('support.closeAria')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {confidence.verifiedAt && (
            <p className="text-slate-500 dark:text-slate-400 font-mono-tabular text-[11px]">
              {t('trust.verifiedOn', { date: confidence.verifiedAt })}
            </p>
          )}
          {confidence.notes && <p className="leading-relaxed">{confidence.notes}</p>}
          {confidence.sourceUrl ? (
            <a
              href={confidence.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold underline break-all rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span>{t('trust.officialLink')}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-amber-700 dark:text-amber-400 text-[11px] font-medium">
              {t('trust.estimateNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
