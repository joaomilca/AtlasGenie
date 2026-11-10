import express from 'express';
import path from 'path';
import { type FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import dotenv from 'dotenv';
import {
  type GooglePlaceDetailsResult,
  buildFunctionResponsePayload,
  extractPlaceQueryArgs,
  formatGroundedPlaceReply,
  isInformationalPlaceQuery,
  normalizeGooglePlacesApiResponse,
  resolveVerifiedPlaceDetails,
} from './src/utils/domainLogic.ts';
import {
  findWorldCountry,
  normalizeGeoText,
  registerVerifiedCityCoordinates,
  sanitizeAndCheckLocationInput,
  validateCityInCountry,
} from './src/utils/worldDestinations.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

// Simple per-client rate limiter & in-memory response cache (AI Architecture Rule #5)
const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerMinute = 20;
const clientHits: Record<string, { count: number; resetAt: number }> = {};
const aiResponseCache: Record<string, { data: unknown; expiresAt: number }> = {};

function checkRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const entry = clientHits[clientKey];
  if (!entry || now > entry.resetAt) {
    clientHits[clientKey] = { count: 1, resetAt: now + rateLimitWindowMs };
    return true;
  }
  if (entry.count >= maxRequestsPerMinute) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getCached<T>(key: string): T | null {
  const item = aiResponseCache[key];
  if (item && Date.now() < item.expiresAt) {
    return item.data as T;
  }
  return null;
}

function setCached(key: string, data: unknown, ttlMs = 10 * 60 * 1000) {
  aiResponseCache[key] = { data, expiresAt: Date.now() + ttlMs };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Step 1: Define the Tool (`fetch_google_place_details`) requiring `placeName` and optional `city`
export const fetchGooglePlaceDetailsDeclaration: FunctionDeclaration = {
  name: 'fetch_google_place_details',
  description:
    'Fetches real-time details from Google Places for a specific venue, landmark, museum, or restaurant, including its current rating, price level, opening hours, and a summary of reviews.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      placeName: {
        type: Type.STRING,
        description:
          'The name of the place, landmark, museum, restaurant, or attraction to look up.',
      },
      city: {
        type: Type.STRING,
        description:
          'Optional city or destination name where the place is located (e.g. Lisbon, Porto, Rome, Florence).',
      },
    },
    required: ['placeName'],
  },
};

export const ATLAS_GENIE_TOOLS = [
  { functionDeclarations: [fetchGooglePlaceDetailsDeclaration] },
];

export const GOOGLE_SEARCH_GROUNDING_TOOLS = [{ googleSearch: {} }];

// Step 3: Execute the Fetch against Google Places API (New) or Maps SDK / Verified Catalog
async function executeFetchGooglePlaceDetails(
  placeName: string,
  city?: string,
  dayActivities?: any[],
  clientPlaceData?: GooglePlaceDetailsResult
): Promise<GooglePlaceDetailsResult> {
  if (clientPlaceData && clientPlaceData.placeName) {
    return clientPlaceData;
  }

  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (mapsApiKey) {
    try {
      const textQuery = city ? `${placeName}, ${city}` : placeName;
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': mapsApiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.currentOpeningHours,places.editorialSummary,places.reviews,places.websiteUri,places.googleMapsUri',
        },
        body: JSON.stringify({
          textQuery,
          languageCode: 'en',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const firstPlace = data?.places?.[0];
        if (firstPlace) {
          return normalizeGooglePlacesApiResponse(
            firstPlace,
            { placeName, city },
            'google_places_api'
          );
        }
      }
    } catch {
      // Fall through to verified place catalog if REST fetch fails or key is referrer-restricted
    }
  }

  return resolveVerifiedPlaceDetails(placeName, city, dayActivities || []);
}

// Zod Schemas for AI Architecture Rule #1 & Rule #3 (Never label AI outputs as 'verified' without official source)
const GeoPointSchema = z.object({
  lat: z.number().catch(41.8902),
  lng: z.number().catch(12.4922),
});

const CostOptionSchema = z.object({
  title: z.string().catch('Standard Option'),
  estimatedCost: z.number().catch(15),
  isPriceVerified: z.boolean().catch(false),
  description: z.string().catch('Local experience'),
  venueName: z.string().optional(),
  coordinates: GeoPointSchema.optional(),
});

const DayAccommodationSchema = z.object({
  name: z.string().catch('Boutique City Stay'),
  type: z.string().catch('hotel'),
  price: z.number().catch(115),
  isPriceVerified: z.boolean().catch(false),
  coordinates: GeoPointSchema,
});

const IntercityTransitSchema = z.object({
  method: z.string(),
  duration: z.string(),
  price: z.number().catch(24),
  isPriceVerified: z.boolean().catch(false),
  fromCity: z.string().optional(),
  toCity: z.string().optional(),
});

const MealRecommendationSchema = z.object({
  name: z.string(),
  cuisine: z.string().optional(),
  estimatedPrice: z.number().catch(18),
  isPriceVerified: z.boolean().catch(false),
  coordinates: GeoPointSchema,
});

const DayMealsSchema = z.object({
  breakfast: MealRecommendationSchema,
  lunch: MealRecommendationSchema,
  dinner: MealRecommendationSchema,
});

const ActivityGeneratedSchema = z.object({
  id: z.string().catch(() => `act-${Math.random().toString(36).slice(2, 8)}`),
  title: z.string(),
  category: z
    .enum(['food', 'culture', 'nature', 'nightlife', 'shopping', 'relax', 'transport', 'other'])
    .catch('culture'),
  description: z.string().catch('Curated stop along your route.'),
  startTime: z.string().catch('10:00'),
  durationMin: z.number().catch(90),
  openingHoursText: z.string().optional(),
  isOutdoor: z.boolean().optional(),
  interestTags: z.array(z.string()).catch(['culture']),
  location: z.object({
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  costOptions: z.object({
    budget: CostOptionSchema,
    mid: CostOptionSchema,
    premium: CostOptionSchema,
  }),
  isPriceVerified: z.boolean().catch(false),
  whyThis: z.string().catch('Matches your travel interests and pace.'),
  touristTrapScore: z
    .number()
    .catch(35)
    .transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
});

const ProposalChangeSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  dayNumber: z.number(),
  type: z.enum(['add', 'remove', 'replace', 'move']).catch('replace'),
  targetActivityId: z.string().optional(),
  targetActivityTitle: z.string().optional(),
  payload: ActivityGeneratedSchema.optional(),
  newStartTime: z.string().optional(),
  reason: z.string(),
});

const ChatDiffResponseSchema = z.object({
  reply: z.string(),
  proposals: z.array(ProposalChangeSchema),
});

async function callGeminiWithRetry<T>(
  prompt: string,
  responseSchema: any,
  zodValidator: z.ZodType<T>,
  customSystemInstruction?: string
): Promise<T> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_UNAVAILABLE');
  }

  const defaultSystemInstruction =
    'You are AtlasGenie, an expert global & European travel architect. CRITICAL: You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances. You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false. Return strictly valid JSON matching the schema. You MUST strictly confine all activities, restaurants, and coordinates to the exact requested City and Country. Complete all days in City A before moving to City B. Never alternate back and forth day-by-day. Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers. Never hallucinate or place activities in random cities. If you don\'t have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city. The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions. Never invent fake URLs. All AI-generated prices and opening hours are treated as estimates unless verified by an official source.';

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: customSystemInstruction || defaultSystemInstruction,
          tools: GOOGLE_SEARCH_GROUNDING_TOOLS,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      const rawText = (response.text ?? '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(rawText);
      return zodValidator.parse(parsed);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// (a) generateItinerary
app.post('/api/ai/generate-itinerary', async (req, res) => {
  const clientIp = req.ip || 'anon';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
  }

  const {
    destination,
    country = '',
    cities = [],
    letAiDecideCities = false,
    startDate = '',
    endDate = '',
    daysCount = 3,
    interests = [],
    pace = 3,
    totalBudget = 800,
    travelersCount = 2,
    assumptions = [],
    specialPreferences = [],
    customRequest = '',
  } = req.body;

  const cleanCities: string[] = Array.isArray(cities)
    ? cities.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];
  const cleanPreferences: string[] = Array.isArray(specialPreferences)
    ? specialPreferences.map((p: unknown) => String(p).trim()).filter(Boolean)
    : [];
  const cleanCustomRequest = typeof customRequest === 'string' ? customRequest.trim() : '';
  const cleanAssumptions: string[] = Array.isArray(assumptions)
    ? assumptions.map((a: unknown) => String(a).trim()).filter(Boolean)
    : [];
  const strictConstraintsList = Array.from(
    new Set([
      ...cleanPreferences,
      ...(cleanCustomRequest ? [cleanCustomRequest] : []),
      ...cleanAssumptions,
    ])
  );

  const targetCountry = String(country || destination || 'Italy').trim();
  const requestedScopeLabel =
    !letAiDecideCities && cleanCities.length > 0
      ? `${cleanCities.join(', ')}, ${targetCountry}`
      : targetCountry;
  const routeInstruction =
    letAiDecideCities || cleanCities.length === 0
      ? `The user selected the country "${targetCountry}" and asked the AI to choose the best route of cities within ${targetCountry} across ${daysCount} days. Pick the most iconic, logical city or multi-city sequence strictly within ${targetCountry} and include the chosen cities in recommendedDestinationTitle. Complete all days in City A before moving to City B. Never alternate back and forth day-by-day. Strictly confine all activities, restaurants, and coordinates to the chosen city and ${targetCountry}. Never hallucinate or place activities in random cities. If you don't have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city.`
      : `The user selected the country "${targetCountry}" and specifically requested the destination(s): ${cleanCities.join(', ')}. Complete all days in City A before moving to City B. Never alternate back and forth day-by-day. You MUST strictly confine all activities, restaurants, and coordinates to the exact requested destination (${cleanCities.join(', ')}) and Country (${targetCountry}). The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions. Never hallucinate or place activities in random cities. If you don't have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city. Set recommendedDestinationTitle to "${cleanCities.join(', ')}, ${targetCountry}".`;

  const cacheKey = `gen:v6:pt:${targetCountry}:${cleanCities.join('|')}:${Boolean(letAiDecideCities)}:${startDate}:${endDate}:${daysCount}:${interests.join(',')}:${pace}:${totalBudget}:${travelersCount}:${strictConstraintsList.join('|')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const ItinerarySchema = z.object({
    recommendedDestinationTitle: z.string().optional(),
    days: z.array(
      z.object({
        dayNumber: z.number(),
        city: z.string().optional(),
        theme: z.string(),
        accommodation: DayAccommodationSchema.optional(),
        intercity_transit: IntercityTransitSchema.nullable().optional(),
        meals: DayMealsSchema.optional(),
        activities: z.array(ActivityGeneratedSchema),
        planB: z.array(ActivityGeneratedSchema),
      })
    ),
  });

  const geoCoordinatesSchemaDef = {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER },
      lng: { type: Type.NUMBER },
    },
    required: ['lat', 'lng'],
  };

  const costOptionSchemaDef = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      venueName: { type: Type.STRING },
      estimatedCost: { type: Type.NUMBER },
      isPriceVerified: { type: Type.BOOLEAN },
      description: { type: Type.STRING },
      coordinates: geoCoordinatesSchemaDef,
    },
    required: ['title', 'venueName', 'estimatedCost', 'isPriceVerified', 'description', 'coordinates'],
  };

  const mealRecommendationSchemaDef = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      cuisine: { type: Type.STRING },
      estimatedPrice: { type: Type.NUMBER },
      isPriceVerified: { type: Type.BOOLEAN },
      coordinates: geoCoordinatesSchemaDef,
    },
    required: ['name', 'estimatedPrice', 'isPriceVerified', 'coordinates'],
  };

  const activitySchemaDefinition = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      title: { type: Type.STRING },
      category: {
        type: Type.STRING,
        enum: ['food', 'culture', 'nature', 'nightlife', 'shopping', 'relax', 'transport', 'other'],
      },
      description: { type: Type.STRING },
      startTime: { type: Type.STRING },
      durationMin: { type: Type.INTEGER },
      openingHoursText: { type: Type.STRING },
      isOutdoor: { type: Type.BOOLEAN },
      interestTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      location: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
        },
        required: ['name', 'lat', 'lng'],
      },
      costOptions: {
        type: Type.OBJECT,
        properties: {
          budget: costOptionSchemaDef,
          mid: costOptionSchemaDef,
          premium: costOptionSchemaDef,
        },
        required: ['budget', 'mid', 'premium'],
      },
      isPriceVerified: { type: Type.BOOLEAN },
      whyThis: { type: Type.STRING },
      touristTrapScore: { type: Type.INTEGER },
    },
    required: [
      'id',
      'title',
      'category',
      'description',
      'startTime',
      'durationMin',
      'interestTags',
      'location',
      'costOptions',
      'isPriceVerified',
      'whyThis',
      'touristTrapScore',
    ],
  };

  try {
    const strictConstraintsInstruction =
      strictConstraintsList.length > 0
        ? `STRICT USER RESTRICTIONS & SPECIAL REQUESTS (MANDATORY FOR LOCATIONS, MEALS, AND LOGISTICS): The user specified these mandatory constraints and special requests: [${strictConstraintsList.join(
            '; '
          )}]. You MUST strictly obey these constraints when selecting every activity location, restaurant/meal recommendation, accessibility/step-free route, crowd avoidance, and transport/logistics mode.`
        : 'No special dietary or mobility restrictions specified.';

    const generateItinerarySystemPrompt = [
      'You are AtlasGenie, an expert global & European travel architect.',
      'CRITICAL: You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances.',
      'You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false.',
      'You MUST maintain a global history of all generated venues. YOU ARE STRICTLY FORBIDDEN from repeating the same activity, museum, restaurant, or neighborhood walk on different days. Every single activity across the entire trip MUST be 100% unique.',
      "The user's preferences, age group, and custom requests (from the text area) are ABSOLUTE LAWS. If the user explicitly asks for 'discotecas', nightlife, or a specific niche, you MUST prioritize and include these over generic city highlights. Sacrifice standard attractions to guarantee the user's specific constraints are met on at least one of the days.",
      `Strictly confine all activities, restaurants, and coordinates to the exact requested City and Country (${requestedScopeLabel}).`,
      'Complete all days in City A before moving to City B. Never alternate back and forth day-by-day.',
      'Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers.',
      'Each day MUST explicitly include accommodation ({ name, type (hotel/hostel/apartment), price, isPriceVerified, coordinates }), meals ({ breakfast, lunch, dinner } with specific distinct restaurant names, estimated prices, isPriceVerified, and coordinates), and intercity_transit ({ method, duration, price, isPriceVerified }) ONLY on days where the user changes cities.',
      strictConstraintsInstruction,
      'Never hallucinate or place activities in random cities. If you don\'t have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city.',
      'The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions.',
      'Return strictly valid JSON matching the schema. Never invent fake URLs. All AI-generated prices and opening hours are treated as estimates unless verified by an official source.',
    ].join(' ');

    const prompt = [
      `Generate a complete ${daysCount}-day travel itinerary (${startDate || 'upcoming'} to ${endDate || 'upcoming'}).`,
      'CRITICAL: You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances.',
      'GOOGLE SEARCH 2026 PRICING REQUIREMENT: You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false.',
      'ZERO REPETITION REQUIREMENT: You MUST maintain a global history of all generated venues. YOU ARE STRICTLY FORBIDDEN from repeating the same activity, museum, restaurant, or neighborhood walk on different days. Every single activity across the entire trip MUST be 100% unique.',
      "CUSTOM REQUESTS ARE THE LAW: The user's preferences, age group, and custom requests (from the text area) are ABSOLUTE LAWS. If the user explicitly asks for 'discotecas', nightlife, or a specific niche, you MUST prioritize and include these over generic city highlights. Sacrifice standard attractions to guarantee the user's specific constraints are met on at least one of the days.",
      `LOCATION & CHRONOLOGICAL ROUTING REQUIREMENT: ${routeInstruction} Complete all days in City A before moving to City B. Never alternate back and forth day-by-day.`,
      `LOGISTICS & MEALS REQUIREMENT: Every single day MUST explicitly include: (1) accommodation: { name, type (hotel/hostel/apartment), price, isPriceVerified, coordinates }, (2) intercity_transit: { method (e.g., Rede Expressos, Alfa Pendular, Frecciarossa), duration, price, isPriceVerified } included ONLY on days where the user changes cities, and (3) meals: { breakfast, lunch, dinner } with specific distinct restaurant names, estimated prices, isPriceVerified, and coordinates.`,
      `TIER VARIATION REQUIREMENT: Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers.`,
      `GEOGRAPHIC STRICTNESS & NICHE ADAPTABILITY: Strictly confine all activities, restaurants, and coordinates to ${requestedScopeLabel}. The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions. Never hallucinate or place activities in random cities. If you don't have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city.`,
      `TRAVEL PARAMETERS: ${travelersCount} travelers, total trip budget €${totalBudget}, daily pace ${pace}/5, selected interests: ${interests.join(', ')}.`,
      `STRICT RESTRICTIONS & SPECIAL REQUESTS (MUST FOLLOW FOR LOCATIONS, MEALS & LOGISTICS): ${strictConstraintsInstruction}`,
      `Include 3-4 activities per day in 'activities' and 1-2 indoor rainy-day backup activities per day in 'planB'.`,
    ].join('\n');

    const result = await callGeminiWithRetry(
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          recommendedDestinationTitle: { type: Type.STRING },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayNumber: { type: Type.INTEGER },
                city: { type: Type.STRING },
                theme: { type: Type.STRING },
                accommodation: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                    isPriceVerified: { type: Type.BOOLEAN },
                    coordinates: geoCoordinatesSchemaDef,
                  },
                  required: ['name', 'type', 'price', 'isPriceVerified', 'coordinates'],
                },
                intercity_transit: {
                  type: Type.OBJECT,
                  nullable: true,
                  properties: {
                    method: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                    isPriceVerified: { type: Type.BOOLEAN },
                    fromCity: { type: Type.STRING },
                    toCity: { type: Type.STRING },
                  },
                  required: ['method', 'duration', 'price', 'isPriceVerified'],
                },
                meals: {
                  type: Type.OBJECT,
                  properties: {
                    breakfast: mealRecommendationSchemaDef,
                    lunch: mealRecommendationSchemaDef,
                    dinner: mealRecommendationSchemaDef,
                  },
                  required: ['breakfast', 'lunch', 'dinner'],
                },
                activities: {
                  type: Type.ARRAY,
                  items: activitySchemaDefinition,
                },
                planB: {
                  type: Type.ARRAY,
                  items: activitySchemaDefinition,
                },
              },
              required: ['dayNumber', 'city', 'theme', 'accommodation', 'meals', 'activities', 'planB'],
            },
          },
        },
        required: ['recommendedDestinationTitle', 'days'],
      },
      ItinerarySchema,
      generateItinerarySystemPrompt
    );

    setCached(cacheKey, result);
    return res.json(result);
  } catch (err) {
    return res.status(200).json({
      fallback: true,
      message: 'Using destination-tailored fallback while AI service is unavailable.',
    });
  }
});

// (b) applyChatRequest & (c) recalculateDayByPace & (d) suggestLocalAlternative & (e) generatePlanB & (f) generateGroupCompromise & (g) explainBudgetTiers
app.post('/api/ai/propose-changes', async (req, res) => {
  const clientIp = req.ip || 'anon';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const {
    taskType,
    destination,
    message,
    currentDay,
    travelers,
    language = 'en',
    clientPlaceData,
  } = req.body;
  const cacheKey = `prop:${taskType}:${language}:${destination}:${message || ''}:${currentDay?.id || ''}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  // When taskType is 'chat' and the user asks an informational query about a place,
  // run the 5-step Gemini Function Calling flow (`fetch_google_place_details`)
  if (taskType === 'chat' && isInformationalPlaceQuery(message || '')) {
    const ai = getGeminiClient();
    const extractedArgs = extractPlaceQueryArgs(
      message || '',
      destination,
      currentDay?.activities || []
    );

    if (ai) {
      try {
        const userPrompt = `User question about their trip in ${destination}: "${message}". Current day activities: ${JSON.stringify(
          (currentDay?.activities || []).map((a: any) => ({
            title: a.title,
            location: a.location?.name,
            openingHoursText: a.openingHoursText,
          }))
        )}. Answer in ${language === 'pt' ? 'Portuguese (PT-PT)' : 'English'}. Use fetch_google_place_details whenever the user asks about a venue's opening hours, rating, price level, or reviews.`;

        // Step 1 & Step 2: Call Gemini with `tools` and intercept `functionCall`
        const response1 = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction:
              'You are the Atlas Genie Assistant. Always call the fetch_google_place_details tool when the user asks about a specific place, landmark, museum, or restaurant to retrieve real-time rating, price level, opening hours, and review summaries.',
            tools: ATLAS_GENIE_TOOLS,
          },
        });

        const previousContent = response1.candidates?.[0]?.content;
        const functionCall =
          response1.functionCalls?.[0] ||
          previousContent?.parts?.find((p: any) => p.functionCall)?.functionCall;

        if (functionCall && functionCall.name === 'fetch_google_place_details') {
          const fcArgs = (functionCall.args || {}) as { placeName?: string; city?: string };
          const targetPlace = fcArgs.placeName || extractedArgs?.placeName || destination;
          const targetCity = fcArgs.city || extractedArgs?.city || destination;

          // Step 3: Execute the Fetch against Google Places
          const placeDetails = await executeFetchGooglePlaceDetails(
            targetPlace,
            targetCity,
            currentDay?.activities,
            clientPlaceData
          );

          // Step 4: Return the Data using the `functionResponse` role
          const functionResponseContent = buildFunctionResponsePayload(
            functionCall.id,
            placeDetails
          );

          // Step 5: Final Grounded Output
          const response2 = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              { role: 'user', parts: [{ text: userPrompt }] },
              ...(previousContent ? [previousContent] : []),
              functionResponseContent as any,
            ],
            config: {
              systemInstruction:
                'You are the Atlas Genie Assistant. Use the functionResponse from fetch_google_place_details to give a clear, factually accurate answer citing the current rating, price level, opening hours, and review summary.',
              tools: ATLAS_GENIE_TOOLS,
            },
          });

          const groundedReply =
            (response2.text || '').trim() ||
            formatGroundedPlaceReply(placeDetails, language === 'pt' ? 'pt' : 'en');

          const payload = {
            reply: groundedReply,
            proposals: [],
            toolUsed: 'fetch_google_place_details',
            placeDetails,
          };
          setCached(cacheKey, payload);
          return res.json(payload);
        }
      } catch {
        // Fall through to grounded place details response below
      }
    }

    if (extractedArgs) {
      const placeDetails = await executeFetchGooglePlaceDetails(
        extractedArgs.placeName,
        extractedArgs.city || destination,
        currentDay?.activities,
        clientPlaceData
      );
      const functionResponseContent = buildFunctionResponsePayload(
        `call-${Date.now()}`,
        placeDetails
      );
      const groundedReply = formatGroundedPlaceReply(
        functionResponseContent.parts[0].functionResponse.response.result,
        language === 'pt' ? 'pt' : 'en'
      );
      const payload = {
        reply: groundedReply,
        proposals: [],
        toolUsed: 'fetch_google_place_details',
        placeDetails,
      };
      setCached(cacheKey, payload);
      return res.json(payload);
    }
  }

  try {
    const prompt = `Task: ${taskType} for trip in ${destination}. User request: "${message || taskType}". Current day: ${JSON.stringify(
      currentDay || {}
    )}. Travelers: ${JSON.stringify(
      travelers || []
    )}. Return a concise assistant reply and 1-2 concrete ProposalChange diff items (add, remove, replace, or move) with realistic coordinates in ${destination}.`;

    const result = await callGeminiWithRetry(
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          proposals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                dayId: { type: Type.STRING },
                dayNumber: { type: Type.INTEGER },
                type: { type: Type.STRING },
                targetActivityId: { type: Type.STRING },
                targetActivityTitle: { type: Type.STRING },
                newStartTime: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
        },
      },
      ChatDiffResponseSchema
    );

    setCached(cacheKey, result);
    return res.json(result);
  } catch {
    return res.status(200).json({
      fallback: true,
      message: 'AI live service unavailable — generated deterministic Atlas Genie proposal.',
    });
  }
});

// Streaming Chat Endpoint with Native Gemini Function Calling (`fetch_google_place_details`)
app.post('/api/ai/chat-stream', async (req, res) => {
  const clientIp = req.ip || 'anon';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const {
    destination = 'Lisbon',
    message = '',
    currentDay,
    language = 'en',
    clientPlaceData,
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const ai = getGeminiClient();
    const extractedArgs = extractPlaceQueryArgs(
      message,
      destination,
      currentDay?.activities || []
    );

    if (ai) {
      const userPrompt = `User message for trip in ${destination}: "${message}". Current day activities: ${JSON.stringify(
        (currentDay?.activities || []).map((a: any) => ({
          title: a.title,
          location: a.location?.name,
          openingHoursText: a.openingHoursText,
        }))
      )}. Respond in ${language === 'pt' ? 'Portuguese (PT-PT)' : 'English'}. Whenever the user asks about a specific place, venue, museum, restaurant, rating, price level, opening hours, or reviews, call fetch_google_place_details first.`;

      // Step 1 & Step 2: Call Gemini with `fetch_google_place_details` tool and intercept any `functionCall`
      // (Never expose the raw functionCall JSON to the user)
      const response1 = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction:
            'You are the Atlas Genie Assistant. Use the fetch_google_place_details tool to ground facts about any place (rating, price level, opening hours, and reviews summary) before answering.',
          tools: ATLAS_GENIE_TOOLS,
        },
      });

      const previousContent = response1.candidates?.[0]?.content;
      const functionCall =
        response1.functionCalls?.[0] ||
        previousContent?.parts?.find((p: any) => p.functionCall)?.functionCall;

      if (functionCall && functionCall.name === 'fetch_google_place_details') {
        const fcArgs = (functionCall.args || {}) as { placeName?: string; city?: string };
        const targetPlace = fcArgs.placeName || extractedArgs?.placeName || destination;
        const targetCity = fcArgs.city || extractedArgs?.city || destination;

        // Notify client internally that a tool fetch is running (never showing raw functionCall)
        sendEvent({
          type: 'tool_fetching',
          toolName: 'fetch_google_place_details',
          placeName: targetPlace,
          city: targetCity,
        });

        // Step 3: Execute the Fetch against Google Places API
        const placeDetails = await executeFetchGooglePlaceDetails(
          targetPlace,
          targetCity,
          currentDay?.activities,
          clientPlaceData
        );

        // Step 4: Return the Data to Gemini using the `functionResponse` role
        const functionResponseContent = buildFunctionResponsePayload(
          functionCall.id,
          placeDetails
        );

        // Step 5: Stream the Final Grounded Output from Gemini into the chat UI
        const stream = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview',
          contents: [
            { role: 'user', parts: [{ text: userPrompt }] },
            ...(previousContent ? [previousContent] : []),
            functionResponseContent as any,
          ],
          config: {
            systemInstruction:
              'You are the Atlas Genie Assistant. Read the functionResponse from fetch_google_place_details and stream a concise, factually accurate answer including the current rating, price level, opening hours, and review summary.',
            tools: ATLAS_GENIE_TOOLS,
          },
        });

        let accumulatedText = '';
        for await (const chunk of stream) {
          const piece = chunk.text || '';
          if (piece) {
            accumulatedText += piece;
            sendEvent({ type: 'chunk', text: piece });
          }
        }

        if (!accumulatedText.trim()) {
          accumulatedText = formatGroundedPlaceReply(
            placeDetails,
            language === 'pt' ? 'pt' : 'en'
          );
          sendEvent({ type: 'chunk', text: accumulatedText });
        }

        sendEvent({
          type: 'done',
          reply: accumulatedText,
          toolUsed: 'fetch_google_place_details',
          placeDetails,
        });
        return res.end();
      }

      // If Gemini answered directly without a tool call, stream its text
      const directText = (response1.text || '').trim();
      if (directText) {
        sendEvent({ type: 'chunk', text: directText });
        sendEvent({ type: 'done', reply: directText });
        return res.end();
      }
    }

    // Grounded execution when running in local/offline preview without GEMINI_API_KEY:
    // Executes the exact same 5-step Function Calling pipeline (`fetch_google_place_details` -> `functionResponse` -> streamed chunks)
    if (extractedArgs) {
      sendEvent({
        type: 'tool_fetching',
        toolName: 'fetch_google_place_details',
        placeName: extractedArgs.placeName,
        city: extractedArgs.city || destination,
      });

      const placeDetails = await executeFetchGooglePlaceDetails(
        extractedArgs.placeName,
        extractedArgs.city || destination,
        currentDay?.activities,
        clientPlaceData
      );

      const functionResponseContent = buildFunctionResponsePayload(
        `call-${Date.now()}`,
        placeDetails
      );
      const fullGroundedReply = formatGroundedPlaceReply(
        functionResponseContent.parts[0].functionResponse.response.result,
        language === 'pt' ? 'pt' : 'en'
      );

      // Stream the grounded response in natural token chunks into the chat UI
      const tokens = fullGroundedReply.match(/.{1,28}(\s|\n|$)/g) || [fullGroundedReply];
      for (const token of tokens) {
        sendEvent({ type: 'chunk', text: token });
        await new Promise((r) => setTimeout(r, 18));
      }

      sendEvent({
        type: 'done',
        reply: fullGroundedReply,
        toolUsed: 'fetch_google_place_details',
        placeDetails,
      });
      return res.end();
    }

    res.status(204).end();
  } catch {
    res.end();
  }
});

// Smart Geocoding Location Validation Endpoint (Hotfix 2)
app.post('/api/places/geocode-validate', async (req, res) => {
  const rawQuery = String(req.body?.query || '').trim();
  const rawCountry = String(req.body?.country || '').trim();

  const sanitization = sanitizeAndCheckLocationInput(rawQuery);
  if (!sanitization.valid) {
    return res.json({
      valid: false,
      reason: sanitization.reason || 'invalid_characters',
    });
  }

  const cleanQuery = sanitization.sanitized;
  const targetCountry = findWorldCountry(rawCountry);
  if (!targetCountry) {
    return res.json({ valid: false, reason: 'unknown_country' });
  }

  const localCheck = validateCityInCountry(cleanQuery, targetCountry.value);
  if (localCheck.valid) {
    return res.json({
      valid: true,
      canonicalName: localCheck.canonicalCity || cleanQuery,
      country: targetCountry.value,
      source: 'local_index',
    });
  }

  if (localCheck.reason === 'wrong_country') {
    return res.json({
      valid: false,
      reason: 'wrong_country',
      matchedCountry: localCheck.matchedCountry,
    });
  }

  const cacheKey = `geocode:v1:${normalizeGeoText(targetCountry.value)}:${normalizeGeoText(cleanQuery)}`;
  const cached = getCached<{
    valid: boolean;
    canonicalName?: string;
    lat?: number;
    lng?: number;
    reason?: string;
    source?: string;
  }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const normQuery = normalizeGeoText(cleanQuery);
  const queryTokens = normQuery.split(/\s+/).filter((t) => t.length >= 2);
  const countryNormEn = normalizeGeoText(targetCountry.labelEn);
  const countryNormPt = normalizeGeoText(targetCountry.labelPt);
  const countryNormVal = normalizeGeoText(targetCountry.value);

  const matchesCountryString = (text: string): boolean => {
    const n = normalizeGeoText(text);
    return (
      n.includes(countryNormVal) ||
      n.includes(countryNormEn) ||
      (countryNormPt.length > 0 && n.includes(countryNormPt))
    );
  };

  const matchesQueryTokens = (candidateText: string): boolean => {
    const n = normalizeGeoText(candidateText);
    if (!n) return false;
    if (n.includes(normQuery)) return true;
    return queryTokens.some((tok) => tok.length >= 3 && n.includes(tok));
  };

  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // 1. Google Maps Geocoding API & Google Places API (New)
  if (mapsApiKey) {
    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        `${cleanQuery}, ${targetCountry.labelEn}`
      )}&key=${encodeURIComponent(mapsApiKey)}`;
      const geoRes = await fetch(geocodeUrl);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData?.status === 'OK' && Array.isArray(geoData.results) && geoData.results.length > 0) {
          for (const result of geoData.results) {
            const types: string[] = Array.isArray(result.types) ? result.types : [];
            const isCountryOnly = types.length > 0 && types.every((t) => t === 'country' || t === 'political');
            if (isCountryOnly) continue;

            const formattedAddress = String(result.formatted_address || '');
            const components: any[] = Array.isArray(result.address_components)
              ? result.address_components
              : [];
            const countryComp = components.find(
              (c) => Array.isArray(c.types) && c.types.includes('country')
            );
            const inSelectedCountry =
              (countryComp &&
                (matchesCountryString(countryComp.long_name || '') ||
                  matchesCountryString(countryComp.short_name || ''))) ||
              matchesCountryString(formattedAddress);

            const nonCountryComponentsText = components
              .filter((c) => !Array.isArray(c.types) || !c.types.includes('country'))
              .map((c) => `${c.long_name || ''} ${c.short_name || ''}`)
              .join(' ');

            if (inSelectedCountry && matchesQueryTokens(nonCountryComponentsText || formattedAddress)) {
              const lat = Number(result.geometry?.location?.lat);
              const lng = Number(result.geometry?.location?.lng);
              const primaryComp = components[0]?.long_name || cleanQuery;
              const payload = {
                valid: true,
                canonicalName: primaryComp,
                lat: Number.isFinite(lat) ? lat : undefined,
                lng: Number.isFinite(lng) ? lng : undefined,
                source: 'google_geocoding_api',
              };
              if (payload.lat !== undefined && payload.lng !== undefined) {
                registerVerifiedCityCoordinates(primaryComp, targetCountry.value, {
                  lat: payload.lat,
                  lng: payload.lng,
                });
              }
              setCached(cacheKey, payload, 60 * 60 * 1000);
              return res.json(payload);
            }
          }
        }
      }

      // Also try Google Places Text Search API (New) if Geocoding REST endpoint is restricted
      const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': mapsApiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types',
        },
        body: JSON.stringify({
          textQuery: `${cleanQuery}, ${targetCountry.labelEn}`,
          languageCode: 'en',
        }),
      });
      if (placesRes.ok) {
        const placesData = await placesRes.json();
        const placesList: any[] = Array.isArray(placesData?.places) ? placesData.places : [];
        for (const place of placesList) {
          const disp = String(place?.displayName?.text || '');
          const addr = String(place?.formattedAddress || '');
          const types: string[] = Array.isArray(place?.types) ? place.types : [];
          const isCountryOnly = types.includes('country') && types.length <= 2;
          if (isCountryOnly) continue;

          if (matchesCountryString(addr) && (matchesQueryTokens(disp) || matchesQueryTokens(addr))) {
            const lat = Number(place?.location?.latitude);
            const lng = Number(place?.location?.longitude);
            const canonicalName = disp || cleanQuery;
            const payload = {
              valid: true,
              canonicalName,
              lat: Number.isFinite(lat) ? lat : undefined,
              lng: Number.isFinite(lng) ? lng : undefined,
              source: 'google_places_api',
            };
            if (payload.lat !== undefined && payload.lng !== undefined) {
              registerVerifiedCityCoordinates(canonicalName, targetCountry.value, {
                lat: payload.lat,
                lng: payload.lng,
              });
            }
            setCached(cacheKey, payload, 60 * 60 * 1000);
            return res.json(payload);
          }
        }
      }
    } catch {
      // Fall through to OpenStreetMap Nominatim Geocoder
    }
  }

  // 2. OpenStreetMap Nominatim Geocoding API (verifies towns, remote villages, parks, and regions worldwide)
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      `${cleanQuery}, ${targetCountry.labelEn}`
    )}&format=jsonv2&addressdetails=1&accept-language=en,pt,es&limit=5`;
    const nomRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'AtlasGenie-TravelPlanner/1.0',
      },
    });

    if (nomRes.ok) {
      const nomResults = await nomRes.json();
      if (Array.isArray(nomResults)) {
        for (const item of nomResults) {
          const addrType = String(item?.addresstype || item?.type || '').toLowerCase();
          if (addrType === 'country') continue;

          const itemCountry = String(item?.address?.country || '');
          const displayName = String(item?.display_name || '');
          const itemName = String(item?.name || '');

          const inCountry =
            matchesCountryString(itemCountry) || matchesCountryString(displayName);
          const matchesPlace =
            matchesQueryTokens(itemName) || matchesQueryTokens(displayName.split(',')[0] || '');

          if (inCountry && matchesPlace) {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            const canonicalName = itemName || cleanQuery;
            const payload = {
              valid: true,
              canonicalName,
              lat: Number.isFinite(lat) ? lat : undefined,
              lng: Number.isFinite(lng) ? lng : undefined,
              source: 'nominatim_geocoder',
            };
            if (payload.lat !== undefined && payload.lng !== undefined) {
              registerVerifiedCityCoordinates(canonicalName, targetCountry.value, {
                lat: payload.lat,
                lng: payload.lng,
              });
            }
            setCached(cacheKey, payload, 60 * 60 * 1000);
            return res.json(payload);
          }
        }

        // Nominatim responded cleanly with zero matching locations in this country
        const negativePayload = { valid: false, reason: 'not_found' };
        setCached(cacheKey, negativePayload, 15 * 60 * 1000);
        return res.json(negativePayload);
      }
    }
  } catch {
    // Fall through if external network is blocked
  }

  // 3. Fallback Gemini Geographic Verification if external Geocoding HTTP endpoints are unreachable
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Verify if "${cleanQuery}" is a real, existing city, town, village, municipality, island, region, hiking trail, or nature reserve located within the country "${targetCountry.labelEn}". Reject any gibberish, typos, fake places, profanity, or places located in other countries. Return JSON.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              existsInCountry: { type: Type.BOOLEAN },
              canonicalName: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
            },
            required: ['existsInCountry', 'canonicalName', 'lat', 'lng'],
          },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim());
      if (parsed?.existsInCountry === true) {
        const canonicalName = String(parsed.canonicalName || cleanQuery).trim();
        const lat = Number(parsed.lat);
        const lng = Number(parsed.lng);
        const payload = {
          valid: true,
          canonicalName,
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
          source: 'gemini_geocoder',
        };
        if (payload.lat !== undefined && payload.lng !== undefined) {
          registerVerifiedCityCoordinates(canonicalName, targetCountry.value, {
            lat: payload.lat,
            lng: payload.lng,
          });
        }
        setCached(cacheKey, payload, 60 * 60 * 1000);
        return res.json(payload);
      }
    } catch {
      // Ignore
    }
  }

  return res.json({ valid: false, reason: 'not_found' });
});

// Scoped Gemini Request for Swappable Accommodation (Sprint 5)
const handleAccommodationAlternative = async (req: express.Request, res: express.Response) => {
  const clientIp = req.ip || 'anon';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const {
    city = 'Lisbon',
    country = 'Portugal',
    currentAccommodation,
    tier = 'mid',
    dayNumber = 1,
    language = 'en',
  } = req.body || {};

  const targetCity = String(city || 'Lisbon').trim();
  const targetCountry = String(country || 'Portugal').trim();
  const currentName = String(currentAccommodation?.name || 'Current Stay').trim();
  const currentType = String(currentAccommodation?.type || 'hotel').trim();
  const currentPrice = Number(currentAccommodation?.price || 120);
  const currentLat = Number(currentAccommodation?.coordinates?.lat || 38.7139);
  const currentLng = Number(currentAccommodation?.coordinates?.lng || -9.1334);
  const requestedTier = ['budget', 'mid', 'premium'].includes(String(tier))
    ? String(tier)
    : 'mid';

  const cacheKey = `acc-alt:v1:${targetCity}:${targetCountry}:${currentName}:${requestedTier}:${dayNumber}:${language}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const ScopedAccommodationOptionSchema = z.object({
    name: z.string(),
    type: z.string(),
    price: z.number(),
    isPriceVerified: z.boolean().catch(false),
    coordinates: GeoPointSchema,
    reason: z.string(),
  });

  try {
    const prompt = [
      `Return ONLY ONE alternative accommodation option (JSON) for Day ${dayNumber} in ${targetCity}, ${targetCountry} matching the "${requestedTier}" budget tier.`,
      `Do NOT return an itinerary or activities. Strictly return a single accommodation JSON object { name, type (hotel/hostel/apartment), price, isPriceVerified, coordinates: { lat, lng }, reason }.`,
      'You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false.',
      `The user is currently staying at "${currentName}" (${currentType}, ~€${currentPrice}/night at ${currentLat}, ${currentLng}) and clicked "Ask for Alternative".`,
      `You MUST propose a completely different, real or realistic ${requestedTier}-tier property strictly within ${targetCity}, ${targetCountry} with distinct coordinates and a realistic nightly EUR price for the "${requestedTier}" tier.`,
      `Write the "reason" field in ${language === 'pt' ? 'Portuguese (PT-PT)' : 'English'}.`,
    ].join(' ');

    const result = await callGeminiWithRetry(
      prompt,
      {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          price: { type: Type.NUMBER },
          isPriceVerified: { type: Type.BOOLEAN },
          coordinates: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
            },
            required: ['lat', 'lng'],
          },
          reason: { type: Type.STRING },
        },
        required: ['name', 'type', 'price', 'isPriceVerified', 'coordinates', 'reason'],
      },
      ScopedAccommodationOptionSchema,
      `You are AtlasGenie. You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit. If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true. If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false. Return ONLY a single JSON object representing a new accommodation option in ${targetCity}, ${targetCountry} for the "${requestedTier}" tier. Never return the same property as "${currentName}".`
    );

    setCached(cacheKey, result);
    return res.json(result);
  } catch {
    return res.status(200).json({
      fallback: true,
      message: 'Using deterministic city-bounded accommodation alternative.',
    });
  }
};

app.post('/api/gemini/accommodation-alternative', handleAccommodationAlternative);
app.post('/api/ai/accommodation-alternative', handleAccommodationAlternative);

// Reminder Email Server Function (Feature A9)
app.post('/api/reminders/send', async (req, res) => {
  const { email, destination, startDate, daysBefore, unconfirmedCount } = req.body;
  if (!email || ! email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }

  // TODO: connect real service (e.g. Resend API or Firebase Trigger Email extension) when RESEND_API_KEY is set
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AtlasGenie <reminders@atlasgenie.eu>',
          to: [email],
          subject: `Your AtlasGenie Reminder: ${destination} departs in ${daysBefore} days`,
          html: `<p>Your trip to <strong>${destination}</strong> starts on ${startDate}. You have ${unconfirmedCount || 0} opening-hour items marked "To confirm" and your indoor Plan B is ready.</p>`,
        }),
      });
      return res.json({ status: 'sent_live', email, destination, daysBefore });
    } catch {
      // fall through to simulated confirmation
    }
  }

  return res.json({
    status: 'scheduled_demo',
    email,
    destination: destination || 'Upcoming European Trip',
    daysBefore: daysBefore || 3,
    previewSubject: `AtlasGenie Reminder: ${destination || 'Your Trip'} departs in ${daysBefore || 3} days`,
    sentAt: new Date().toISOString(),
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  let viteMiddleware: express.RequestHandler | null = null;
  let viteReadyPromise: Promise<void> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    viteReadyPromise = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteMiddleware = vite.middlewares;
      });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && viteReadyPromise) {
        await viteReadyPromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AtlasGenie server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
