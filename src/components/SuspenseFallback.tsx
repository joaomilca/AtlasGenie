import React from 'react';
import { Compass } from 'lucide-react';

export const MapSuspenseFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading interactive map"
    data-testid="map-suspense-fallback"
    className="relative w-full h-full min-h-[360px] rounded-xl overflow-hidden bg-[#0F172A] text-slate-100 border border-slate-200 dark:border-slate-800 flex flex-col justify-between p-5"
  >
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-3 w-44 rounded bg-amber-500/20 animate-pulse" />
        <div className="h-4 w-56 rounded bg-slate-700/80 animate-pulse" />
      </div>
      <div className="h-4 w-24 rounded bg-slate-800 animate-pulse" />
    </div>

    <div className="my-auto flex flex-col items-center justify-center gap-3 py-12">
      <Compass className="w-8 h-8 text-[#D97706] animate-spin" aria-hidden="true" />
      <p className="text-xs font-mono-tabular text-slate-300">
        Calibrating city bounding box & route coordinates…
      </p>
    </div>

    <div className="h-12 w-full rounded-lg bg-slate-900/90 border border-slate-800 animate-pulse" />
  </div>
);

export const DiffBannerSuspenseFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading diff proposals"
    data-testid="diff-suspense-fallback"
    className="mb-6 rounded-xl bg-amber-50/90 dark:bg-slate-900 border border-amber-300 dark:border-amber-700/70 p-4 sm:p-5 space-y-3"
  >
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1.5">
        <div className="h-4 w-56 rounded bg-amber-300/60 dark:bg-amber-800/40 animate-pulse" />
        <div className="h-3 w-72 rounded bg-amber-200/60 dark:bg-slate-800 animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-7 w-20 rounded-lg bg-emerald-700/30 animate-pulse" />
        <div className="h-7 w-20 rounded-lg bg-slate-300/60 dark:bg-slate-800 animate-pulse" />
      </div>
    </div>
  </div>
);

export const ModalSuspenseFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading dialog"
    data-testid="modal-suspense-fallback"
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
  >
    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex items-center gap-3">
      <Compass className="w-5 h-5 text-[#D97706] animate-spin shrink-0" aria-hidden="true" />
      <span className="text-xs font-mono-tabular text-slate-700 dark:text-slate-200">
        Loading Atlas dialog…
      </span>
    </div>
  </div>
);

export const TabViewSuspenseFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading workspace view"
    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
  >
    <div className="h-6 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
    <div className="h-4 w-96 max-w-full rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
      <div className="h-28 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/60 animate-pulse" />
      <div className="h-28 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/60 animate-pulse" />
      <div className="h-28 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/60 animate-pulse" />
    </div>
  </div>
);
