import {
  Activity,
  Day,
  FullTripBundle,
  ProposalChange,
  Traveler,
} from '../types/models';
import { DEMO_TRIPS } from '../data/demoTrips';
import {
  GooglePlaceDetailsResult,
  buildFunctionResponsePayload,
  calculateHaversineTravel,
  computePaceMetrics,
  extractPlaceQueryArgs,
  formatGroundedPlaceReply,
  isInformationalPlaceQuery,
  normalizeGooglePlacesApiResponse,
  resolveVerifiedPlaceDetails,
} from '../utils/domainLogic';

// Live Gemini API integration enabled via server-side /api/ai/* routes
const USE_LIVE_GEMINI_API = true;

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
          title: 'Colosseum & Roman Forum Archaeological Walk',
          category: 'culture',
          description: 'Walk the ancient Flavian Amphitheatre tiers and Via Sacra ruins.',
          neighborhood: 'Centro Storico, Rome',
          latOffset: 0.0,
          lngOffset: 0.0,
          isOutdoor: true,
          baseCost: 18,
        },
        {
          title: 'Trastevere Artisanal Trattoria & Piazzas',
          category: 'food',
          description: 'Traditional Roman cacio e pepe and seasonal artichokes in cobblestone lanes.',
          neighborhood: 'Trastevere, Rome',
          latOffset: -0.0012,
          lngOffset: -0.0225,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: 'Pantheon & Galleria Borghese Sculptures',
          category: 'culture',
          description: 'Marvel at the unreinforced concrete dome oculus and Bernini marble masterpieces.',
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
          title: 'Uffizi Gallery & Piazza della Signoria',
          category: 'culture',
          description: 'Renaissance masterpieces by Botticelli and Leonardo overlooking the Arno.',
          neighborhood: 'Historic Center, Florence',
          latOffset: -0.0018,
          lngOffset: -0.0005,
          isOutdoor: false,
          baseCost: 25,
        },
        {
          title: 'Oltrarno Craft Workshops & Santo Spirito Wine Bar',
          category: 'food',
          description: 'Authentic Florentine leather studios followed by Chianti Classico and crostini.',
          neighborhood: 'Oltrarno, Florence',
          latOffset: -0.0052,
          lngOffset: -0.0074,
          isOutdoor: false,
          baseCost: 22,
        },
        {
          title: 'Piazzale Michelangelo Golden Hour Panorama',
          category: 'nature',
          description: 'Sweeping sunset terrace view over Brunelleschi’s Duomo and Ponte Vecchio.',
          neighborhood: 'San Miniato Hill, Florence',
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
          title: 'Senso-ji Temple & Yanaka Old Tokyo Lanes',
          category: 'culture',
          description: 'Historic wooden craft shops, incense courtyards, and quiet Edo-era side streets.',
          neighborhood: 'Asakusa & Yanaka, Tokyo',
          latOffset: 0.0385,
          lngOffset: 0.0463,
          isOutdoor: true,
          baseCost: 12,
        },
        {
          title: 'Tsukiji Outer Market &Ginza Izakaya Tasting',
          category: 'food',
          description: 'Fresh seasonal sushi counter and charcoal-grilled yakitori in a tucked-away alley.',
          neighborhood: 'Chuo City, Tokyo',
          latOffset: -0.0108,
          lngOffset: 0.0204,
          isOutdoor: false,
          baseCost: 28,
        },
        {
          title: 'Meiji Jingu Forest Shrine & Shibuya Sky Deck',
          category: 'nature',
          description: 'Towering cedar forest torii gates followed by a 360-degree skyline view.',
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
          title: 'Fushimi Inari Taisha Upper Mountain Trail',
          category: 'culture',
          description: 'Vermilion torii gates winding through quiet bamboo and cedar shrines.',
          neighborhood: 'Fushimi Ward, Kyoto',
          latOffset: -0.0445,
          lngOffset: 0.0045,
          isOutdoor: true,
          baseCost: 10,
        },
        {
          title: 'Nishiki Market & Gion Matcha Tea House',
          category: 'food',
          description: 'Kyoto obanzai delicacies, yuba tofu, and ceremonial Uji matcha.',
          neighborhood: 'Nakagyo & Gion, Kyoto',
          latOffset: -0.0066,
          lngOffset: -0.0032,
          isOutdoor: false,
          baseCost: 24,
        },
        {
          title: 'Arashiyama Bamboo Grove & Katsura River Walk',
          category: 'nature',
          description: 'Morning stroll through towering bamboo stalks and riverside Zen gardens.',
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
          title: 'Musée d’Orsay & Left Bank Seine Promenade',
          category: 'culture',
          description: 'Impressionist masterpieces housed in a Beaux-Arts railway station.',
          neighborhood: 'Saint-Germain-des-Prés, Paris',
          latOffset: 0.0034,
          lngOffset: -0.0257,
          isOutdoor: false,
          baseCost: 16,
        },
        {
          title: 'Le Marais Covered Market & Neighborhood Bistro',
          category: 'food',
          description: 'Marché des Enfants Rouges stalls and classic duck confit bistro lunch.',
          neighborhood: 'Le Marais, Paris',
          latOffset: 0.0062,
          lngOffset: 0.01,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: 'Montmartre Vineyards & Sacré-Cœur Terrace',
          category: 'culture',
          description: 'Historic artists’ square, hidden Clos Montmartre vineyard, and panoramic steps.',
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
          title: 'Sagrada Família & Eixample Modernisme Walk',
          category: 'culture',
          description: 'Gaudí’s stained-glass basilica nave and modernist block courtyards.',
          neighborhood: 'Eixample, Barcelona',
          latOffset: 0.0162,
          lngOffset: 0.0058,
          isOutdoor: false,
          baseCost: 26,
        },
        {
          title: 'El Born Santa Caterina Market & Pintxos Bar',
          category: 'food',
          description: 'Wave-roofed neighborhood food market and Catalan vermut & tapas.',
          neighborhood: 'El Born, Barcelona',
          latOffset: -0.0011,
          lngOffset: 0.0095,
          isOutdoor: false,
          baseCost: 20,
        },
        {
          title: 'Bunkers del Carmel & Park Güell Terraces',
          category: 'nature',
          description: 'Sweeping Mediterranean and city grid views at golden hour.',
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
          title: 'Acropolis Citadel & Acropolis Museum',
          category: 'culture',
          description: 'Parthenon marble friezes and glass-floored archaeological galleries.',
          neighborhood: 'Makrygianni, Athens',
          latOffset: -0.0123,
          lngOffset: -0.0018,
          isOutdoor: true,
          baseCost: 20,
        },
        {
          title: 'Plaka & Psyri Courtyard Meze Tavern',
          category: 'food',
          description: 'Grilled halloumi, courgette fritters, and Peloponnese wines under lemon trees.',
          neighborhood: 'Plaka, Athens',
          latOffset: -0.0095,
          lngOffset: 0.0031,
          isOutdoor: false,
          baseCost: 22,
        },
        {
          title: 'Mount Lycabettus & Philopappos Hill Sunset',
          category: 'nature',
          description: 'Pine-shaded footpath overlooking the Aegean Sea and ancient Pnyx.',
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
  assumptions: string[];
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
          assumptions: params.assumptions,
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

          const builtDays: Day[] = data.days.map((d: any, idx: number) => {
            const dayDate = new Date(start.getTime() + idx * 86400000)
              .toISOString()
              .slice(0, 10);
            const fallbackCityName =
              cleanCities[idx % Math.max(1, cleanCities.length)] || cleanCountry;
            const fallbackCoords = CITY_COORDINATES_LOOKUP[fallbackCityName.toLowerCase()] ||
              CITY_COORDINATES_LOOKUP[cleanCountry.toLowerCase()] || {
                lat: 41.8902,
                lng: 12.4922,
              };

            const mapActivity = (raw: any, aIdx: number): Activity => ({
              id: raw.id || `${tripId}-d${idx + 1}-a${aIdx + 1}`,
              title: raw.title,
              category: raw.category || 'culture',
              description: raw.description,
              startTime: raw.startTime || `${9 + aIdx * 3}:00`,
              durationMin: raw.durationMin || 90,
              openingHoursText: raw.openingHoursText || '09:30 – 18:00',
              isOutdoor: Boolean(raw.isOutdoor),
              interestTags: raw.interestTags || params.interests.slice(0, 2),
              location: raw.location || {
                name: fallbackCityName,
                lat: fallbackCoords.lat + aIdx * 0.004,
                lng: fallbackCoords.lng + aIdx * 0.004,
              },
              costOptions: raw.costOptions,
              selectedTier: 'mid',
              // AI Architecture Rule #3: Never mark AI-generated prices or hours as 'verified'
              priceConfidence: {
                status: 'estimated',
                notes: 'AI estimated cost (~) — verify on official venue site',
              },
              hoursConfidence: {
                status: 'estimated',
                notes: 'Estimated typical schedule',
              },
              whyThis:
                raw.whyThis ||
                `Suggested for your interest in ${params.interests[0] || 'local culture'}.`,
              touristTrapScore:
                typeof raw.touristTrapScore === 'number' ? raw.touristTrapScore : 38,
              votes: {},
            });

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
              theme: d.theme || `Day ${idx + 1} in ${finalDestinationTitle}`,
              paceLevel: params.defaultPace,
              paceScore: 55,
              activePlan: 'A',
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
              constraints: 'None',
              preferredPace: params.defaultPace,
              color: '#D97706',
              avatar: (params.ownerName || 'Y')[0].toUpperCase(),
            },
          ];

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
                assumptions: params.assumptions,
                groupEnabled: params.groupEnabled,
              },
              days: builtDays,
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
  const targetCitiesList: string[] =
    !params.letAiDecideCities && cleanCities.length > 0
      ? cleanCities
      : countrySeeds
      ? countrySeeds.map((s) => s.city)
      : [cleanCountry];

  const fallbackDestinationTitle =
    targetCitiesList.length > 0 &&
    targetCitiesList[0].toLowerCase() !== cleanCountry.toLowerCase()
      ? `${targetCitiesList.join(', ')}, ${cleanCountry}`
      : formattedDestination;

  const builtFallbackDays: Day[] = Array.from({ length: diffDays }).map((_, idx) => {
    const dayDate = new Date(start.getTime() + idx * 86400000).toISOString().slice(0, 10);
    const activeCity = targetCitiesList[idx % targetCitiesList.length] || cleanCountry;
    const matchedSeed =
      countrySeeds?.find((s) => s.city.toLowerCase() === activeCity.toLowerCase()) ||
      countrySeeds?.[idx % (countrySeeds?.length || 1)];

    const coords = matchedSeed
      ? { lat: matchedSeed.lat, lng: matchedSeed.lng }
      : CITY_COORDINATES_LOOKUP[activeCity.toLowerCase()] ||
        CITY_COORDINATES_LOOKUP[lowerCountry] || { lat: 41.8902, lng: 12.4922 };

    const stopsSource = matchedSeed?.stops || [
      {
        title: `${activeCity} Historic Quarter & Architectural Landmarks`,
        category: 'culture' as const,
        description: `Guided walk through the historic heart and iconic monuments of ${activeCity}.`,
        neighborhood: `Historic Center, ${activeCity}`,
        latOffset: 0.0,
        lngOffset: 0.0,
        isOutdoor: true,
        baseCost: 16,
      },
      {
        title: `${activeCity} Artisanal Market & Regional Gastronomy`,
        category: 'food' as const,
        description: `Tasting regional specialties and seasonal market produce in ${activeCity}.`,
        neighborhood: `Old Town Market, ${activeCity}`,
        latOffset: 0.0045,
        lngOffset: -0.0052,
        isOutdoor: false,
        baseCost: 24,
      },
      {
        title: `${activeCity} Panoramic Viewpoint & Cultural Gallery`,
        category: 'nature' as const,
        description: `Golden-hour overlook and cultural heritage collection in ${activeCity}.`,
        neighborhood: `Scenic Overlook, ${activeCity}`,
        latOffset: -0.005,
        lngOffset: 0.0065,
        isOutdoor: true,
        baseCost: 14,
      },
    ];

    const activities: Activity[] = stopsSource.map((s, aIdx) => ({
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
        lat: Number((coords.lat + s.latOffset + idx * 0.001).toFixed(4)),
        lng: Number((coords.lng + s.lngOffset + idx * 0.001).toFixed(4)),
      },
      costOptions: {
        budget: {
          title: `${s.title} (Self-Guided / Light)`,
          estimatedCost: Math.max(0, Math.round(s.baseCost * 0.6)),
          description: 'Budget-friendly entry or local counter option',
        },
        mid: {
          title: `${s.title} (Standard)`,
          estimatedCost: s.baseCost,
          description: 'Standard curated experience',
        },
        premium: {
          title: `${s.title} (Private Priority Access)`,
          estimatedCost: Math.round(s.baseCost * 1.8),
          description: 'Priority skip-the-line or tasting menu pairing',
        },
      },
      selectedTier: 'mid',
      priceConfidence: {
        status: 'estimated',
        notes: 'AI estimated cost (~) — verify on official venue site',
      },
      hoursConfidence: {
        status: 'estimated',
        notes: 'Estimated typical schedule',
      },
      whyThis: `Tailored to your route in ${activeCity} (${cleanCountry}) and interest in ${
        params.interests[aIdx % Math.max(1, params.interests.length)] || 'culture'
      }.`,
      touristTrapScore: aIdx === 0 ? 52 : 26,
      votes: {},
    }));

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
      theme: `Day ${idx + 1}: Exploring ${activeCity}`,
      paceLevel: params.defaultPace,
      paceScore: 55,
      activePlan: 'A',
      activities: withTravel,
      planB: [
        {
          ...activities[1],
          id: `${tripId}-d${idx + 1}-planb-1`,
          title: `${activeCity} National Museum & Covered Atrium Café (Indoor Plan B)`,
          isOutdoor: false,
          whyThis: `Rainy-day indoor cultural backup in ${activeCity}.`,
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
      constraints: 'None',
      preferredPace: params.defaultPace,
      color: '#D97706',
      avatar: (params.ownerName || 'Y')[0].toUpperCase(),
    },
  ];

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
        assumptions: params.assumptions,
        groupEnabled: params.groupEnabled,
      },
      days: builtFallbackDays,
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
          return {
            reply: data.reply,
            proposals: data.proposals.map((p: any) => ({
              ...p,
              dayId: params.currentDay.id,
              dayNumber: params.currentDay.dayNumber,
              source: params.taskType,
              status: 'pending',
            })),
            usedFallback: false,
          };
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

  const firstAct = params.currentDay.activities[0];
  const lastAct = params.currentDay.activities[params.currentDay.activities.length - 1];
  const baseLat = firstAct?.location.lat ?? 38.7139;
  const baseLng = firstAct?.location.lng ?? -9.1334;
  const lowerMsg = params.message.toLowerCase();

  if (params.taskType === 'pace') {
    const isRelaxing = params.message.includes('1') || params.message.includes('2') || lowerMsg.includes('relax');
    if (isRelaxing && params.currentDay.activities.length > 2 && lastAct) {
      return {
        usedFallback: true,
        reply: `To give Day ${params.currentDay.dayNumber} a more relaxed pace with wider free buffers, I propose removing "${lastAct.title}" or shifting it to a later afternoon slot.`,
        proposals: [
          {
            id: `prop-pace-${Date.now()}`,
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

    const newAct: Activity = {
      id: `act-pace-${Date.now()}`,
      title: `${params.destination} Artisanal Roastery & Miradouro Stop`,
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
          id: `prop-pace-add-${Date.now()}`,
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
      params.currentDay.activities.find((a) => Object.values(a.votes || {}).includes('down')) ||
      firstAct;
    const names = params.travelers.map((t) => t.displayName).join(' & ');
    const compromiseAct: Activity = {
      id: `act-comp-${Date.now()}`,
      title: `${params.destination} Cultural Courtyard & Neighbourhood Tapas`,
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
          id: `prop-comp-${Date.now()}`,
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
  const target = firstAct;
  const replacement: Activity = {
    id: `act-chat-${Date.now()}`,
    title: lowerMsg.includes('cheap') || lowerMsg.includes('barat')
      ? `Free Historic Guildhall & Neighbourhood Tasca (${params.destination})`
      : lowerMsg.includes('walk') || lowerMsg.includes('caminh')
      ? `Scenic Tram Loop & Seated Courtyard Café (${params.destination})`
      : `Authentic Neighbourhood Tavern & Craft Workshop (${params.destination})`,
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
        id: `prop-chat-${Date.now()}`,
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

