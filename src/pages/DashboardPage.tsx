import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';
import { computeReliabilitySummary } from '../utils/domainLogic';
import { FullTripBundle } from '../types/models';

export const DashboardPage: React.FC = () => {
  const { trips, deleteTrip, duplicateTrip } = useAtlas();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [joinCodeInput, setJoinCodeInput] = useState('');

  const allBundles = Object.values(trips) as FullTripBundle[];
  const customTrips = allBundles.filter((b) => !b.trip.isDemo);
  const demoTrips = allBundles.filter((b) => b.trip.isDemo);

  const getCountdownText = (startDate: string) => {
    const now = new Date();
    const start = new Date(startDate);
    const diff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) return `${diff} ${t('dash.daysUntil')}`;
    return t('dash.departed');
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    navigate(`/join/${encodeURIComponent(joinCodeInput.trim().toUpperCase())}`);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-12">
      {/* Header & Join by Invite Code */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="font-serif-atlas text-3xl font-bold text-slate-900 dark:text-white">
            {t('dash.title')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('dash.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleJoinSubmit} className="flex items-center gap-2">
            <label htmlFor="join-code-input" className="sr-only">
              Invite Code
            </label>
            <input
              id="join-code-input"
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Invite code (e.g. LISBOA26)"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Join Group
            </button>
          </form>

          <Link
            to="/trips/new"
            className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap"
          >
            + {t('dash.createBtn')}
          </Link>
        </div>
      </div>

      {/* Custom Saved Trips or Designed Empty State */}
      <section className="space-y-4">
        <h2 className="font-serif-atlas text-xl font-semibold text-slate-900 dark:text-white">
          {t('nav.dashboard')} ({customTrips.length})
        </h2>

        {customTrips.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-4">
            <svg viewBox="0 0 180 60" className="w-40 h-14 mx-auto">
              <path
                d="M15,45 Q60,10 95,35 T165,15"
                fill="none"
                stroke="#D97706"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />
              <circle cx="15" cy="45" r="5" fill="#0D9488" />
              <circle cx="95" cy="35" r="5" fill="#D97706" />
              <circle cx="165" cy="15" r="5" fill="#0D9488" />
            </svg>
            <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
              {t('dash.emptyTitle')}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              {t('dash.emptyDesc')}
            </p>
            <div className="pt-1">
              <Link
                to="/trips/new"
                className="inline-block px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {t('dash.createBtn')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customTrips.map((bundle) => {
              const rel = computeReliabilitySummary(bundle.days);
              return (
                <article
                  key={bundle.trip.id}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500">
                      <span>{getCountdownText(bundle.trip.startDate)}</span>
                      <span>Status: {bundle.trip.status}</span>
                    </div>
                    <h3 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                      {bundle.trip.destination}
                    </h3>
                    <p className="text-xs font-mono-tabular text-slate-500">
                      {bundle.trip.startDate} → {bundle.trip.endDate} · €{bundle.trip.totalBudget}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      🟢 {rel.verifiedPercent}% Verified · {bundle.days.length} Days · Invite:{' '}
                      <span className="font-mono-tabular font-semibold">{bundle.trip.inviteCode}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                      className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      {t('dash.openTrip')}
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateTrip(bundle.trip.id)}
                      aria-label={`Duplicate ${bundle.trip.destination}`}
                      className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200"
                    >
                      {t('dash.duplicate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTrip(bundle.trip.id)}
                      aria-label={`Delete ${bundle.trip.destination}`}
                      className="py-2 px-3 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 rounded-lg hover:bg-rose-100"
                    >
                      {t('dash.delete')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Pre-Built Demo Trips Section */}
      <section className="space-y-4">
        <h2 className="font-serif-atlas text-xl font-semibold text-slate-900 dark:text-white">
          {t('dash.demoSectionTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {demoTrips.map((bundle) => {
            const rel = computeReliabilitySummary(bundle.days);
            return (
              <article
                key={bundle.trip.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500">
                    <span>{getCountdownText(bundle.trip.startDate)}</span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      🟢 {rel.verifiedPercent}% Verified
                    </span>
                  </div>
                  <h3 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                    {bundle.trip.destination} ({bundle.days.length}d)
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {bundle.travelers.length} Travellers · €{bundle.trip.totalBudget} Budget · Invite{' '}
                    <span className="font-mono-tabular font-semibold">{bundle.trip.inviteCode}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    {t('dash.openTrip')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const newId = await duplicateTrip(bundle.trip.id);
                      navigate(`/trips/${newId}`);
                    }}
                    className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200"
                  >
                    {t('dash.duplicate')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};
