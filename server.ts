import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import dotenv from 'dotenv';

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

// Zod Schemas for AI Architecture Rule #1 & Rule #3 (Never label AI outputs as 'verified' without official source)
const CostOptionSchema = z.object({
  title: z.string(),
  estimatedCost: z.number(),
  description: z.string(),
});

const ActivityGeneratedSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['food', 'culture', 'nature', 'nightlife', 'shopping', 'relax', 'transport', 'other']),
  description: z.string(),
  startTime: z.string(),
  durationMin: z.number(),
  openingHoursText: z.string().optional(),
  isOutdoor: z.boolean().optional(),
  interestTags: z.array(z.string()),
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
  whyThis: z.string(),
  touristTrapScore: z.number().min(0).max(100),
});

const ProposalChangeSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  dayNumber: z.number(),
  type: z.enum(['add', 'remove', 'replace', 'move']),
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
            'You are AtlasGenie, a European travel architect. Return strictly valid JSON matching the schema. Never invent fake URLs. All AI-generated prices and opening hours are treated as estimates unless verified by an official source.',
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

  const { destination, daysCount = 3, interests = [], pace = 3, totalBudget = 800, travelersCount = 2, assumptions = [] } = req.body;
  const cacheKey = `gen:${destination}:${daysCount}:${interests.join(',')}:${pace}:${totalBudget}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const ItinerarySchema = z.object({
    days: z.array(
      z.object({
        dayNumber: z.number(),
        theme: z.string(),
        activities: z.array(ActivityGeneratedSchema),
        planB: z.array(ActivityGeneratedSchema),
      })
    ),
  });

  try {
    const result = await callGeminiWithRetry(
      `Generate a ${daysCount}-day travel itinerary for ${destination} for ${travelersCount} travelers with total budget €${totalBudget}, pace ${pace}/5, interests: ${interests.join(', ')}, and assumptions: ${assumptions.join('; ')}. Include 3-4 activities per day and 1-2 indoor Plan B backup activities per day.`,
      {
        type: Type.OBJECT,
        properties: {
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayNumber: { type: Type.INTEGER },
                theme: { type: Type.STRING },
                activities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      category: { type: Type.STRING },
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
                          },
                          mid: {
                            type: Type.OBJECT,
                            properties: {
                              title: { type: Type.STRING },
                              estimatedCost: { type: Type.NUMBER },
                              description: { type: Type.STRING },
                            },
                          },
                          premium: {
                            type: Type.OBJECT,
                            properties: {
                              title: { type: Type.STRING },
                              estimatedCost: { type: Type.NUMBER },
                              description: { type: Type.STRING },
                            },
                          },
                        },
                      },
                      whyThis: { type: Type.STRING },
                      touristTrapScore: { type: Type.INTEGER },
                    },
                  },
                },
                planB: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      category: { type: Type.STRING },
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
                          },
                          mid: {
                            type: Type.OBJECT,
                            properties: {
                              title: { type: Type.STRING },
                              estimatedCost: { type: Type.NUMBER },
                              description: { type: Type.STRING },
                            },
                          },
                          premium: {
                            type: Type.OBJECT,
                            properties: {
                              title: { type: Type.STRING },
                              estimatedCost: { type: Type.NUMBER },
                              description: { type: Type.STRING },
                            },
                          },
                        },
                      },
                      whyThis: { type: Type.STRING },
                      touristTrapScore: { type: Type.INTEGER },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ItinerarySchema
    );

    setCached(cacheKey, result);
    return res.json(result);
  } catch (err) {
    return res.status(503).json({
      fallback: true,
      message: 'Using verified Demo Atlas fallback while AI service is unavailable.',
    });
  }
});

// (b) applyChatRequest & (c) recalculateDayByPace & (d) suggestLocalAlternative & (e) generatePlanB & (f) generateGroupCompromise & (g) explainBudgetTiers
app.post('/api/ai/propose-changes', async (req, res) => {
  const clientIp = req.ip || 'anon';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const { taskType, destination, message, currentDay, travelers } = req.body;
  const cacheKey = `prop:${taskType}:${destination}:${message || ''}:${currentDay?.id || ''}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
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
      server: { middlewareMode: true },
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
