import React, { useMemo, useState } from 'react';
import { FullTripBundle, VoteValue } from '../types/models';
import { computeGroupFairness } from '../utils/domainLogic';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { requestAiProposals } from '../services/api';

interface GroupTabViewProps {
  bundle: FullTripBundle;
}

export const GroupTabView: React.FC<GroupTabViewProps> = ({ bundle }) => {
  const { t } = useI18n();
  const {
    activeTravelerIdByTrip,
    setActiveTravelerId,
    castVote,
    addTraveler,
    addProposals,
    showToast,
  } = useAtlas();

  const activeTravelerId =
    activeTravelerIdByTrip[bundle.trip.id] || bundle.travelers[0]?.id || 'ana';

  const [newName, setNewName] = useState('');
  const [newInterests, setNewInterests] = useState('food, culture');
  const [newBudget, setNewBudget] = useState(350);
  const [newConstraints, setNewConstraints] = useState('');
  const [loadingCompromise, setLoadingCompromise] = useState(false);

  const fairness = useMemo(
    () => computeGroupFairness(bundle.days, bundle.travelers),
    [bundle.days, bundle.travelers]
  );

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/join/${bundle.trip.inviteCode}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    showToast(`Copied invite link: ${url}`);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await addTraveler(bundle.trip.id, {
      userId: `guest-${Date.now()}`,
      displayName: newName.trim(),
      interests: newInterests
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      budgetPerPerson: Number(newBudget) || 350,
      constraints: newConstraints.trim() || 'None',
      preferredPace: 3,
      color: '#0D9488',
      avatar: newName.trim()[0].toUpperCase(),
    });
    setNewName('');
    setNewConstraints('');
  };

  const handleGenerateCompromise = async () => {
    const dayWithDisagreement =
      bundle.days.find((d) =>
        d.activities.some((a) => Object.values(a.votes || {}).includes('down'))
      ) || bundle.days[0];
    if (!dayWithDisagreement) return;

    setLoadingCompromise(true);
    try {
      const res = await requestAiProposals({
        taskType: 'compromise',
        destination: bundle.trip.destination,
        message: 'Resolve group downvotes and balance Fairness Meter',
        currentDay: dayWithDisagreement,
        travelers: bundle.travelers,
      });
      addProposals(bundle.trip.id, res.proposals);
      showToast('AI Compromise proposal added to the diff review bar above!');
    } finally {
      setLoadingCompromise(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Group Invite Header & Active Voter Switcher */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
            {t('group.title')}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('group.inviteCode')}:{' '}
            <strong className="font-mono-tabular text-amber-700 dark:text-amber-400">
              {bundle.trip.inviteCode}
            </strong>{' '}
            · Share with friends to join as a guest or registered user.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Voting as:</span>
            {bundle.travelers.map((tr) => (
              <button
                key={tr.id}
                type="button"
                onClick={() => setActiveTravelerId(bundle.trip.id, tr.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  activeTravelerId === tr.id
                    ? 'bg-[#0F172A] text-white dark:bg-amber-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {tr.displayName}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-600 rounded-lg transition-colors whitespace-nowrap"
          >
            {t('group.copyInvite')}
          </button>
        </div>
      </section>

      {/* Fairness Meter & Plain-Language Trade-offs */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
              {t('group.fairnessTitle')} — Overall Balance: {fairness.overallFairnessIndex}%
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Measures how well each person’s stated interests and budgets are served across days.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateCompromise}
            disabled={loadingCompromise}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {loadingCompromise ? 'Consulting the Atlas…' : t('group.compromiseBtn')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fairness.perPerson.map((person) => (
            <div
              key={person.travelerId}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2 bg-[#FAF6F0]/50 dark:bg-slate-950/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{person.displayName}</span>
                <span className="font-mono-tabular text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {person.overallScore}% matched
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${person.overallScore}%` }}
                  className="h-full bg-teal-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                {Object.entries(person.perDayScore)
                  .map(([d, sc]) => `D${d}: ${sc}%`)
                  .join(' · ')}
              </p>
            </div>
          ))}
        </div>

        {fairness.tradeOffExplanations.length > 0 && (
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            {fairness.tradeOffExplanations.map((line, i) => (
              <p key={i}>⚖️ {line}</p>
            ))}
          </div>
        )}
      </section>

      {/* Group Activity Voting Table */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
          Live Activity Voting (👍 / 😐 / 👎)
        </h3>
        <div className="space-y-4">
          {bundle.days.map((day) => (
            <div key={day.id} className="space-y-2">
              <p className="text-xs font-mono-tabular font-semibold uppercase text-slate-500">
                Day {day.dayNumber} · {day.theme}
              </p>
              <div className="space-y-2">
                {day.activities.map((act) => {
                  const votes = act.votes || {};
                  const downCount = Object.values(votes).filter((v) => v === 'down').length;
                  const needsDiscussion = downCount >= 1;
                  const myVote = votes[activeTravelerId];

                  return (
                    <div
                      key={act.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{act.title}</span>
                          {needsDiscussion && (
                            <span className="text-xs font-mono-tabular font-semibold text-rose-700 dark:text-rose-400">
                              · ⚠️ {t('trip.needsDiscussion')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {bundle.travelers
                            .map((tr) => {
                              const v = votes[tr.id];
                              const icon = v === 'up' ? '👍' : v === 'down' ? '👎' : v === 'neutral' ? '😐' : '—';
                              return `${tr.displayName}: ${icon}`;
                            })
                            .join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {(['up', 'neutral', 'down'] as VoteValue[]).map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              castVote(bundle.trip.id, day.id, act.id, activeTravelerId, val)
                            }
                            aria-label={`Vote ${val} on ${act.title}`}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
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
      </section>

      {/* Add Traveler Profile Form */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
          {t('group.addMember')}
        </h3>
        <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            required
            placeholder="Name (e.g. Tiago)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
          <input
            type="text"
            placeholder="Interests (food, art...)"
            value={newInterests}
            onChange={(e) => setNewInterests(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
          <input
            type="number"
            placeholder="Personal Budget (€)"
            value={newBudget}
            onChange={(e) => setNewBudget(Number(e.target.value))}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors"
          >
            + {t('group.addMember')}
          </button>
        </form>
      </section>
    </div>
  );
};
