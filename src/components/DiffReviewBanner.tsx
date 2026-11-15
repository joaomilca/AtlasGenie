import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { ProposalChange } from '../types/models';

interface DiffReviewBannerProps {
  proposals: ProposalChange[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onOpenDetails?: (proposal: ProposalChange) => void;
}

export const DiffReviewBanner: React.FC<DiffReviewBannerProps> = ({
  proposals,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onOpenDetails,
}) => {
  const { t } = useTranslation();
  useI18n();

  if (proposals.length === 0) return null;

  return (
    <section
      aria-label={t('diff.bannerTitle')}
      className="mb-6 rounded-xl bg-amber-50/90 dark:bg-slate-900 border border-amber-300 dark:border-amber-700/70 p-4 sm:p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200 dark:border-slate-800">
        <div>
          <h2 className="font-serif-atlas text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('diff.bannerTitle')} ({proposals.length})
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">{t('diff.bannerSub')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAcceptAll}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('diff.acceptAll')}
          </button>
          <button
            type="button"
            onClick={onRejectAll}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('diff.rejectAll')}
          </button>
        </div>
      </div>

      <div
        data-testid="diff-proposals-grid"
        className={`mt-3 ${
          proposals.length > 1
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch'
            : 'space-y-2.5'
        }`}
      >
        {proposals.map((prop, index) => {
          const isAdd = prop.type === 'add';
          const isRemove = prop.type === 'remove';
          const isReplaceAccommodation = prop.type === 'replace_accommodation';
          const toneClasses = isAdd
            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
            : isRemove
            ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200'
            : 'bg-amber-100/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200';

          const badgeLabel = isAdd
            ? t('diff.addBadge')
            : isRemove
            ? t('diff.removeBadge')
            : isReplaceAccommodation
            ? t('logistics.swapStayBadge')
            : t('diff.replaceBadge');

          const activeTier = prop.payload?.selectedTier || 'mid';
          const optionEstimatedCost =
            prop.payload?.costOptions?.[activeTier]?.estimatedCost ??
            prop.payload?.costOptions?.mid?.estimatedCost ??
            prop.accommodationPayload?.price;

          const displayTitle =
            isReplaceAccommodation && prop.accommodationPayload
              ? t('logistics.swapStayText', {
                  from: prop.targetAccommodationName || 'Current Stay',
                  to: prop.accommodationPayload.name,
                  price: prop.accommodationPayload.price,
                })
              : prop.type === 'replace' && prop.targetActivityTitle && prop.payload
              ? t('diff.swapText', {
                  from: prop.targetActivityTitle,
                  to: prop.payload.title,
                })
              : prop.type === 'remove'
              ? t('diff.removeText', { title: prop.targetActivityTitle })
              : prop.payload?.title || prop.targetActivityTitle || prop.accommodationPayload?.name || '';

          return (
            <div
              key={prop.id}
              data-testid={`proposal-row-${prop.id}`}
              className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 h-full ${toneClasses}`}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular font-semibold">
                  <div className="flex items-center gap-1.5">
                    {proposals.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 text-[10px] font-bold">
                        #{index + 1}
                      </span>
                    )}
                    <span>{badgeLabel}</span>
                    <span>·</span>
                    <span>
                      {t('trip.dayWord')} {prop.dayNumber}
                    </span>
                  </div>
                  {typeof optionEstimatedCost === 'number' && (
                    <span
                      data-testid={`proposal-price-${prop.id}`}
                      className="px-2 py-0.5 rounded-md bg-white/85 dark:bg-slate-900/80 border border-amber-300/80 dark:border-amber-700/80 text-xs font-mono-tabular font-bold"
                    >
                      {optionEstimatedCost}€
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold break-words leading-snug">{displayTitle}</h3>
                <p className="text-xs opacity-90 break-words leading-relaxed">{prop.reason}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1">
                {onOpenDetails && (
                  <button
                    type="button"
                    data-testid={`read-more-prop-${prop.id}`}
                    aria-label={t('diff.readMoreAria', {
                      title:
                        prop.payload?.title ||
                        prop.accommodationPayload?.name ||
                        prop.targetActivityTitle ||
                        '',
                    })}
                    onClick={() => onOpenDetails(prop)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <Info className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
                    <span>{t('diff.readMoreBtn')}</span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`accept-prop-${prop.id}`}
                  onClick={() => onAccept(prop.id)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {t('diff.accept')}
                </button>
                <button
                  type="button"
                  data-testid={`reject-prop-${prop.id}`}
                  onClick={() => onReject(prop.id)}
                  className="px-3 py-1.5 text-xs font-medium text-rose-800 dark:text-rose-200 bg-white/80 dark:bg-slate-800 border border-rose-300 dark:border-rose-700 hover:bg-rose-100 rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {t('diff.reject')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default React.memo(DiffReviewBanner);
