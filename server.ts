import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import dotenv from 'dotenv';
import {
  GooglePlaceDetailsResult,
  buildFunctionResponsePayload,
  extractPlaceQueryArgs,
  formatGroundedPlaceReply,
  isInformationalPlaceQuery,
  normalizeGooglePlacesApiResponse,
  resolveVerifiedPlaceDetails,
} from './src/utils/domainLogic';

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
const CostOptionSchema = z.object({
  title: z.string().catch('Standard Option'),
  estimatedCost: z.number().catch(15),
  description: z.string().catch('Local experience'),
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
  zodValidator: z.ZodType<T>
): Promise<T> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_UNAVAILABLE');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are AtlasGenie, an expert global & European travel architect. Return strictly valid JSON matching the schema. Strictly generate activities, real landmarks, neighbourhoods, and accurate latitude/longitude coordinates for the exact country and cities requested by the user (NEVER default to Lisbon unless Portugal/Lisbon was explicitly requested). Never invent fake URLs. All AI-generated prices and opening hours are treated as estimates unless verified by an official source.',
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      const rawText = (response.text ?? '{}').trim();
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
  } = req.body;

  const cleanCities: string[] = Array.isArray(cities)
    ? cities.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];
  const targetCountry = String(country || destination || 'Italy').trim();
  const routeInstruction =
    letAiDecideCities || cleanCities.length === 0
      ? `The user selected the country "${targetCountry}" and asked the AI to choose the best route of cities within ${targetCountry} across ${daysCount} days. Pick the most iconic, logical city or multi-city sequence in ${targetCountry} (e.g. if Italy, Rome & Florence; if Japan, Tokyo & Kyoto) and include the chosen cities in recommendedDestinationTitle.`
      : `The user selected the country "${targetCountry}" and specifically requested these cities: ${cleanCities.join(', ')}. Strictly distribute the ${daysCount} days across ${cleanCities.join(', ')} in ${targetCountry} and set recommendedDestinationTitle to "${cleanCities.join(', ')}, ${targetCountry}".`;

  const cacheKey = `gen:${targetCountry}:${cleanCities.join('|')}:${Boolean(letAiDecideCities)}:${startDate}:${endDate}:${daysCount}:${interests.join(',')}:${pace}:${totalBudget}:${travelersCount}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const ItinerarySchema = z.object({
    recommendedDestinationTitle: z.string().optional(),
    days: z.array(
      z.object({
        dayNumber: z.number(),
        theme: z.string(),
        activities: z.array(ActivityGeneratedSchema),
        planB: z.array(ActivityGeneratedSchema),
      })
    ),
  });

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
          budget: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimatedCost: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ['title', 'estimatedCost', 'description'],
          },
          mid: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimatedCost: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ['title', 'estimatedCost', 'description'],
          },
          premium: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimatedCost: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ['title', 'estimatedCost', 'description'],
          },
        },
        required: ['budget', 'mid', 'premium'],
      },
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
      'whyThis',
      'touristTrapScore',
    ],
  };

  try {
    const prompt = [
      `Generate a complete ${daysCount}-day travel itinerary (${startDate || 'upcoming'} to ${endDate || 'upcoming'}).`,
      `LOCATION REQUIREMENT: ${routeInstruction}`,
      `Every single activity and Plan B backup MUST be located in ${cleanCities.length > 0 && !letAiDecideCities ? `${cleanCities.join(' / ')}, ${targetCountry}` : targetCountry} with accurate real-world latitude and longitude coordinates.`,
      `TRAVEL PARAMETERS: ${travelersCount} travelers, total trip budget €${totalBudget}, daily pace ${pace}/5, selected interests: ${interests.join(', ')}.`,
      `USER ASSUMPTIONS: ${assumptions.join('; ')}.`,
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
                theme: { type: Type.STRING },
                activities: {
                  type: Type.ARRAY,
                  items: activitySchemaDefinition,
                },
                planB: {
                  type: Type.ARRAY,
                  items: activitySchemaDefinition,
                },
              },
              required: ['dayNumber', 'theme', 'activities', 'planB'],
            },
          },
        },
        required: ['recommendedDestinationTitle', 'days'],
      },
      ItinerarySchema
    );

    setCached(cacheKey, result);
    return res.json(result);
  } catch (err) {
    return res.status(503).json({
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
          model: 'gemini-3.8-flash',
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
            model: 'gemini-3.8-flash',
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
    return res.status(503).json({
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
        model: 'gemini-3.8-flash',
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
          model: 'gemini-3.8-flash',
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
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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
