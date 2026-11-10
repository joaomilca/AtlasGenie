import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { buildInstantMiniPreview, DEMO_TRIPS } from '../data/demoTrips';

interface LandingPageProps {
  onOpenSupport?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenSupport }) => {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { showToast } = useAtlas();
  const navigate = useNavigate();
  const [miniCity, setMiniCity] = useState('Lisbon');
  const [miniLoading, setMiniLoading] = useState(false);
  const [preview, setPreview] = useState(() => buildInstantMiniPreview('Lisbon', language));
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    setPreview(buildInstantMiniPreview(miniCity || 'Lisbon', language));
  }, [language]);

  const handleGenerateMini = (e: React.FormEvent) => {
    e.preventDefault();
    if (!miniCity.trim()) return;
    setMiniLoading(true);
    setTimeout(() => {
      setPreview(buildInstantMiniPreview(miniCity, language));
      setMiniLoading(false);
      showToast(t('toast.magicComplete'));
    }, 350);
  };

  return (
    <main className="max-w-7xl mx-auto px-0 md:px-8 py-6 sm:py-16 space-y-14 sm:space-y-20">
      {/* Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
          <p className="text-xs font-mono-tabular uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t('hero.kicker')} · PT-PT &amp; EN
          </p>
          <h1
            style={{ textWrap: 'balance' }}
            className="font-serif-atlas text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]"
          >
            {t('hero.title')}
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate('/demo')}
              className="px-6 py-3 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              {t('hero.ctaDemo')}
            </button>
            <Link
              to="/trips/new"
              className="px-6 py-3 text-sm font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              {t('hero.ctaPrimary')}
            </Link>
          </div>

          <div className="pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              <span aria-hidden="true">🟢 </span>
              <span className="sr-only">Verified Source: </span>
              {t('hero.pillSources')}
            </span>
            <span aria-hidden="true">·</span>
            <span>⇄ {t('hero.pillDiff')}</span>
            <span aria-hidden="true">·</span>
            <span>⚖️ {t('hero.pillGroup')}</span>
          </div>
        </div>

        {/* Animated Cartographic Atlas Card */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0F172A] text-white p-6 sm:p-8 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <p className="text-xs font-mono-tabular text-amber-400">{t('hero.plateKicker')}</p>
              <h2 className="font-serif-atlas text-xl font-semibold mt-0.5">
                {t('hero.plateTitle')}
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-teal-400">{t('hero.plateVerified')}</span>
          </div>

          <div className="my-6">
            <svg
              viewBox="0 0 420 210"
              className="w-full h-48"
              role="img"
              aria-label={t('hero.plateTitle')}
            >
              {/* Subtle topographic contours */}
              <path
                d="M10,160 Q110,90 220,140 T410,80"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />
              <path
                d="M10,120 Q140,40 260,110 T410,45"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />

              {/* Animated route drawing itself */}
              <path
                d="M 45 155 C 120 65, 195 165, 265 95 C 315 50, 355 110, 380 55"
                fill="none"
                stroke="#D97706"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="animate-route-draw"
              />

              {/* Stops */}
              <g>
                <circle cx="45" cy="155" r="9" fill="#0D9488" stroke="#fff" strokeWidth="2" />
                <text x="45" y="180" textAnchor="middle" fill="#E2E8F0" fontSize="11">
                  1. Alfama
                </text>
              </g>
              <g>
                <circle cx="165" cy="115" r="9" fill="#D97706" stroke="#fff" strokeWidth="2" />
                <text x="165" y="140" textAnchor="middle" fill="#E2E8F0" fontSize="11">
                  2. Campo de Ourique
                </text>
              </g>
              <g>
                <circle cx="265" cy="95" r="9" fill="#D97706" stroke="#fff" strokeWidth="2" />
                <text x="265" y="75" textAnchor="middle" fill="#E2E8F0" fontSize="11">
                  {t('hero.plateStop3')}
                </text>
              </g>
              <g>
                <circle cx="380" cy="55" r="9" fill="#0D9488" stroke="#fff" strokeWidth="2" />
                <text x="365" y="36" textAnchor="middle" fill="#E2E8F0" fontSize="11">
                  {t('hero.plateStop4')}
                </text>
              </g>
            </svg>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>
                <span aria-hidden="true">🟢 </span>
                <span className="sr-only">Verified Source: </span>
                {t('hero.plateRateLabel')}
              </span>
              <span className="font-mono-tabular text-white">15.00€ · {t('hero.plateVerifiedTag')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>🧭 {t('hero.plateSwapLabel')}</span>
              <span className="font-mono-tabular text-teal-400">{t('hero.plateTransitTag')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Mini-Generator Section */}
      <section
        aria-labelledby="mini-gen-heading"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="mini-gen-heading"
              className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white"
            >
              {t('hero.miniGenTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t('hero.miniGenSub')}
            </p>
          </div>

          <form onSubmit={handleGenerateMini} className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
            <label htmlFor="mini-city-input" className="sr-only">
              {t('hero.miniGenPlaceholder')}
            </label>
            <input
              id="mini-city-input"
              type="text"
              value={miniCity}
              onChange={(e) => setMiniCity(e.target.value)}
              placeholder={t('hero.miniGenPlaceholder')}
              className="w-full sm:w-auto sm:min-w-[260px] px-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('hero.miniGenButton')}
            </button>
          </form>
        </div>

        {miniLoading ? (
          <div className="py-10 text-center space-y-3">
            <svg viewBox="0 0 240 40" className="w-48 h-10 mx-auto" aria-hidden="true">
              <path
                d="M 10 20 Q 65 5, 120 20 T 230 20"
                fill="none"
                stroke="#D97706"
                strokeWidth="3"
                className="animate-route-draw"
              />
            </svg>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('hero.miniGenLoading')}
            </p>
          </div>
        ) : (
          <div className="pt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
                {preview.tagline}
              </h3>
              <button
                type="button"
                onClick={() => navigate(`/trips/new?city=${encodeURIComponent(preview.city)}`)}
                className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-4 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('hero.customizeFull', { city: preview.city })}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: t('hero.day1Preview'), stops: preview.day1 },
                { label: t('hero.day2Preview'), stops: preview.day2 },
              ].map((dayCol) => (
                <div
                  key={dayCol.label}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-[#FAF6F0]/60 dark:bg-slate-950/50"
                >
                  <p className="text-xs font-mono-tabular font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {dayCol.label}
                  </p>
                  {dayCol.stops.map((stop) => (
                    <div
                      key={stop.title}
                      className="pt-2 border-t border-slate-200/70 dark:border-slate-800 first:border-t-0 first:pt-0 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          <span className="font-mono-tabular text-amber-700 dark:text-amber-400 mr-2">
                            {stop.time}
                          </span>
                          {stop.title}
                        </span>
                        <span className="text-xs font-mono-tabular whitespace-nowrap shrink-0">
                          <span aria-hidden="true">
                            {stop.confidence === 'verified' ? '🟢 ' : '🟡 '}
                          </span>
                          <span className="sr-only">
                            {stop.confidence === 'verified' ? 'Verified Source: ' : 'AI Estimated: '}
                          </span>
                          {stop.costEstimate}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{stop.whyThis}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                        {t('hero.sourceLabel')} {stop.sourceNote} · {t('hero.crowdIndex')} {stop.trapScore}/100
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Pre-Built Demo Trips Showcase */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {t('hero.demoSamplesTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t('hero.demoSamplesSub')}
            </p>
          </div>
          <Link
            to="/demo"
            className="text-sm font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-4 whitespace-nowrap rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('hero.viewAllDemos')}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.values(DEMO_TRIPS).map((bundle) => (
            <div
              key={bundle.trip.id}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-2">
                <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  {bundle.days.length} {t('hero.days')} · {bundle.travelers.length} {t('hero.travellers')} · €{bundle.trip.totalBudget} {t('hero.budget')}
                </p>
                <h3 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
                  {bundle.trip.destination}, {bundle.trip.country}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('hero.sampleCardDesc', { theme: bundle.days[0]?.theme || bundle.trip.destination })}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    {t('hero.groupMembers')} {bundle.travelers.map((tr) => tr.displayName).join(', ')}
                  </span>
                  <span className="font-mono-tabular">
                    {t('hero.code')} {bundle.trip.inviteCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/trips/${bundle.trip.id}`)}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-500 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {t('hero.openDemoBtn', { city: bundle.trip.destination })}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 Core Differentiators */}
      <section className="space-y-8">
        <h2
          style={{ textWrap: 'balance' }}
          className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white"
        >
          {t('hero.featuresTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: t('hero.feat1Title'), desc: t('hero.feat1Desc') },
            { title: t('hero.feat2Title'), desc: t('hero.feat2Desc') },
            { title: t('hero.feat3Title'), desc: t('hero.feat3Desc') },
            { title: t('hero.feat4Title'), desc: t('hero.feat4Desc') },
          ].map((feat) => (
            <div
              key={feat.title}
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-2"
            >
              <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
                {feat.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive FAQ Section (Accordion) */}
      <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 space-y-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-mono-tabular uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t('faq.kicker')}
          </p>
          <h2
            id="faq-heading"
            style={{ textWrap: 'balance' }}
            className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white"
          >
            {t('faq.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('faq.subtitle')}
          </p>
        </div>

        <div className="space-y-3">
          {[
            { q: t('faq.q1'), a: t('faq.a1') },
            { q: t('faq.q2'), a: t('faq.a2') },
            { q: t('faq.q3'), a: t('faq.a3') },
            { q: t('faq.q4'), a: t('faq.a4') },
          ].map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            const panelId = `faq-panel-${idx}`;
            const buttonId = `faq-btn-${idx}`;
            return (
              <div
                key={item.q}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors"
              >
                <h3 className="m-0">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset"
                  >
                    <span className="font-serif-atlas text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                      {item.q}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex items-center justify-center w-8 h-8 rounded-lg bg-[#FAF6F0] dark:bg-slate-800 text-amber-700 dark:text-amber-400 shrink-0 transition-transform duration-300 ease-in-out ${
                        isOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  aria-hidden={!isOpen}
                  className={`grid transition-all duration-300 ease-in-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-5 pt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/80">
                      {item.a}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {onOpenSupport && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
              {t('faq.stillQuestions')}
            </p>
            <button
              type="button"
              onClick={onOpenSupport}
              className="px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('faq.askSupport')} →
            </button>
          </div>
        )}
      </section>
    </main>
  );
};
