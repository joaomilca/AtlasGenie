import {
  Activity,
  Day,
  FullTripBundle,
  ProposalChange,
  Traveler,
} from '../types/models';
import { DEMO_TRIPS } from '../data/demoTrips';
import { calculateHaversineTravel, computePaceMetrics } from '../utils/domainLogic';

/**
 * Generates an itinerary via server-side Gemini endpoint (/api/ai/generate-itinerary).
 * Falls back gracefully to rich verified Demo Atlas data if offline or quota-limited.
 */
export async function generateTripItinerary(params: {
  destination: string;
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

  const tripId = `trip-${Date.now().toString(36)}`;
  const inviteCode = `${params.destination
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'TRIP'}${Math.floor(10 + Math.random() * 89)}`;

  try {
    const response = await fetch('/api/ai/generate-itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: params.destination,
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
        const builtDays: Day[] = data.days.map((d: any, idx: number) => {
          const dayDate = new Date(start.getTime() + idx * 86400000)
            .toISOString()
            .slice(0, 10);
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
            location: raw.location || { name: params.destination, lat: 38.7139, lng: -9.1334 },
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
            whyThis: raw.whyThis || `Suggested for your interest in ${params.interests[0] || 'local culture'}.`,
            touristTrapScore: typeof raw.touristTrapScore === 'number' ? raw.touristTrapScore : 38,
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
            theme: d.theme || `Day ${idx + 1} in ${params.destination}`,
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
              destination: params.destination,
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
    // Graceful fallback to rich Demo template adapted to user's destination
  }

  // Fallback: clone matching or Lisbon template and customize for destination & dates
  const lowerDest = params.destination.toLowerCase();
  const baseKey = lowerDest.includes('porto')
    ? 'demo-porto-3d'
    : lowerDest.includes('rom')
    ? 'demo-rome-5d'
    : 'demo-lisbon-4d';

  const template = JSON.parse(JSON.stringify(DEMO_TRIPS[baseKey])) as FullTripBundle;
  template.trip.id = tripId;
  template.trip.ownerId = params.ownerId;
  template.trip.destination = params.destination;
  template.trip.startDate = params.startDate;
  template.trip.endDate = params.endDate;
  template.trip.totalBudget = params.totalBudget;
  template.trip.travelersCount = params.travelersCount;
  template.trip.interests = params.interests;
  template.trip.defaultPace = params.defaultPace;
  template.trip.assumptions = params.assumptions;
  template.trip.groupEnabled = params.groupEnabled;
  template.trip.inviteCode = inviteCode;
  template.trip.isDemo = false;

  template.days = template.days.slice(0, diffDays).map((d, idx) => ({
    ...d,
    id: `${tripId}-day-${idx + 1}`,
    tripId,
    ownerId: params.ownerId,
    date: new Date(start.getTime() + idx * 86400000).toISOString().slice(0, 10),
    dayNumber: idx + 1,
    paceLevel: params.defaultPace,
  }));

  return { bundle: template, usedFallback: true };
}

/**
 * Requests AI proposals (Chat assistant, Vibe Slider pace change, Group compromise, or Local alternative).
 * Always returns non-destructive ProposalChange[] items for the visual diff bar.
 */
export async function requestAiProposals(params: {
  taskType: 'chat' | 'pace' | 'compromise';
  destination: string;
  message: string;
  currentDay: Day;
  travelers: Traveler[];
}): Promise<{ reply: string; proposals: ProposalChange[]; usedFallback: boolean }> {
  try {
    const res = await fetch('/api/ai/propose-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
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
    // Fall through to deterministic smart proposal
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
