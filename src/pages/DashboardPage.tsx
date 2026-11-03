import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Plus, Copy, Trash2, Users, Calendar, Compass, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAtlas } from '../context/AtlasContext';
import { computeReliabilitySummary } from '../utils/domainLogic';
import { FullTripBundle } from '../types/models';

export const DashboardPage: React.FC = () => {
  const { trips, deleteTrip, duplicateTrip, currentUser, isDemoMode, enableDemoMode } = useAtlas();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'empty-preview'>('all');

  const allBundles = Object.values(trips) as FullTripBundle[];

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

  // Protected Route Guard if neither signed in nor in Demo Mode
  if (!currentUser && !isDemoMode) {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 space-y-4 shadow-sm">
          <ShieldCheck className="w-10 h-10 text-amber-600 mx-auto" />
          <h1 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
            {t('dash.privateGuardTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('dash.privateGuardSub')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/login"
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] rounded-lg hover:bg-slate-800"
            >
              {t('nav.login')}
            </Link>
            <button
              type="button"
              onClick={enableDemoMode}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] rounded-lg hover:bg-amber-600 cursor-pointer"
            >
              {t('dash.unlockDemoBtn')}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const displayedTrips = viewMode === 'empty-preview' ? [] : allBundles;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-10">
      {/* Protected Dashboard Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-mono-tabular uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {currentUser
                ? `${t('dash.privateBadge')} · ${currentUser.email || currentUser.displayName}`
                : t('dash.protectedDemoBadge')}
            </span>
          </div>
          <h1 className="font-serif-atlas text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
            {t('dash.title')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('dash.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle to let the user inspect both the Trip Grid and the "Make your first wish" Empty State */}
          <div
            role="group"
            aria-label={t('dash.title')}
            className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('dash.tripCardsTab', { count: allBundles.length })}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('empty-preview')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'empty-preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('dash.emptyStateTab')}
            </button>
          </div>

          <form onSubmit={handleJoinSubmit} className="flex items-center gap-2">
            <label htmlFor="join-code-input" className="sr-only">
              {t('group.inviteCode')}
            </label>
            <input
              id="join-code-input"
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder={t('dash.invitePlaceholder')}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-tabular"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {t('dash.joinGroupBtn')}
            </button>
          </form>

          <Link
            to="/trips/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t('dash.createBtn')}</span>
          </Link>
        </div>
      </div>

      {/* Empty State ("Make your first wish") OR Grid of Trip Cards */}
      {displayedTrips.length === 0 ? (
        <section
          aria-labelledby="empty-wish-heading"
          className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-amber-300/80 dark:border-slate-700 p-10 sm:p-14 text-center space-y-6 max-w-3xl mx-auto my-6"
        >
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 flex items-center justify-center mx-auto text-[#D97706]">
            <Sparkles className="w-8 h-8" />
          </div>

          <svg viewBox="0 0 240 60" className="w-52 h-14 mx-auto" aria-hidden="true">
            <path
              d="M 15 45 Q 75 10, 125 35 T 225 15"
              fill="none"
              stroke="#D97706"
              strokeWidth="2.5"
              strokeDasharray="5 5"
              className="animate-route-draw"
            />
            <circle cx="15" cy="45" r="5" fill="#0D9488" />
            <circle cx="125" cy="35" r="5" fill="#D97706" />
            <circle cx="225" cy="15" r="5" fill="#0D9488" />
          </svg>

          <div className="space-y-2 max-w-lg mx-auto">
            <p className="text-xs font-mono-tabular uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {t('dash.emptyKicker')}
            </p>
            <h2
              id="empty-wish-heading"
              className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white"
            >
              {t('dash.emptyTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('dash.emptyDesc')}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/trips/new"
              className="inline-flex items-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm"
            >
              <Compass className="w-4 h-4" />
              <span>{t('dash.makeFirstWishBtn')}</span>
            </Link>
            {viewMode === 'empty-preview' && (
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className="px-5 py-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {t('dash.showExistingBtn', { count: allBundles.length })}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section aria-label={t('dash.title')} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedTrips.map((bundle) => {
              const rel = computeReliabilitySummary(bundle.days);
              const totalStops = bundle.days.reduce((acc, d) => acc + d.activities.length, 0);

              return (
                <article
                  key={bundle.trip.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-5 hover:border-amber-500/60 transition-colors shadow-xs"
                >
                  <div className="space-y-3">
                    {/* Top Row: Countdown + Trust Badge */}
                    <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular">
                      <span className="px-2.5 py-1 rounded-md bg-[#FAF6F0] dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                        {getCountdownText(bundle.trip.startDate)}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 font-semibold">
                        <span aria-hidden="true">🟢 </span>
                        <span className="sr-only">Verified Source: </span>
                        {rel.verifiedPercent}% {t('trip.verified')}
                      </span>
                    </div>

                    {/* Destination & Country */}
                    <div>
                      <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                        {bundle.trip.destination}
                        {bundle.trip.country ? `, ${bundle.trip.country}` : ''}
                      </h2>
                      <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>
                          {bundle.trip.startDate} → {bundle.trip.endDate} ({bundle.days.length}{' '}
                          {t('hero.days')} · {totalStops} {t('dash.stops')})
                        </span>
                      </p>
                    </div>

                    {/* Budget & Group Metadata */}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs bg-[#FAF6F0]/70 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('dash.totalBudgetLabel')}
                        </p>
                        <p className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                          €{bundle.trip.totalBudget}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('dash.groupSizeLabel')}
                        </p>
                        <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-teal-600" />
                          <span>
                            {bundle.trip.travelersCount}{' '}
                            {bundle.trip.groupEnabled
                              ? `(${bundle.trip.inviteCode})`
                              : t('dash.solo')}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Interests Preview */}
                    <div className="flex flex-wrap gap-1.5">
                      {bundle.trip.interests.slice(0, 4).map((interest) => (
                        <span
                          key={interest}
                          className="px-2 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          {t(`interest.${interest}`, { defaultValue: interest })}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                      className="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors cursor-pointer"
                    >
                      {t('dash.openTrip')} →
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const newId = await duplicateTrip(bundle.trip.id);
                        navigate(`/trips/${newId}`);
                      }}
                      title={t('dash.duplicate')}
                      aria-label={`${t('dash.duplicate')} ${bundle.trip.destination}`}
                      className="p-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!bundle.trip.isDemo && (
                      <button
                        type="button"
                        onClick={() => deleteTrip(bundle.trip.id)}
                        title={t('dash.delete')}
                        aria-label={`${t('dash.delete')} ${bundle.trip.destination}`}
                        className="p-2.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
};
