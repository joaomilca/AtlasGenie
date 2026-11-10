import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
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

      <div className="mt-3 space-y-2.5">
        {proposals.map((prop) => {
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
              className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${toneClasses}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono-tabular font-semibold">
                  <span>{badgeLabel}</span>
                  <span>·</span>
                  <span>
                    {t('trip.dayWord')} {prop.dayNumber}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">{displayTitle}</h3>
                <p className="text-xs opacity-90">{prop.reason}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
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
