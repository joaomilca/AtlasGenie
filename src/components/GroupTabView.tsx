import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FullTripBundle, Traveler, VoteValue } from '../types/models';
import { computeGroupFairness, normalizeTravelersList } from '../utils/domainLogic';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';
import { requestAiProposals } from '../services/api';

interface AddTravelerProfileFormProps {
  onAddMember: (payload: Omit<Traveler, 'id' | 'tripId' | 'ownerId'>) => Promise<void>;
}

/**
 * Isolated memoized child form component so keystrokes in "Add Traveler"
 * never re-render the parent GroupTabView or TripWorkspacePage.
 */
const AddTravelerProfileForm = React.memo<AddTravelerProfileFormProps>(({ onAddMember }) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [newInterests, setNewInterests] = useState('food, culture');
  const [newBudget, setNewBudget] = useState(350);
  const [newConstraints, setNewConstraints] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName || submitting) return;
    setSubmitting(true);
    try {
      await onAddMember({
        userId: `guest-${Date.now()}`,
        displayName: cleanName,
        interests: newInterests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        budgetPerPerson: Number(newBudget) || 350,
        constraints: newConstraints.trim() || 'None',
        preferredPace: 3,
        color: '#0D9488',
        avatar: (cleanName[0] || 'T').toUpperCase(),
      });
      setNewName('');
      setNewConstraints('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
      <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
        {t('group.addMember')}
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          type="text"
          required
          data-testid="add-traveler-name-input"
          placeholder={t('group.namePlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
        />
        <input
          type="text"
          placeholder={t('group.interestsPlaceholder')}
          value={newInterests}
          onChange={(e) => setNewInterests(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
        />
        <input
          type="number"
          placeholder={t('group.budgetPlaceholder')}
          value={newBudget}
          onChange={(e) => setNewBudget(Number(e.target.value))}
          className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
        >
          + {t('group.addMember')}
        </button>
      </form>
    </section>
  );
});

AddTravelerProfileForm.displayName = 'AddTravelerProfileForm';

interface GroupTabViewProps {
  bundle: FullTripBundle;
}

export const GroupTabView: React.FC<GroupTabViewProps> = ({ bundle }) => {
  const { t } = useTranslation();
  const { language } = useI18n();
  const {
    activeTravelerIdByTrip,
    setActiveTravelerId,
    castVote,
    addTraveler,
    addProposals,
    showToast,
  } = useAtlas();

  const liveDays = useMemo(() => (Array.isArray(bundle?.days) ? bundle.days : []), [bundle?.days]);
  const liveTravelers = useMemo(
    () =>
      normalizeTravelersList(bundle?.travelers, undefined, {
        tripId: bundle?.trip?.id,
        ownerId: bundle?.trip?.ownerId,
        defaultInterests: bundle?.trip?.interests,
        totalBudget: bundle?.trip?.totalBudget,
        travelersCount: bundle?.trip?.travelersCount,
      }),
    [
      bundle?.travelers,
      bundle?.trip?.id,
      bundle?.trip?.interests,
      bundle?.trip?.ownerId,
      bundle?.trip?.totalBudget,
      bundle?.trip?.travelersCount,
    ]
  );

  const tripId = bundle?.trip?.id || '';
  const activeTravelerId =
    (tripId ? activeTravelerIdByTrip[tripId] : undefined) || liveTravelers[0]?.id || '';

  const [loadingCompromise, setLoadingCompromise] = useState(false);

  const fairness = useMemo(
    () => computeGroupFairness(liveDays, liveTravelers),
    [liveDays, liveTravelers]
  );

  const handleCopyInvite = useCallback(() => {
    const inviteCode = bundle?.trip?.inviteCode || '';
    const url = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    showToast(`${t('group.copyInvite')}: ${url}`);
  }, [bundle?.trip?.inviteCode, showToast, t]);

  const handleAddMember = useCallback(
    async (travelerInput: Omit<Traveler, 'id' | 'tripId' | 'ownerId'>) => {
      if (!tripId) return;
      await addTraveler(tripId, travelerInput);
    },
    [addTraveler, tripId]
  );

  const handleGenerateCompromise = useCallback(async () => {
    const dayWithDisagreement =
      liveDays.find((d) =>
        (d?.activities || []).some((a) => Object.values(a?.votes || {}).includes('down'))
      ) || liveDays[0];
    if (!dayWithDisagreement || !tripId) return;

    setLoadingCompromise(true);
    try {
      const res = await requestAiProposals({
        taskType: 'compromise',
        destination: bundle?.trip?.destination || '',
        message: 'Resolve group downvotes and balance Fairness Meter',
        currentDay: dayWithDisagreement,
        travelers: liveTravelers,
        language,
        uiLanguage: language === 'pt' ? 'pt-PT' : 'en',
        itinerary: bundle,
      });
      addProposals(tripId, res.proposals || []);
      showToast(t('diff.bannerTitle'));
    } finally {
      setLoadingCompromise(false);
    }
  }, [addProposals, bundle, language, liveDays, liveTravelers, showToast, t, tripId]);

  const waitingMessage =
    language === 'en' ? 'Waiting for traveler data...' : 'A aguardar dados dos viajantes...';

  return (
    <div className="space-y-8">
      {/* Group Invite Header & Active Voter Switcher */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif-atlas text-xl md:text-2xl font-bold text-slate-900 dark:text-white break-words">
            {t('group.title')}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 break-words">
            {t('group.inviteCode')}:{' '}
            <strong className="font-mono-tabular text-amber-700 dark:text-amber-400">
              {bundle?.trip?.inviteCode || '—'}
            </strong>{' '}
            · {t('group.shareNote')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {liveTravelers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">{t('group.votingAs')}</span>
              {liveTravelers.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => setActiveTravelerId(tripId, tr.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    activeTravelerId === tr.id
                      ? 'bg-[#0F172A] text-white dark:bg-amber-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tr?.displayName || 'Traveler'}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {t('group.copyInvite')}
          </button>
        </div>
      </section>

      {/* Fairness Meter & Plain-Language Trade-offs */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white break-words">
              {t('group.fairnessTitle')} — {t('group.overallBalance')}{' '}
              {Number(fairness?.overallFairnessIndex) || 0}%
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('group.fairnessSub')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateCompromise}
            disabled={loadingCompromise || liveTravelers.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loadingCompromise ? t('group.consulting') : t('group.compromiseBtn')}
          </button>
        </div>

        {liveTravelers.length === 0 ? (
          <div
            data-testid="waiting-traveler-data"
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500 dark:text-slate-400"
          >
            {waitingMessage}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(fairness?.perPerson || []).map((person) => {
              const safeScore = Number(person?.overallScore) || 0;
              const perDayEntries = Object.entries(person?.perDayScore || {});
              return (
                <div
                  key={person?.travelerId || person?.displayName}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2 bg-[#FAF6F0]/50 dark:bg-slate-950/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {person?.displayName || 'Traveler'}
                    </span>
                    <span className="font-mono-tabular text-xs font-semibold text-teal-700 dark:text-teal-400">
                      {safeScore}% {t('group.matched')}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(0, safeScore))}%` }}
                      className="h-full bg-teal-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono-tabular">
                    {perDayEntries
                      .map(([d, sc]) => `D${d}: ${Number(sc) || 0}%`)
                      .join(' · ')}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {(fairness?.tradeOffExplanations || []).length > 0 && (
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            {(fairness?.tradeOffExplanations || []).map((line, i) => (
              <p key={i}>⚖️ {line}</p>
            ))}
          </div>
        )}
      </section>

      {/* Group Activity Voting Table */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
          {t('group.liveVotingTitle')}
        </h3>
        {liveTravelers.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{waitingMessage}</p>
        ) : (
          <div className="space-y-4">
            {liveDays.map((day) => (
              <div key={day?.id || day?.dayNumber} className="space-y-2">
                <p className="text-xs font-mono-tabular font-semibold uppercase text-slate-500">
                  {t('trip.dayWord')} {day?.dayNumber || 1} · {day?.theme || ''}
                </p>
                <div className="space-y-2">
                  {(day?.activities || []).map((act) => {
                    const votes = act?.votes || {};
                    const downCount = Object.values(votes).filter((v) => v === 'down').length;
                    const needsDiscussion = downCount >= 1;
                    const myVote = activeTravelerId ? votes[activeTravelerId] : undefined;

                    return (
                      <div
                        key={act?.id || act?.title}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{act?.title || ''}</span>
                            {needsDiscussion && (
                              <span className="text-xs font-mono-tabular font-semibold text-rose-700 dark:text-rose-400">
                                · ⚠️ {t('trip.needsDiscussion')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {liveTravelers
                              .map((tr) => {
                                const v = votes[tr.id] || (tr.userId ? votes[tr.userId] : undefined);
                                const icon =
                                  v === 'up'
                                    ? '👍'
                                    : v === 'down'
                                    ? '👎'
                                    : v === 'neutral'
                                    ? '😐'
                                    : '—';
                                return `${tr?.displayName || 'Traveler'}: ${icon}`;
                              })
                              .join(' · ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(['up', 'neutral', 'down'] as VoteValue[]).map((val) => (
                            <button
                              key={val}
                              type="button"
                              disabled={!activeTravelerId}
                              onClick={() =>
                                activeTravelerId &&
                                castVote(tripId, day.id, act.id, activeTravelerId, val)
                              }
                              aria-label={`Vote ${val} ${act?.title || ''}`}
                              className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                                myVote === val
                                  ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {val === 'up' ? '👍' : val === 'neutral' ? '😐' : '👎'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Isolated Add Traveler Profile Form */}
      <AddTravelerProfileForm onAddMember={handleAddMember} />
    </div>
  );
};

