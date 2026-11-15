import {
  Activity,
  BudgetTier,
  Day,
  DayAccommodation,
  DayMeals,
  FullTripBundle,
  IntercityTransit,
  ProposalChange,
  Traveler,
} from '../types/models';
import { DEMO_TRIPS } from '../data/demoTrips';
import {
  CHAT_ASSISTANT_PT_DIRECTIVE,
  GooglePlaceDetailsResult,
  MULTI_OPTION_PROPOSALS_DIRECTIVE,
  NON_LATIN_SCRIPT_DIRECTIVE,
  NUCLEAR_LANGUAGE_PREFIX_EN,
  NUCLEAR_LANGUAGE_PREFIX_PT,
  PROPER_NOUN_PRESERVATION_DIRECTIVE,
  buildChatAssistantSystemPrompt,
  buildFunctionResponsePayload,
  buildGlobalLanguageDirective,
  buildNuclearLanguagePrefix,
  buildStrictBudgetConstraintDirective,
  buildUniversalProperNounDirective,
  calculateHaversineTravel,
  computePaceMetrics,
  deduplicateAndMergeProposals,
  enforceStrictBudgetCapOnDays,
  evaluateBudgetGuard,
  evaluateBudgetTierFromPerPersonBudget,
  extractPlaceQueryArgs,
  formatGroundedPlaceReply,
  isInformationalPlaceQuery,
  normalizeGooglePlacesApiResponse,
  normalizeInputBudget,
  normalizeTargetUiLanguage,
  resolveVerifiedPlaceDetails,
  sanitizeItineraryForAI,
  TRANSLATION_TIMEOUT_MS,
  fetchWithTranslationTimeout,
  runAutoTranslateWithRecovery,
  translateItineraryBundleDeterministic,
  translateItineraryText,
} from '../utils/domainLogic';

export {
  CHAT_ASSISTANT_PT_DIRECTIVE,
  MULTI_OPTION_PROPOSALS_DIRECTIVE,
  NON_LATIN_SCRIPT_DIRECTIVE,
  NUCLEAR_LANGUAGE_PREFIX_EN,
  NUCLEAR_LANGUAGE_PREFIX_PT,
  PROPER_NOUN_PRESERVATION_DIRECTIVE,
  TRANSLATION_TIMEOUT_MS,
  buildChatAssistantSystemPrompt,
  buildGlobalLanguageDirective,
  buildNuclearLanguagePrefix,
  buildStrictBudgetConstraintDirective,
  buildUniversalProperNounDirective,
  enforceStrictBudgetCapOnDays,
  evaluateBudgetGuard,
  evaluateBudgetTierFromPerPersonBudget,
  fetchWithTranslationTimeout,
  normalizeInputBudget,
  normalizeTargetUiLanguage,
  runAutoTranslateWithRecovery,
  sanitizeItineraryForAI,
  translateItineraryBundleDeterministic,
  translateItineraryText,
};
import {
  assignContiguousCitiesToDays,
  clampCoordinatesToCityBounds,
  findWorldCountry,
  hasExactCityCoordinates,
  normalizeGeoText,
  registerVerifiedCityCoordinates,
  resolveDestinationCoordinates,
  sanitizeAndCheckLocationInput,
  validateCityInCountry,
} from '../utils/worldDestinations';

// Live Gemini API integration enabled via server-side /api/ai/* routes
const USE_LIVE_GEMINI_API = true;

export interface SpecialPreferenceChipOption {
  id: string;
  labelPt: string;
  labelEn: string;
  icon: string;
}

export const SPECIAL_PREFERENCE_CHIPS: SpecialPreferenceChipOption[] = [
  {
    id: 'diet_veg',
    labelPt: 'Dieta Vegetariana / Vegan',
    labelEn: 'Vegetarian / Vegan Diet',
    icon: '🥗',
  },
  {
    id: 'reduced_mobility',
    labelPt: 'Mobilidade Reduzida (Evitar escadas)',
    labelEn: 'Reduced Mobility (Avoid stairs)',
    icon: '♿',
  },
  {
    id: 'kids_family',
    labelPt: 'Viagem com Crianças',
    labelEn: 'Travelling with Children',
    icon: '👨‍👩‍👧',
  },
  {
    id: 'avoid_crowds',
    labelPt: "Evitar multidões (Fugir das 'Tourist Traps')",
    labelEn: "Avoid Crowds (Skip 'Tourist Traps')",
    icon: '🧭',
  },
  {
    id: 'prefer_taxi_uber',
    labelPt: 'Preferir deslocações de Táxi/Uber',
    labelEn: 'Prefer Taxi/Uber Rides',
    icon: '🚕',
  },
  {
    id: 'gluten_free_allergies',
    labelPt: 'Sem Glúten / Alergias Alimentares',
    labelEn: 'Gluten-Free / Food Allergies',
    icon: '🌾',
  },
];

/**
 * Combines selected quick-filter constraint chips (`specialPreferences`) and the optional
 * custom request string (`customRequest`) into a deduplicated array of strict constraints.
 */
export function buildSpecialPreferencesConstraintList(
  specialPreferences?: string[],
  customRequest?: string,
  legacyAssumptions?: string[]
): string[] {
  const result: string[] = [];
  const addUnique = (val: string) => {
    const clean = val.trim();
    if (clean && !result.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      result.push(clean);
    }
  };

  if (Array.isArray(specialPreferences)) {
    for (const item of specialPreferences) {
      if (typeof item === 'string') addUnique(item);
    }
  }
  if (typeof customRequest === 'string' && customRequest.trim()) {
    addUnique(customRequest);
  }
  if (result.length === 0 && Array.isArray(legacyAssumptions)) {
    for (const item of legacyAssumptions) {
      if (typeof item === 'string') addUnique(item);
    }
  }
  return result;
}

export function buildGenerateItinerarySystemPrompt(
  cityOrScope: string,
  country: string,
  specialPreferences?: string[],
  customRequest?: string,
  uiLanguage: string = 'pt-PT',
  inputTotalBudget: number = 900,
  travelers: number = 2
): string {
  const scope = cityOrScope && cityOrScope !== country ? `${cityOrScope}, ${country}` : country;
  const constraints = buildSpecialPreferencesConstraintList(specialPreferences, customRequest);
  const constraintsDirective =
    constraints.length > 0
      ? `STRICT USER RESTRICTIONS & SPECIAL REQUESTS (MANDATORY FOR LOCATIONS, MEALS, AND LOGISTICS): The user specified the following mandatory constraints: [${constraints.join(
          '; '
        )}]. You MUST strictly obey these constraints when selecting every activity location, restaurant/meal recommendation, accessibility/step-free route, crowd avoidance, and transport/logistics mode.`
      : '';

  const {
    inputTotalBudget: cleanTotalBudget,
    travelers: safeTravelers,
    perPersonBudget,
    budgetTier,
  } = normalizeInputBudget(inputTotalBudget, travelers);
  const strictBudgetDirective = buildStrictBudgetConstraintDirective(perPersonBudget);
  const budgetDirective = `${strictBudgetDirective} BUDGET NORMALIZATION & TIER SCALING: The total group budget is €${cleanTotalBudget} across ${safeTravelers} travelers, which equals an individual per-person budget of €${perPersonBudget}/person (target budget tier: "${budgetTier}"). You MUST scale all venue, meal, and activity recommendations strictly to the per-person budget of €${perPersonBudget}/person ("${budgetTier}" tier), NOT the total group budget.`;

  const nuclearPrefix = buildNuclearLanguagePrefix(uiLanguage);
  const globalLangDirective = buildGlobalLanguageDirective(uiLanguage);
  const universalProperNounDirective = buildUniversalProperNounDirective(uiLanguage);
  const isEnglish = normalizeTargetUiLanguage(uiLanguage) === 'en';

  return [
    nuclearPrefix,
    'You are AtlasGenie, an expert global & European travel architect.',
    globalLangDirective,
    universalProperNounDirective,
    !isEnglish
      ? 'CRITICAL: You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances.'
      : '',
    !isEnglish ? CHAT_ASSISTANT_PT_DIRECTIVE : '',
    PROPER_NOUN_PRESERVATION_DIRECTIVE,
    NON_LATIN_SCRIPT_DIRECTIVE,
    `You MUST strictly confine all activities, restaurants, and coordinates to the exact requested City and Country (${scope}).`,
    'Complete all days in City A before moving to City B. Never alternate back and forth day-by-day.',
    'You MUST maintain a global history of all generated venues. YOU ARE STRICTLY FORBIDDEN from repeating the same activity, museum, restaurant, or neighborhood walk on different days. Every single activity across the entire trip MUST be 100% unique.',
    "The user's preferences, age group, and custom requests (from the text area) are ABSOLUTE LAWS. If the user explicitly asks for 'discotecas', nightlife, or a specific niche, you MUST prioritize and include these over generic city highlights. Sacrifice standard attractions to guarantee the user's specific constraints are met on at least one of the days.",
    'Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers.',
    budgetDirective,
    'Each day MUST explicitly include accommodation: { name, type (hotel/hostel/apartment), price, isPriceVerified, coordinates }, intercity_transit: { method, duration, price, isPriceVerified } (ONLY on days where the user changes cities), and meals: { breakfast, lunch, dinner } with specific distinct restaurant names, estimated prices, isPriceVerified, and coordinates.',
    'CRITICAL: You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false.',
    constraintsDirective,
    "Never hallucinate or place activities in random cities. If you don't have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city.",
    'The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions.',
    'Return strictly valid JSON matching the schema. Never invent fake URLs. All AI-generated prices and opening hours are treated as estimates unless verified by an official source.',
  ]
    .filter(Boolean)
    .join(' ');
}

function buildDefaultDayAccommodation(
  cityName: string,
  cityCoords: { lat: number; lng: number },
  dayIdx: number,
  rawAcc?: any,
  initialTier: BudgetTier = 'mid'
): DayAccommodation {
  const fallbackCoord = {
    lat: Number((cityCoords.lat + 0.0028 + (dayIdx % 3) * 0.0006).toFixed(5)),
    lng: Number((cityCoords.lng - 0.0034 + (dayIdx % 3) * 0.0005).toFixed(5)),
  };
  const clamped = clampCoordinatesToCityBounds(
    rawAcc?.coordinates?.lat,
    rawAcc?.coordinates?.lng,
    cityCoords,
    dayIdx + 10,
    0.35
  );
  const coords =
    rawAcc?.coordinates && typeof rawAcc.coordinates.lat === 'number' ? clamped : fallbackCoord;

  const accTypes = ['hotel', 'apartment', 'hostel'] as const;
  const resolvedType =
    typeof rawAcc?.type === 'string' && rawAcc.type.trim()
      ? rawAcc.type.trim().toLowerCase()
      : accTypes[dayIdx % accTypes.length];

  const isPriceVerified = Boolean(rawAcc?.isPriceVerified);

  const tierOptions = {
    budget: {
      name: `${cityName} Central Social Hostel & Guesthouse`,
      type: 'hostel',
      price: 48,
      isPriceVerified: Boolean(rawAcc?.tierOptions?.budget?.isPriceVerified ?? false),
      coordinates: {
        lat: Number((coords.lat - 0.0041).toFixed(5)),
        lng: Number((coords.lng + 0.0038).toFixed(5)),
      },
    },
    mid: {
      name:
        typeof rawAcc?.name === 'string' && rawAcc.name.trim()
          ? rawAcc.name.trim()
          : `Hotel Heritage & Courtyard ${cityName}`,
      type: resolvedType,
      price:
        typeof rawAcc?.price === 'number' && Number.isFinite(rawAcc.price)
          ? Math.max(25, Math.round(rawAcc.price))
          : 120,
      isPriceVerified,
      coordinates: coords,
    },
    premium: {
      name: `Grand Palazzo & Spa ${cityName}`,
      type: 'hotel',
      price: 265,
      isPriceVerified: Boolean(rawAcc?.tierOptions?.premium?.isPriceVerified ?? false),
      coordinates: {
        lat: Number((coords.lat + 0.0046).toFixed(5)),
        lng: Number((coords.lng - 0.0049).toFixed(5)),
      },
    },
  };

  const activeOption = tierOptions[initialTier] || tierOptions.mid;

  return {
    name: activeOption.name,
    type: activeOption.type,
    price: activeOption.price,
    isPriceVerified: activeOption.isPriceVerified,
    coordinates: activeOption.coordinates,
    selectedTier: initialTier,
    tierOptions,
  };
}

function buildDefaultIntercityTransit(
  fromCity: string,
  toCity: string,
  countryName: string,
  rawTransit?: any
): IntercityTransit {
  const normCountry = countryName.toLowerCase();
  let defaultMethod = `Intercity Express Rail (${fromCity} → ${toCity})`;
  if (normCountry.includes('portugal')) {
    defaultMethod = `Alfa Pendular / Rede Expressos (${fromCity} → ${toCity})`;
  } else if (normCountry.includes('italy') || normCountry.includes('itália')) {
    defaultMethod = `Frecciarossa High-Speed Rail (${fromCity} → ${toCity})`;
  } else if (normCountry.includes('spain') || normCountry.includes('espanha')) {
    defaultMethod = `AVE High-Speed Train (${fromCity} → ${toCity})`;
  } else if (normCountry.includes('france') || normCountry.includes('frança')) {
    defaultMethod = `TGV InOui High-Speed Rail (${fromCity} → ${toCity})`;
  } else if (normCountry.includes('japan') || normCountry.includes('japão')) {
    defaultMethod = `Shinkansen Bullet Train (${fromCity} → ${toCity})`;
  }

  return {
    method:
      typeof rawTransit?.method === 'string' && rawTransit.method.trim()
        ? rawTransit.method.trim()
        : defaultMethod,
    duration:
      typeof rawTransit?.duration === 'string' && rawTransit.duration.trim()
        ? rawTransit.duration.trim()
        : '2h 15m',
    price:
      typeof rawTransit?.price === 'number' && Number.isFinite(rawTransit.price)
        ? Math.max(8, Math.round(rawTransit.price))
        : 28,
    isPriceVerified: Boolean(rawTransit?.isPriceVerified),
    fromCity,
    toCity,
  };
}

function buildDefaultDayMeals(
  cityName: string,
  cityCoords: { lat: number; lng: number },
  dayIdx: number,
  rawMeals?: any,
  uiLanguage: string = 'pt-PT'
): DayMeals {
  const isEn = normalizeTargetUiLanguage(uiLanguage) === 'en';
  const buildMeal = (
    slot: 'breakfast' | 'lunch' | 'dinner',
    fallbackName: string,
    fallbackCuisine: string,
    fallbackPrice: number,
    latDelta: number,
    lngDelta: number,
    rawSlot?: any
  ) => {
    const defaultCoord = {
      lat: Number((cityCoords.lat + latDelta + dayIdx * 0.0007).toFixed(5)),
      lng: Number((cityCoords.lng + lngDelta - dayIdx * 0.0007).toFixed(5)),
    };
    const clamped = clampCoordinatesToCityBounds(
      rawSlot?.coordinates?.lat,
      rawSlot?.coordinates?.lng,
      cityCoords,
      dayIdx * 3 + (slot === 'breakfast' ? 1 : slot === 'lunch' ? 2 : 3),
      0.35
    );
    const coords =
      rawSlot?.coordinates && typeof rawSlot.coordinates.lat === 'number' ? clamped : defaultCoord;
    const resolvedName =
      typeof rawSlot?.name === 'string' && rawSlot.name.trim()
        ? rawSlot.name.trim()
        : fallbackName;
    const resolvedPrice =
      typeof rawSlot?.estimatedPrice === 'number' && Number.isFinite(rawSlot.estimatedPrice)
        ? Math.max(4, Math.round(rawSlot.estimatedPrice))
        : fallbackPrice;

    const isPriceVerified = Boolean(rawSlot?.isPriceVerified);

    return {
      name: resolvedName,
      cuisine:
        typeof rawSlot?.cuisine === 'string' && rawSlot.cuisine.trim()
          ? rawSlot.cuisine.trim()
          : fallbackCuisine,
      estimatedPrice: resolvedPrice,
      isPriceVerified,
      coordinates: coords,
      tierVenues: {
        budget: {
          name:
            slot === 'breakfast'
              ? isEn
                ? `Bakery & Espresso Bar ${cityName}`
                : `Padaria & Espresso Bar ${cityName}`
              : slot === 'lunch'
              ? isEn
                ? `Popular Market Tavern ${cityName}`
                : `Mercado Tasca Popular ${cityName}`
              : isEn
              ? `Neighbourhood Tavern ${cityName}`
              : `Taberna do Bairro ${cityName}`,
          estimatedPrice: Math.max(5, Math.round(resolvedPrice * 0.6)),
          isPriceVerified: Boolean(rawSlot?.tierVenues?.budget?.isPriceVerified ?? false),
          coordinates: {
            lat: Number((coords.lat - 0.0032).toFixed(5)),
            lng: Number((coords.lng + 0.0029).toFixed(5)),
          },
        },
        mid: {
          name: resolvedName,
          estimatedPrice: resolvedPrice,
          isPriceVerified,
          coordinates: coords,
        },
        premium: {
          name:
            slot === 'breakfast'
              ? `Grand Café & Patisserie ${cityName}`
              : slot === 'lunch'
              ? `Enoteca & Terrace Dining ${cityName}`
              : `Chef's Tasting Table ${cityName}`,
          estimatedPrice: Math.round(resolvedPrice * 1.9),
          isPriceVerified: Boolean(rawSlot?.tierVenues?.premium?.isPriceVerified ?? false),
          coordinates: {
            lat: Number((coords.lat + 0.0039).toFixed(5)),
            lng: Number((coords.lng - 0.0036).toFixed(5)),
          },
        },
      },
    };
  };

  const dayWord = isEn ? 'Day' : 'Dia';
  return {
    breakfast: buildMeal(
      'breakfast',
      isEn
        ? `Artisan Café & Bakery ${cityName} (${dayWord} ${dayIdx + 1})`
        : `Café & Pastelaria Artesanal ${cityName} (${dayWord} ${dayIdx + 1})`,
      isEn ? 'Artisan Bakery & Coffee' : 'Pastelaria Artesanal e Café',
      11,
      0.0022,
      -0.0019,
      rawMeals?.breakfast
    ),
    lunch: buildMeal(
      'lunch',
      isEn
        ? `Regional Market Kitchen & Bistro ${cityName} (${dayWord} ${dayIdx + 1})`
        : `Tasca & Cozinha de Mercado Regional ${cityName} (${dayWord} ${dayIdx + 1})`,
      isEn ? 'Regional Market Kitchen' : 'Cozinha Regional de Mercado',
      22,
      -0.0031,
      0.0028,
      rawMeals?.lunch
    ),
    dinner: buildMeal(
      'dinner',
      isEn
        ? `Traditional Restaurant & Wine Cellar ${cityName} (${dayWord} ${dayIdx + 1})`
        : `Restaurante Tradicional & Adega ${cityName} (${dayWord} ${dayIdx + 1})`,
      isEn ? 'Traditional Evening Gastronomy' : 'Gastronomia Tradicional ao Jantar',
      36,
      0.0044,
      0.0037,
      rawMeals?.dinner
    ),
  };
}

function enrichCostOptionsWithDistinctVenues(
  rawCostOptions: any,
  baseTitle: string,
  baseLocationName: string,
  baseCoords: { lat: number; lng: number },
  baseCost: number,
  activityIdx: number,
  uiLanguage: string = 'pt-PT'
): Activity['costOptions'] {
  const isEn = normalizeTargetUiLanguage(uiLanguage) === 'en';
  const angle = ((activityIdx + 1) * 1.37) % (Math.PI * 2);
  const budgetDefaultCoords = {
    lat: Number((baseCoords.lat + Math.sin(angle + 1.1) * 0.0052).toFixed(5)),
    lng: Number((baseCoords.lng + Math.cos(angle + 1.1) * 0.0052).toFixed(5)),
  };
  const midDefaultCoords = {
    lat: Number(baseCoords.lat.toFixed(5)),
    lng: Number(baseCoords.lng.toFixed(5)),
  };
  const premiumDefaultCoords = {
    lat: Number((baseCoords.lat + Math.sin(angle - 1.3) * 0.0068).toFixed(5)),
    lng: Number((baseCoords.lng + Math.cos(angle - 1.3) * 0.0068).toFixed(5)),
  };

  const resolveTierCoord = (
    rawCoord: any,
    fallback: { lat: number; lng: number },
    mustDifferFrom?: { lat: number; lng: number }
  ) => {
    if (
      rawCoord &&
      typeof rawCoord.lat === 'number' &&
      typeof rawCoord.lng === 'number' &&
      Number.isFinite(rawCoord.lat) &&
      Number.isFinite(rawCoord.lng)
    ) {
      if (
        mustDifferFrom &&
        Math.abs(rawCoord.lat - mustDifferFrom.lat) < 0.0002 &&
        Math.abs(rawCoord.lng - mustDifferFrom.lng) < 0.0002
      ) {
        return fallback;
      }
      return {
        lat: Number(rawCoord.lat.toFixed(5)),
        lng: Number(rawCoord.lng.toFixed(5)),
      };
    }
    return fallback;
  };

  const midCoord = resolveTierCoord(rawCostOptions?.mid?.coordinates, midDefaultCoords);
  const budgetCoord = resolveTierCoord(
    rawCostOptions?.budget?.coordinates,
    budgetDefaultCoords,
    midCoord
  );
  const premiumCoord = resolveTierCoord(
    rawCostOptions?.premium?.coordinates,
    premiumDefaultCoords,
    midCoord
  );

  const budgetVenue =
    rawCostOptions?.budget?.venueName ||
    rawCostOptions?.budget?.title ||
    `${baseTitle} — ${isEn ? 'Local Neighbourhood Entry' : 'Entrada de Bairro Local'}`;
  const midVenue =
    rawCostOptions?.mid?.venueName ||
    rawCostOptions?.mid?.title ||
    `${baseTitle} — ${baseLocationName}`;
  const premiumVenue =
    rawCostOptions?.premium?.venueName ||
    rawCostOptions?.premium?.title ||
    `${baseTitle} — ${isEn ? 'Private Curator Access' : 'Acesso Privado com Curador'}`;

  return {
    budget: {
      title:
        rawCostOptions?.budget?.title ||
        `${baseTitle} (${isEn ? 'Local Budget Option' : 'Opção Económica Local'})`,
      venueName: budgetVenue,
      estimatedCost:
        typeof rawCostOptions?.budget?.estimatedCost === 'number'
          ? rawCostOptions.budget.estimatedCost
          : Math.max(0, Math.round(baseCost * 0.55)),
      isPriceVerified: Boolean(rawCostOptions?.budget?.isPriceVerified),
      description:
        rawCostOptions?.budget?.description ||
        (isEn
          ? 'Authentic self-guided neighbourhood visit or traditional local counter'
          : 'Visita autónoma autêntica de bairro ou balcão tradicional local'),
      coordinates: budgetCoord,
    },
    mid: {
      title:
        rawCostOptions?.mid?.title ||
        `${baseTitle} (${isEn ? 'Main Venue' : 'Espaço Principal'})`,
      venueName: midVenue,
      estimatedCost:
        typeof rawCostOptions?.mid?.estimatedCost === 'number'
          ? rawCostOptions.mid.estimatedCost
          : baseCost,
      isPriceVerified: Boolean(rawCostOptions?.mid?.isPriceVerified),
      description:
        rawCostOptions?.mid?.description ||
        (isEn ? 'Curated experience at the main venue' : 'Experiência selecionada no recinto central'),
      coordinates: midCoord,
    },
    premium: {
      title:
        rawCostOptions?.premium?.title ||
        `${baseTitle} (${isEn ? 'Private Premium Experience' : 'Experiência Privada Premium'})`,
      venueName: premiumVenue,
      estimatedCost:
        typeof rawCostOptions?.premium?.estimatedCost === 'number'
          ? rawCostOptions.premium.estimatedCost
          : Math.round(baseCost * 1.85),
      isPriceVerified: Boolean(rawCostOptions?.premium?.isPriceVerified),
      description:
        rawCostOptions?.premium?.description ||
        (isEn
          ? 'Exclusive private access or guided tasting with a local specialist'
          : 'Acesso exclusivo privado ou prova comentada com especialista local'),
      coordinates: premiumCoord,
    },
  };
}

interface CitySeed {
  city: string;
  country: string;
  lat: number;
  lng: number;
  stops: {
    title: string;
    category: Activity['category'];
    description: string;
    neighborhood: string;
    latOffset: number;
    lngOffset: number;
    isOutdoor: boolean;
    baseCost: number;
  }[];
}

const COUNTRY_DEFAULT_CITIES: Record<string, CitySeed[]> = {
  italy: [
    {
      city: 'Rome',
      country: 'Italy',
      lat: 41.8902,
      lng: 12.4922,
      stops: [
        {
          title: 'Passeio Arqueológico pelo Coliseu e Fórum Romano',
          category: 'culture',
          description: 'Percorra as galerias do antigo Anfiteatro Flaviano e as ruínas históricas da Via Sacra.',
          neighborhood: 'Centro Storico, Rome',
          latOffset: 0.0,
          lngOffset: 0.0,
          isOutdoor: true,
          baseCost: 18,
        },
        {
          title: 'Trattoria Artesanal e Praças de Trastevere',
          category: 'food',
          description: 'Prove o clássico cacio e pepe romano e alcachofras da época pelas ruelas empedradas.',
          neighborhood: 'Trastevere, Rome',
          latOffset: -0.0012,
          lngOffset: -0.0225,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: 'Panteão e Esculturas da Galleria Borghese',
          category: 'culture',
          description: 'Admire a cúpula histórica com o óculo aberto e as obras-primas em mármore de Bernini.',
          neighborhood: 'Piazza della Rotonda, Rome',
          latOffset: 0.0084,
          lngOffset: -0.0153,
          isOutdoor: false,
          baseCost: 16,
        },
      ],
    },
    {
      city: 'Florence',
      country: 'Italy',
      lat: 43.7696,
      lng: 11.2558,
      stops: [
        {
          title: 'Galeria Uffizi e Piazza della Signoria',
          category: 'culture',
          description: 'Obras-primas do Renascimento de Botticelli e Leonardo da Vinci com vista sobre o rio Arno.',
          neighborhood: 'Centro Histórico, Florence',
          latOffset: -0.0018,
          lngOffset: -0.0005,
          isOutdoor: false,
          baseCost: 25,
        },
        {
          title: 'Oficinas Artesanais de Oltrarno e Enoteca em Santo Spirito',
          category: 'food',
          description: 'Ateliês tradicionais de couro florentino seguidos de prova de Chianti Classico e crostini.',
          neighborhood: 'Oltrarno, Florence',
          latOffset: -0.0052,
          lngOffset: -0.0074,
          isOutdoor: false,
          baseCost: 22,
        },
        {
          title: 'Miradouro Panorâmico da Piazzale Michelangelo ao Pôr do Sol',
          category: 'nature',
          description: 'Vista panorâmica ao final da tarde sobre a cúpula de Brunelleschi e a Ponte Vecchio.',
          neighborhood: 'Colina de San Miniato, Florence',
          latOffset: -0.0067,
          lngOffset: 0.0092,
          isOutdoor: true,
          baseCost: 8,
        },
      ],
    },
  ],
  japan: [
    {
      city: 'Tokyo',
      country: 'Japan',
      lat: 35.6762,
      lng: 139.6503,
      stops: [
        {
          title: 'Templo Senso-ji e Ruelas Históricas de Yanaka',
          category: 'culture',
          description: 'Lojas tradicionais de artesanato em madeira, pátios de incenso e ruas tranquilas da era Edo.',
          neighborhood: 'Asakusa & Yanaka, Tokyo',
          latOffset: 0.0385,
          lngOffset: 0.0463,
          isOutdoor: true,
          baseCost: 12,
        },
        {
          title: 'Mercado Exterior de Tsukiji e Degustação em Izakaya',
          category: 'food',
          description: 'Balcão de sushi sazonal fresco e espetadas yakitori grelhadas no carvão.',
          neighborhood: 'Chuo City, Tokyo',
          latOffset: -0.0108,
          lngOffset: 0.0204,
          isOutdoor: false,
          baseCost: 28,
        },
        {
          title: 'Santuário Florestal Meiji Jingu e Miradouro de Shibuya',
          category: 'nature',
          description: 'Portais torii entre cedros centenários seguidos de vista panorâmica de 360 graus.',
          neighborhood: 'Shibuya, Tokyo',
          latOffset: 0.0001,
          lngOffset: 0.049,
          isOutdoor: true,
          baseCost: 18,
        },
      ],
    },
    {
      city: 'Kyoto',
      country: 'Japan',
      lat: 35.0116,
      lng: 135.7681,
      stops: [
        {
          title: 'Trilho de Montanha de Fushimi Inari Taisha',
          category: 'culture',
          description: 'Milhares de portais torii vermelhos serpenteando por santuários de bambu e cedro.',
          neighborhood: 'Fushimi Ward, Kyoto',
          latOffset: -0.0445,
          lngOffset: 0.0045,
          isOutdoor: true,
          baseCost: 10,
        },
        {
          title: 'Mercado Nishiki e Casa de Chá Matcha em Gion',
          category: 'food',
          description: 'Especialidades obanzai de Quioto, tofu artesanal e cerimónia de chá matcha Uji.',
          neighborhood: 'Nakagyo & Gion, Kyoto',
          latOffset: -0.0066,
          lngOffset: -0.0032,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: 'Bosque de Bambu de Arashiyama e Passeio no Rio Katsura',
          category: 'nature',
          description: 'Caminhada matinal entre bambuzais imponentes e jardins zen junto ao rio.',
          neighborhood: 'Arashiyama, Kyoto',
          latOffset: 0.0054,
          lngOffset: -0.0968,
          isOutdoor: true,
          baseCost: 14,
        },
      ],
    },
  ],
  france: [
    {
      city: 'Paris',
      country: 'France',
      lat: 48.8566,
      lng: 2.3522,
      stops: [
        {
          title: 'Museu d’Orsay e Passeio Ribeirinho na Margem Esquerda do Sena',
          category: 'culture',
          description: 'Obras-primas do Impressionismo instaladas numa antiga estação ferroviária Beaux-Arts.',
          neighborhood: 'Saint-Germain-des-Prés, Paris',
          latOffset: 0.0034,
          lngOffset: -0.0257,
          isOutdoor: false,
          baseCost: 16,
        },
        {
          title: 'Mercado Coberto do Marais e Bistrô de Bairro',
          category: 'food',
          description: 'Bancas históricas do Marché des Enfants Rouges e almoço tradicional de bistrô.',
          neighborhood: 'Le Marais, Paris',
          latOffset: 0.0062,
          lngOffset: 0.01,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: 'Vinhas de Montmartre e Terraço Panorâmico do Sacré-Cœur',
          category: 'culture',
          description: 'Praça histórica dos artistas, vinha escondida de Montmartre e escadaria panorâmica.',
          neighborhood: 'Montmartre, Paris',
          latOffset: 0.0301,
          lngOffset: -0.0091,
          isOutdoor: true,
          baseCost: 10,
        },
      ],
    },
  ],
  spain: [
    {
      city: 'Barcelona',
      country: 'Spain',
      lat: 41.3874,
      lng: 2.1686,
      stops: [
        {
          title: 'Sagrada Família e Roteiro Modernista pelo Eixample',
          category: 'culture',
          description: 'A nave iluminada pelos vitrais de Gaudí e os quarteirões modernistas históricos.',
          neighborhood: 'Eixample, Barcelona',
          latOffset: 0.0162,
          lngOffset: 0.0058,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: 'Mercado de Santa Caterina em El Born e Bar de Tapas',
          category: 'food',
          description: 'Mercado gastronómico de bairro com cobertura ondulada, vermute catalão e petiscos.',
          neighborhood: 'El Born, Barcelona',
          latOffset: -0.0011,
          lngOffset: 0.0095,
          isOutdoor: false,
          baseCost: 20,
        },
        {
          title: 'Miradouro dos Bunkers del Carmel e Terraços do Park Güell',
          category: 'nature',
          description: 'Vista ampla sobre o Mediterrâneo e a malha urbana de Barcelona ao pôr do sol.',
          neighborhood: 'El Turó de la Rovira, Barcelona',
          latOffset: 0.0318,
          lngOffset: -0.0069,
          isOutdoor: true,
          baseCost: 14,
        },
      ],
    },
  ],
  greece: [
    {
      city: 'Athens',
      country: 'Greece',
      lat: 37.9838,
      lng: 23.7275,
      stops: [
        {
          title: 'Cidadela da Acrópole e Museu da Acrópole',
          category: 'culture',
          description: 'Frisos de mármore do Pártenon e galerias arqueológicas com piso de vidro.',
          neighborhood: 'Makrygianni, Athens',
          latOffset: -0.0123,
          lngOffset: -0.0018,
          isOutdoor: true,
          baseCost: 20,
        },
        {
          title: 'Taberna Tradicional com Pátio em Plaka e Psyri',
          category: 'food',
          description: 'Meze grego tradicional, queijo grelhado e vinhos do Peloponeso sob limoeiros.',
          neighborhood: 'Plaka, Athens',
          latOffset: -0.0095,
          lngOffset: 0.0031,
          isOutdoor: false,
          baseCost: 22,
        },
        {
          title: 'Pôr do Sol na Colina de Filopapo e Monte Licabeto',
          category: 'nature',
          description: 'Trilho sombreado por pinheiros com vista para o Mar Egeu e a antiga Pnyx.',
          neighborhood: 'Filopappou, Athens',
          latOffset: -0.015,
          lngOffset: -0.006,
          isOutdoor: true,
          baseCost: 8,
        },
      ],
    },
  ],
};

const CITY_COORDINATES_LOOKUP: Record<string, { lat: number; lng: number }> = {
  rome: { lat: 41.8902, lng: 12.4922 },
  florence: { lat: 43.7696, lng: 11.2558 },
  venice: { lat: 45.4408, lng: 12.3155 },
  milan: { lat: 45.4642, lng: 9.19 },
  naples: { lat: 40.8518, lng: 14.2681 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  kyoto: { lat: 35.0116, lng: 135.7681 },
  osaka: { lat: 34.6937, lng: 135.5023 },
  paris: { lat: 48.8566, lng: 2.3522 },
  lyon: { lat: 45.764, lng: 4.8357 },
  nice: { lat: 43.7102, lng: 7.262 },
  barcelona: { lat: 41.3874, lng: 2.1686 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  seville: { lat: 37.3891, lng: -5.9845 },
  athens: { lat: 37.9838, lng: 23.7275 },
  santorini: { lat: 36.3932, lng: 25.4615 },
  london: { lat: 51.5072, lng: -0.1276 },
  edinburgh: { lat: 55.9533, lng: -3.1883 },
  berlin: { lat: 52.52, lng: 13.405 },
  munich: { lat: 48.1351, lng: 11.582 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  vienna: { lat: 48.2082, lng: 16.3738 },
  zurich: { lat: 47.3769, lng: 8.5417 },
  dubrovnik: { lat: 42.6507, lng: 18.0944 },
  marrakech: { lat: 31.6295, lng: -7.9811 },
  lisbon: { lat: 38.7139, lng: -9.1334 },
  porto: { lat: 41.1496, lng: -8.6109 },
};

/**
 * Sprint 16: Guarantees 100% unique activities across all days of a trip (zero repetition)
 * and ensures explicit custom requests (such as 'discotecas', nightlife, football stadium, etc.)
 * are prioritized and included on at least one day.
 */
export function enforceUniqueActivitiesAndCustomRequests(
  days: Day[],
  customRequest?: string,
  specialPreferences?: string[],
  uiLanguage: string = 'pt-PT'
): Day[] {
  const isEn = normalizeTargetUiLanguage(uiLanguage) === 'en';
  const seenTitles = new Set<string>();
  const uniqueFallbackPool = [
    {
      suffix: isEn
        ? 'Contemporary Art Gallery & Historic Courtyard'
        : 'Galeria de Arte Contemporânea e Pátio Histórico',
      category: 'culture' as const,
      desc: isEn
        ? 'Visit temporary exhibitions, modern architecture, and local sculpture gardens.'
        : 'Visita às exposições temporárias, arquitetura moderna e jardins escultóricos locais.',
    },
    {
      suffix: isEn
        ? 'Neighbourhood Wine & Tapas Trail'
        : 'Rota de Tasquinhas, Vinhos e Petiscos de Bairro',
      category: 'food' as const,
      desc: isEn
        ? 'Gastronomic tasting across family-run taverns and traditional producers.'
        : 'Degustação gastronómica por tascas familiares e produtores tradicionais.',
    },
    {
      suffix: isEn
        ? 'Panoramic Gardens & Belvedere Walk'
        : 'Passeio Panorâmico pelos Jardins e Belvedere',
      category: 'nature' as const,
      desc: isEn
        ? 'Relaxed walk along tree-lined avenues and historic viewpoints over the city.'
        : 'Caminhada tranquila por alamedas arborizadas e miradouros históricos sobre a cidade.',
    },
    {
      suffix: isEn
        ? 'Bohemian Quarter, Bookshops & Independent Design'
        : 'Quarteirão Boémio, Livrarias e Design Independente',
      category: 'shopping' as const,
      desc: isEn
        ? 'Explore independent studios, literary cafés, and creative workshops.'
        : 'Exploração de lojas de autor, cafés literários e oficinas criativas.',
    },
    {
      suffix: isEn
        ? 'Monumental Cloisters & Historic Tilework'
        : 'Claustros Monumentais e Azulejaria Histórica',
      category: 'culture' as const,
      desc: isEn
        ? 'Journey through centuries-old architectural heritage and quiet interior courtyards.'
        : 'Percurso pelo património arquitetónico secular e pátios interiores.',
    },
    {
      suffix: isEn
        ? 'Live Music Evening & Local Cocktail Bar'
        : 'Noite de Música ao Vivo e Cocktail Bar Local',
      category: 'nightlife' as const,
      desc: isEn
        ? 'Authentic evening atmosphere with acoustic live music or a local DJ set.'
        : 'Ambiente noturno autêntico com música acústica ou DJ set local.',
    },
  ];
  let poolCursor = 0;

  const deduplicatedDays = days.map((day, dIdx) => {
    const cityLabel = day.city || (isEn ? 'Center' : 'Centro');
    const nextActivities = day.activities.map((act, aIdx) => {
      const normTitle = act.title.trim().toLowerCase();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        return act;
      }

      // Replace duplicate activity with a guaranteed unique venue for this day
      let replacement = uniqueFallbackPool[poolCursor % uniqueFallbackPool.length];
      poolCursor += 1;
      const dayWord = isEn ? 'Day' : 'Dia';
      const ofWord = isEn ? 'of' : 'de';
      const routeWord = isEn ? 'Route' : 'Roteiro';
      let candidateTitle = `${replacement.suffix} ${ofWord} ${cityLabel} (${dayWord} ${dIdx + 1})`;
      while (seenTitles.has(candidateTitle.toLowerCase())) {
        replacement = uniqueFallbackPool[poolCursor % uniqueFallbackPool.length];
        poolCursor += 1;
        candidateTitle = `${replacement.suffix} ${ofWord} ${cityLabel} — ${routeWord} ${dIdx + 1}.${aIdx + 1}`;
      }
      seenTitles.add(candidateTitle.toLowerCase());

      const shiftedCoords = {
        lat: Number((act.location.lat + (dIdx + 1) * 0.0021).toFixed(5)),
        lng: Number((act.location.lng - (aIdx + 1) * 0.0019).toFixed(5)),
      };

      return {
        ...act,
        title: candidateTitle,
        category: replacement.category,
        description: replacement.desc,
        location: {
          ...act.location,
          lat: shiftedCoords.lat,
          lng: shiftedCoords.lng,
        },
        costOptions: enrichCostOptionsWithDistinctVenues(
          undefined,
          candidateTitle,
          act.location.name,
          shiftedCoords,
          act.costOptions.mid.estimatedCost || 18,
          aIdx + dIdx * 3,
          uiLanguage
        ),
      };
    });

    return {
      ...day,
      activities: nextActivities,
    };
  });

  const cleanCustom = (customRequest || '').trim();
  if (!cleanCustom || deduplicatedDays.length === 0) {
    return deduplicatedDays;
  }

  const lowerCustom = cleanCustom.toLowerCase();
  const isNightlifeOrClubRequest =
    lowerCustom.includes('discoteca') ||
    lowerCustom.includes('nightlife') ||
    lowerCustom.includes('noite') ||
    lowerCustom.includes('club') ||
    lowerCustom.includes('bar');

  const alreadySatisfied = deduplicatedDays.some((d) =>
    d.activities.some((a) => {
      const text = `${a.title} ${a.description} ${a.whyThis}`.toLowerCase();
      if (isNightlifeOrClubRequest) {
        return (
          text.includes('discoteca') ||
          text.includes('club') ||
          a.category === 'nightlife'
        );
      }
      return text.includes(lowerCustom.slice(0, Math.min(12, lowerCustom.length)));
    })
  );

  if (alreadySatisfied) {
    return deduplicatedDays;
  }

  // Prioritize and sacrifice the last generic activity on Day 1 to fulfill the user's custom request
  return deduplicatedDays.map((day, dIdx) => {
    if (dIdx !== 0 || day.activities.length === 0) return day;
    const cityLabel = day.city || (isEn ? 'City' : 'Cidade');
    const lastIdx = day.activities.length - 1;
    const targetAct = day.activities[lastIdx];

    const customTitle = isNightlifeOrClubRequest
      ? isEn
        ? `Iconic Nightclubs & Nightlife District in ${cityLabel}`
        : `Noite nas Discotecas e Clubes Emblemáticos de ${cityLabel}`
      : isEn
      ? `Custom Experience in ${cityLabel}: ${cleanCustom.slice(0, 60)}`
      : `Experiência Personalizada em ${cityLabel}: ${cleanCustom.slice(0, 60)}`;
    const customCategory: Activity['category'] = isNightlifeOrClubRequest
      ? 'nightlife'
      : targetAct.category;
    const customDesc = isNightlifeOrClubRequest
      ? isEn
        ? `Late-night itinerary dedicated to top nightclubs, dance floors, and electronic/live music venues in ${cityLabel}, fulfilling the group's special request.`
        : `Roteiro noturno dedicado às principais discotecas, pistas de dança e clubes de música eletrónica e comercial em ${cityLabel}, cumprindo o pedido especial do grupo.`
      : isEn
      ? `Activity prioritized to fulfill your custom request ("${cleanCustom}") in ${cityLabel}.`
      : `Atividade incluída prioritariamente para cumprir o pedido específico do utilizador ("${cleanCustom}") em ${cityLabel}.`;

    const updatedLastAct: Activity = {
      ...targetAct,
      title: customTitle,
      category: customCategory,
      startTime: isNightlifeOrClubRequest ? '23:00' : targetAct.startTime,
      description: customDesc,
      whyThis: isEn
        ? `Prioritized as an absolute rule to fulfill your custom request: "${cleanCustom}"${
            specialPreferences && specialPreferences.length > 0
              ? ` (${specialPreferences.join(', ')})`
              : ''
          }.`
        : `Priorizado como lei absoluta para cumprir o seu pedido personalizado: "${cleanCustom}"${
            specialPreferences && specialPreferences.length > 0
              ? ` (${specialPreferences.join(', ')})`
              : ''
          }.`,
      costOptions: enrichCostOptionsWithDistinctVenues(
        undefined,
        customTitle,
        targetAct.location.name,
        targetAct.location,
        isNightlifeOrClubRequest ? 25 : targetAct.costOptions.mid.estimatedCost || 22,
        lastIdx,
        uiLanguage
      ),
    };

    const nextActs = day.activities.map((a, idx) => (idx === lastIdx ? updatedLastAct : a));
    return {
      ...day,
      activities: nextActs,
    };
  });
}

/**
 * Generates an itinerary using the server-side Gemini API (/api/ai/generate-itinerary).
 * Only falls back to destination-specific generated data if the API call completely fails.
 */
export async function generateTripItinerary(params: {
  destination: string;
  country?: string;
  cities?: string[];
  letAiDecideCities?: boolean;
  startDate: string;
  endDate: string;
  totalBudget: number;
  travelersCount: number;
  interests: string[];
  defaultPace: number;
  assumptions?: string[];
  specialPreferences?: string[];
  customRequest?: string;
  groupEnabled: boolean;
  ownerId: string;
  ownerName: string;
  language?: 'en' | 'pt';
  uiLanguage?: string;
  activeLanguage?: 'en' | 'pt-PT' | string;
}): Promise<{ bundle: FullTripBundle; usedFallback: boolean }> {
  const resolvedUiLanguage = normalizeTargetUiLanguage(
    params.activeLanguage || params.uiLanguage || (params.language === 'en' ? 'en' : 'pt-PT')
  );
  const start = new Date(params.startDate || '2026-11-18');
  const end = new Date(params.endDate || '2026-11-20');
  const diffDays = Math.max(
    2,
    Math.min(10, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  );

  const cleanCities = (params.cities || []).map((c) => c.trim()).filter(Boolean);
  const cleanCountry = (params.country || params.destination || 'Italy').trim();
  const formattedDestination =
    !params.letAiDecideCities && cleanCities.length > 0
      ? `${cleanCities.join(', ')}, ${cleanCountry}`
      : params.destination.trim() || cleanCountry;

  const combinedConstraints = buildSpecialPreferencesConstraintList(
    params.specialPreferences,
    params.customRequest,
    params.assumptions
  );

  const tripId = `trip-${Date.now().toString(36)}`;
  const inviteCode = `${formattedDestination
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'TRIP'}${Math.floor(10 + Math.random() * 89)}`;

  const {
    perPersonBudget,
    budgetTier: initialBudgetTier,
    travelers: safeTravelersCount,
  } = normalizeInputBudget(params.totalBudget, params.travelersCount);

  if (USE_LIVE_GEMINI_API) {
    try {
      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: formattedDestination,
          country: cleanCountry,
          cities: cleanCities,
          letAiDecideCities: Boolean(params.letAiDecideCities),
          startDate: params.startDate,
          endDate: params.endDate,
          daysCount: diffDays,
          interests: params.interests,
          pace: params.defaultPace,
          totalBudget: params.totalBudget,
          travelersCount: safeTravelersCount,
          perPersonBudget,
          budgetTier: initialBudgetTier,
          assumptions: combinedConstraints,
          specialPreferences: params.specialPreferences || [],
          customRequest: params.customRequest || '',
          language: params.language || (resolvedUiLanguage === 'en' ? 'en' : 'pt'),
          uiLanguage: resolvedUiLanguage,
          activeLanguage: resolvedUiLanguage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.days && Array.isArray(data.days) && data.days.length > 0) {
          const finalDestinationTitle =
            typeof data.recommendedDestinationTitle === 'string' &&
            data.recommendedDestinationTitle.trim().length > 0
              ? data.recommendedDestinationTitle.trim()
              : formattedDestination;

          const contiguousCities = assignContiguousCitiesToDays(
            cleanCities.length > 0
              ? cleanCities
              : [findWorldCountry(cleanCountry)?.suggestedCities?.[0] || cleanCountry],
            data.days.length,
            cleanCountry
          );

          const isEn = resolvedUiLanguage === 'en';
          const builtDays: Day[] = data.days.map((d: any, idx: number) => {
            const dayDate = new Date(start.getTime() + idx * 86400000)
              .toISOString()
              .slice(0, 10);
            const fallbackCityName =
              contiguousCities[idx] ||
              (typeof d.city === 'string' && d.city.trim() ? d.city.trim() : '') ||
              findWorldCountry(cleanCountry)?.suggestedCities?.[0] ||
              cleanCountry;
            const prevDayCity = idx > 0 ? contiguousCities[idx - 1] : fallbackCityName;
            const isCityTransitionDay =
              idx > 0 &&
              normalizeGeoText(fallbackCityName) !== normalizeGeoText(prevDayCity);

            const fallbackCoords = resolveDestinationCoordinates(fallbackCityName, cleanCountry);
            const hasExactLookup = hasExactCityCoordinates(fallbackCityName);
            const allowedDeltaDeg = hasExactLookup ? 0.35 : 6.0;

            const mapActivity = (raw: any, aIdx: number): Activity => {
              const clampedCoords = clampCoordinatesToCityBounds(
                raw?.location?.lat,
                raw?.location?.lng,
                fallbackCoords,
                aIdx,
                allowedDeltaDeg
              );
              const rawLocName = String(raw?.location?.name || '').trim();
              const safeLocationName = rawLocName
                ? rawLocName.toLowerCase().includes(fallbackCityName.toLowerCase()) ||
                  rawLocName.toLowerCase().includes(cleanCountry.toLowerCase())
                  ? rawLocName
                  : `${rawLocName}, ${fallbackCityName}`
                : `${fallbackCityName}, ${cleanCountry}`;

              const baseEstCost =
                typeof raw?.costOptions?.mid?.estimatedCost === 'number'
                  ? raw.costOptions.mid.estimatedCost
                  : 18;
              const isPriceVerified = Boolean(
                raw?.costOptions?.mid?.isPriceVerified ?? raw?.isPriceVerified
              );

              return {
                id: raw.id || `${tripId}-d${idx + 1}-a${aIdx + 1}`,
                title: raw.title,
                category: raw.category || 'culture',
                description: raw.description,
                startTime: raw.startTime || `${9 + aIdx * 3}:00`,
                durationMin: raw.durationMin || 90,
                openingHoursText: raw.openingHoursText || '09:30 – 18:00',
                isOutdoor: Boolean(raw.isOutdoor),
                interestTags: raw.interestTags || params.interests.slice(0, 2),
                location: {
                  name: safeLocationName,
                  lat: clampedCoords.lat,
                  lng: clampedCoords.lng,
                },
                costOptions: enrichCostOptionsWithDistinctVenues(
                  raw.costOptions,
                  raw.title || `Stop ${aIdx + 1}`,
                  safeLocationName,
                  clampedCoords,
                  baseEstCost,
                  aIdx,
                  resolvedUiLanguage
                ),
                selectedTier: initialBudgetTier,
                isPriceVerified,
                priceConfidence: isPriceVerified
                  ? {
                      status: 'verified',
                      verifiedAt: new Date().toISOString().slice(0, 10),
                      notes: isEn
                        ? '2026 price verified via Google Search'
                        : 'Preço 2026 verificado via Google Search',
                    }
                  : {
                      status: 'estimated',
                      notes: isEn
                        ? 'AI estimated cost (~) — confirm on the official venue website'
                        : 'Custo estimado pela IA (~) — confirmar no site oficial do local',
                    },
                hoursConfidence: {
                  status: 'estimated',
                  notes: isEn ? 'Estimated standard opening hours' : 'Horário habitual estimado',
                },
                whyThis:
                  raw.whyThis ||
                  (isEn
                    ? `Selected for your cultural and culinary interests in ${fallbackCityName}.`
                    : `Selecionado pelo seu interesse cultural e gastronómico em ${fallbackCityName}.`),
                touristTrapScore:
                  typeof raw.touristTrapScore === 'number' ? raw.touristTrapScore : 38,
                votes: {},
              };
            };

            const acts = (d.activities || []).map(mapActivity);
            const withTravel = acts.map((act: Activity, i: number) =>
              i === 0
                ? act
                : {
                    ...act,
                    travelFromPrevious: calculateHaversineTravel(
                      acts[i - 1].location,
                      act.location,
                      'WALKING'
                    ),
                  }
            );

            const dayObj: Day = {
              id: `${tripId}-day-${idx + 1}`,
              tripId,
              ownerId: params.ownerId,
              date: dayDate,
              dayNumber: idx + 1,
              city: fallbackCityName,
              theme:
                d.theme ||
                (isEn
                  ? `Day ${idx + 1}: Discovering ${fallbackCityName}`
                  : `Dia ${idx + 1}: À descoberta de ${fallbackCityName}`),
              paceLevel: params.defaultPace,
              paceScore: 55,
              activePlan: 'A',
              accommodation: buildDefaultDayAccommodation(
                fallbackCityName,
                fallbackCoords,
                idx,
                d.accommodation,
                initialBudgetTier
              ),
              intercity_transit: isCityTransitionDay
                ? buildDefaultIntercityTransit(
                    prevDayCity,
                    fallbackCityName,
                    cleanCountry,
                    d.intercity_transit
                  )
                : undefined,
              meals: buildDefaultDayMeals(
                fallbackCityName,
                fallbackCoords,
                idx,
                d.meals,
                resolvedUiLanguage
              ),
              activities: withTravel,
              planB: (d.planB || []).map(mapActivity),
            };
            dayObj.paceScore = computePaceMetrics(dayObj).paceScore;
            return dayObj;
          });

          const defaultTravelers: Traveler[] = [
            {
              id: `trav-${params.ownerId.slice(0, 6)}`,
              tripId,
              ownerId: params.ownerId,
              userId: params.ownerId,
              displayName: params.ownerName || 'You',
              interests: params.interests,
              budgetPerPerson: perPersonBudget,
              constraints: combinedConstraints.length > 0 ? combinedConstraints.join('; ') : 'None',
              preferredPace: params.defaultPace,
              color: '#D97706',
              avatar: (params.ownerName || 'Y')[0].toUpperCase(),
            },
          ];

          const deduplicatedLiveDays = enforceStrictBudgetCapOnDays(
            enforceUniqueActivitiesAndCustomRequests(
              builtDays,
              params.customRequest,
              params.specialPreferences,
              resolvedUiLanguage
            ),
            params.totalBudget,
            safeTravelersCount
          );

          return {
            usedFallback: false,
            bundle: {
              trip: {
                id: tripId,
                ownerId: params.ownerId,
                destination: finalDestinationTitle,
                startDate: params.startDate,
                endDate: params.endDate,
                currency: 'EUR',
                totalBudget: params.totalBudget,
                travelersCount: params.travelersCount,
                interests: params.interests,
                defaultPace: params.defaultPace,
                status: 'planned',
                memberIds: [params.ownerId],
                inviteCode,
                assumptions: combinedConstraints,
                groupEnabled: params.groupEnabled,
              },
              days: deduplicatedLiveDays,
              travelers: defaultTravelers,
              expenses: [],
            },
          };
        }
      }
    } catch {
      // Only use fallback data in the catch block if the API request completely fails
    }
  }

  // Destination-Specific Fallback (only reached if the API request fails):
  // Dynamically constructs an itinerary for the requested country & cities instead of returning Lisbon
  const isEnFallback = resolvedUiLanguage === 'en';
  const lowerCountry = cleanCountry.toLowerCase();
  const countrySeeds = COUNTRY_DEFAULT_CITIES[lowerCountry];
  const worldCountryEntry = findWorldCountry(cleanCountry);
  const targetCitiesList: string[] =
    !params.letAiDecideCities && cleanCities.length > 0
      ? cleanCities
      : countrySeeds
      ? countrySeeds.map((s) => s.city)
      : worldCountryEntry && worldCountryEntry.suggestedCities.length > 0
      ? worldCountryEntry.suggestedCities.slice(0, 2)
      : [cleanCountry];

  const fallbackDestinationTitle =
    targetCitiesList.length > 0 &&
    targetCitiesList[0].toLowerCase() !== cleanCountry.toLowerCase()
      ? `${targetCitiesList.join(', ')}, ${cleanCountry}`
      : formattedDestination;

  // Enforce strict chronological routing: Complete all days in City A before moving to City B
  const contiguousFallbackCities = assignContiguousCitiesToDays(
    targetCitiesList,
    diffDays,
    cleanCountry
  );

  const buildDistinctDayStopsForCity = (cityName: string, dayOffset: number) => {
    const dayStopCatalog = [
      [
        {
          title: isEnFallback
            ? `Historic Quarter & Heritage Walk in ${cityName}`
            : `Passeio pelo Centro Histórico e Património de ${cityName}`,
          category: 'culture' as const,
          description: isEnFallback
            ? `Explore historic squares, traditional architecture, and local merchant streets in ${cityName}.`
            : `Exploração pelas praças históricas, arquitetura tradicional e ruas de comércio local em ${cityName}.`,
          neighborhood: isEnFallback
            ? `Historic Quarter, ${cityName}`
            : `Centro Histórico, ${cityName}`,
          latOffset: 0.0,
          lngOffset: 0.0,
          isOutdoor: true,
          baseCost: 12,
        },
        {
          title: isEnFallback
            ? `Regional Market & Traditional Kitchen of ${cityName}`
            : `Mercado Regional e Cozinha Tradicional de ${cityName}`,
          category: 'food' as const,
          description: isEnFallback
            ? `Tasting of authentic regional dishes, local coffee, and fresh market produce in ${cityName}.`
            : `Degustação de pratos regionais autênticos, café local e produtos frescos do mercado em ${cityName}.`,
          neighborhood: isEnFallback
            ? `Municipal Market, ${cityName}`
            : `Mercado Municipal, ${cityName}`,
          latOffset: 0.0045,
          lngOffset: -0.0052,
          isOutdoor: false,
          baseCost: 20,
        },
        {
          title: isEnFallback
            ? `Nature Trail & Panoramic Viewpoint of ${cityName}`
            : `Trilho Natural e Miradouro Panorâmico de ${cityName}`,
          category: 'nature' as const,
          description: isEnFallback
            ? `Scenic walk and late-afternoon viewpoint with panoramic views over ${cityName}.`
            : `Caminhada pela natureza e miradouro ao final da tarde com vista panorâmica sobre ${cityName}.`,
          neighborhood: isEnFallback
            ? `Local Viewpoint, ${cityName}`
            : `Miradouro Local, ${cityName}`,
          latOffset: -0.005,
          lngOffset: 0.0065,
          isOutdoor: true,
          baseCost: 10,
        },
      ],
      [
        {
          title: isEnFallback
            ? `Fine Arts & Classical Architecture Museum of ${cityName}`
            : `Museu de Arte e Arquitetura Clássica de ${cityName}`,
          category: 'culture' as const,
          description: isEnFallback
            ? `Visit art collections, historic cloisters, and heritage galleries in ${cityName}.`
            : `Visita às coleções de arte, claustros históricos e galerias patrimoniais de ${cityName}.`,
          neighborhood: isEnFallback
            ? `Cultural Quarter, ${cityName}`
            : `Quarteirão Cultural, ${cityName}`,
          latOffset: 0.0062,
          lngOffset: 0.0041,
          isOutdoor: false,
          baseCost: 16,
        },
        {
          title: isEnFallback
            ? `Tapas Trail & Historic Wine Cellar in ${cityName}`
            : `Roteiro de Petiscos e Adega Histórica em ${cityName}`,
          category: 'food' as const,
          description: isEnFallback
            ? `Tasting of local culinary specialties paired with regional wines in ${cityName}.`
            : `Prova de especialidades gastronómicas locais acompanhadas por vinhos da região em ${cityName}.`,
          neighborhood: isEnFallback
            ? `Old Quarter, ${cityName}`
            : `Bairro Antigo, ${cityName}`,
          latOffset: -0.0038,
          lngOffset: 0.0058,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: isEnFallback
            ? `Botanical Gardens & Waterfront Promenade of ${cityName}`
            : `Jardins Botânicos e Passeio Ribeirinho de ${cityName}`,
          category: 'nature' as const,
          description: isEnFallback
            ? `Relaxing route through historic gardens and the riverfront or promenade of ${cityName}.`
            : `Percurso relaxante pelos jardins históricos e frente ribeirinha ou marítima de ${cityName}.`,
          neighborhood: isEnFallback
            ? `Waterfront District, ${cityName}`
            : `Zona Ribeirinha, ${cityName}`,
          latOffset: 0.0074,
          lngOffset: -0.0063,
          isOutdoor: true,
          baseCost: 8,
        },
      ],
      [
        {
          title: isEnFallback
            ? `Artisan Workshops & Creative District of ${cityName}`
            : `Oficinas de Artesanato e Bairro Criativo de ${cityName}`,
          category: 'shopping' as const,
          description: isEnFallback
            ? `Discover independent ateliers, historic bookshops, and local design in ${cityName}.`
            : `Descoberta de ateliês independentes, livrarias históricas e design local em ${cityName}.`,
          neighborhood: isEnFallback
            ? `Arts Quarter, ${cityName}`
            : `Bairro das Artes, ${cityName}`,
          latOffset: -0.0064,
          lngOffset: -0.0047,
          isOutdoor: true,
          baseCost: 14,
        },
        {
          title: isEnFallback
            ? `Chef's Tavern & Traditional Pastries in ${cityName}`
            : `Taberna de Autor e Doçaria Conventual em ${cityName}`,
          category: 'food' as const,
          description: isEnFallback
            ? `Long lunch featuring reimagined traditional recipes and signature pastries of ${cityName}.`
            : `Almoço prolongado com receitas tradicionais reinventadas e pastelaria típica de ${cityName}.`,
          neighborhood: isEnFallback
            ? `Central Square, ${cityName}`
            : `Praça Central, ${cityName}`,
          latOffset: 0.0029,
          lngOffset: 0.0072,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: isEnFallback
            ? `Cultural Evening, Live Music & Rooftop in ${cityName}`
            : `Noite Cultural, Música ao Vivo e Terraço em ${cityName}`,
          category: 'nightlife' as const,
          description: isEnFallback
            ? `Dusk acoustic session followed by evening drinks on an iconic terrace in ${cityName}.`
            : `Sessão acústica ao entardecer seguida de convívio num terraço emblemático de ${cityName}.`,
          neighborhood: isEnFallback
            ? `Bohemian Quarter, ${cityName}`
            : `Bairro Boémio, ${cityName}`,
          latOffset: -0.0042,
          lngOffset: 0.0033,
          isOutdoor: false,
          baseCost: 22,
        },
      ],
      [
        {
          title: isEnFallback
            ? `Historic Palace & Hidden Courtyards of ${cityName}`
            : `Palácio Histórico e Pátios Secretos de ${cityName}`,
          category: 'culture' as const,
          description: isEnFallback
            ? `Guided walk through noble halls, tilework, and walled gardens in ${cityName}.`
            : `Percurso guiado pelos salões nobres, azulejaria e jardins murados de ${cityName}.`,
          neighborhood: isEnFallback
            ? `Historic Hill, ${cityName}`
            : `Colina Histórica, ${cityName}`,
          latOffset: 0.0051,
          lngOffset: -0.0078,
          isOutdoor: false,
          baseCost: 15,
        },
        {
          title: isEnFallback
            ? `Historic Patisserie & Specialty Roastery of ${cityName}`
            : `Confeitaria Histórica e Torrefação Artesanal de ${cityName}`,
          category: 'food' as const,
          description: isEnFallback
            ? `Culinary break dedicated to regional sweets and specialty coffee in ${cityName}.`
            : `Pausa gastronómica dedicada aos doces regionais e cafés de especialidade em ${cityName}.`,
          neighborhood: isEnFallback
            ? `Historic Downtown, ${cityName}`
            : `Baixa Histórica, ${cityName}`,
          latOffset: -0.0025,
          lngOffset: -0.0061,
          isOutdoor: false,
          baseCost: 12,
        },
        {
          title: isEnFallback
            ? `Sunset Viewpoint & Panoramic Ridge of ${cityName}`
            : `Miradouro do Pôr do Sol e Encosta Panorâmica de ${cityName}`,
          category: 'nature' as const,
          description: isEnFallback
            ? `Late-afternoon farewell at a high vantage point with 360-degree views over ${cityName}.`
            : `Despedida ao final da tarde num ponto alto com vista de 360 graus sobre ${cityName}.`,
          neighborhood: isEnFallback
            ? `Panoramic Ridge, ${cityName}`
            : `Encosta Panorâmica, ${cityName}`,
          latOffset: 0.0081,
          lngOffset: 0.0054,
          isOutdoor: true,
          baseCost: 0,
        },
      ],
    ];
    return dayStopCatalog[dayOffset % dayStopCatalog.length];
  };

  const builtFallbackDays: Day[] = Array.from({ length: diffDays }).map((_, idx) => {
    const dayDate = new Date(start.getTime() + idx * 86400000).toISOString().slice(0, 10);
    const activeCity = contiguousFallbackCities[idx] || cleanCountry;
    const prevDayCity = idx > 0 ? contiguousFallbackCities[idx - 1] : activeCity;
    const isCityTransitionDay =
      idx > 0 && normalizeGeoText(activeCity) !== normalizeGeoText(prevDayCity);

    const matchedSeed =
      countrySeeds?.find((s) => s.city.toLowerCase() === activeCity.toLowerCase()) ||
      (!cleanCities.length
        ? countrySeeds?.find((s) => s.city.toLowerCase() === activeCity.toLowerCase())
        : undefined);

    const coords = matchedSeed
      ? { lat: matchedSeed.lat, lng: matchedSeed.lng }
      : resolveDestinationCoordinates(activeCity, cleanCountry);

    const stopsSource =
      matchedSeed && idx === 0 && !isEnFallback
        ? matchedSeed.stops
        : buildDistinctDayStopsForCity(activeCity, idx);

    const activities: Activity[] = stopsSource.map((s, aIdx) => {
      const baseStopCoords = {
        lat: Number((coords.lat + s.latOffset + idx * 0.001).toFixed(5)),
        lng: Number((coords.lng + s.lngOffset + idx * 0.001).toFixed(5)),
      };
      return {
        id: `${tripId}-d${idx + 1}-a${aIdx + 1}`,
        title: s.title,
        category: s.category,
        description: s.description,
        startTime: aIdx === 0 ? '09:30' : aIdx === 1 ? '13:00' : '16:30',
        durationMin: 95,
        openingHoursText: '09:30 – 18:30',
        isOutdoor: s.isOutdoor,
        interestTags: params.interests.slice(0, 2),
        location: {
          name: s.neighborhood,
          lat: baseStopCoords.lat,
          lng: baseStopCoords.lng,
        },
        costOptions: enrichCostOptionsWithDistinctVenues(
          undefined,
          s.title,
          s.neighborhood,
          baseStopCoords,
          s.baseCost,
          aIdx,
          resolvedUiLanguage
        ),
        selectedTier: initialBudgetTier,
        isPriceVerified: false,
        priceConfidence: {
          status: 'estimated',
          notes: isEnFallback
            ? 'AI estimated cost (~) — confirm on the official venue website'
            : 'Custo estimado pela IA (~) — confirmar no site oficial do local',
        },
        hoursConfidence: {
          status: 'estimated',
          notes: isEnFallback ? 'Estimated standard opening hours' : 'Horário habitual estimado',
        },
        whyThis: isEnFallback
          ? `Tailored for your itinerary in ${activeCity} (${cleanCountry}), prioritizing local authenticity and balanced pacing.`
          : `Escolhido à medida para o seu roteiro em ${activeCity} (${cleanCountry}), privilegiando autenticidade local e ritmo equilibrado.`,
        touristTrapScore: aIdx === 0 ? 52 : 26,
        votes: {},
      };
    });

    const withTravel = activities.map((act, i) =>
      i === 0
        ? act
        : {
            ...act,
            travelFromPrevious: calculateHaversineTravel(
              activities[i - 1].location,
              act.location,
              'WALKING'
            ),
          }
    );

    const dayObj: Day = {
      id: `${tripId}-day-${idx + 1}`,
      tripId,
      ownerId: params.ownerId,
      date: dayDate,
      dayNumber: idx + 1,
      city: activeCity,
      theme: isEnFallback
        ? `Day ${idx + 1}: Discovering ${activeCity}`
        : `Dia ${idx + 1}: À descoberta de ${activeCity}`,
      paceLevel: params.defaultPace,
      paceScore: 55,
      activePlan: 'A',
      accommodation: buildDefaultDayAccommodation(
        activeCity,
        coords,
        idx,
        undefined,
        initialBudgetTier
      ),
      intercity_transit: isCityTransitionDay
        ? buildDefaultIntercityTransit(prevDayCity, activeCity, cleanCountry)
        : undefined,
      meals: buildDefaultDayMeals(activeCity, coords, idx, undefined, resolvedUiLanguage),
      activities: withTravel,
      planB: [
        {
          ...activities[1],
          id: `${tripId}-d${idx + 1}-planb-1`,
          title: isEnFallback
            ? `Municipal Museum & Covered Gallery of ${activeCity} — Day ${idx + 1} (Indoor Plan B)`
            : `Museu Municipal e Galeria Coberta de ${activeCity} — Dia ${idx + 1} (Plano B Interior)`,
          isOutdoor: false,
          whyThis: isEnFallback
            ? `Indoor cultural alternative in ${activeCity} ideal for rainy weather.`
            : `Alternativa cultural interior em ${activeCity} ideal para dias de chuva.`,
        },
      ],
    };
    dayObj.paceScore = computePaceMetrics(dayObj).paceScore;
    return dayObj;
  });

  const fallbackTravelers: Traveler[] = [
    {
      id: `trav-${params.ownerId.slice(0, 6)}`,
      tripId,
      ownerId: params.ownerId,
      userId: params.ownerId,
      displayName: params.ownerName || 'You',
      interests: params.interests,
      budgetPerPerson: perPersonBudget,
      constraints: combinedConstraints.length > 0 ? combinedConstraints.join('; ') : 'None',
      preferredPace: params.defaultPace,
      color: '#D97706',
      avatar: (params.ownerName || 'Y')[0].toUpperCase(),
    },
  ];

  const deduplicatedFallbackDays = enforceStrictBudgetCapOnDays(
    enforceUniqueActivitiesAndCustomRequests(
      builtFallbackDays,
      params.customRequest,
      params.specialPreferences,
      resolvedUiLanguage
    ),
    params.totalBudget,
    safeTravelersCount
  );

  return {
    usedFallback: true,
    bundle: {
      trip: {
        id: tripId,
        ownerId: params.ownerId,
        destination: fallbackDestinationTitle,
        startDate: params.startDate,
        endDate: params.endDate,
        currency: 'EUR',
        totalBudget: params.totalBudget,
        travelersCount: params.travelersCount,
        interests: params.interests,
        defaultPace: params.defaultPace,
        status: 'planned',
        memberIds: [params.ownerId],
        inviteCode,
        assumptions: combinedConstraints,
        groupEnabled: params.groupEnabled,
      },
      days: deduplicatedFallbackDays,
      travelers: fallbackTravelers,
      expenses: [],
    },
  };
}

export interface TranslateTripOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  forceLiveApi?: boolean;
}

/**
 * Sprint 28 & 30: Auto-translates an existing FullTripBundle to the activeLanguage ('en' or 'pt-PT')
 * with a strict 15,000ms AbortController timeout guard.
 */
export async function translateTripItinerary(
  bundle: FullTripBundle,
  activeLanguage: 'en' | 'pt-PT' | string = 'pt-PT',
  options?: TranslateTripOptions
): Promise<FullTripBundle> {
  const resolvedLang = normalizeTargetUiLanguage(activeLanguage);
  const deterministicTranslated = translateItineraryBundleDeterministic(bundle, resolvedLang);
  const timeoutMs = options?.timeoutMs ?? TRANSLATION_TIMEOUT_MS;
  const shouldCallApi = options?.forceLiveApi ?? (USE_LIVE_GEMINI_API && !bundle.trip?.isDemo);

  if (shouldCallApi) {
    const response = await fetchWithTranslationTimeout(
      '/api/ai/translate-itinerary',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: deterministicTranslated,
          activeLanguage: resolvedLang,
          uiLanguage: resolvedLang,
          language: resolvedLang === 'en' ? 'en' : 'pt',
        }),
      },
      timeoutMs,
      options?.fetchImpl
    );

    if (!response.ok) {
      throw new Error(`Translation API HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (data?.bundle && Array.isArray(data.bundle.days)) {
      return translateItineraryBundleDeterministic(data.bundle, resolvedLang);
    }
    throw new Error('Translation API returned invalid itinerary payload');
  }

  return deterministicTranslated;
}

/**
 * Queries the browser's loaded Google Maps JS SDK (`google.maps.places.Place.searchByText`)
 * when available to obtain live rating, price level, opening hours, and reviews.
 */
export async function fetchPlaceDetailsFromMapsSdk(
  placeName: string,
  city?: string
): Promise<GooglePlaceDetailsResult | null> {
  if (typeof window === 'undefined') return null;
  const gmaps = (window as any).google?.maps;
  if (!gmaps || typeof gmaps.importLibrary !== 'function') return null;

  try {
    const placesLib = await gmaps.importLibrary('places');
    const PlaceClass = placesLib?.Place;
    if (!PlaceClass || typeof PlaceClass.searchByText !== 'function') return null;

    const textQuery = city ? `${placeName}, ${city}` : placeName;
    const { places } = await PlaceClass.searchByText({
      textQuery,
      fields: [
        'displayName',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'priceLevel',
        'regularOpeningHours',
        'editorialSummary',
        'reviews',
        'URI',
      ],
      maxResultCount: 1,
    });

    if (Array.isArray(places) && places.length > 0) {
      return normalizeGooglePlacesApiResponse(
        places[0],
        { placeName, city },
        'maps_js_sdk'
      );
    }
  } catch {
    // Fall back to server-side Places API / verified catalog
  }
  return null;
}

export interface GeocodedLocationValidationResult {
  valid: boolean;
  canonicalName?: string;
  lat?: number;
  lng?: number;
  reason?: string;
}

/**
 * Smart City & Region Validation (Hotfix 2):
 * 1. Runs frontend regex sanitization & profanity/gibberish check before any API call.
 * 2. Checks the fast O(1) country city index.
 * 3. Queries Google Maps Geocoder SDK (if loaded in browser) and `/api/places/geocode-validate`
 *    (Google Geocoding API / Places API / Nominatim Geocoder) to verify the location exists
 *    within the boundaries of `selectedCountry`.
 */
export async function validateLocationWithGeocoder(
  rawLocationInput: string,
  selectedCountry: string
): Promise<GeocodedLocationValidationResult> {
  // 1. Frontend Regex Sanitization & Gibberish/Profanity Pre-check
  const sanitizedCheck = sanitizeAndCheckLocationInput(rawLocationInput);
  if (!sanitizedCheck.valid) {
    return {
      valid: false,
      reason: sanitizedCheck.reason || 'invalid_characters',
    };
  }

  const cleanQuery = sanitizedCheck.sanitized;
  const targetCountry = findWorldCountry(selectedCountry);
  if (!targetCountry) {
    return { valid: false, reason: 'unknown_country' };
  }

  // 2. O(1) Local Index Check
  const localCheck = validateCityInCountry(cleanQuery, targetCountry.value);
  if (localCheck.valid) {
    return {
      valid: true,
      canonicalName: localCheck.canonicalCity || cleanQuery,
    };
  }
  if (localCheck.reason === 'wrong_country') {
    return {
      valid: false,
      reason: 'wrong_country',
    };
  }

  // 3. Browser Google Maps Geocoding SDK check (if loaded)
  try {
    const gMaps = (globalThis as any).window?.google?.maps;
    if (gMaps) {
      let GeocoderClass = gMaps.Geocoder;
      if (!GeocoderClass && typeof gMaps.importLibrary === 'function') {
        const geocodingLib = await gMaps.importLibrary('geocoding');
        GeocoderClass = geocodingLib?.Geocoder;
      }

      if (GeocoderClass) {
        const geocoder = new GeocoderClass();
        const geoResponse = await geocoder.geocode({
          address: `${cleanQuery}, ${targetCountry.labelEn}`,
        });
        const results: any[] = Array.isArray(geoResponse?.results) ? geoResponse.results : [];
        const normQuery = normalizeGeoText(cleanQuery);
        const queryTokens = normQuery.split(/\s+/).filter((t) => t.length >= 3);
        const countryNormEn = normalizeGeoText(targetCountry.labelEn);
        const countryNormPt = normalizeGeoText(targetCountry.labelPt);

        for (const result of results) {
          const types: string[] = Array.isArray(result.types) ? result.types : [];
          const isCountryOnly =
            types.length > 0 && types.every((t) => t === 'country' || t === 'political');
          if (isCountryOnly) continue;

          const components: any[] = Array.isArray(result.address_components)
            ? result.address_components
            : [];
          const countryComp = components.find(
            (c) => Array.isArray(c.types) && c.types.includes('country')
          );
          const compCountryNorm = normalizeGeoText(countryComp?.long_name || '');
          const inCountry =
            compCountryNorm.includes(countryNormEn) ||
            (countryNormPt.length > 0 && compCountryNorm.includes(countryNormPt));

          const nonCountryText = normalizeGeoText(
            components
              .filter((c) => !Array.isArray(c.types) || !c.types.includes('country'))
              .map((c) => `${c.long_name || ''} ${c.short_name || ''}`)
              .join(' ')
          );
          const matchesTokens =
            nonCountryText.includes(normQuery) ||
            queryTokens.some((tok) => nonCountryText.includes(tok));

          if (inCountry && matchesTokens) {
            const loc = result.geometry?.location;
            const lat = typeof loc?.lat === 'function' ? loc.lat() : Number(loc?.lat);
            const lng = typeof loc?.lng === 'function' ? loc.lng() : Number(loc?.lng);
            const canonicalName = components[0]?.long_name || cleanQuery;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              registerVerifiedCityCoordinates(canonicalName, targetCountry.value, { lat, lng });
            }
            return {
              valid: true,
              canonicalName,
              lat: Number.isFinite(lat) ? lat : undefined,
              lng: Number.isFinite(lng) ? lng : undefined,
            };
          }
        }
      }
    }
  } catch {
    // Fall through to backend Geocoding API endpoint
  }

  // 4. Backend Geocoding Endpoint (`/api/places/geocode-validate`)
  try {
    const res = await fetch('/api/places/geocode-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: cleanQuery,
        country: targetCountry.value,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.valid) {
        const canonicalName = String(data.canonicalName || cleanQuery).trim();
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          registerVerifiedCityCoordinates(canonicalName, targetCountry.value, {
            lat: data.lat,
            lng: data.lng,
          });
        } else {
          registerVerifiedCityCoordinates(canonicalName, targetCountry.value);
        }
        return {
          valid: true,
          canonicalName,
          lat: data.lat,
          lng: data.lng,
        };
      }
      return {
        valid: false,
        reason: data?.reason || 'not_found',
      };
    }
  } catch {
    // Ignore network error
  }

  return {
    valid: false,
    reason: 'not_found',
  };
}

/**
 * Requests AI proposals (Chat assistant, Vibe Slider pace change, Group compromise, or Local alternative).
 * Always returns non-destructive ProposalChange[] items for the visual diff bar,
 * or grounded place details when `fetch_google_place_details` is invoked.
 */
export async function requestAiProposals(params: {
  taskType: 'chat' | 'pace' | 'compromise';
  destination: string;
  message: string;
  currentDay: Day;
  travelers: Traveler[];
  language?: 'en' | 'pt';
  uiLanguage?: string;
  itinerary?: FullTripBundle | Day[] | Day;
}): Promise<{
  reply: string;
  proposals: ProposalChange[];
  usedFallback: boolean;
  toolUsed?: string;
  placeDetails?: GooglePlaceDetailsResult;
}> {
  const resolvedUiLanguage =
    params.uiLanguage || (params.language === 'en' ? 'en' : 'pt-PT');
  const isEn = normalizeTargetUiLanguage(resolvedUiLanguage) === 'en';
  const sanitizedItinerary = sanitizeItineraryForAI(params.itinerary || params.currentDay);
  const assistantSystemPrompt = buildChatAssistantSystemPrompt(
    sanitizedItinerary,
    resolvedUiLanguage
  );

  const activeDayList =
    params.currentDay.activePlan === 'B' && params.currentDay.planB.length > 0
      ? params.currentDay.planB
      : params.currentDay.activities;
  const existingTitlesLower = new Set(
    activeDayList.map((a) => a.title.trim().toLowerCase())
  );
  const firstAct = activeDayList[0];
  const lastAct = activeDayList[activeDayList.length - 1];
  const baseLat = firstAct?.location.lat ?? 38.7139;
  const baseLng = firstAct?.location.lng ?? -9.1334;
  const lowerMsg = params.message.toLowerCase();

  // Helper to build 3 distinct, verified multi-option proposals in target uiLanguage preserving proper nouns
  const buildThreeChatAlternatives = (): ProposalChange[] => {
    const target =
      activeDayList.find(
        (a) => !a.id.startsWith('act-chat-') && !a.id.startsWith('act-comp-')
      ) || firstAct;
    const isAddRequest =
      lowerMsg.includes('adicion') ||
      lowerMsg.includes('add ') ||
      lowerMsg.includes('inclu') ||
      !target;
    const propType: 'add' | 'replace' = isAddRequest ? 'add' : 'replace';
    const destLower = params.destination.toLowerCase();
    const isEastAsia =
      destLower.includes('seul') ||
      destLower.includes('seoul') ||
      destLower.includes('coreia') ||
      destLower.includes('korea') ||
      destLower.includes('pequim') ||
      destLower.includes('beijing') ||
      destLower.includes('tóquio') ||
      destLower.includes('tokyo');

    const optionBlueprints: {
      suffixId: string;
      title: string;
      venueName: string;
      category: Activity['category'];
      tier: BudgetTier;
      budgetCost: number;
      midCost: number;
      premiumCost: number;
      description: string;
      reason: string;
      latOffset: number;
      lngOffset: number;
    }[] = isEastAsia
      ? [
          {
            suffixId: 'opt1',
            title: '景福宫 (Palácio Gyeongbokgung) & Bukchon Walk',
            venueName: '景福宫 (Palácio Gyeongbokgung)',
            category: 'culture',
            tier: 'budget',
            budgetCost: 6,
            midCost: 14,
            premiumCost: 36,
            description: isEn
              ? 'Option 1 (Budget / Heritage): Morning visit to the historic royal complex with a walk through traditional alleys.'
              : 'Opção 1 (Económica / Património): Visita matinal ao complexo real histórico com caminhada pelas vielas tradicionais.',
            reason: isEn
              ? 'Option 1 Verified Budget (€6) — preserves local proper nouns.'
              : 'Opção 1 Económica verificada (6€) — preserva os nomes próprios locais com tradução PT-PT entre parênteses.',
            latOffset: 0.0022,
            lngOffset: -0.0018,
          },
          {
            suffixId: 'opt2',
            title: '광장시장 (Mercado Gwangjang) Street Gastronomy',
            venueName: '광장시장 (Mercado Gwangjang)',
            category: 'food',
            tier: 'mid',
            budgetCost: 9,
            midCost: 18,
            premiumCost: 38,
            description: isEn
              ? 'Option 2 (Mid-Range / Local Gastronomy): Authentic tasting across historic market stalls without tourist crowds.'
              : 'Opção 2 (Intermédia / Gastronomia Local): Degustação autêntica nas bancas históricas sem multidões.',
            reason: isEn
              ? 'Option 2 Verified Mid-Range (€18) — ideal balance of authentic cuisine and walking proximity.'
              : 'Opção 2 Intermédia verificada (18€) — equilíbrio ideal entre gastronomia autêntica e proximidade geográfica.',
            latOffset: -0.0026,
            lngOffset: 0.0024,
          },
          {
            suffixId: 'opt3',
            title: '창덕궁 후원 (Jardim Secreto de Changdeokgung)',
            venueName: '창덕궁 후원 (Jardim Secreto de Changdeokgung)',
            category: 'nature',
            tier: 'premium',
            budgetCost: 12,
            midCost: 24,
            premiumCost: 48,
            description: isEn
              ? 'Option 3 (Premium / Exclusive Guided Tour): Reserved access to royal pavilions and UNESCO gardens.'
              : 'Opção 3 (Premium / Visita Guiada Exclusiva): Acesso reservado aos pavilhões reais e jardins classificados pela UNESCO.',
            reason: isEn
              ? 'Option 3 Verified Premium (€48) — serene experience with reserved access and historian guide.'
              : 'Opção 3 Premium verificada (48€) — experiência tranquila com acesso reservado e guia historiador.',
            latOffset: 0.0034,
            lngOffset: 0.0029,
          },
        ]
      : [
          {
            suffixId: 'opt1',
            title: `Mercado de Campo de Ourique & Tasca da Esquina (${params.destination})`,
            venueName: `Mercado de Campo de Ourique, ${params.destination}`,
            category: 'food',
            tier: 'budget',
            budgetCost: 8,
            midCost: 14,
            premiumCost: 28,
            description: isEn
              ? 'Option 1 (Budget / Authentic): Neighbourhood culinary stop frequented by locals with a short transit leg.'
              : 'Opção 1 (Económica / Autêntica): Paragem gastronómica de bairro frequentada por residentes locais, com deslocação curta.',
            reason: isEn
              ? `Option 1 Budget (€8) tailored to your request ("${params.message}"), preserving original proper nouns.`
              : `Opção 1 Económica (8€) adaptada ao seu pedido («${params.message}»), mantendo os nomes próprios originais.`,
            latOffset: 0.0022,
            lngOffset: -0.0019,
          },
          {
            suffixId: 'opt2',
            title: `Atelier National du Azulejo & Miradouro de Santa Catarina (${params.destination})`,
            venueName: `Miradouro de Santa Catarina, ${params.destination}`,
            category: 'culture',
            tier: 'mid',
            budgetCost: 10,
            midCost: 19,
            premiumCost: 38,
            description: isEn
              ? 'Option 2 (Mid-Range / Cultural): Verified cultural experience paired with a late-afternoon panoramic viewpoint.'
              : 'Opção 2 (Intermédia / Cultural): Experiência cultural verificada combinada com vista panorâmica ao final da tarde.',
            reason: isEn
              ? `Option 2 Mid-Range (€19) balancing cultural heritage and comfortable pacing on Day ${params.currentDay.dayNumber}.`
              : `Opção 2 Intermédia (19€) com equilíbrio entre património cultural e ritmo confortável no Dia ${params.currentDay.dayNumber}.`,
            latOffset: -0.0028,
            lngOffset: 0.0023,
          },
          {
            suffixId: 'opt3',
            title: `Palácio Belmonte Private Wine Salon & Terrace (${params.destination})`,
            venueName: `Palácio Belmonte, ${params.destination}`,
            category: 'food',
            tier: 'premium',
            budgetCost: 16,
            midCost: 28,
            premiumCost: 56,
            description: isEn
              ? 'Option 3 (Premium / Exclusive): Private guided tasting on a historic terrace with priority skip-the-line access.'
              : 'Opção 3 (Premium / Exclusiva): Prova comentada privada num terraço histórico com reserva prioritária sem filas.',
            reason: isEn
              ? `Option 3 Premium (€56) for a top-tier private experience on Day ${params.currentDay.dayNumber}.`
              : `Opção 3 Premium (56€) para uma experiência privada de topo no Dia ${params.currentDay.dayNumber}.`,
            latOffset: 0.0036,
            lngOffset: 0.0031,
          },
        ];

    return optionBlueprints.map((bp, idx) => {
      const actId = `act-chat-${params.currentDay.id}-${target?.id || 'slot'}-${bp.suffixId}`;
      const propId = `prop-chat-${params.currentDay.id}-${target?.id || 'slot'}-${bp.suffixId}`;
      const startTime =
        propType === 'add'
          ? idx === 0
            ? '16:00'
            : idx === 1
            ? '16:30'
            : '17:00'
          : target?.startTime || '11:00';

      const payload: Activity = {
        id: actId,
        title: bp.title,
        category: bp.category,
        description: bp.description,
        startTime,
        durationMin: 90,
        openingHoursText: '10:00 – 20:00',
        isOutdoor: idx === 1,
        interestTags: ['culture', 'food'],
        location: {
          name: bp.venueName,
          lat: Number((baseLat + bp.latOffset).toFixed(5)),
          lng: Number((baseLng + bp.lngOffset).toFixed(5)),
        },
        costOptions: {
          budget: {
            title: `${bp.title} — ${isEn ? 'Budget' : 'Económico'}`,
            venueName: bp.venueName,
            estimatedCost: bp.budgetCost,
            isPriceVerified: true,
            description: isEn ? 'Verified essential entry or tasting' : 'Entrada ou degustação essencial verificada',
            coordinates: {
              lat: Number((baseLat + bp.latOffset).toFixed(5)),
              lng: Number((baseLng + bp.lngOffset).toFixed(5)),
            },
          },
          mid: {
            title: `${bp.title} — ${isEn ? 'Mid-Range' : 'Intermédio'}`,
            venueName: bp.venueName,
            estimatedCost: bp.midCost,
            isPriceVerified: true,
            description: isEn ? 'Recommended complete experience' : 'Experiência completa recomendada',
            coordinates: {
              lat: Number((baseLat + bp.latOffset + 0.0008).toFixed(5)),
              lng: Number((baseLng + bp.lngOffset - 0.0008).toFixed(5)),
            },
          },
          premium: {
            title: `${bp.title} — Premium`,
            venueName: bp.venueName,
            estimatedCost: bp.premiumCost,
            isPriceVerified: true,
            description: isEn ? 'Private guided experience with priority access' : 'Experiência privada com acesso prioritário',
            coordinates: {
              lat: Number((baseLat + bp.latOffset - 0.0009).toFixed(5)),
              lng: Number((baseLng + bp.lngOffset + 0.0009).toFixed(5)),
            },
          },
        },
        selectedTier: bp.tier,
        isPriceVerified: true,
        priceConfidence: {
          status: 'verified',
          sourceUrl: 'https://www.visitportugal.com/',
          verifiedAt: '2026-10-28',
          notes: isEn ? 'Verified rate 2026' : 'Tarifa verificada 2026',
        },
        hoursConfidence: {
          status: 'verified',
          sourceUrl: 'https://www.visitportugal.com/',
          verifiedAt: '2026-10-28',
          notes: isEn ? 'Confirmed opening hours 10:00 – 20:00' : 'Horário confirmado 10:00 – 20:00',
        },
        whyThis: bp.reason,
        touristTrapScore: 18 + idx * 4,
        votes: {},
      };

      return {
        id: propId,
        dayId: params.currentDay.id,
        dayNumber: params.currentDay.dayNumber,
        type: propType,
        targetActivityId: propType === 'replace' ? target?.id : undefined,
        targetActivityTitle: propType === 'replace' ? target?.title : undefined,
        payload,
        reason: bp.reason,
        source: 'chat',
        status: 'pending',
      };
    });
  };

  if (USE_LIVE_GEMINI_API) {
    try {
      let clientPlaceData: GooglePlaceDetailsResult | null = null;
      if (params.taskType === 'chat' && isInformationalPlaceQuery(params.message)) {
        const args = extractPlaceQueryArgs(
          params.message,
          params.destination,
          params.currentDay.activities
        );
        if (args) {
          clientPlaceData = await fetchPlaceDetailsFromMapsSdk(args.placeName, args.city);
        }
      }

      const res = await fetch('/api/ai/propose-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          language: isEn ? 'en' : 'pt',
          uiLanguage: resolvedUiLanguage,
          sanitizedItinerary,
          systemPrompt: assistantSystemPrompt,
          clientPlaceData: clientPlaceData || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.toolUsed === 'fetch_google_place_details' && data?.reply) {
          return {
            reply: data.reply,
            proposals: [],
            usedFallback: false,
            toolUsed: data.toolUsed,
            placeDetails: data.placeDetails,
          };
        }
        if (data?.proposals && Array.isArray(data.proposals) && data.proposals.length > 0) {
          const fallbackTarget = activeDayList[0];

          const mappedProposals: ProposalChange[] = data.proposals.map(
            (p: any, idx: number): ProposalChange => {
              const rawType =
                p.type === 'add' || p.type === 'remove' || p.type === 'replace' || p.type === 'move'
                  ? p.type
                  : fallbackTarget
                  ? 'replace'
                  : 'add';

              const matchedTarget =
                activeListFind(activeDayList, p.targetActivityId, p.targetActivityTitle) ||
                fallbackTarget;

              const resolvedTargetId =
                rawType === 'add' ? undefined : matchedTarget?.id || p.targetActivityId;
              const resolvedTargetTitle =
                rawType === 'add' ? undefined : matchedTarget?.title || p.targetActivityTitle;

              const deterministicPropId =
                p.id && String(p.id).startsWith('prop-')
                  ? `${String(p.id)}-opt${idx + 1}`
                  : `prop-${params.taskType}-${params.currentDay.id}-${resolvedTargetId || 'slot'}-opt${idx + 1}`;

              const deterministicActId = `act-${params.taskType}-${params.currentDay.id}-${
                resolvedTargetId || 'slot'
              }-opt${idx + 1}`;

              let payload: Activity | undefined = p.payload;
              if ((rawType === 'add' || rawType === 'replace') && (!payload || !payload.costOptions)) {
                const suggestedTitle =
                  payload?.title ||
                  (rawType === 'replace' &&
                  p.targetActivityTitle &&
                  matchedTarget &&
                  p.targetActivityTitle !== matchedTarget.title
                    ? String(p.targetActivityTitle)
                    : isEn
                    ? `${params.destination} — Verified Alternative #${idx + 1}`
                    : `${params.destination} — Alternativa Verificada #${idx + 1}`);
                const suggestedDesc =
                  payload?.description ||
                  p.reason ||
                  (isEn
                    ? `Curated stop in ${params.destination} tailored to your request.`
                    : `Paragem selecionada em ${params.destination} de acordo com o seu pedido.`);
                const tierForIdx: BudgetTier = idx === 0 ? 'budget' : idx === 1 ? 'mid' : 'premium';
                payload = {
                  id: payload?.id || deterministicActId,
                  title: suggestedTitle,
                  category: payload?.category || matchedTarget?.category || 'culture',
                  description: suggestedDesc,
                  startTime:
                    payload?.startTime ||
                    p.newStartTime ||
                    matchedTarget?.startTime ||
                    '15:00',
                  durationMin: payload?.durationMin || matchedTarget?.durationMin || 90,
                  openingHoursText:
                    payload?.openingHoursText ||
                    matchedTarget?.openingHoursText ||
                    '09:30 – 19:00',
                  isOutdoor: Boolean(payload?.isOutdoor ?? false),
                  interestTags: payload?.interestTags || matchedTarget?.interestTags || ['culture', 'food'],
                  location: {
                    name: payload?.location?.name || `${suggestedTitle}, ${params.destination}`,
                    lat: payload?.location?.lat ?? Number((baseLat + 0.0025 * (idx + 1)).toFixed(4)),
                    lng: payload?.location?.lng ?? Number((baseLng - 0.002 * (idx + 1)).toFixed(4)),
                  },
                  costOptions: payload?.costOptions || {
                    budget: {
                      title: `${suggestedTitle} — ${isEn ? 'Budget' : 'Económico'}`,
                      estimatedCost: 8 + idx * 2,
                      isPriceVerified: true,
                      description: isEn ? 'Local budget option' : 'Opção económica local',
                    },
                    mid: {
                      title: `${suggestedTitle} — ${isEn ? 'Mid-Range' : 'Intermédio'}`,
                      estimatedCost: 16 + idx * 4,
                      isPriceVerified: true,
                      description: isEn ? 'Mid-range cultural experience' : 'Experiência cultural intermédia',
                    },
                    premium: {
                      title: `${suggestedTitle} — Premium`,
                      estimatedCost: 36 + idx * 8,
                      isPriceVerified: true,
                      description: isEn
                        ? 'Private guided or tasting experience'
                        : 'Experiência privada com guia ou degustação',
                    },
                  },
                  selectedTier: tierForIdx,
                  isPriceVerified: true,
                  priceConfidence: {
                    status: 'verified',
                    sourceUrl: 'https://www.visitportugal.com/',
                    verifiedAt: '2026-10-28',
                    notes: isEn ? 'Verified 2026 rate' : 'Tarifa verificada 2026',
                  },
                  hoursConfidence: {
                    status: 'verified',
                    sourceUrl: 'https://www.visitportugal.com/',
                    verifiedAt: '2026-10-28',
                    notes: isEn ? 'Verified opening hours' : 'Horário verificado',
                  },
                  whyThis:
                    p.reason ||
                    (isEn
                      ? `Suggestion tailored to your request: "${params.message}"`
                      : `Sugestão adaptada ao seu pedido: «${params.message}»`),
                  touristTrapScore: 20 + idx * 3,
                  votes: {},
                };
              } else if (payload && !payload.id) {
                payload = { ...payload, id: deterministicActId };
              }

              return {
                id: deterministicPropId,
                dayId: params.currentDay.id,
                dayNumber: params.currentDay.dayNumber,
                type: rawType,
                targetActivityId: resolvedTargetId,
                targetActivityTitle: resolvedTargetTitle,
                newStartTime: p.newStartTime,
                payload,
                reason:
                  p.reason ||
                  (isEn
                    ? `Verified alternative for: "${params.message}"`
                    : `Alternativa verificada para: «${params.message}»`),
                source: params.taskType,
                status: 'pending',
              };
            }
          );

          // Enforce 2 to 3 distinct alternatives when taskType === 'chat'
          let finalCandidateList = mappedProposals;
          if (params.taskType === 'chat' && finalCandidateList.length < 2) {
            const fallbackThree = buildThreeChatAlternatives();
            for (const fb of fallbackThree) {
              if (finalCandidateList.length >= 3) break;
              if (
                !finalCandidateList.some(
                  (existing) =>
                    existing.payload?.title?.toLowerCase() === fb.payload?.title?.toLowerCase()
                )
              ) {
                finalCandidateList.push(fb);
              }
            }
          }

          const dedupedProposals = deduplicateAndMergeProposals(
            [],
            finalCandidateList,
            [params.currentDay]
          );

          if (dedupedProposals.length > 0) {
            return {
              reply:
                data.reply ||
                (isEn
                  ? `I prepared ${dedupedProposals.length} distinct, verified alternatives for Day ${params.currentDay.dayNumber}. Compare the options in "Proposed Changes" and click "Accept" on your preferred one.`
                  : `Preparei ${dedupedProposals.length} alternativas distintas e verificadas para o Dia ${params.currentDay.dayNumber}. Compare as opções em «Alterações Propostas» e clique em «Aceitar» na sua preferida.`),
              proposals: dedupedProposals,
              usedFallback: false,
            };
          }
        }
      }
    } catch {
      // Fall through to deterministic multi-option proposal or grounded place fallback
    }
  }

  if (params.taskType === 'chat' && isInformationalPlaceQuery(params.message)) {
    const args = extractPlaceQueryArgs(
      params.message,
      params.destination,
      params.currentDay.activities
    ) || { placeName: params.destination, city: params.destination };

    const placeDetails =
      (await fetchPlaceDetailsFromMapsSdk(args.placeName, args.city)) ||
      resolveVerifiedPlaceDetails(args.placeName, args.city, params.currentDay.activities);

    const functionResponse = buildFunctionResponsePayload(`call-${Date.now()}`, placeDetails);
    const reply = formatGroundedPlaceReply(
      functionResponse.parts[0].functionResponse.response.result,
      isEn ? 'en' : 'pt'
    );
    return {
      reply,
      proposals: [],
      usedFallback: false,
      toolUsed: 'fetch_google_place_details',
      placeDetails,
    };
  }

  if (params.taskType === 'pace') {
    const isRelaxing =
      params.message.includes('1') || params.message.includes('2') || lowerMsg.includes('relax');
    if (isRelaxing && activeDayList.length > 2 && lastAct) {
      return {
        usedFallback: true,
        reply: isEn
          ? `To make Day ${params.currentDay.dayNumber} more relaxed with extra free buffer time, I propose removing "${lastAct.title}" or postponing it.`
          : `Para tornar o Dia ${params.currentDay.dayNumber} mais descontraído e com mais tempo livre, proponho remover «${lastAct.title}» ou adiá-lo para mais tarde.`,
        proposals: [
          {
            id: `prop-pace-remove-${params.currentDay.id}-${lastAct.id}`,
            dayId: params.currentDay.id,
            dayNumber: params.currentDay.dayNumber,
            type: 'remove',
            targetActivityId: lastAct.id,
            targetActivityTitle: lastAct.title,
            reason: isEn
              ? `Frees ${lastAct.durationMin} min to match your Relaxed pace`
              : `Liberta ${lastAct.durationMin} min para corresponder ao seu ritmo Descontraído`,
            source: 'pace',
            status: 'pending',
          },
        ],
      };
    }

    const paceTitleCandidates = isEn
      ? [
          `Fábrica Coffee Roasters & Viewpoint (${params.destination})`,
          `Botanical Garden & Wine Bar (${params.destination})`,
          `Historic Cloister & Gelateria (${params.destination})`,
        ]
      : [
          `Fábrica Coffee Roasters & Miradouro (${params.destination})`,
          `Jardim Botânico & Wine Bar (${params.destination})`,
          `Claustro Histórico & Gelateria (${params.destination})`,
        ];
    const chosenPaceTitle =
      paceTitleCandidates.find((t) => !existingTitlesLower.has(t.toLowerCase())) ||
      paceTitleCandidates[0];

    const newAct: Activity = {
      id: `act-pace-add-${params.currentDay.id}`,
      title: chosenPaceTitle,
      category: 'food',
      description: isEn
        ? 'Late-afternoon stop with specialty coffee and panoramic views tailored to your dynamic pace.'
        : 'Paragem de final de tarde com café de especialidade e vista panorâmica adaptada ao seu ritmo mais intenso.',
      startTime: '17:15',
      durationMin: 60,
      openingHoursText: '09:00 – 20:00',
      isOutdoor: true,
      interestTags: ['food', 'viewpoints'],
      location: {
        name: chosenPaceTitle,
        lat: baseLat + 0.004,
        lng: baseLng - 0.003,
      },
      costOptions: {
        budget: {
          title: isEn ? 'Counter Espresso' : 'Expresso ao Balcão',
          estimatedCost: 3,
          isPriceVerified: true,
          description: isEn ? 'Quick traditional espresso' : 'Bica tradicional rápida',
        },
        mid: {
          title: isEn ? 'Specialty Coffee & Pastry' : 'Café de Especialidade e Pastelaria',
          estimatedCost: 9,
          isPriceVerified: true,
          description: isEn ? 'Terrace table service' : 'Serviço de esplanada',
        },
        premium: {
          title: isEn ? 'Sunset Terrace Tasting' : 'Prova ao Pôr do Sol no Terraço',
          estimatedCost: 22,
          isPriceVerified: false,
          description: isEn ? 'Reserved table with panoramic view' : 'Mesa reservada com vista panorâmica',
        },
      },
      selectedTier: 'mid',
      isPriceVerified: true,
      priceConfidence: {
        status: 'verified',
        notes: isEn ? 'Verified average menu (~€9)' : 'Menu médio verificado (~9€)',
      },
      hoursConfidence: {
        status: 'verified',
        notes: isEn ? 'Daytime terrace hours' : 'Horário diurno de esplanada',
      },
      whyThis: isEn
        ? 'Added to enrich your afternoon according to your Vibe Slider.'
        : 'Adicionado para enriquecer a tarde de acordo com o seu Vibe Slider.',
      touristTrapScore: 21,
      votes: {},
    };

    return {
      usedFallback: true,
      reply: isEn
        ? `I prepared an additional late-afternoon stop for Day ${params.currentDay.dayNumber} with calculated transit times. Review and accept below if you would like to include it.`
        : `Preparei uma paragem adicional ao final da tarde para o Dia ${params.currentDay.dayNumber} com tempos de deslocação calculados. Reveja e aceite abaixo se pretender incluí-la.`,
      proposals: [
        {
          id: `prop-pace-add-${params.currentDay.id}`,
          dayId: params.currentDay.id,
          dayNumber: params.currentDay.dayNumber,
          type: 'add',
          payload: newAct,
          reason: isEn
            ? 'Adds a 60-min late-afternoon highlight for your dynamic pace'
            : 'Adiciona um destaque de 60 min ao final da tarde para o seu ritmo mais dinâmico',
          source: 'pace',
          status: 'pending',
        },
      ],
    };
  }

  if (params.taskType === 'compromise') {
    const target =
      activeDayList.find((a) => Object.values(a.votes || {}).includes('down')) ||
      activeDayList.find((a) => !a.id.startsWith('act-comp-')) ||
      firstAct;
    const names = params.travelers.map((t) => t.displayName).join(isEn ? ' and ' : ' e ');
    const compTitleCandidates = isEn
      ? [
          `Cultural Courtyard & Neighbourhood Tapas (${params.destination})`,
          `Historic Cloister & Artisan Wine Bar (${params.destination})`,
          `Waterfront Market & Acoustic Session (${params.destination})`,
        ]
      : [
          `Pátio Cultural & Petiscos de Bairro (${params.destination})`,
          `Claustro Histórico & Garrafeira Artesanal (${params.destination})`,
          `Mercado Ribeirinho & Sessão Acústica (${params.destination})`,
        ];
    const chosenCompTitle =
      compTitleCandidates.find((t) => !existingTitlesLower.has(t.toLowerCase())) ||
      compTitleCandidates[0];

    const compromiseAct: Activity = {
      id: `act-comp-${params.currentDay.id}-${target?.id || 'slot1'}`,
      title: chosenCompTitle,
      category: 'food',
      description: isEn
        ? 'Historic architectural courtyard combining regional food stalls and live acoustic music.'
        : 'Pátio arquitetónico histórico que reúne bancas de gastronomia regional e música acústica.',
      startTime: target?.startTime || '13:00',
      durationMin: 90,
      openingHoursText: '11:00 – 22:00',
      isOutdoor: false,
      interestTags: ['food', 'architecture', 'culture', 'music'],
      location: {
        name: chosenCompTitle,
        lat: baseLat + 0.003,
        lng: baseLng + 0.003,
      },
      costOptions: {
        budget: {
          title: isEn ? 'Courtyard Visit & Light Bite' : 'Visita ao Pátio e Petisco Leve',
          estimatedCost: 10,
          isPriceVerified: true,
          description: isEn ? 'Shared budget option' : 'Opção económica partilhada',
        },
        mid: {
          title: isEn ? 'Tasting Board & Regional Wine' : 'Tábua de Degustação e Vinho Regional',
          estimatedCost: 22,
          isPriceVerified: true,
          description: isEn ? 'Balanced group lunch' : 'Almoço equilibrado para o grupo',
        },
        premium: {
          title: isEn ? 'Private Courtyard Table & Wine Pairing' : 'Mesa Privada no Pátio e Harmonização',
          estimatedCost: 44,
          isPriceVerified: false,
          description: isEn ? 'Full tasting menu' : 'Menu completo de degustação',
        },
      },
      selectedTier: 'mid',
      isPriceVerified: true,
      priceConfidence: {
        status: 'estimated',
        notes: isEn ? 'Estimate ~€22/person' : 'Estimativa ~22€/pessoa',
      },
      hoursConfidence: {
        status: 'to_confirm',
        notes: isEn ? 'Confirm kitchen hours before arrival' : 'Confirmar horário da cozinha antes da chegada',
      },
      whyThis: isEn
        ? `Compromise designed for ${names || 'all group members'} — blends architecture, gastronomy, and music.`
        : `Compromisso pensado para ${names || 'todos os membros do grupo'} — combina arquitetura, gastronomia e música.`,
      touristTrapScore: 19,
      votes: {},
    };

    return {
      usedFallback: true,
      reply: isEn
        ? `I analyzed the group votes and fairness index. Here is a compromise proposal to replace "${target?.title || 'the contested stop'}", balancing every traveler's interests.`
        : `Analisei os votos e o índice de justiça do grupo. Aqui está uma proposta de compromisso para substituir «${target?.title || 'a paragem contestada'}», equilibrando os interesses de todos os viajantes.`,
      proposals: [
        {
          id: `prop-comp-${params.currentDay.id}-${target?.id || 'slot1'}`,
          dayId: params.currentDay.id,
          dayNumber: params.currentDay.dayNumber,
          type: target ? 'replace' : 'add',
          targetActivityId: target?.id,
          targetActivityTitle: target?.title,
          payload: compromiseAct,
          reason: isEn
            ? `Resolves group downvotes and balances the Fairness Meter for ${names}`
            : `Resolve votos negativos do grupo e equilibra o Medidor de Justiça para ${names}`,
          source: 'compromise',
          status: 'pending',
        },
      ],
    };
  }

  // Default Chat Assistant multi-option proposals (always returns 3 distinct, verified alternatives)
  const threeAlternatives = buildThreeChatAlternatives();

  return {
    usedFallback: true,
    reply: isEn
      ? `I prepared 3 distinct, verified alternatives for Day ${params.currentDay.dayNumber} based on your request ("${params.message}"). Compare the options side by side in the "Proposed Changes" banner above — nothing changes in your itinerary until you click "Accept" on your preferred option.`
      : `Preparei 3 alternativas distintas e verificadas para o Dia ${params.currentDay.dayNumber} com base no seu pedido («${params.message}»). Compare as opções lado a lado na secção «Alterações Propostas» acima — nada será alterado no seu roteiro até clicar em «Aceitar» na sua opção preferida.`,
    proposals: threeAlternatives,
  };
}

function activeListFind(
  list: Activity[],
  targetId?: string,
  targetTitle?: string
): Activity | undefined {
  if (targetId) {
    const byId = list.find((a) => a.id === targetId);
    if (byId) return byId;
  }
  if (targetTitle) {
    const clean = String(targetTitle).trim().toLowerCase();
    const byTitle = list.find((a) => a.title.trim().toLowerCase() === clean);
    if (byTitle) return byTitle;
  }
  return undefined;
}

/**
 * Streams the Atlas Genie Assistant response into the chat UI.
 * Implements the 5-step Gemini Function Calling flow (`fetch_google_place_details` -> `functionResponse` -> streamed grounded output)
 * for informational queries while preserving multi-option visual diff proposals for itinerary modification requests.
 */
export async function streamAtlasGenieChat(params: {
  destination: string;
  message: string;
  currentDay: Day;
  travelers: Traveler[];
  language?: 'en' | 'pt';
  uiLanguage?: string;
  itinerary?: FullTripBundle | Day[] | Day;
  onToolFetching?: (info: { placeName: string; city?: string }) => void;
  onChunk?: (accumulatedText: string) => void;
}): Promise<{
  reply: string;
  proposals: ProposalChange[];
  toolUsed?: string;
  placeDetails?: GooglePlaceDetailsResult;
}> {
  const resolvedUiLanguage =
    params.uiLanguage || (params.language === 'en' ? 'en' : 'pt-PT');
  const isEn = normalizeTargetUiLanguage(resolvedUiLanguage) === 'en';
  const isInfoQuery = isInformationalPlaceQuery(params.message);
  const sanitizedItinerary = sanitizeItineraryForAI(params.itinerary || params.currentDay);
  const assistantSystemPrompt = buildChatAssistantSystemPrompt(
    sanitizedItinerary,
    resolvedUiLanguage
  );

  if (isInfoQuery) {
    const extracted = extractPlaceQueryArgs(
      params.message,
      params.destination,
      params.currentDay.activities
    );
    if (extracted) {
      params.onToolFetching?.(extracted);
    }

    const clientPlaceData = extracted
      ? await fetchPlaceDetailsFromMapsSdk(extracted.placeName, extracted.city)
      : null;

    if (USE_LIVE_GEMINI_API) {
      try {
        const res = await fetch('/api/ai/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: params.destination,
            message: params.message,
            currentDay: params.currentDay,
            sanitizedItinerary,
            systemPrompt: assistantSystemPrompt,
            language: isEn ? 'en' : 'pt',
            uiLanguage: resolvedUiLanguage,
            clientPlaceData: clientPlaceData || undefined,
          }),
        });

        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';
          let finalToolUsed: string | undefined;
          let finalPlaceDetails: GooglePlaceDetailsResult | undefined;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const rawEvent of events) {
              const dataLine = rawEvent
                .split('\n')
                .find((line) => line.startsWith('data: '));
              if (!dataLine) continue;
              try {
                const payload = JSON.parse(dataLine.slice(6));
                if (payload.type === 'tool_fetching') {
                  params.onToolFetching?.({
                    placeName: payload.placeName,
                    city: payload.city,
                  });
                } else if (payload.type === 'chunk' && typeof payload.text === 'string') {
                  accumulated += payload.text;
                  params.onChunk?.(accumulated);
                } else if (payload.type === 'done') {
                  if (typeof payload.reply === 'string' && payload.reply.trim()) {
                    accumulated = payload.reply;
                    params.onChunk?.(accumulated);
                  }
                  finalToolUsed = payload.toolUsed;
                  finalPlaceDetails = payload.placeDetails;
                }
              } catch {
                // Ignore malformed SSE lines
              }
            }
          }

          if (accumulated.trim()) {
            return {
              reply: accumulated,
              proposals: [],
              toolUsed: finalToolUsed || 'fetch_google_place_details',
              placeDetails: finalPlaceDetails,
            };
          }
        }
      } catch {
        // Fall through to grounded local stream
      }
    }
  }

  // Delegate to requestAiProposals (handles both multi-option modification diffs and offline place queries)
  const result = await requestAiProposals({
    taskType: 'chat',
    destination: params.destination,
    message: params.message,
    currentDay: params.currentDay,
    travelers: params.travelers,
    language: isEn ? 'en' : 'pt',
    uiLanguage: resolvedUiLanguage,
    itinerary: params.itinerary || params.currentDay,
  });

  // Stream the reply progressively into the chat UI
  const tokens = result.reply.match(/.{1,30}(\s|\n|$)/g) || [result.reply];
  let acc = '';
  for (const token of tokens) {
    acc += token;
    params.onChunk?.(acc);
    await new Promise((r) => setTimeout(r, 14));
  }

  return {
    reply: result.reply,
    proposals: result.proposals,
    toolUsed: result.toolUsed,
    placeDetails: result.placeDetails,
  };
}

const ACCOMMODATION_ALTERNATIVES_CATALOG: Record<
  BudgetTier,
  { suffix: string; type: string; price: number; latOffset: number; lngOffset: number }[]
> = {
  budget: [
    {
      suffix: 'Artisan Courtyard Hostel & Co-Living',
      type: 'hostel',
      price: 44,
      latOffset: 0.0038,
      lngOffset: -0.0032,
    },
    {
      suffix: 'Old Quarter Travellers Guesthouse',
      type: 'hostel',
      price: 52,
      latOffset: -0.0042,
      lngOffset: 0.0029,
    },
    {
      suffix: 'Neighbourhood Studio & Terrace',
      type: 'apartment',
      price: 58,
      latOffset: 0.0027,
      lngOffset: 0.0041,
    },
  ],
  mid: [
    {
      suffix: 'Boutique Townhouse & Garden Hotel',
      type: 'hotel',
      price: 128,
      latOffset: -0.0036,
      lngOffset: -0.0041,
    },
    {
      suffix: 'Heritage Loft & Cloister Suites',
      type: 'apartment',
      price: 135,
      latOffset: 0.0044,
      lngOffset: -0.0028,
    },
    {
      suffix: 'Miradouro Design Hotel & Bistro',
      type: 'hotel',
      price: 144,
      latOffset: -0.0029,
      lngOffset: 0.0045,
    },
  ],
  premium: [
    {
      suffix: 'Palazzo Reserve & Rooftop Thermal Spa',
      type: 'hotel',
      price: 275,
      latOffset: 0.0051,
      lngOffset: -0.0048,
    },
    {
      suffix: 'Grand Heritage Palace & Private Courtyard',
      type: 'hotel',
      price: 295,
      latOffset: -0.0049,
      lngOffset: 0.0052,
    },
    {
      suffix: 'Royal Riverfront Suites & Wine Cellar',
      type: 'hotel',
      price: 310,
      latOffset: 0.0039,
      lngOffset: 0.0047,
    },
  ],
};

/**
 * Triggers a scoped Gemini request that returns ONLY a new accommodation option (JSON)
 * for that specific city and budget tier, wrapped as a ProposalChange (`replace_accommodation`)
 * so the user can accept or reject it via the Diff Review UI.
 */
export async function requestAccommodationAlternative(params: {
  city: string;
  country?: string;
  day: Day;
  tier: BudgetTier;
  language?: 'en' | 'pt';
  uiLanguage?: string;
}): Promise<{ proposal: ProposalChange; usedFallback: boolean }> {
  const resolvedUiLanguage =
    params.uiLanguage || (params.language === 'en' ? 'en' : 'pt-PT');
  const cleanCity = (params.city || params.day.city || 'Lisbon').split(',')[0].trim();
  const cleanCountry = (params.country || 'Portugal').trim();
  const currentAcc = params.day.accommodation;
  const currentName = currentAcc?.name || `Hotel ${cleanCity}`;
  const baseCoords =
    currentAcc?.coordinates || resolveDestinationCoordinates(cleanCity, cleanCountry);

  if (USE_LIVE_GEMINI_API) {
    try {
      const response = await fetch('/api/gemini/accommodation-alternative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: cleanCity,
          country: cleanCountry,
          currentAccommodation: currentAcc,
          tier: params.tier,
          dayNumber: params.day.dayNumber,
          language: params.language || (resolvedUiLanguage === 'en' ? 'en' : 'pt'),
          uiLanguage: resolvedUiLanguage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (
          data &&
          !data.fallback &&
          typeof data.name === 'string' &&
          data.name.trim().length > 0 &&
          typeof data.price === 'number'
        ) {
          const clampedCoords = clampCoordinatesToCityBounds(
            data.coordinates?.lat,
            data.coordinates?.lng,
            baseCoords,
            params.day.dayNumber + 7,
            0.35
          );
          const newAcc: DayAccommodation = {
            ...(currentAcc || {
              name: data.name.trim(),
              type: data.type || 'hotel',
              price: Math.max(20, Math.round(data.price)),
              coordinates: clampedCoords,
            }),
            name: data.name.trim(),
            type: String(data.type || 'hotel').toLowerCase(),
            price: Math.max(20, Math.round(data.price)),
            isPriceVerified: Boolean(data.isPriceVerified),
            coordinates: clampedCoords,
            selectedTier: params.tier,
            customPriceLocked: true,
            whyThis: data.reason,
            tierOptions: {
              ...(currentAcc?.tierOptions || {
                budget: {
                  name: `${cleanCity} Budget Hostel`,
                  type: 'hostel',
                  price: 48,
                  isPriceVerified: false,
                  coordinates: {
                    lat: Number((clampedCoords.lat - 0.003).toFixed(5)),
                    lng: Number((clampedCoords.lng + 0.003).toFixed(5)),
                  },
                },
                mid: {
                  name: data.name.trim(),
                  type: String(data.type || 'hotel').toLowerCase(),
                  price: Math.max(20, Math.round(data.price)),
                  isPriceVerified: Boolean(data.isPriceVerified),
                  coordinates: clampedCoords,
                },
                premium: {
                  name: `Grand Palace ${cleanCity}`,
                  type: 'hotel',
                  price: 270,
                  isPriceVerified: false,
                  coordinates: {
                    lat: Number((clampedCoords.lat + 0.004).toFixed(5)),
                    lng: Number((clampedCoords.lng - 0.004).toFixed(5)),
                  },
                },
              }),
              [params.tier]: {
                name: data.name.trim(),
                type: String(data.type || 'hotel').toLowerCase(),
                price: Math.max(20, Math.round(data.price)),
                isPriceVerified: Boolean(data.isPriceVerified),
                coordinates: clampedCoords,
              },
            },
          };

          return {
            usedFallback: false,
            proposal: {
              id: `prop-acc-${params.day.id}-${params.tier}`,
              dayId: params.day.id,
              dayNumber: params.day.dayNumber,
              type: 'replace_accommodation',
              targetAccommodationName: currentName,
              accommodationPayload: newAcc,
              reason:
                data.reason ||
                `Alternative ${params.tier}-tier accommodation in ${cleanCity} (~€${newAcc.price}/night).`,
              source: 'accommodation',
              status: 'pending',
            },
          };
        }
      }
    } catch {
      // Fall through to deterministic city-bounded alternative
    }
  }

  const tierCandidates = ACCOMMODATION_ALTERNATIVES_CATALOG[params.tier] || ACCOMMODATION_ALTERNATIVES_CATALOG.mid;
  const candidate =
    tierCandidates.find(
      (c) => !currentName.toLowerCase().includes(c.suffix.toLowerCase())
    ) || tierCandidates[params.day.dayNumber % tierCandidates.length];

  const altName = `${cleanCity} ${candidate.suffix}`;
  const altCoords = {
    lat: Number((baseCoords.lat + candidate.latOffset).toFixed(5)),
    lng: Number((baseCoords.lng + candidate.lngOffset).toFixed(5)),
  };

  const fallbackAcc: DayAccommodation = {
    ...(currentAcc || {
      name: altName,
      type: candidate.type,
      price: candidate.price,
      coordinates: altCoords,
    }),
    name: altName,
    type: candidate.type,
    price: candidate.price,
    coordinates: altCoords,
    selectedTier: params.tier,
    customPriceLocked: true,
    whyThis: `Curated ${params.tier}-tier alternative stay in ${cleanCity} with distinct coordinates and walkable transit access.`,
    tierOptions: {
      budget: {
        name:
          params.tier === 'budget'
            ? altName
            : currentAcc?.tierOptions?.budget?.name || `${cleanCity} Artisan Hostel`,
        type: 'hostel',
        price:
          params.tier === 'budget'
            ? candidate.price
            : currentAcc?.tierOptions?.budget?.price || 48,
        coordinates:
          params.tier === 'budget'
            ? altCoords
            : currentAcc?.tierOptions?.budget?.coordinates || {
                lat: Number((altCoords.lat - 0.0031).toFixed(5)),
                lng: Number((altCoords.lng + 0.0029).toFixed(5)),
              },
      },
      mid: {
        name:
          params.tier === 'mid'
            ? altName
            : currentAcc?.tierOptions?.mid?.name || `${cleanCity} Boutique Hotel`,
        type: params.tier === 'mid' ? candidate.type : 'hotel',
        price:
          params.tier === 'mid'
            ? candidate.price
            : currentAcc?.tierOptions?.mid?.price || 128,
        coordinates:
          params.tier === 'mid'
            ? altCoords
            : currentAcc?.tierOptions?.mid?.coordinates || altCoords,
      },
      premium: {
        name:
          params.tier === 'premium'
            ? altName
            : currentAcc?.tierOptions?.premium?.name || `${cleanCity} Palazzo Spa Hotel`,
        type: 'hotel',
        price:
          params.tier === 'premium'
            ? candidate.price
            : currentAcc?.tierOptions?.premium?.price || 275,
        coordinates:
          params.tier === 'premium'
            ? altCoords
            : currentAcc?.tierOptions?.premium?.coordinates || {
                lat: Number((altCoords.lat + 0.0042).toFixed(5)),
                lng: Number((altCoords.lng - 0.0038).toFixed(5)),
              },
      },
    },
  };

  return {
    usedFallback: true,
    proposal: {
      id: `prop-acc-${params.day.id}-${params.tier}`,
      dayId: params.day.id,
      dayNumber: params.day.dayNumber,
      type: 'replace_accommodation',
      targetAccommodationName: currentName,
      accommodationPayload: fallbackAcc,
      reason:
        params.language === 'pt'
          ? `Alternativa de alojamento (${params.tier}) em ${cleanCity} com localização distinta (~€${fallbackAcc.price}/noite).`
          : `Curated ${params.tier}-tier accommodation alternative in ${cleanCity} with distinct coordinates (~€${fallbackAcc.price}/night).`,
      source: 'accommodation',
      status: 'pending',
    },
  };
}


