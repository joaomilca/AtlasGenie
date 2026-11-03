import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { generateTripItinerary } from '../services/api';

const INTEREST_OPTIONS = [
  { id: 'food', labelEn: 'Food & Markets', labelPt: 'Gastronomia e Mercados', icon: '🍲' },
  { id: 'history', labelEn: 'History & Ruins', labelPt: 'História e Património', icon: '🏛️' },
  { id: 'architecture', labelEn: 'Architecture & Tiles', labelPt: 'Arquitetura e Azulejos', icon: '🧱' },
  { id: 'viewpoints', labelEn: 'Miradouros & Views', labelPt: 'Miradouros e Vistas', icon: '🌅' },
  { id: 'art', labelEn: 'Museums & Galleries', labelPt: 'Museus e Arte', icon: '🎨' },
  { id: 'wine', labelEn: 'Wine & Cellars', labelPt: 'Vinhos e Caves', icon: '🍷' },
  { id: 'music', labelEn: 'Live Music & Fado', labelPt: 'Música ao Vivo e Fado', icon: '🎸' },
  { id: 'nature', labelEn: 'Parks & Coastal Walks', labelPt: 'Parques e Costa', icon: '🌿' },
];

export const TripWizardPage: React.FC = () => {
  const { t, language } = useI18n();
  const { currentUser, saveTripBundle, showToast } = useAtlas();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialCity = searchParams.get('city') || 'Lisbon';
  const [destination, setDestination] = useState(initialCity);
  const [startDate, setStartDate] = useState('2026-11-18');
  const [endDate, setEndDate] = useState('2026-11-21');
  const [travelersCount, setTravelersCount] = useState(2);
  const [totalBudget, setTotalBudget] = useState(900);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'food',
    'history',
    'viewpoints',
  ]);
  const [defaultPace, setDefaultPace] = useState(3);
  const [groupEnabled, setGroupEnabled] = useState(true);

  const [assumptions, setAssumptions] = useState<string[]>([
    '2 adults travelling together, moderate walking pace',
    'Mid-range neighbourhood tascas & verified cultural tickets',
    'Public transit or walking between stops (< 25 min legs)',
    'Include indoor Plan B backups in case of rain',
  ]);
  const [newAssumption, setNewAssumption] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleAddAssumption = () => {
    if (!newAssumption.trim()) return;
    setAssumptions((prev) => [...prev, newAssumption.trim()]);
    setNewAssumption('');
  };

  const handleUpdateAssumption = (idx: number, val: string) => {
    setAssumptions((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const handleRemoveAssumption = (idx: number) => {
    setAssumptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!destination.trim()) {
      setFormError('Please enter a destination city.');
      return;
    }
    if (selectedInterests.length === 0) {
      setFormError('Please select at least one travel interest.');
      return;
    }

    setIsGenerating(true);
    try {
      const { bundle, usedFallback } = await generateTripItinerary({
        destination: destination.trim(),
        startDate,
        endDate,
        totalBudget,
        travelersCount,
        interests: selectedInterests,
        defaultPace,
        assumptions,
        groupEnabled,
        ownerId: currentUser?.uid || 'demo-user',
        ownerName: currentUser?.displayName || 'Ana',
      });

      await saveTripBundle(bundle);
      if (usedFallback) {
        showToast('Generated your Atlas with verified Demo data.');
      } else {
        showToast('Atlas itinerary generated!');
      }
      navigate(`/trips/${bundle.trip.id}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isGenerating) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-24 text-center space-y-6">
        <div className="rounded-2xl bg-[#0F172A] text-white p-10 border border-slate-800 space-y-6">
          <svg viewBox="0 0 320 90" className="w-72 h-24 mx-auto">
            <path
              d="M 20 65 C 90 15, 160 80, 230 30 C 260 15, 285 45, 300 25"
              fill="none"
              stroke="#D97706"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="animate-route-draw"
            />
            <circle cx="20" cy="65" r="6" fill="#0D9488" />
            <circle cx="145" cy="48" r="6" fill="#D97706" />
            <circle cx="300" cy="25" r="6" fill="#0D9488" />
          </svg>
          <h1 className="font-serif-atlas text-2xl font-bold">{t('wizard.generating')}</h1>
          <p className="text-xs text-slate-300 max-w-md mx-auto">
            Checking verification sources, computing travel legs, and preparing budget tiers for{' '}
            <strong>{destination}</strong>…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8"
      >
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <h1 className="font-serif-atlas text-3xl font-bold text-slate-900 dark:text-white">
            {t('wizard.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('wizard.step1')} · {t('wizard.step2')} · {t('wizard.step3')}
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-800 dark:text-rose-200"
          >
            {formError}
          </div>
        )}

        {/* Step 1: Destination, Dates, Budget & Group Toggle */}
        <section className="space-y-4">
          <h2 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            {t('wizard.step1')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label htmlFor="wiz-dest" className="block text-xs font-medium mb-1">
                {t('wizard.destination')}
              </label>
              <input
                id="wiz-dest"
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
              />
            </div>

            <div>
              <label htmlFor="wiz-start" className="block text-xs font-medium mb-1">
                {t('wizard.startDate')}
              </label>
              <input
                id="wiz-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="wiz-end" className="block text-xs font-medium mb-1">
                {t('wizard.endDate')}
              </label>
              <input
                id="wiz-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wiz-travelers" className="block text-xs font-medium mb-1">
                {t('wizard.travelers')}
              </label>
              <input
                id="wiz-travelers"
                type="number"
                min={1}
                max={12}
                value={travelersCount}
                onChange={(e) => setTravelersCount(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="wiz-budget" className="block text-xs font-medium mb-1">
                {t('wizard.totalBudget')}
              </label>
              <input
                id="wiz-budget"
                type="number"
                min={50}
                step={50}
                value={totalBudget}
                onChange={(e) => setTotalBudget(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={groupEnabled}
              onChange={(e) => setGroupEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-600"
            />
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
              {t('wizard.groupToggle')}
            </span>
          </label>
        </section>

        {/* Step 2: Visual Interest Chips & Pace Selector */}
        <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h2 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            {t('wizard.step2')}
          </h2>

          <div>
            <p className="text-xs font-medium mb-2">{t('wizard.interestsLabel')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {INTEREST_OPTIONS.map((item) => {
                const active = selectedInterests.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleInterest(item.id)}
                    aria-pressed={active}
                    className={`p-3 rounded-xl border text-left transition-colors flex items-center gap-2.5 ${
                      active
                        ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500'
                        : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <span className="text-lg" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="text-xs font-medium leading-tight">
                      {language === 'pt' ? item.labelPt : item.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-medium mb-1">
              <label htmlFor="wiz-pace">{t('wizard.paceLabel')}</label>
              <span className="font-mono-tabular">
                Level {defaultPace}/5 (
                {defaultPace <= 2
                  ? t('trip.paceRelaxed')
                  : defaultPace === 3
                  ? t('trip.paceBalanced')
                  : t('trip.pacePacked')}
                )
              </span>
            </div>
            <input
              id="wiz-pace"
              type="range"
              min={1}
              max={5}
              step={1}
              value={defaultPace}
              onChange={(e) => setDefaultPace(Number(e.target.value))}
              className="w-full accent-amber-600"
            />
          </div>
        </section>

        {/* Step 3: Editable AI Assumptions Panel */}
        <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
              {t('wizard.step3')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {t('wizard.assumptionsTitle')}
            </p>
          </div>

          <div className="space-y-2">
            {assumptions.map((assump, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label={`Assumption ${idx + 1}`}
                  value={assump}
                  onChange={(e) => handleUpdateAssumption(idx, e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAssumption(idx)}
                  aria-label={`Remove assumption ${idx + 1}`}
                  className="px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 rounded-md"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newAssumption}
              onChange={(e) => setNewAssumption(e.target.value)}
              placeholder="e.g. Prefer step-free access or vegetarian lunch spots…"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={handleAddAssumption}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap"
            >
              + {t('wizard.addAssumption')}
            </button>
          </div>
        </section>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm"
          >
            {t('wizard.generateBtn')}
          </button>
        </div>
      </form>
    </main>
  );
};
