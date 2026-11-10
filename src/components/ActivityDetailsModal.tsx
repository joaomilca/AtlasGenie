import React, { useEffect, useMemo } from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../i18n/I18nContext';
import { Activity, BudgetTier, ProposalChange } from '../types/models';
import { buildActivityExtendedDetails } from '../utils/domainLogic';
import { TrustBadge } from './TrustBadge';

export interface ActivityDetailsModalProps {
  isOpen: boolean;
  activity?: Activity | null;
  proposal?: ProposalChange | null;
  onClose: () => void;
  onAcceptProposal?: (proposalId: string) => void;
  onRejectProposal?: (proposalId: string) => void;
  onEscapeCrowds?: (activity: Activity) => void;
}

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({
  isOpen,
  activity,
  proposal,
  onClose,
  onAcceptProposal,
  onRejectProposal,
  onEscapeCrowds,
}) => {
  const { t } = useTranslation();
  const { language } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const targetActivity = activity || proposal?.payload || undefined;
  const details = useMemo(
    () => buildActivityExtendedDetails(targetActivity, proposal || undefined, language),
    [targetActivity, proposal, language]
  );

  if (!isOpen || (!activity && !proposal)) return null;

  const isProposalView = Boolean(proposal);
  const getTierLabel = (tier: BudgetTier) => {
    if (tier === 'budget') return t('trip.tierBudget');
    if (tier === 'mid') return t('trip.tierMid');
    return t('trip.tierPremium');
  };

  return (
    <div
      data-testid="activity-details-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-details-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Modal Header (matching LoginModal styling) */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-mono-tabular uppercase tracking-widest text-amber-700 dark:text-amber-400">
              {isProposalView ? t('details.kickerProposal') : t('details.kickerActivity')}
            </p>
            <h2
              id="activity-details-modal-title"
              className="font-serif-atlas text-xl font-bold text-slate-900 dark:text-white mt-0.5"
            >
              {details.title}
            </h2>
            {details.subtitle && (
              <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 mt-1">
                {details.subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('details.closeAria')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Proposed Change Diff Banner (when opened from DiffReviewBanner) */}
        {details.proposalSummary && (
          <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-950 dark:text-amber-200 font-medium">
            {details.proposalSummary}
          </div>
        )}

        {/* Section 1: Extended Context & Overview */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-mono-tabular font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('details.overviewTitle')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {details.extendedOverview}
          </p>

          {targetActivity && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              <TrustBadge
                type="price"
                confidence={targetActivity.priceConfidence}
                valueText={`${
                  targetActivity.priceConfidence.status === 'verified' ? '' : '~'
                }${targetActivity.costOptions[targetActivity.selectedTier].estimatedCost}€ (${
                  targetActivity.costOptions[targetActivity.selectedTier].title
                })`}
              />
              <TrustBadge
                type="hours"
                confidence={targetActivity.hoursConfidence}
                valueText={targetActivity.openingHoursText || '09:30 – 18:00'}
              />
            </div>
          )}
        </div>

        {/* Section 2: AI Selection Reasoning & Cost Tiers */}
        <div className="p-4 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D97706] shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              {t('details.aiReasoningTitle')}
            </h3>
          </div>
          <p className="text-xs text-teal-900 dark:text-teal-200 leading-relaxed">
            {details.aiReasoning}
          </p>

          {targetActivity && targetActivity.costOptions && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
              <p className="text-[11px] font-mono-tabular font-semibold text-slate-500 dark:text-slate-400">
                {t('details.tiersTitle')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => {
                  const opt = targetActivity.costOptions[tier];
                  const isActive = targetActivity.selectedTier === tier;
                  return (
                    <div
                      key={tier}
                      className={`p-2.5 rounded-lg border text-xs ${
                        isActive
                          ? 'bg-white dark:bg-slate-900 border-amber-400 dark:border-amber-500'
                          : 'bg-white/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        <span className="capitalize">{getTierLabel(tier)}</span>
                        <span>€{opt.estimatedCost}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {opt.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Specific Tips & Warnings */}
        {details.tipsAndWarnings.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-mono-tabular font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('details.tipsWarningsTitle')}
            </h3>
            <div className="space-y-2">
              {details.tipsAndWarnings.map((tip) => {
                const isWarn = tip.level === 'warning';
                const isVerified = tip.level === 'verified';
                return (
                  <div
                    key={tip.id}
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      isWarn
                        ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                        : isVerified
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {isWarn ? (
                      <AlertTriangle
                        className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : isVerified ? (
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <Info
                        className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-semibold">{tip.title}</p>
                      <p className="opacity-90 leading-relaxed">{tip.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {proposal && onAcceptProposal && (
              <button
                type="button"
                data-testid="activity-details-accept-btn"
                onClick={() => {
                  onAcceptProposal(proposal.id);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('details.acceptProposalBtn')}
              </button>
            )}
            {proposal && onRejectProposal && (
              <button
                type="button"
                data-testid="activity-details-reject-btn"
                onClick={() => {
                  onRejectProposal(proposal.id);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-slate-800 border border-rose-200 dark:border-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('details.rejectProposalBtn')}
              </button>
            )}
            {!proposal &&
              targetActivity &&
              targetActivity.touristTrapScore >= 70 &&
              onEscapeCrowds && (
                <button
                  type="button"
                  onClick={() => {
                    onEscapeCrowds(targetActivity);
                    onClose();
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <span aria-hidden="true">🧭 </span>
                  {t('trip.escapeCrowds')} ({targetActivity.touristTrapScore}/100)
                </button>
              )}
          </div>

          <button
            type="button"
            data-testid="activity-details-close-btn"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ml-auto"
          >
            {t('details.closeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ActivityDetailsModal);
