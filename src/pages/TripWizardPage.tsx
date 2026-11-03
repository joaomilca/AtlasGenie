import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, MapPin, Plus, Sparkles, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { generateTripItinerary } from '../services/api';
import { SkeletonItinerary } from '../components/SkeletonItinerary';

const COUNTRY_OPTIONS = [
  { value: 'Italy', labelEn: 'Italy', labelPt: 'Itália', suggestedCities: ['Rome', 'Florence', 'Venice', 'Milan'] },
  { value: 'Japan', labelEn: 'Japan', labelPt: 'Japão', suggestedCities: ['Tokyo', 'Kyoto', 'Osaka', 'Hakone'] },
  { value: 'Portugal', labelEn: 'Portugal', labelPt: 'Portugal', suggestedCities: ['Lisbon', 'Porto', 'Sintra', 'Coimbra'] },
  { value: 'Spain', labelEn: 'Spain', labelPt: 'Espanha', suggestedCities: ['Barcelona', 'Madrid', 'Seville', 'Granada'] },
  { value: 'France', labelEn: 'France', labelPt: 'França', suggestedCities: ['Paris', 'Lyon', 'Nice', 'Bordeaux'] },
  { value: 'Greece', labelEn: 'Greece', labelPt: 'Grécia', suggestedCities: ['Athens', 'Santorini', 'Naxos', 'Chania'] },
  { value: 'United Kingdom', labelEn: 'United Kingdom', labelPt: 'Reino Unido', suggestedCities: ['London', 'Edinburgh', 'Bath', 'Oxford'] },
  { value: 'Germany', labelEn: 'Germany', labelPt: 'Alemanha', suggestedCities: ['Berlin', 'Munich', 'Hamburg', 'Heidelberg'] },
  { value: 'Switzerland', labelEn: 'Switzerland', labelPt: 'Suíça', suggestedCities: ['Zurich', 'Lucerne', 'Interlaken', 'Zermatt'] },
  { value: 'Netherlands', labelEn: 'Netherlands', labelPt: 'Países Baixos', suggestedCities: ['Amsterdam', 'Utrecht', 'Haarlem', 'Rotterdam'] },
  { value: 'Austria', labelEn: 'Austria', labelPt: 'Áustria', suggestedCities: ['Vienna', 'Salzburg', 'Innsbruck', 'Hallstatt'] },
  { value: 'Croatia', labelEn: 'Croatia', labelPt: 'Croácia', suggestedCities: ['Dubrovnik', 'Split', 'Zadar', 'Zagreb'] },
  { value: 'Morocco', labelEn: 'Morocco', labelPt: 'Marrocos', suggestedCities: ['Marrakech', 'Fes', 'Chefchaouen', 'Essaouira'] },
  { value: 'United States', labelEn: 'United States', labelPt: 'Estados Unidos', suggestedCities: ['New York', 'San Francisco', 'Boston', 'Chicago'] },
];

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

function inferCountryFromCity(cityParam: string | null): { country: string; initialCities: string[] } {
  if (!cityParam || !cityParam.trim()) {
    return { country: 'Italy', initialCities: ['Rome', 'Florence'] };
  }
  const clean = cityParam.trim();
  const match = COUNTRY_OPTIONS.find(
    (c) =>
      c.value.toLowerCase() === clean.toLowerCase() ||
      c.suggestedCities.some((sc) => sc.toLowerCase() === clean.toLowerCase())
  );
  if (match) {
    const isCountryName = match.value.toLowerCase() === clean.toLowerCase();
    return {
      country: match.value,
      initialCities: isCountryName ? [] : [clean],
    };
  }
  return { country: 'Italy', initialCities: [clean] };
}

export const TripWizardPage: React.FC = () => {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { currentUser, saveTripBundle, showToast } = useAtlas();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const inferred = inferCountryFromCity(searchParams.get('city'));
  const [country, setCountry] = useState<string>(inferred.country);
  const [cities, setCities] = useState<string[]>(inferred.initialCities);
  const [cityInput, setCityInput] = useState<string>('');
  const [letAiDecideCities, setLetAiDecideCities] = useState<boolean>(false);

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

  const [assumptions, setAssumptions] = useState<string[]>(() => [
    t('wizard.defaultAssump1'),
    t('wizard.defaultAssump2'),
    t('wizard.defaultAssump3'),
    t('wizard.defaultAssump4'),
  ]);
  const [newAssumption, setNewAssumption] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setAssumptions([
      t('wizard.defaultAssump1'),
      t('wizard.defaultAssump2'),
      t('wizard.defaultAssump3'),
      t('wizard.defaultAssump4'),
    ]);
  }, [language, t]);

  const handleAddCityChip = (rawValue?: string) => {
    const candidate = (rawValue ?? cityInput).trim();
    if (!candidate) return;
    const parts = candidate
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setCities((prev) => {
      const next = [...prev];
      for (const part of parts) {
        if (!next.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
          next.push(part);
        }
      }
      return next;
    });
    if (rawValue === undefined) {
      setCityInput('');
    }
  };

  const handleCityInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddCityChip();
    } else if (e.key === 'Backspace' && !cityInput && cities.length > 0) {
      setCities((prev) => prev.slice(0, -1));
    }
  };

  const handleRemoveCityChip = (cityToRemove: string) => {
    setCities((prev) => prev.filter((c) => c !== cityToRemove));
  };

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

  // Compute display destination string for headers & skeleton loader
  const pendingTypedCity = !letAiDecideCities && cityInput.trim() ? [cityInput.trim()] : [];
  const effectiveCities = letAiDecideCities
    ? []
    : Array.from(new Set([...cities, ...pendingTypedCity]));
  const computedDestination =
    effectiveCities.length > 0 ? `${effectiveCities.join(', ')}, ${country}` : country;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!country.trim()) {
      setFormError(t('wizard.errCountry'));
      return;
    }
    if (selectedInterests.length === 0) {
      setFormError(t('wizard.errInterests'));
      return;
    }

    setIsGenerating(true);
    try {
      const [{ bundle }] = await Promise.all([
        generateTripItinerary({
          destination: computedDestination,
          country: country.trim(),
          cities: effectiveCities,
          letAiDecideCities: letAiDecideCities || effectiveCities.length === 0,
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
        }),
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]);

      await saveTripBundle(bundle);
      showToast(t('toast.magicComplete'));
      navigate(`/trips/${bundle.trip.id}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeCountryOption = COUNTRY_OPTIONS.find((c) => c.value === country);

  if (isGenerating) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <SkeletonItinerary
          cardsCount={3}
          destination={computedDestination}
          subtitle={t('wizard.generatingSub', { destination: computedDestination })}
        />
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

        {/* Step 1: Advanced Destination Selector (Country + Multi-City Chips + AI Route Checkbox), Dates, Budget & Group Toggle */}
        <section className="space-y-5">
          <h2 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            {t('wizard.step1')}
          </h2>

          {/* Country Selector + Dates Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label
                htmlFor="wiz-country"
                className="flex items-center gap-1.5 text-xs font-medium mb-1"
              >
                <Globe className="w-3.5 h-3.5 text-[#D97706]" />
                <span>{t('wizard.countryLabel')}</span>
              </label>
              <select
                id="wiz-country"
                required
                value={country}
                onChange={(e) => {
                  const nextCountry = e.target.value;
                  setCountry(nextCountry);
                  setCities([]);
                  setCityInput('');
                }}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {language === 'pt' ? c.labelPt : c.labelEn}
                  </option>
                ))}
              </select>
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

          {/* Multi-City Tag Input & AI Route Decision Checkbox */}
          <div className="p-4 rounded-xl bg-[#FAF6F0]/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label
                htmlFor="wiz-cities-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white"
              >
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{t('wizard.citiesLabel')}</span>
              </label>

              {/* Quick suggestion pills for the selected country */}
              {!letAiDecideCities && activeCountryOption && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeCountryOption.suggestedCities.map((sugCity) => {
                    const alreadyAdded = cities.some(
                      (c) => c.toLowerCase() === sugCity.toLowerCase()
                    );
                    return (
                      <button
                        key={sugCity}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddCityChip(sugCity)}
                        className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors cursor-pointer ${
                          alreadyAdded
                            ? 'bg-slate-200/70 dark:bg-slate-700 text-slate-400 border-transparent cursor-default'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                        }`}
                      >
                        + {sugCity}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {!letAiDecideCities ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-amber-500/40">
                  {cities.map((cityChip) => (
                    <span
                      key={cityChip}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0F172A] text-white dark:bg-amber-600"
                    >
                      <span>{cityChip}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCityChip(cityChip)}
                        aria-label={t('wizard.removeCityAria', { city: cityChip })}
                        className="hover:text-amber-300 dark:hover:text-slate-900 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  <input
                    id="wiz-cities-input"
                    type="text"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    onKeyDown={handleCityInputKeyDown}
                    placeholder={t('wizard.citiesPlaceholder')}
                    className="flex-1 min-w-[180px] px-2 py-1 text-xs sm:text-sm bg-transparent focus:outline-none text-slate-900 dark:text-white"
                  />

                  <button
                    type="button"
                    onClick={() => handleAddCityChip()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('wizard.addCityBtn')}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('wizard.citiesHint')}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                <Sparkles className="w-4 h-4 text-[#D97706] shrink-0" />
                <span>
                  {t('wizard.aiRouteActiveNote', {
                    country:
                      language === 'pt'
                        ? activeCountryOption?.labelPt || country
                        : activeCountryOption?.labelEn || country,
                  })}
                </span>
              </div>
            )}

            {/* Checkbox: "I don't know which cities to visit, let the AI decide the best route within the country." */}
            <label
              htmlFor="wiz-ai-decide-cities"
              className="flex items-start gap-2.5 pt-1 cursor-pointer select-none"
            >
              <input
                id="wiz-ai-decide-cities"
                type="checkbox"
                checked={letAiDecideCities}
                onChange={(e) => setLetAiDecideCities(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#D97706] cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t('wizard.letAiDecideCheckbox')}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wiz-travelers" className="block text-xs font-medium mb-1">
                {t('wizard.groupSizeLabel')}
              </label>
              <input
                id="wiz-travelers"
                type="number"
                min={1}
                max={12}
                value={travelersCount}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value));
                  setTravelersCount(val);
                  if (val > 1) setGroupEnabled(true);
                }}
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

          <div className="p-4 rounded-xl bg-[#FAF6F0] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                  {t('wizard.groupTitle')}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('wizard.groupToggle')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={groupEnabled}
                aria-label={t('wizard.groupTitle')}
                onClick={() => setGroupEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  groupEnabled ? 'bg-[#D97706]' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    groupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {groupEnabled && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-teal-800 dark:text-teal-300">
                <span>✓ {t('wizard.groupFeatInvite')}</span>
                <span>✓ {t('wizard.groupFeatFairness')}</span>
                <span>✓ {t('wizard.groupFeatVoting')}</span>
                <span>✓ {t('wizard.groupFeatSplit')}</span>
              </div>
            )}
          </div>
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
                    className={`p-3 rounded-xl border text-left transition-colors flex items-center gap-2.5 cursor-pointer ${
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
                {t('wizard.level')} {defaultPace}/5 (
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
              className="w-full accent-amber-600 cursor-pointer"
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
                  aria-label={`${t('wizard.step3')} ${idx + 1}`}
                  value={assump}
                  onChange={(e) => handleUpdateAssumption(idx, e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAssumption(idx)}
                  aria-label={`${t('dash.delete')} ${idx + 1}`}
                  className="px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 rounded-md cursor-pointer"
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
              placeholder={t('wizard.assumptionPlaceholder')}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={handleAddAssumption}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap cursor-pointer"
            >
              + {t('wizard.addAssumption')}
            </button>
          </div>
        </section>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            {t('wizard.generateBtn')}
          </button>
        </div>
      </form>
    </main>
  );
};
