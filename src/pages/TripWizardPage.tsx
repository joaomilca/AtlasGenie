import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe, Loader2, MapPin, Plus, Sparkles, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';
import { useAuth } from '../context/AuthContext';
import {
  SPECIAL_PREFERENCE_CHIPS,
  SpecialPreferenceChipOption,
  buildSpecialPreferencesConstraintList,
  generateTripItinerary,
  validateLocationWithGeocoder,
} from '../services/api';
import { getUserProfile } from '../services/firebase';
import { SkeletonItinerary } from '../components/SkeletonItinerary';

import {
  FORM_DRAFT_STORAGE_KEY,
  INTEREST_OPTION_ITEMS,
  NEW_TRIP_DRAFT_STORAGE_KEY,
  TRIP_DRAFT_STORAGE_KEY,
  TripWizardDraftState,
  applyUserProfileToTripDraft,
  createDefaultTripWizardDraft,
  doesRestrictionMatchChip,
  normalizeInputBudget,
  parseTripWizardDraft,
  serializeTripWizardDraft,
  toggleRestrictionInList,
  writeActiveTripToLocalStorageGuarded,
} from '../utils/domainLogic';
import {
  WorldCountryOption,
  filterWorldCountries,
  findWorldCountry,
  getSortedWorldCountries,
  resolveCountryFromQueryParam,
  sanitizeAndCheckLocationInput,
} from '../utils/worldDestinations';

const INTEREST_OPTIONS = [
  { id: 'food', icon: '🍲' },
  { id: 'history', icon: '🏛️' },
  { id: 'architecture', icon: '🧱' },
  { id: 'viewpoints', icon: '🌅' },
  { id: 'art', icon: '🎨' },
  { id: 'wine', icon: '🍷' },
  { id: 'music', icon: '🎸' },
  { id: 'nature', icon: '🌿' },
];

interface CountrySelectOptionsProps {
  countries: WorldCountryOption[];
  selectedCountry: string;
  isPt: boolean;
  emptyMessage: string;
  onSelect: (countryValue: string) => void;
}

/**
 * Memoized compact 197-country option list for the searchable Combobox.
 */
const CountrySelectOptions = React.memo<CountrySelectOptionsProps>(
  ({ countries, selectedCountry, isPt, emptyMessage, onSelect }) => {
    if (countries.length === 0) {
      return (
        <li className="text-sm py-1.5 px-3 text-slate-500 dark:text-slate-400 italic">
          {emptyMessage}
        </li>
      );
    }
    return (
      <>
        {countries.map((c) => {
          const isSelected = c.value === selectedCountry;
          const label = isPt ? c.labelPt : c.labelEn;
          return (
            <li
              key={c.value}
              role="option"
              aria-selected={isSelected}
              data-testid={`country-option-${c.value}`}
              onMouseDown={(e) => {
                // Prevent input blur before selection completes
                e.preventDefault();
              }}
              onClick={() => onSelect(c.value)}
              className={`text-sm py-1.5 px-3 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 font-semibold'
                  : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="truncate">{label}</span>
              {isSelected && <Check className="w-3.5 h-3.5 text-[#D97706] shrink-0" />}
            </li>
          );
        })}
      </>
    );
  }
);

CountrySelectOptions.displayName = 'CountrySelectOptions';

export const TripWizardPage: React.FC = () => {
  const { t } = useTranslation();
  const { language, activeLanguage } = useI18n();
  const { currentUser, saveTripBundle, showToast } = useAtlas();
  const { user, userProfile } = useAuth();
  const activeAuthUser = user || currentUser;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isPt = language === 'pt';
  const sortedCountries = useMemo(
    () => getSortedWorldCountries(isPt ? 'pt' : 'en'),
    [isPt]
  );

  const cityParam = searchParams.get('city');
  const hasExplicitCityParam = Boolean(cityParam && cityParam.trim());
  const inferred = useMemo(
    () => (hasExplicitCityParam ? resolveCountryFromQueryParam(cityParam) : null),
    [cityParam, hasExplicitCityParam]
  );

  const defaultState = useMemo<TripWizardDraftState>(
    () => createDefaultTripWizardDraft(inferred),
    [inferred]
  );
  const hadSavedDraftOnMountRef = useRef<boolean>(false);

  const [formData, setFormData] = useState<TripWizardDraftState>(() => {
    if (typeof window === 'undefined') {
      return defaultState;
    }
    try {
      const draft =
        window.localStorage.getItem(NEW_TRIP_DRAFT_STORAGE_KEY) ||
        window.localStorage.getItem(FORM_DRAFT_STORAGE_KEY) ||
        window.localStorage.getItem(TRIP_DRAFT_STORAGE_KEY);
      if (draft) {
        const parsed = parseTripWizardDraft(draft, defaultState);
        if (parsed) {
          hadSavedDraftOnMountRef.current = true;
          if (hasExplicitCityParam && inferred) {
            return {
              ...parsed,
              country: inferred.country,
              cities: [...inferred.initialCities],
            };
          }
          return parsed;
        }
      }
    } catch {
      // ignore localStorage read errors
    }
    return defaultState;
  });

  const [country, setCountry] = useState<string>(() => formData.country);
  const [countrySearch, setCountrySearch] = useState<string>(() => {
    if (!formData.country) return '';
    const opt = findWorldCountry(formData.country);
    return isPt ? opt?.labelPt || formData.country : opt?.labelEn || formData.country;
  });
  const [isFilteringCountries, setIsFilteringCountries] = useState<boolean>(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState<boolean>(false);
  const countryDropdownRef = useRef<HTMLDivElement | null>(null);
  const [cities, setCities] = useState<string[]>(() => [...formData.cities]);
  const [cityInput, setCityInput] = useState<string>(() => formData.cityInput);
  const [letAiDecideCities, setLetAiDecideCities] = useState<boolean>(
    () => formData.letAiDecideCities
  );

  const [startDate, setStartDate] = useState<string>(() => formData.startDate);
  const [endDate, setEndDate] = useState<string>(() => formData.endDate);
  const [travelersCount, setTravelersCount] = useState<number>(() => formData.travelersCount);
  const [totalBudget, setTotalBudget] = useState<number>(() => formData.totalBudget);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => [
    ...formData.selectedInterests,
  ]);
  const [defaultPace, setDefaultPace] = useState<number>(() => formData.defaultPace);
  const [groupEnabled, setGroupEnabled] = useState<boolean>(() => formData.groupEnabled);

  const [specialPreferences, setSpecialPreferences] = useState<string[]>(() => [
    ...formData.specialPreferences,
  ]);
  const [customRequest, setCustomRequest] = useState<string>(() => formData.customRequest);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifyingCity, setIsVerifyingCity] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const skipNextDraftSaveRef = useRef<boolean>(false);

  // Synchronize formData state whenever any individual form control changes
  useEffect(() => {
    setFormData({
      country,
      cities,
      cityInput,
      letAiDecideCities,
      startDate,
      endDate,
      travelersCount,
      totalBudget,
      selectedInterests,
      defaultPace,
      groupEnabled,
      specialPreferences,
      customRequest,
    });
  }, [
    country,
    cities,
    cityInput,
    letAiDecideCities,
    startDate,
    endDate,
    travelersCount,
    totalBudget,
    selectedInterests,
    defaultPace,
    groupEnabled,
    specialPreferences,
    customRequest,
  ]);

  // Save formData to localStorage ('new_trip_draft') on every change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    try {
      const serializedDraft = serializeTripWizardDraft(formData);
      window.localStorage.setItem(NEW_TRIP_DRAFT_STORAGE_KEY, serializedDraft);
      window.localStorage.setItem(FORM_DRAFT_STORAGE_KEY, serializedDraft);
      window.localStorage.setItem(TRIP_DRAFT_STORAGE_KEY, serializedDraft);
    } catch {
      // ignore storage quota errors
    }
  }, [formData]);

  // Sprint 25: Smart Auto-Fill from Firestore user profile on mount ONLY when no saved draft exists
  useEffect(() => {
    let isMounted = true;
    if (hadSavedDraftOnMountRef.current) return;
    const uid = activeAuthUser?.uid;
    if (!uid) return;

    (async () => {
      const profile =
        (await getUserProfile(
          uid,
          activeAuthUser?.email || undefined,
          activeAuthUser?.displayName || undefined
        )) || userProfile;

      if (!isMounted || !profile || hadSavedDraftOnMountRef.current) return;

      const updatedDraft = applyUserProfileToTripDraft(
        {
          country,
          cities,
          cityInput,
          letAiDecideCities,
          startDate,
          endDate,
          travelersCount,
          totalBudget,
          selectedInterests,
          defaultPace,
          groupEnabled,
          specialPreferences,
          customRequest,
        },
        profile
      );

      setTravelersCount(updatedDraft.travelersCount);
      setGroupEnabled(updatedDraft.groupEnabled);
      setDefaultPace(updatedDraft.defaultPace);
      setSelectedInterests([...updatedDraft.selectedInterests]);
      setSpecialPreferences([...updatedDraft.specialPreferences]);
    })();

    return () => {
      isMounted = false;
    };
    // Run on component mount and when authenticated user uid changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAuthUser?.uid]);

  const handleClearForm = useCallback(() => {
    const clean = applyUserProfileToTripDraft(
      createDefaultTripWizardDraft(null),
      activeAuthUser ? userProfile : null
    );
    hadSavedDraftOnMountRef.current = false;
    skipNextDraftSaveRef.current = true;
    try {
      window.localStorage.removeItem(NEW_TRIP_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(FORM_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(TRIP_DRAFT_STORAGE_KEY);
    } catch {
      // ignore localStorage errors
    }
    setFormData(clean);
    setCountry(clean.country);
    setCountrySearch('');
    setIsFilteringCountries(false);
    setCountryDropdownOpen(false);
    setCities([...clean.cities]);
    setCityInput(clean.cityInput);
    setLetAiDecideCities(clean.letAiDecideCities);
    setStartDate(clean.startDate);
    setEndDate(clean.endDate);
    setTravelersCount(clean.travelersCount);
    setTotalBudget(clean.totalBudget);
    setSelectedInterests([...clean.selectedInterests]);
    setDefaultPace(clean.defaultPace);
    setGroupEnabled(clean.groupEnabled);
    setSpecialPreferences([...clean.specialPreferences]);
    setCustomRequest(clean.customRequest);
    setFormError(null);
  }, [activeAuthUser, userProfile]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(e.target as Node)
      ) {
        setCountryDropdownOpen(false);
        setIsFilteringCountries(false);
      }
    };
    if (countryDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [countryDropdownOpen]);

  const activeCountryOption = useMemo(() => findWorldCountry(country), [country]);

  // Keep input display text synced with language switch when a country is selected and user is not mid-typing
  useEffect(() => {
    if (country && activeCountryOption && !isFilteringCountries) {
      setCountrySearch(isPt ? activeCountryOption.labelPt : activeCountryOption.labelEn);
    }
  }, [isPt, country, activeCountryOption, isFilteringCountries]);

  const filteredCountries = useMemo(() => {
    if (!isFilteringCountries || !countrySearch.trim()) {
      return sortedCountries;
    }
    return filterWorldCountries(countrySearch, isPt ? 'pt' : 'en');
  }, [countrySearch, isFilteringCountries, isPt, sortedCountries]);

  const handleSelectCountry = useCallback(
    (nextCountry: string) => {
      const opt = findWorldCountry(nextCountry);
      const label = opt ? (isPt ? opt.labelPt : opt.labelEn) : nextCountry;
      setCountry(nextCountry);
      setCountrySearch(label);
      setIsFilteringCountries(false);
      setCountryDropdownOpen(false);
      setCities([]);
      setCityInput('');
      setFormError(null);
    },
    [isPt]
  );

  const handleCountryInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setCountrySearch(val);
      setIsFilteringCountries(true);
      setCountryDropdownOpen(true);
      setFormError(null);

      const trimmed = val.trim();
      if (!trimmed) {
        setCountry('');
        return;
      }
      const exactMatch = findWorldCountry(trimmed);
      if (exactMatch) {
        setCountry(exactMatch.value);
      } else {
        setCountry('');
      }
    },
    []
  );

  const handleAddCityChip = useCallback(
    async (rawValue?: string) => {
      const candidate = (rawValue ?? cityInput).trim();
      if (!candidate || isVerifyingCity) return;
      const parts = candidate
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Step 1: Fast frontend regex sanitization & profanity/gibberish check before querying any API
      const sanitizedParts: string[] = [];
      for (const part of parts) {
        const sanitized = sanitizeAndCheckLocationInput(part);
        if (!sanitized.valid) {
          const errorMsg = t('wizard.errLocationNotFound');
          setFormError(errorMsg);
          showToast(errorMsg, 'alert');
          return;
        }
        sanitizedParts.push(sanitized.sanitized);
      }

      // Step 2: Geocoding validation against the selected country
      setIsVerifyingCity(true);
      try {
        const resolvedParts: string[] = [];
        for (const cleanPart of sanitizedParts) {
          const geoResult = await validateLocationWithGeocoder(cleanPart, country);
          if (!geoResult.valid) {
            const errorMsg = t('wizard.errLocationNotFound');
            setFormError(errorMsg);
            showToast(errorMsg, 'alert');
            return;
          }
          resolvedParts.push(geoResult.canonicalName || cleanPart);
        }

        setFormError(null);
        setCities((prev) => {
          const next = [...prev];
          for (const part of resolvedParts) {
            if (!next.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
              next.push(part);
            }
          }
          return next;
        });
        if (rawValue === undefined) {
          setCityInput('');
        }
      } finally {
        setIsVerifyingCity(false);
      }
    },
    [cityInput, country, isVerifyingCity, showToast, t]
  );

  const handleCityInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        void handleAddCityChip();
      } else if (e.key === 'Backspace' && !cityInput && cities.length > 0) {
        setCities((prev) => prev.slice(0, -1));
      }
    },
    [handleAddCityChip, cityInput, cities.length]
  );

  const handleRemoveCityChip = useCallback((cityToRemove: string) => {
    setCities((prev) => prev.filter((c) => c !== cityToRemove));
    setFormError(null);
  }, []);

  const toggleInterest = useCallback((id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const toggleSpecialPreference = useCallback((chip: SpecialPreferenceChipOption) => {
    setSpecialPreferences((prev) => toggleRestrictionInList(prev, chip));
  }, []);

  // Compute display destination string for headers & skeleton loader
  const pendingTypedCities =
    !letAiDecideCities && cityInput.trim()
      ? cityInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const effectiveCities = letAiDecideCities
    ? []
    : Array.from(new Set([...cities, ...pendingTypedCities]));
  const computedDestination =
    effectiveCities.length > 0 ? `${effectiveCities.join(', ')}, ${country}` : country;
  const normalizedBudget = useMemo(
    () => normalizeInputBudget(totalBudget, travelersCount),
    [totalBudget, travelersCount]
  );
  const perPersonSuffix = language === 'en' ? '/person' : '/pessoa';

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!country.trim()) {
      setFormError(t('wizard.errCountry'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (selectedInterests.length === 0) {
      setFormError(t('wizard.errInterests'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate any pending unadded city text in the input field before generating
    const verifiedPendingCities: string[] = [];
    if (!letAiDecideCities && pendingTypedCities.length > 0) {
      setIsVerifyingCity(true);
      try {
        for (const pendingCity of pendingTypedCities) {
          const sanitized = sanitizeAndCheckLocationInput(pendingCity);
          if (!sanitized.valid) {
            const errorMsg = t('wizard.errLocationNotFound');
            setFormError(errorMsg);
            showToast(errorMsg, 'alert');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          const geoResult = await validateLocationWithGeocoder(sanitized.sanitized, country);
          if (!geoResult.valid) {
            const errorMsg = t('wizard.errLocationNotFound');
            setFormError(errorMsg);
            showToast(errorMsg, 'alert');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          verifiedPendingCities.push(geoResult.canonicalName || sanitized.sanitized);
        }
      } finally {
        setIsVerifyingCity(false);
      }
    }

    const finalCities = letAiDecideCities
      ? []
      : Array.from(new Set([...cities, ...verifiedPendingCities]));
    const finalDestination =
      finalCities.length > 0 ? `${finalCities.join(', ')}, ${country}` : country;

    setIsGenerating(true);
    try {
      const combinedConstraints = buildSpecialPreferencesConstraintList(
        specialPreferences,
        customRequest
      );
      const [{ bundle }] = await Promise.all([
        generateTripItinerary({
          destination: finalDestination,
          country: country.trim(),
          cities: finalCities,
          letAiDecideCities: letAiDecideCities || finalCities.length === 0,
          startDate,
          endDate,
          totalBudget,
          travelersCount,
          interests: selectedInterests,
          defaultPace,
          assumptions: combinedConstraints,
          specialPreferences,
          customRequest,
          groupEnabled,
          ownerId: currentUser?.uid || 'demo-user',
          ownerName: currentUser?.displayName || 'Ana',
          language,
          uiLanguage: activeLanguage,
          activeLanguage,
        }),
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]);

      writeActiveTripToLocalStorageGuarded(bundle, { allowDemoOverwrite: true });
      await saveTripBundle(bundle);
      try {
        skipNextDraftSaveRef.current = true;
        window.localStorage.removeItem(NEW_TRIP_DRAFT_STORAGE_KEY);
        window.localStorage.removeItem(FORM_DRAFT_STORAGE_KEY);
        window.localStorage.removeItem(TRIP_DRAFT_STORAGE_KEY);
      } catch {
        // ignore localStorage errors
      }
      showToast(t('toast.magicComplete'));
      navigate(`/trips/${bundle.trip.id}`);
    } finally {
      setIsGenerating(false);
    }
  };

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
    <main className="max-w-4xl mx-auto px-0 md:px-8 py-6 md:py-10">
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8"
      >
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif-atlas text-xl md:text-3xl font-bold text-slate-900 dark:text-white break-words">
              {t('wizard.title')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('wizard.step1')} · {t('wizard.step2')} · {t('wizard.step3')}
            </p>
          </div>
          <button
            type="button"
            data-testid="wiz-clear-form-top-btn"
            onClick={handleClearForm}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            {t('wizard.clearFormBtn')}
          </button>
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
                id="wiz-country-label"
                htmlFor="wiz-country"
                className="flex items-center gap-1.5 text-xs font-medium mb-1"
              >
                <Globe className="w-3.5 h-3.5 text-[#D97706]" />
                <span>{t('wizard.countryLabel')}</span>
              </label>
              <div
                ref={countryDropdownRef}
                data-testid="wiz-country-wrapper"
                className="relative w-full"
              >
                <input type="hidden" name="country" value={country} />
                <div className="relative flex items-center">
                  <input
                    id="wiz-country"
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-labelledby="wiz-country-label"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-expanded={countryDropdownOpen}
                    aria-controls="wiz-country-listbox"
                    value={countrySearch}
                    placeholder={t('wizard.countryPlaceholder')}
                    onFocus={() => {
                      setIsFilteringCountries(false);
                      setCountryDropdownOpen(true);
                    }}
                    onClick={() => {
                      setCountryDropdownOpen(true);
                    }}
                    onChange={handleCountryInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setCountryDropdownOpen(false);
                      } else if (e.key === 'Enter' && countryDropdownOpen) {
                        e.preventDefault();
                        if (filteredCountries.length > 0) {
                          handleSelectCountry(filteredCountries[0].value);
                        }
                      }
                    }}
                    className="w-full pl-3.5 pr-9 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={t('wizard.countryLabel')}
                    onClick={() => {
                      setIsFilteringCountries(false);
                      setCountryDropdownOpen((prev) => !prev);
                    }}
                    className="absolute right-2.5 inline-flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        countryDropdownOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <ul
                  id="wiz-country-listbox"
                  role="listbox"
                  aria-labelledby="wiz-country-label"
                  data-testid="wiz-country-dropdown"
                  hidden={!countryDropdownOpen}
                  className={`absolute top-full left-0 w-full max-h-60 overflow-y-auto z-[100] bg-white shadow-xl dark:bg-slate-900 mt-1 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800/60 ${
                    countryDropdownOpen ? 'block' : 'hidden'
                  }`}
                >
                  <CountrySelectOptions
                    countries={filteredCountries}
                    selectedCountry={country}
                    isPt={isPt}
                    emptyMessage={t('wizard.noCountryResults')}
                    onSelect={handleSelectCountry}
                  />
                </ul>
              </div>
            </div>

            <div>
              <label htmlFor="wiz-start" className="block text-xs font-medium mb-1">
                {t('wizard.startDate')}
              </label>
              <input
                id="wiz-start"
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={startDate}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setStartDate(nextStart);
                  if (endDate && nextStart && endDate < nextStart) {
                    setEndDate(nextStart);
                  }
                }}
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
                min={
                  startDate && startDate >= new Date().toISOString().split('T')[0]
                    ? startDate
                    : new Date().toISOString().split('T')[0]
                }
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
                    onChange={(e) => {
                      setCityInput(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    onKeyDown={handleCityInputKeyDown}
                    placeholder={t('wizard.citiesPlaceholder')}
                    className="flex-1 min-w-[140px] sm:min-w-[180px] px-2 py-1 text-xs sm:text-sm bg-transparent focus:outline-none text-slate-900 dark:text-white"
                  />

                  <button
                    type="button"
                    disabled={isVerifyingCity}
                    onClick={() => void handleAddCityChip()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-60 rounded-md transition-colors cursor-pointer"
                  >
                    {isVerifyingCity ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                        <span>{t('wizard.verifyingCity')}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('wizard.addCityBtn')}</span>
                      </>
                    )}
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
              <p
                data-testid="wiz-per-person-budget-hint"
                className="mt-1 text-[11px] font-mono-tabular text-slate-600 dark:text-slate-400"
              >
                ~€{normalizedBudget.inputTotalBudget} (~€{normalizedBudget.perPersonBudget}
                {perPersonSuffix})
              </p>
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
                      {t(`interest.${item.id}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 overflow-hidden">
            <div
              data-testid="wizard-vibe-slider-container"
              className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium mb-1 overflow-hidden"
            >
              <label
                htmlFor="wiz-pace"
                data-testid="wizard-vibe-slider-label"
                className="w-full md:w-auto max-w-full whitespace-normal break-words text-xs md:text-sm"
              >
                {t('wizard.paceLabel')}
              </label>
              <span className="font-mono-tabular text-xs">
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

        {/* Step 3: Restrictions & Special Requests (Optional) */}
        <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
              {t('wizard.step3')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {t('wizard.step3Subtitle')}
            </p>
          </div>

          <div
            data-testid="wiz-special-preferences-chips"
            className="flex flex-wrap gap-2.5"
          >
            {SPECIAL_PREFERENCE_CHIPS.map((chip) => {
              const isSelected = doesRestrictionMatchChip(specialPreferences, chip);
              const displayLabel = t(
                `wizard.prefChip.${chip.id}`,
                isPt ? chip.labelPt : chip.labelEn
              );
              return (
                <button
                  key={chip.id}
                  type="button"
                  data-testid={`pref-chip-${chip.id}`}
                  aria-pressed={isSelected}
                  onClick={() => toggleSpecialPreference(chip)}
                  className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500 shadow-sm'
                      : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                  }`}
                >
                  <span aria-hidden="true">{chip.icon}</span>
                  <span>{displayLabel}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 dark:text-white shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1">
            <label
              htmlFor="wiz-custom-requests"
              className="block text-xs font-semibold text-slate-900 dark:text-white mb-1.5"
            >
              {t('wizard.otherRequestsLabel')}
            </label>
            <textarea
              id="wiz-custom-requests"
              data-testid="wiz-custom-requests"
              rows={3}
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              placeholder={t('wizard.otherRequestsPlaceholder')}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </section>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            data-testid="wiz-clear-form-btn"
            onClick={handleClearForm}
            className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            {t('wizard.clearFormBtn')}
          </button>
          <button
            type="submit"
            data-testid="wiz-generate-btn"
            className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            {t('wizard.generateBtn')}
          </button>
        </div>
      </form>
    </main>
  );
};
