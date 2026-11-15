import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAtlas } from '../context/AtlasContext';

export const JoinTripPage: React.FC = () => {
  const { inviteCode = 'LISBOA26' } = useParams<{ inviteCode: string }>();
  const { findTripByInviteCode, addTraveler } = useAtlas();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const bundle = findTripByInviteCode(inviteCode);

  const [displayName, setDisplayName] = useState('');
  const [interests, setInterests] = useState('food, history, viewpoints');
  const [budgetPerPerson, setBudgetPerPerson] = useState(350);
  const [constraints, setConstraints] = useState('');
  const [preferredPace, setPreferredPace] = useState(3);

  if (!bundle) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-serif-atlas text-2xl font-bold">{t('join.notFoundTitle')}</h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t('join.notFoundSub', { code: inviteCode })}
        </p>
        <button
          type="button"
          onClick={() => navigate('/demo')}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] rounded-lg cursor-pointer"
        >
          {t('join.browseDemosBtn')}
        </button>
      </main>
    );
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    await addTraveler(bundle.trip.id, {
      userId: `guest-${Date.now()}`,
      displayName: displayName.trim(),
      interests: interests
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      budgetPerPerson: Number(budgetPerPerson) || 350,
      constraints: constraints.trim() || 'None',
      preferredPace,
      color: '#0D9488',
      avatar: displayName.trim()[0].toUpperCase(),
    });
    navigate(`/trips/${bundle.trip.id}/group`);
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <form
        onSubmit={handleJoin}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5"
      >
        <div>
          <p className="text-xs font-mono-tabular uppercase text-amber-700 dark:text-amber-400">
            {t('group.inviteCode')} · {bundle.trip.inviteCode}
          </p>
          <h1 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {t('join.title', { destination: bundle.trip.destination })}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('join.subtitle')}
          </p>
        </div>

        <div>
          <label htmlFor="join-name" className="block text-xs font-medium mb-1">
            {t('join.yourName')}
          </label>
          <input
            id="join-name"
            type="text"
            required
            placeholder={t('join.namePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <div>
          <label htmlFor="join-interests" className="block text-xs font-medium mb-1">
            {t('join.interestsLabel')}
          </label>
          <input
            id="join-interests"
            type="text"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="join-budget" className="block text-xs font-medium mb-1">
              {t('group.budgetPlaceholder')}
            </label>
            <input
              id="join-budget"
              type="number"
              min={50}
              value={budgetPerPerson}
              onChange={(e) => setBudgetPerPerson(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="join-pace" className="block text-xs font-medium mb-1">
              {t('join.paceLabel')}
            </label>
            <input
              id="join-pace"
              type="number"
              min={1}
              max={5}
              value={preferredPace}
              onChange={(e) => setPreferredPace(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
            />
          </div>
        </div>

        <div>
          <label htmlFor="join-constraints" className="block text-xs font-medium mb-1">
            {t('join.constraintsLabel')}
          </label>
          <input
            id="join-constraints"
            type="text"
            placeholder={t('join.constraintsPlaceholder')}
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer"
        >
          {t('join.submitBtn')}
        </button>
      </form>
    </main>
  );
};
