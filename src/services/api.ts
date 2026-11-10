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
  GooglePlaceDetailsResult,
  buildFunctionResponsePayload,
  calculateHaversineTravel,
  computePaceMetrics,
  deduplicateAndMergeProposals,
  extractPlaceQueryArgs,
  formatGroundedPlaceReply,
  isInformationalPlaceQuery,
  normalizeGooglePlacesApiResponse,
  resolveVerifiedPlaceDetails,
} from '../utils/domainLogic';
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
  customRequest?: string
): string {
  const scope = cityOrScope && cityOrScope !== country ? `${cityOrScope}, ${country}` : country;
  const constraints = buildSpecialPreferencesConstraintList(specialPreferences, customRequest);
  const constraintsDirective =
    constraints.length > 0
      ? `STRICT USER RESTRICTIONS & SPECIAL REQUESTS (MANDATORY FOR LOCATIONS, MEALS, AND LOGISTICS): The user specified the following mandatory constraints: [${constraints.join(
          '; '
        )}]. You MUST strictly obey these constraints when selecting every activity location, restaurant/meal recommendation, accessibility/step-free route, crowd avoidance, and transport/logistics mode.`
      : '';

  return [
    'You are AtlasGenie, an expert global & European travel architect.',
    'CRITICAL: You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances.',
    `You MUST strictly confine all activities, restaurants, and coordinates to the exact requested City and Country (${scope}).`,
    'Complete all days in City A before moving to City B. Never alternate back and forth day-by-day.',
    'You MUST maintain a global history of all generated venues. YOU ARE STRICTLY FORBIDDEN from repeating the same activity, museum, restaurant, or neighborhood walk on different days. Every single activity across the entire trip MUST be 100% unique.',
    "The user's preferences, age group, and custom requests (from the text area) are ABSOLUTE LAWS. If the user explicitly asks for 'discotecas', nightlife, or a specific niche, you MUST prioritize and include these over generic city highlights. Sacrifice standard attractions to guarantee the user's specific constraints are met on at least one of the days.",
    'Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers.',
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
  rawAcc?: any
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

  return {
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
    tierOptions: {
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
    },
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
  rawMeals?: any
): DayMeals {
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
              ? `Padaria & Espresso Bar ${cityName}`
              : slot === 'lunch'
              ? `Mercado Tasca Popular ${cityName}`
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

  return {
    breakfast: buildMeal(
      'breakfast',
      `Café & Pastelaria Artesanal ${cityName} (Dia ${dayIdx + 1})`,
      'Pastelaria Artesanal e Café',
      11,
      0.0022,
      -0.0019,
      rawMeals?.breakfast
    ),
    lunch: buildMeal(
      'lunch',
      `Tasca & Cozinha de Mercado Regional ${cityName} (Dia ${dayIdx + 1})`,
      'Cozinha Regional de Mercado',
      22,
      -0.0031,
      0.0028,
      rawMeals?.lunch
    ),
    dinner: buildMeal(
      'dinner',
      `Restaurante Tradicional & Adega ${cityName} (Dia ${dayIdx + 1})`,
      'Gastronomia Tradicional ao Jantar',
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
  activityIdx: number
): Activity['costOptions'] {
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
    `${baseTitle} — Entrada de Bairro Local`;
  const midVenue =
    rawCostOptions?.mid?.venueName ||
    rawCostOptions?.mid?.title ||
    `${baseTitle} — ${baseLocationName}`;
  const premiumVenue =
    rawCostOptions?.premium?.venueName ||
    rawCostOptions?.premium?.title ||
    `${baseTitle} — Acesso Privado com Curador`;

  return {
    budget: {
      title: rawCostOptions?.budget?.title || `${baseTitle} (Opção Económica Local)`,
      venueName: budgetVenue,
      estimatedCost:
        typeof rawCostOptions?.budget?.estimatedCost === 'number'
          ? rawCostOptions.budget.estimatedCost
          : Math.max(0, Math.round(baseCost * 0.55)),
      isPriceVerified: Boolean(rawCostOptions?.budget?.isPriceVerified),
      description:
        rawCostOptions?.budget?.description ||
        'Visita autónoma autêntica de bairro ou balcão tradicional local',
      coordinates: budgetCoord,
    },
    mid: {
      title: rawCostOptions?.mid?.title || `${baseTitle} (Espaço Principal)`,
      venueName: midVenue,
      estimatedCost:
        typeof rawCostOptions?.mid?.estimatedCost === 'number'
          ? rawCostOptions.mid.estimatedCost
          : baseCost,
      isPriceVerified: Boolean(rawCostOptions?.mid?.isPriceVerified),
      description: rawCostOptions?.mid?.description || 'Experiência selecionada no recinto central',
      coordinates: midCoord,
    },
    premium: {
      title: rawCostOptions?.premium?.title || `${baseTitle} (Experiência Privada Premium)`,
      venueName: premiumVenue,
      estimatedCost:
        typeof rawCostOptions?.premium?.estimatedCost === 'number'
          ? rawCostOptions.premium.estimatedCost
          : Math.round(baseCost * 1.85),
      isPriceVerified: Boolean(rawCostOptions?.premium?.isPriceVerified),
      description:
        rawCostOptions?.premium?.description ||
        'Acesso exclusivo privado ou prova comentada com especialista local',
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
  specialPreferences?: string[]
): Day[] {
  const seenTitles = new Set<string>();
  const uniqueFallbackPool = [
    {
      suffix: 'Galeria de Arte Contemporânea e Pátio Histórico',
      category: 'culture' as const,
      desc: 'Visita às exposições temporárias, arquitetura moderna e jardins escultóricos locais.',
    },
    {
      suffix: 'Rota de Tasquinhas, Vinhos e Petiscos de Bairro',
      category: 'food' as const,
      desc: 'Degustação gastronómica por tascas familiares e produtores tradicionais.',
    },
    {
      suffix: 'Passeio Panorâmico pelos Jardins e Belvedere',
      category: 'nature' as const,
      desc: 'Caminhada tranquila por alamedas arborizadas e miradouros históricos sobre a cidade.',
    },
    {
      suffix: 'Quarteirão Boémio, Livrarias e Design Independente',
      category: 'shopping' as const,
      desc: 'Exploração de lojas de autor, cafés literários e oficinas criativas.',
    },
    {
      suffix: 'Claustros Monumentais e Azulejaria Histórica',
      category: 'culture' as const,
      desc: 'Percurso pelo património arquitetónico secular e pátios interiores.',
    },
    {
      suffix: 'Noite de Música ao Vivo e Cocktail Bar Local',
      category: 'nightlife' as const,
      desc: 'Ambiente noturno autêntico com música acústica ou DJ set local.',
    },
  ];
  let poolCursor = 0;

  const deduplicatedDays = days.map((day, dIdx) => {
    const cityLabel = day.city || 'Centro';
    const nextActivities = day.activities.map((act, aIdx) => {
      const normTitle = act.title.trim().toLowerCase();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        return act;
      }

      // Replace duplicate activity with a guaranteed unique venue for this day
      let replacement = uniqueFallbackPool[poolCursor % uniqueFallbackPool.length];
      poolCursor += 1;
      let candidateTitle = `${replacement.suffix} de ${cityLabel} (Dia ${dIdx + 1})`;
      while (seenTitles.has(candidateTitle.toLowerCase())) {
        replacement = uniqueFallbackPool[poolCursor % uniqueFallbackPool.length];
        poolCursor += 1;
        candidateTitle = `${replacement.suffix} de ${cityLabel} — Roteiro ${dIdx + 1}.${aIdx + 1}`;
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
          aIdx + dIdx * 3
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
    const cityLabel = day.city || 'Cidade';
    const lastIdx = day.activities.length - 1;
    const targetAct = day.activities[lastIdx];

    const customTitle = isNightlifeOrClubRequest
      ? `Noite nas Discotecas e Clubes Emblemáticos de ${cityLabel}`
      : `Experiência Personalizada em ${cityLabel}: ${cleanCustom.slice(0, 60)}`;
    const customCategory: Activity['category'] = isNightlifeOrClubRequest
      ? 'nightlife'
      : targetAct.category;
    const customDesc = isNightlifeOrClubRequest
      ? `Roteiro noturno dedicado às principais discotecas, pistas de dança e clubes de música eletrónica e comercial em ${cityLabel}, cumprindo o pedido especial do grupo.`
      : `Atividade incluída prioritariamente para cumprir o pedido específico do utilizador ("${cleanCustom}") em ${cityLabel}.`;

    const updatedLastAct: Activity = {
      ...targetAct,
      title: customTitle,
      category: customCategory,
      startTime: isNightlifeOrClubRequest ? '23:00' : targetAct.startTime,
      description: customDesc,
      whyThis: `Priorizado como lei absoluta para cumprir o seu pedido personalizado: "${cleanCustom}"${
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
        lastIdx
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
}): Promise<{ bundle: FullTripBundle; usedFallback: boolean }> {
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
          travelersCount: params.travelersCount,
          assumptions: combinedConstraints,
          specialPreferences: params.specialPreferences || [],
          customRequest: params.customRequest || '',
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
                  aIdx
                ),
                selectedTier: 'mid',
                isPriceVerified,
                priceConfidence: isPriceVerified
                  ? {
                      status: 'verified',
                      verifiedAt: new Date().toISOString().slice(0, 10),
                      notes: 'Preço 2026 verificado via Google Search',
                    }
                  : {
                      status: 'estimated',
                      notes: 'Custo estimado pela IA (~) — confirmar no site oficial do local',
                    },
                hoursConfidence: {
                  status: 'estimated',
                  notes: 'Horário habitual estimado',
                },
                whyThis:
                  raw.whyThis ||
                  `Selecionado pelo seu interesse cultural e gastronómico em ${fallbackCityName}.`,
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
              theme: d.theme || `Dia ${idx + 1}: À descoberta de ${fallbackCityName}`,
              paceLevel: params.defaultPace,
              paceScore: 55,
              activePlan: 'A',
              accommodation: buildDefaultDayAccommodation(
                fallbackCityName,
                fallbackCoords,
                idx,
                d.accommodation
              ),
              intercity_transit: isCityTransitionDay
                ? buildDefaultIntercityTransit(
                    prevDayCity,
                    fallbackCityName,
                    cleanCountry,
                    d.intercity_transit
                  )
                : undefined,
              meals: buildDefaultDayMeals(fallbackCityName, fallbackCoords, idx, d.meals),
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
              budgetPerPerson: Math.round(params.totalBudget / Math.max(1, params.travelersCount)),
              constraints: combinedConstraints.length > 0 ? combinedConstraints.join('; ') : 'None',
              preferredPace: params.defaultPace,
              color: '#D97706',
              avatar: (params.ownerName || 'Y')[0].toUpperCase(),
            },
          ];

          const deduplicatedLiveDays = enforceUniqueActivitiesAndCustomRequests(
            builtDays,
            params.customRequest,
            params.specialPreferences
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
          title: `Passeio pelo Centro Histórico e Património de ${cityName}`,
          category: 'culture' as const,
          description: `Exploração pelas praças históricas, arquitetura tradicional e ruas de comércio local em ${cityName}.`,
          neighborhood: `Centro Histórico, ${cityName}`,
          latOffset: 0.0,
          lngOffset: 0.0,
          isOutdoor: true,
          baseCost: 12,
        },
        {
          title: `Mercado Regional e Cozinha Tradicional de ${cityName}`,
          category: 'food' as const,
          description: `Degustação de pratos regionais autênticos, café local e produtos frescos do mercado em ${cityName}.`,
          neighborhood: `Mercado Municipal, ${cityName}`,
          latOffset: 0.0045,
          lngOffset: -0.0052,
          isOutdoor: false,
          baseCost: 20,
        },
        {
          title: `Trilho Natural e Miradouro Panorâmico de ${cityName}`,
          category: 'nature' as const,
          description: `Caminhada pela natureza e miradouro ao final da tarde com vista panorâmica sobre ${cityName}.`,
          neighborhood: `Miradouro Local, ${cityName}`,
          latOffset: -0.005,
          lngOffset: 0.0065,
          isOutdoor: true,
          baseCost: 10,
        },
      ],
      [
        {
          title: `Museu de Arte e Arquitetura Clássica de ${cityName}`,
          category: 'culture' as const,
          description: `Visita às coleções de arte, claustros históricos e galerias patrimoniais de ${cityName}.`,
          neighborhood: `Quarteirão Cultural, ${cityName}`,
          latOffset: 0.0062,
          lngOffset: 0.0041,
          isOutdoor: false,
          baseCost: 16,
        },
        {
          title: `Roteiro de Petiscos e Adega Histórica em ${cityName}`,
          category: 'food' as const,
          description: `Prova de especialidades gastronómicas locais acompanhadas por vinhos da região em ${cityName}.`,
          neighborhood: `Bairro Antigo, ${cityName}`,
          latOffset: -0.0038,
          lngOffset: 0.0058,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: `Jardins Botânicos e Passeio Ribeirinho de ${cityName}`,
          category: 'nature' as const,
          description: `Percurso relaxante pelos jardins históricos e frente ribeirinha ou marítima de ${cityName}.`,
          neighborhood: `Zona Ribeirinha, ${cityName}`,
          latOffset: 0.0074,
          lngOffset: -0.0063,
          isOutdoor: true,
          baseCost: 8,
        },
      ],
      [
        {
          title: `Oficinas de Artesanato e Bairro Criativo de ${cityName}`,
          category: 'shopping' as const,
          description: `Descoberta de ateliês independentes, livrarias históricas e design local em ${cityName}.`,
          neighborhood: `Bairro das Artes, ${cityName}`,
          latOffset: -0.0064,
          lngOffset: -0.0047,
          isOutdoor: true,
          baseCost: 14,
        },
        {
          title: `Taberna de Autor e Doçaria Conventual em ${cityName}`,
          category: 'food' as const,
          description: `Almoço prolongado com receitas tradicionais reinventadas e pastelaria típica de ${cityName}.`,
          neighborhood: `Praça Central, ${cityName}`,
          latOffset: 0.0029,
          lngOffset: 0.0072,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: `Noite Cultural, Música ao Vivo e Terraço em ${cityName}`,
          category: 'nightlife' as const,
          description: `Sessão acústica ao entardecer seguida de convívio num terraço emblemático de ${cityName}.`,
          neighborhood: `Bairro Boémio, ${cityName}`,
          latOffset: -0.0042,
          lngOffset: 0.0033,
          isOutdoor: false,
          baseCost: 22,
        },
      ],
      [
        {
          title: `Palácio Histórico e Pátios Secretos de ${cityName}`,
          category: 'culture' as const,
          description: `Percurso guiado pelos salões nobres, azulejaria e jardins murados de ${cityName}.`,
          neighborhood: `Colina Histórica, ${cityName}`,
          latOffset: 0.0051,
          lngOffset: -0.0078,
          isOutdoor: false,
          baseCost: 15,
        },
        {
          title: `Confeitaria Histórica e Torrefação Artesanal de ${cityName}`,
          category: 'food' as const,
          description: `Pausa gastronómica dedicada aos doces regionais e cafés de especialidade em ${cityName}.`,
          neighborhood: `Baixa Histórica, ${cityName}`,
          latOffset: -0.0025,
          lngOffset: -0.0061,
          isOutdoor: false,
          baseCost: 12,
        },
        {
          title: `Miradouro do Pôr do Sol e Encosta Panorâmica de ${cityName}`,
          category: 'nature' as const,
          description: `Despedida ao final da tarde num ponto alto com vista de 360 graus sobre ${cityName}.`,
          neighborhood: `Encosta Panorâmica, ${cityName}`,
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
      matchedSeed && idx === 0
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
          aIdx
        ),
        selectedTier: 'mid',
        isPriceVerified: false,
        priceConfidence: {
          status: 'estimated',
          notes: 'Custo estimado pela IA (~) — confirmar no site oficial do local',
        },
        hoursConfidence: {
          status: 'estimated',
          notes: 'Horário habitual estimado',
        },
        whyThis: `Escolhido à medida para o seu roteiro em ${activeCity} (${cleanCountry}), privilegiando autenticidade local e ritmo equilibrado.`,
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
      theme: `Dia ${idx + 1}: À descoberta de ${activeCity}`,
      paceLevel: params.defaultPace,
      paceScore: 55,
      activePlan: 'A',
      accommodation: buildDefaultDayAccommodation(activeCity, coords, idx),
      intercity_transit: isCityTransitionDay
        ? buildDefaultIntercityTransit(prevDayCity, activeCity, cleanCountry)
        : undefined,
      meals: buildDefaultDayMeals(activeCity, coords, idx),
      activities: withTravel,
      planB: [
        {
          ...activities[1],
          id: `${tripId}-d${idx + 1}-planb-1`,
          title: `Museu Municipal e Galeria Coberta de ${activeCity} — Dia ${idx + 1} (Plano B Interior)`,
          isOutdoor: false,
          whyThis: `Alternativa cultural interior em ${activeCity} ideal para dias de chuva.`,
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
      budgetPerPerson: Math.round(params.totalBudget / Math.max(1, params.travelersCount)),
      constraints: combinedConstraints.length > 0 ? combinedConstraints.join('; ') : 'None',
      preferredPace: params.defaultPace,
      color: '#D97706',
      avatar: (params.ownerName || 'Y')[0].toUpperCase(),
    },
  ];

  const deduplicatedFallbackDays = enforceUniqueActivitiesAndCustomRequests(
    builtFallbackDays,
    params.customRequest,
    params.specialPreferences
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
}): Promise<{
  reply: string;
  proposals: ProposalChange[];
  usedFallback: boolean;
  toolUsed?: string;
  placeDetails?: GooglePlaceDetailsResult;
}> {
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
          const activeList =
            params.currentDay.activePlan === 'B' && params.currentDay.planB.length > 0
              ? params.currentDay.planB
              : params.currentDay.activities;
          const fallbackTarget = activeList[0];
          const baseLat = fallbackTarget?.location.lat ?? 38.7139;
          const baseLng = fallbackTarget?.location.lng ?? -9.1334;

          const mappedProposals: ProposalChange[] = data.proposals.map(
            (p: any, idx: number): ProposalChange => {
              const rawType =
                p.type === 'add' || p.type === 'remove' || p.type === 'replace' || p.type === 'move'
                  ? p.type
                  : fallbackTarget
                  ? 'replace'
                  : 'add';

              const matchedTarget =
                activeList.find((a) => a.id === p.targetActivityId) ||
                (p.targetActivityTitle
                  ? activeList.find(
                      (a) =>
                        a.title.trim().toLowerCase() ===
                        String(p.targetActivityTitle).trim().toLowerCase()
                    )
                  : undefined) ||
                fallbackTarget;

              const resolvedTargetId =
                rawType === 'add' ? undefined : matchedTarget?.id || p.targetActivityId;
              const resolvedTargetTitle =
                rawType === 'add' ? undefined : matchedTarget?.title || p.targetActivityTitle;

              const deterministicPropId =
                p.id && String(p.id).startsWith('prop-')
                  ? String(p.id)
                  : `prop-${params.taskType}-${params.currentDay.id}-${resolvedTargetId || idx}`;

              const deterministicActId = `act-${params.taskType}-${params.currentDay.id}-${
                resolvedTargetId || idx
              }`;

              let payload: Activity | undefined = p.payload;
              if ((rawType === 'add' || rawType === 'replace') && (!payload || !payload.costOptions)) {
                const suggestedTitle =
                  payload?.title ||
                  (rawType === 'replace' && p.targetActivityTitle && matchedTarget && p.targetActivityTitle !== matchedTarget.title
                    ? String(p.targetActivityTitle)
                    : `${params.destination} Local Cultural & Culinary Highlight`);
                const suggestedDesc =
                  payload?.description ||
                  p.reason ||
                  `Curated stop in ${params.destination} tailored to your request.`;
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
                    name: payload?.location?.name || `${params.destination} Historic Quarter`,
                    lat: payload?.location?.lat ?? Number((baseLat + 0.0025).toFixed(4)),
                    lng: payload?.location?.lng ?? Number((baseLng - 0.002).toFixed(4)),
                  },
                  costOptions: payload?.costOptions || {
                    budget: {
                      title: `${suggestedTitle} (Budget)`,
                      estimatedCost: 8,
                      description: 'Self-guided or light local option',
                    },
                    mid: {
                      title: `${suggestedTitle} (Standard)`,
                      estimatedCost: 16,
                      description: 'Standard curated experience',
                    },
                    premium: {
                      title: `${suggestedTitle} (Priority / Guided)`,
                      estimatedCost: 34,
                      description: 'Private guide or tasting pairing',
                    },
                  },
                  selectedTier: 'mid',
                  priceConfidence: {
                    status: 'estimated',
                    notes: 'AI estimated cost (~) — verify on official venue site',
                  },
                  hoursConfidence: {
                    status: 'estimated',
                    notes: 'Estimated typical opening schedule',
                  },
                  whyThis: p.reason || `Suggested for your request: "${params.message}"`,
                  touristTrapScore: 22,
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
                reason: p.reason || `Tailored to your request: "${params.message}"`,
                source: params.taskType,
                status: 'pending',
              };
            });

          const dedupedProposals = deduplicateAndMergeProposals(
            [],
            mappedProposals,
            [params.currentDay]
          );

          if (dedupedProposals.length > 0) {
            return {
              reply: data.reply,
              proposals: dedupedProposals,
              usedFallback: false,
            };
          }
        }
      }
    } catch {
      // Fall through to deterministic smart proposal or grounded place fallback
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
      params.language || 'en'
    );
    return {
      reply,
      proposals: [],
      usedFallback: false,
      toolUsed: 'fetch_google_place_details',
      placeDetails,
    };
  }

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

  if (params.taskType === 'pace') {
    const isRelaxing = params.message.includes('1') || params.message.includes('2') || lowerMsg.includes('relax');
    if (isRelaxing && activeDayList.length > 2 && lastAct) {
      return {
        usedFallback: true,
        reply: `To give Day ${params.currentDay.dayNumber} a more relaxed pace with wider free buffers, I propose removing "${lastAct.title}" or shifting it to a later afternoon slot.`,
        proposals: [
          {
            id: `prop-pace-remove-${params.currentDay.id}-${lastAct.id}`,
            dayId: params.currentDay.id,
            dayNumber: params.currentDay.dayNumber,
            type: 'remove',
            targetActivityId: lastAct.id,
            targetActivityTitle: lastAct.title,
            reason: `Frees up ${lastAct.durationMin} mins to match your Relaxed vibe setting`,
            source: 'pace',
            status: 'pending',
          },
        ],
      };
    }

    const paceTitleCandidates = [
      `${params.destination} Artisanal Roastery & Miradouro Stop`,
      `${params.destination} Twilight Botanical Promenade & Wine Bar`,
      `${params.destination} Old Quarter Gelateria & Cloister Walk`,
    ];
    const chosenPaceTitle =
      paceTitleCandidates.find((t) => !existingTitlesLower.has(t.toLowerCase())) ||
      paceTitleCandidates[0];

    const newAct: Activity = {
      id: `act-pace-add-${params.currentDay.id}`,
      title: chosenPaceTitle,
      category: 'food',
      description: 'High-energy specialty coffee terrace and viewpoint added for your faster daily pace.',
      startTime: '17:15',
      durationMin: 60,
      openingHoursText: '09:00 – 20:00',
      isOutdoor: true,
      interestTags: ['food', 'viewpoints'],
      location: {
        name: `${params.destination} Panoramic Terrace`,
        lat: baseLat + 0.004,
        lng: baseLng - 0.003,
      },
      costOptions: {
        budget: { title: 'Espresso at the Counter', estimatedCost: 3, description: 'Quick local bica' },
        mid: { title: 'Specialty Pour-Over & Pastry', estimatedCost: 9, description: 'Terrace table service' },
        premium: { title: 'Sunset Tasting Flight', estimatedCost: 22, description: 'Reserved viewpoint table' },
      },
      selectedTier: 'mid',
      priceConfidence: { status: 'estimated', notes: 'Estimated café menu (~€9)' },
      hoursConfidence: { status: 'estimated', notes: 'Typical daylight terrace hours' },
      whyThis: 'Added to enrich your afternoon schedule per your Vibe Slider.',
      touristTrapScore: 21,
      votes: {},
    };

    return {
      usedFallback: true,
      reply: `I have prepared an additional late-afternoon stop on Day ${params.currentDay.dayNumber} with calculated travel times. Review and accept below if you want it added.`,
      proposals: [
        {
          id: `prop-pace-add-${params.currentDay.id}`,
          dayId: params.currentDay.id,
          dayNumber: params.currentDay.dayNumber,
          type: 'add',
          payload: newAct,
          reason: `Adds a 60-min late afternoon highlight for your higher pace setting`,
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
    const names = params.travelers.map((t) => t.displayName).join(' & ');
    const compTitleCandidates = [
      `${params.destination} Cultural Courtyard & Neighbourhood Tapas`,
      `${params.destination} Heritage Cloister & Artisan Wine Cellar`,
      `${params.destination} Riverside Market Hall & Acoustic Sessions`,
    ];
    const chosenCompTitle =
      compTitleCandidates.find((t) => !existingTitlesLower.has(t.toLowerCase())) ||
      compTitleCandidates[0];

    const compromiseAct: Activity = {
      id: `act-comp-${params.currentDay.id}-${target?.id || 'slot1'}`,
      title: chosenCompTitle,
      category: 'food',
      description: 'Historic architectural courtyard hosting small-batch regional food stalls and acoustic music.',
      startTime: target?.startTime || '13:00',
      durationMin: 90,
      openingHoursText: '11:00 – 22:00',
      isOutdoor: false,
      interestTags: ['food', 'architecture', 'culture', 'music'],
      location: {
        name: `${params.destination} Old Quarter Courtyard`,
        lat: baseLat + 0.003,
        lng: baseLng + 0.003,
      },
      costOptions: {
        budget: { title: 'Courtyard Walk & Light Petisco', estimatedCost: 10, description: 'Shared bite' },
        mid: { title: 'Shared Tasting Platter & Local Wine', estimatedCost: 22, description: 'Balanced group lunch' },
        premium: { title: 'Private Courtyard Table & Pairing', estimatedCost: 44, description: 'Full tasting menu' },
      },
      selectedTier: 'mid',
      priceConfidence: { status: 'estimated', notes: 'Estimated ~€22/person' },
      hoursConfidence: { status: 'to_confirm', notes: 'Confirm courtyard kitchen hours before arrival' },
      whyThis: `Compromise serving ${names || 'all group members'} — blends architecture, food, and music.`,
      touristTrapScore: 19,
      votes: {},
    };

    return {
      usedFallback: true,
      reply: `I analysed everyone's votes and fairness scores. Here is a group compromise proposal replacing "${target?.title || 'the contested stop'}" so every traveller's interests are represented.`,
      proposals: [
        {
          id: `prop-comp-${params.currentDay.id}-${target?.id || 'slot1'}`,
          dayId: params.currentDay.id,
          dayNumber: params.currentDay.dayNumber,
          type: target ? 'replace' : 'add',
          targetActivityId: target?.id,
          targetActivityTitle: target?.title,
          payload: compromiseAct,
          reason: `Resolves group downvotes and raises overall Fairness Meter balance for ${names}`,
          source: 'compromise',
          status: 'pending',
        },
      ],
    };
  }

  // Default Chat Assistant proposals (Cheaper, Less walking, More local, Rainy day, or custom prompt)
  const target =
    activeDayList.find(
      (a) => !a.id.startsWith('act-chat-') && !a.id.startsWith('act-comp-')
    ) || firstAct;

  const chatTitleCandidates =
    lowerMsg.includes('cheap') || lowerMsg.includes('barat')
      ? [
          `Free Historic Guildhall & Neighbourhood Tasca (${params.destination})`,
          `Municipal Heritage Garden & €5 Bakery Stop (${params.destination})`,
          `Old Quarter Artisans Alley & Local Market (${params.destination})`,
        ]
      : lowerMsg.includes('walk') || lowerMsg.includes('caminh')
      ? [
          `Scenic Tram Loop & Seated Courtyard Café (${params.destination})`,
          `Panoramic Funicular & Shaded Plaza Bistro (${params.destination})`,
          `Historic River Ferry & Waterfront Lounge (${params.destination})`,
        ]
      : [
          `Authentic Neighbourhood Tavern & Craft Workshop (${params.destination})`,
          `Historic Tile Atelier & Family-Run Adega (${params.destination})`,
          `Secret Cloister Garden & Regional Tasting Room (${params.destination})`,
        ];

  const chosenChatTitle =
    chatTitleCandidates.find((t) => !existingTitlesLower.has(t.toLowerCase())) ||
    chatTitleCandidates[0];

  const replacement: Activity = {
    id: `act-chat-${params.currentDay.id}-${target?.id || 'slot1'}`,
    title: chosenChatTitle,
    category: lowerMsg.includes('cheap') ? 'food' : 'culture',
    description:
      'Handpicked local alternative tailored to your chat request, keeping travel time under 12 minutes.',
    startTime: target?.startTime || '11:00',
    durationMin: 90,
    openingHoursText: '10:00 – 19:00',
    isOutdoor: false,
    interestTags: ['culture', 'food'],
    location: {
      name: `${params.destination} Local Quarter`,
      lat: baseLat + 0.002,
      lng: baseLng - 0.002,
    },
    costOptions: {
      budget: { title: 'Free Entry / €6 Tasca Snack', estimatedCost: 6, description: 'Ultra-budget local option' },
      mid: { title: 'Standard Local Experience', estimatedCost: 14, description: 'Mid-range local favourite' },
      premium: { title: 'Private Local Host Experience', estimatedCost: 34, description: 'Curated insider access' },
    },
    selectedTier: lowerMsg.includes('cheap') || lowerMsg.includes('barat') ? 'budget' : 'mid',
    priceConfidence: { status: 'estimated', notes: 'Estimated (~) from AI suggestion' },
    hoursConfidence: { status: 'to_confirm', notes: 'Confirm local opening times' },
    whyThis: `Proposed in response to: "${params.message}"`,
    touristTrapScore: 17,
    votes: {},
  };

  return {
    usedFallback: true,
    reply: `I've prepared a visual diff proposal for Day ${params.currentDay.dayNumber} based on "${params.message}". Review the change below—nothing in your saved plan will change unless you click Accept.`,
    proposals: [
      {
        id: `prop-chat-${params.currentDay.id}-${target?.id || 'slot1'}`,
        dayId: params.currentDay.id,
        dayNumber: params.currentDay.dayNumber,
        type: target ? 'replace' : 'add',
        targetActivityId: target?.id,
        targetActivityTitle: target?.title,
        payload: replacement,
        reason: `Matches your chat request: "${params.message}"`,
        source: 'chat',
        status: 'pending',
      },
    ],
  };
}

/**
 * Streams the Atlas Genie Assistant response into the chat UI.
 * Implements the 5-step Gemini Function Calling flow (`fetch_google_place_details` -> `functionResponse` -> streamed grounded output)
 * for informational queries while preserving visual diff proposals for itinerary modification requests.
 */
export async function streamAtlasGenieChat(params: {
  destination: string;
  message: string;
  currentDay: Day;
  travelers: Traveler[];
  language?: 'en' | 'pt';
  onToolFetching?: (info: { placeName: string; city?: string }) => void;
  onChunk?: (accumulatedText: string) => void;
}): Promise<{
  reply: string;
  proposals: ProposalChange[];
  toolUsed?: string;
  placeDetails?: GooglePlaceDetailsResult;
}> {
  const isInfoQuery = isInformationalPlaceQuery(params.message);

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
            language: params.language || 'en',
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

  // Delegate to requestAiProposals (handles both modification diffs and offline place queries)
  const result = await requestAiProposals({
    taskType: 'chat',
    destination: params.destination,
    message: params.message,
    currentDay: params.currentDay,
    travelers: params.travelers,
    language: params.language,
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
}): Promise<{ proposal: ProposalChange; usedFallback: boolean }> {
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
          language: params.language || 'en',
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


