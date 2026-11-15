import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEMO_TRIPS, getLocalizedDemoTripMeta } from '../data/demoTrips';
import { computeReliabilitySummary } from '../utils/domainLogic';

export const DemoHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <main className="max-w-7xl mx-auto px-0 md:px-8 py-6 md:py-10 space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-mono-tabular uppercase text-amber-700 dark:text-amber-400">
            {t('demo.kicker')}
          </p>
          <h1 className="font-serif-atlas text-xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mt-1">
            {t('hero.demoSamplesTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
            {t('demo.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/trips/new')}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {t('dash.createBtn')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.values(DEMO_TRIPS).map((bundle) => {
          const reliability = computeReliabilitySummary(bundle.days);
          const meta = getLocalizedDemoTripMeta(bundle, t);
          return (
            <article
              key={bundle.trip.id}
              data-testid={`demo-hub-card-${bundle.trip.id}`}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  <span>
                    {bundle.trip.startDate} → {bundle.trip.endDate}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span aria-hidden="true">🟢 </span>
                    <span className="sr-only">Verified Source: </span>
                    {reliability.verifiedPercent}% {t('trip.verified')}
                  </span>
                </div>

                <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                  {meta.locationTitle} ({bundle.days.length} {t('hero.days')})
                </h2>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('hero.sampleCardDesc', { theme: meta.theme })}
                </p>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t('demo.interests')}{' '}
                  {bundle.trip.interests
                    .map((intKey) => t(`interest.${intKey}`, { defaultValue: intKey }))
                    .join(' · ')}
                </p>

                <div className="pt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    <strong className="text-slate-900 dark:text-white">
                      {t('demo.groupTravellers')}
                    </strong>{' '}
                    {bundle.travelers
                      .map((tr) => `${tr.displayName} (€${tr.budgetPerPerson})`)
                      .join(', ')}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-white">
                      {t('demo.totalBudget')}
                    </strong>{' '}
                    €{bundle.trip.totalBudget} · {bundle.expenses.length}{' '}
                    {t('demo.loggedExpenses')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                  className="col-span-2 py-2.5 px-4 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer"
                >
                  {meta.openBtnLabel}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}/budget`)}
                  className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  {t('demo.whatIfBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}/group`)}
                  className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  {t('demo.groupVotesBtn')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
};
