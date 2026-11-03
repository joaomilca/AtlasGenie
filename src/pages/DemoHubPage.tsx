import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_TRIPS } from '../data/demoTrips';
import { computeReliabilitySummary } from '../utils/domainLogic';
import { useI18n } from '../i18n/I18nContext';

export const DemoHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-mono-tabular uppercase text-amber-700 dark:text-amber-400">
            Instant Interactive Sandbox · Zero Sign-Up Required
          </p>
          <h1 className="font-serif-atlas text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mt-1">
            {t('hero.demoSamplesTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
            Every sample trip includes verified &amp; estimated badges, pre-generated budget tiers, tourist-trap local alternatives, rainy-day Plan B schedules, and a live group with votes and shared expenses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/trips/new')}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {t('dash.createBtn')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.values(DEMO_TRIPS).map((bundle) => {
          const reliability = computeReliabilitySummary(bundle.days);
          return (
            <article
              key={bundle.trip.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  <span>
                    {bundle.trip.startDate} → {bundle.trip.endDate}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    🟢 {reliability.verifiedPercent}% Verified
                  </span>
                </div>

                <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                  {bundle.trip.destination} ({bundle.days.length} Days)
                </h2>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Interests: {bundle.trip.interests.join(' · ')}
                </p>

                <div className="pt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    <strong className="text-slate-900 dark:text-white">Group Travellers:</strong>{' '}
                    {bundle.travelers.map((tr) => `${tr.displayName} (€${tr.budgetPerPerson})`).join(', ')}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-white">Total Budget:</strong> €
                    {bundle.trip.totalBudget} · {bundle.expenses.length} logged expenses
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                  className="col-span-2 py-2.5 px-4 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors"
                >
                  Explore Itinerary &amp; Map
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}/budget`)}
                  className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  What-If Budget
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}/group`)}
                  className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Group &amp; Votes
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
};
