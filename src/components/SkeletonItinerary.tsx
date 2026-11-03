import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SkeletonItineraryProps {
  cardsCount?: number;
  destination?: string;
  subtitle?: string;
}

export const SkeletonItinerary: React.FC<SkeletonItineraryProps> = ({
  cardsCount = 3,
  destination,
  subtitle,
}) => {
  const { t } = useTranslation();
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    t('skeleton.msg1'),
    t('skeleton.msg2'),
    t('skeleton.msg3'),
    t('skeleton.msg4'),
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="skeleton-itinerary"
      className="space-y-6"
    >
      {/* Dynamic Micro-Copy Header + Animated Cartographic Route */}
      <div className="rounded-2xl bg-[#0F172A] text-white p-6 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 text-center sm:text-left">
          <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-400">
            {subtitle || t('skeleton.recalculatingTag')}
            {destination ? ` · ${destination}` : ''}
          </p>
          <p
            key={messageIndex}
            data-testid="skeleton-cycling-copy"
            className="font-serif-atlas text-lg sm:text-xl font-bold text-white transition-opacity duration-300"
          >
            {messages[messageIndex]}
          </p>
        </div>

        <svg
          viewBox="0 0 240 56"
          className="w-48 h-14 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M 14 42 C 65 10, 120 48, 175 18 C 198 8, 212 32, 226 16"
            fill="none"
            stroke="#D97706"
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-route-draw"
          />
          <circle cx="14" cy="42" r="4.5" fill="#0D9488" />
          <circle cx="115" cy="28" r="4.5" fill="#D97706" />
          <circle cx="226" cy="16" r="4.5" fill="#0D9488" />
        </svg>
      </div>

      {/* Pulsing Activity Card Skeletons mimicking real itinerary cards */}
      <div className="space-y-4">
        {Array.from({ length: cardsCount }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-pulse"
          >
            {/* Top Row: Stop # + Time + Title */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-24 rounded bg-amber-200/70 dark:bg-amber-900/50" />
                  <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="h-5 w-3/5 rounded-md bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-7 w-7 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>

            {/* Description Lines */}
            <div className="space-y-2">
              <div className="h-3.5 w-full rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3.5 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
            </div>

            {/* Why this line */}
            <div className="h-3.5 w-2/3 rounded bg-teal-200/60 dark:bg-teal-900/40" />

            {/* Trust Layer Badges Skeleton */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="h-6 w-44 rounded-md bg-emerald-100 dark:bg-emerald-950/60" />
              <div className="h-6 w-40 rounded-md bg-amber-100 dark:bg-amber-950/60" />
            </div>

            {/* Bottom Tier & Action Bar Skeleton */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="h-7 w-52 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="flex items-center gap-2">
                <div className="h-7 w-16 rounded-md bg-slate-200 dark:bg-slate-800" />
                <div className="h-7 w-20 rounded-md bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
