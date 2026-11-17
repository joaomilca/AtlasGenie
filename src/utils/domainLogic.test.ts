import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineTravel,
  computePaceMetrics,
  optimizeBudgetTiers,
  computeExpenseBalancesAndSettlement,
  applySingleProposalChange,
  applyProposalChanges,
  applyBudgetOptimizationToDays,
  computeGroupFairness,
  reorderActivitiesList,
  generateIcsCalendar,
} from './domainLogic';
import {
  WORLD_COUNTRIES,
  assignContiguousCitiesToDays,
  clampCoordinatesToCityBounds,
  computeActivityBounds,
  getActiveActivityLocation,
  getSortedWorldCountries,
  resolveDestinationCoordinates,
  validateCityInCountry,
} from './worldDestinations';
import { buildGenerateItinerarySystemPrompt } from '../services/api';
import { DEMO_TRIPS } from '../data/demoTrips';
import { Activity, Day, Expense, FullTripBundle, Traveler } from '../types/models';

const sampleActivity = (
  id: string,
  title: string,
  startTime: string,
  durationMin: number,
  budgetCost: number,
  midCost: number,
  premiumCost: number
): Activity => ({
  id,
  title,
  category: 'culture',
  description: 'Sample description',
  startTime,
  durationMin,
  interestTags: ['history', 'culture'],
  location: { name: 'Lisbon Center', lat: 38.711, lng: -9.136 },
  costOptions: {
    budget: { title: 'Free Walk', estimatedCost: budgetCost, description: 'Budget option' },
    mid: { title: 'Standard Ticket', estimatedCost: midCost, description: 'Mid option' },
    premium: { title: 'Private Guide', estimatedCost: premiumCost, description: 'Premium option' },
  },
  selectedTier: 'mid',
  priceConfidence: { status: 'verified', sourceUrl: 'https://example.com', verifiedAt: '2026-10-15' },
  hoursConfidence: { status: 'estimated' },
  whyThis: 'Suggested because you like history',
  touristTrapScore: 30,
  votes: {},
});

test('calculateHaversineTravel labels fallback travel time as estimated', () => {
  const leg = calculateHaversineTravel(
    { lat: 38.711, lng: -9.136 },
    { lat: 38.722, lng: -9.145 },
    'WALKING'
  );
  assert.equal(leg.source, 'estimated');
  assert.ok(leg.distanceKm > 0);
  assert.ok(leg.minutes >= 4);
});

test('computePaceMetrics identifies Relaxed, Balanced, and Unrealistic days', () => {
  const relaxedDay: Day = {
    id: 'd1',
    tripId: 't1',
    ownerId: 'u1',
    date: '2026-11-10',
    dayNumber: 1,
    paceLevel: 2,
    paceScore: 0,
    activePlan: 'A',
    activities: [sampleActivity('a1', 'Morning Cafe', '09:30', 90, 5, 12, 25)],
    planB: [],
  };

  const relaxedMetrics = computePaceMetrics(relaxedDay);
  assert.equal(relaxedMetrics.label, 'Relaxed');
  assert.equal(relaxedMetrics.isUnrealistic, false);

  const overloadedDay: Day = {
    ...relaxedDay,
    activities: [
      sampleActivity('a1', 'Act 1', '08:00', 180, 10, 20, 40),
      sampleActivity('a2', 'Act 2', '11:00', 180, 10, 20, 40),
      sampleActivity('a3', 'Act 3', '14:00', 180, 10, 20, 40),
      sampleActivity('a4', 'Act 4', '17:00', 180, 10, 20, 40),
    ],
  };

  const overloadedMetrics = computePaceMetrics(overloadedDay);
  assert.equal(overloadedMetrics.label, 'Packed');
  assert.equal(overloadedMetrics.isUnrealistic, true);
  assert.equal(overloadedMetrics.warningReason, 'too_long');
});

test('optimizeBudgetTiers deterministically selects tiers within target budget', () => {
  const day: Day = {
    id: 'd1',
    tripId: 't1',
    ownerId: 'u1',
    date: '2026-11-10',
    dayNumber: 1,
    paceLevel: 3,
    paceScore: 50,
    activePlan: 'A',
    activities: [
      sampleActivity('a1', 'Museum', '09:00', 120, 0, 15, 45),
      sampleActivity('a2', 'Dinner', '19:30', 120, 12, 30, 75),
    ],
    planB: [],
  };

  // Budget = 30 for 1 traveler: a1 can upgrade to mid (+15 -> total 27), a2 stays budget (12)
  const res = optimizeBudgetTiers([day], 30, 1);
  assert.equal(res.withinBudget, true);
  assert.ok(res.totalEstimatedCost <= 30);
  assert.equal(res.selections['a1'], 'mid');
  assert.equal(res.selections['a2'], 'budget');
  assert.equal(res.changes.length, 1);
  assert.equal(res.changes[0].activityId, 'a2');
});

test('computeExpenseBalancesAndSettlement sums balances to zero and minimizes transfers', () => {
  const travelers: Traveler[] = [
    {
      id: 'ana',
      tripId: 't1',
      ownerId: 'u1',
      userId: 'u1',
      displayName: 'Ana',
      interests: ['food'],
      budgetPerPerson: 500,
      constraints: '',
      preferredPace: 3,
      color: '#D97706',
      avatar: 'A',
    },
    {
      id: 'rui',
      tripId: 't1',
      ownerId: 'u1',
      userId: 'u2',
      displayName: 'Rui',
      interests: ['history'],
      budgetPerPerson: 500,
      constraints: '',
      preferredPace: 3,
      color: '#0D9488',
      avatar: 'R',
    },
    {
      id: 'sofia',
      tripId: 't1',
      ownerId: 'u1',
      userId: 'u3',
      displayName: 'Sofia',
      interests: ['culture'],
      budgetPerPerson: 500,
      constraints: '',
      preferredPace: 3,
      color: '#4F46E5',
      avatar: 'S',
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'e1',
      tripId: 't1',
      ownerId: 'u1',
      authorId: 'u1',
      activityId: 'a1',
      category: 'food',
      description: 'Seafood dinner',
      amount: 90,
      currency: 'EUR',
      paidBy: 'ana',
      splitMode: 'equal',
      splits: { ana: 30, rui: 30, sofia: 30 },
      date: '2026-11-10',
      settled: false,
    },
    {
      id: 'e2',
      tripId: 't1',
      ownerId: 'u1',
      authorId: 'u2',
      activityId: '',
      category: 'transport',
      description: 'Airport taxi',
      amount: 30,
      currency: 'EUR',
      paidBy: 'rui',
      splitMode: 'equal',
      splits: { ana: 10, rui: 10, sofia: 10 },
      date: '2026-11-10',
      settled: false,
    },
  ];

  const summary = computeExpenseBalancesAndSettlement(expenses, travelers);
  assert.equal(summary.totalSpent, 120);

  // Sum of netBalances must equal 0
  const sumBalances = summary.balances.reduce((acc, b) => acc + b.netBalance, 0);
  assert.ok(Math.abs(sumBalances) < 0.01);

  // Ana paid 90, owes 40 -> +50
  // Rui paid 30, owes 40 -> -10
  // Sofia paid 0, owes 40 -> -40
  // Minimized transfers: Sofia pays Ana 40, Rui pays Ana 10 (2 transfers)
  assert.equal(summary.settlements.length, 2);
  assert.equal(summary.settlements[0].fromTravelerId, 'sofia');
  assert.equal(summary.settlements[0].toTravelerId, 'ana');
  assert.equal(summary.settlements[0].amount, 40);
  assert.equal(summary.settlements[1].fromTravelerId, 'rui');
  assert.equal(summary.settlements[1].toTravelerId, 'ana');
  assert.equal(summary.settlements[1].amount, 10);
});

test('applySingleProposalChange replaces activity and recalculates travel times', () => {
  const day: Day = {
    id: 'd1',
    tripId: 't1',
    ownerId: 'u1',
    date: '2026-11-10',
    dayNumber: 1,
    paceLevel: 3,
    paceScore: 50,
    activePlan: 'A',
    activities: [sampleActivity('a1', 'Original Activity', '10:00', 60, 10, 20, 30)],
    planB: [],
  };

  const replacement = sampleActivity('a1-local', 'Authentic Local Spot', '10:00', 90, 5, 12, 20);
  const updated = applySingleProposalChange([day], {
    id: 'p1',
    dayId: 'd1',
    dayNumber: 1,
    type: 'replace',
    targetActivityId: 'a1',
    payload: replacement,
    reason: 'Less crowded local alternative',
    source: 'local_alt',
    status: 'accepted',
  });

  assert.equal(updated[0].activities[0].id, 'a1-local');
  assert.equal(updated[0].activities[0].title, 'Authentic Local Spot');

  // Verify idempotency & batch application via applyProposalChanges
  const addedAct = sampleActivity('a2-evening', 'Sunset Viewpoint', '18:30', 60, 0, 10, 25);
  const batched = applyProposalChanges(updated, [
    {
      id: 'p2',
      dayId: 'd1',
      dayNumber: 1,
      type: 'add',
      payload: addedAct,
      reason: 'Add evening stop',
      source: 'chat',
      status: 'accepted',
    },
    {
      id: 'p2-dup',
      dayId: 'd1',
      dayNumber: 1,
      type: 'add',
      payload: addedAct,
      reason: 'Duplicate real-time event',
      source: 'chat',
      status: 'accepted',
    },
  ]);
  assert.equal(batched[0].activities.length, 2);

  const tierUpdated = applyBudgetOptimizationToDays(batched, { 'a1-local': 'budget', 'a2-evening': 'premium' });
  assert.equal(tierUpdated[0].activities[0].selectedTier, 'budget');
  assert.equal(tierUpdated[0].activities[1].selectedTier, 'premium');
});

test('computeGroupFairness produces balanced scores for travelers', () => {
  const day: Day = {
    id: 'd1',
    tripId: 't1',
    ownerId: 'u1',
    date: '2026-11-10',
    dayNumber: 1,
    paceLevel: 3,
    paceScore: 50,
    activePlan: 'A',
    activities: [sampleActivity('a1', 'National Museum', '10:00', 120, 10, 20, 30)],
    planB: [],
  };
  const travelers: Traveler[] = [
    {
      id: 'ana',
      tripId: 't1',
      ownerId: 'u1',
      userId: 'u1',
      displayName: 'Ana',
      interests: ['history', 'culture'],
      budgetPerPerson: 400,
      constraints: '',
      preferredPace: 3,
      color: '#D97706',
      avatar: 'A',
    },
  ];
  const report = computeGroupFairness([day], travelers);
  assert.ok(report.overallFairnessIndex > 0);
  assert.equal(report.perPerson[0].matchedActivitiesCount, 1);
});

test('reorderActivitiesList moves activity to target index and recalculates travelFromPrevious', () => {
  const act1 = {
    ...sampleActivity('a1', 'Stop 1', '09:00', 60, 5, 10, 20),
    location: { name: 'Alfama', lat: 38.711, lng: -9.13 },
  };
  const act2 = {
    ...sampleActivity('a2', 'Stop 2', '11:00', 60, 5, 10, 20),
    location: { name: 'Chiado', lat: 38.710, lng: -9.142 },
  };
  const act3 = {
    ...sampleActivity('a3', 'Stop 3', '14:00', 60, 5, 10, 20),
    location: { name: 'Belem', lat: 38.697, lng: -9.206 },
  };

  const reordered = reorderActivitiesList([act1, act2, act3], 2, 0);
  assert.equal(reordered[0].id, 'a3');
  assert.equal(reordered[1].id, 'a1');
  assert.equal(reordered[2].id, 'a2');
  assert.equal(reordered[0].travelFromPrevious, undefined);
  assert.ok(reordered[1].travelFromPrevious);
  assert.ok(reordered[1].travelFromPrevious!.minutes >= 4);
});

test('generateIcsCalendar outputs valid RFC 5545 VCALENDAR with VEVENT entries', () => {
  const day: Day = {
    id: 'd1',
    tripId: 't1',
    ownerId: 'u1',
    date: '2026-11-18',
    dayNumber: 1,
    paceLevel: 3,
    paceScore: 50,
    activePlan: 'A',
    activities: [
      sampleActivity('a1', 'Castelo de São Jorge', '09:30', 120, 0, 15, 45),
      sampleActivity('a2', 'Museu Nacional do Azulejo', '15:15', 105, 8, 14, 48),
    ],
    planB: [],
  };

  const bundle: FullTripBundle = {
    trip: {
      id: 't1',
      ownerId: 'u1',
      destination: 'Lisbon',
      startDate: '2026-11-18',
      endDate: '2026-11-18',
      currency: 'EUR',
      totalBudget: 500,
      travelersCount: 2,
      interests: ['history'],
      defaultPace: 3,
      status: 'planned',
      memberIds: ['u1'],
      inviteCode: 'LISBOA26',
      assumptions: [],
      groupEnabled: true,
    },
    days: [day],
    travelers: [],
    expenses: [],
  };

  const ics = generateIcsCalendar(bundle, day);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('SUMMARY:Castelo de São Jorge'));
  assert.ok(ics.includes('SUMMARY:Museu Nacional do Azulejo'));
  assert.ok(ics.includes('DTSTART:20261118T093000Z'));
  assert.ok(ics.includes('DTEND:20261118T113000Z'));
  assert.ok(ics.trim().endsWith('END:VCALENDAR'));
});

test('Gemini Function Calling helpers extract place arguments, build functionResponse, and format grounded output', async () => {
  const {
    isInformationalPlaceQuery,
    extractPlaceQueryArgs,
    normalizeGooglePlacesApiResponse,
    resolveVerifiedPlaceDetails,
    buildFunctionResponsePayload,
    formatGroundedPlaceReply,
  } = await import('./domainLogic');

  assert.equal(
    isInformationalPlaceQuery('What are the opening hours, rating, and reviews for Time Out Market in Lisbon?'),
    true
  );
  assert.equal(
    isInformationalPlaceQuery('Make today cheaper with local budget spots'),
    false
  );

  const extracted = extractPlaceQueryArgs(
    'What are the opening hours, rating, and reviews for Time Out Market in Lisbon?',
    'Lisbon'
  );
  assert.ok(extracted);
  assert.equal(extracted!.placeName, 'Time Out Market Lisboa');
  assert.equal(extracted!.city, 'Lisbon');

  const verifiedDetails = resolveVerifiedPlaceDetails('Time Out Market Lisboa', 'Lisbon');
  assert.equal(verifiedDetails.rating, 4.5);
  assert.ok(verifiedDetails.priceLevel.includes('€€'));
  assert.ok(verifiedDetails.openingHours.length > 0);
  assert.ok(verifiedDetails.reviewsSummary.includes('food hall'));

  const normalizedApi = normalizeGooglePlacesApiResponse(
    {
      displayName: { text: 'Pastéis de Belém' },
      formattedAddress: 'R. de Belém 84-92, Lisboa',
      rating: 4.72,
      userRatingCount: 89400,
      priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
      regularOpeningHours: {
        weekdayDescriptions: ['Monday – Sunday: 08:00 – 21:00'],
      },
      reviews: [
        {
          authorAttribution: { displayName: 'Ana M.' },
          rating: 5,
          text: { text: 'Warm flaky custard tarts right out of the oven.' },
        },
      ],
    },
    { placeName: 'Pastéis de Belém', city: 'Lisbon' }
  );
  assert.equal(normalizedApi.placeName, 'Pastéis de Belém');
  assert.equal(normalizedApi.rating, 4.7);
  assert.ok(normalizedApi.priceLevel.includes('Inexpensive'));
  assert.ok(normalizedApi.reviewsSummary.includes('Warm flaky custard tarts'));

  const fnResponse = buildFunctionResponsePayload('call-123', verifiedDetails);
  assert.equal(fnResponse.role, 'function');
  assert.equal(fnResponse.parts[0].functionResponse.id, 'call-123');
  assert.equal(fnResponse.parts[0].functionResponse.name, 'fetch_google_place_details');
  assert.equal(fnResponse.parts[0].functionResponse.response.result.placeName, 'Time Out Market Lisboa');

  const groundedEn = formatGroundedPlaceReply(verifiedDetails, 'en');
  assert.ok(groundedEn.includes('Time Out Market Lisboa'));
  assert.ok(groundedEn.includes('4.5/5'));
  assert.ok(groundedEn.includes('Opening Hours:'));
  assert.ok(groundedEn.includes('Reviews Summary:'));
});

test('Sprint 1.1: Global destination list is comprehensive worldwide and strictly sorted alphabetically', () => {
  const sortedEn = getSortedWorldCountries('en');
  assert.ok(sortedEn.length >= 190, `Expected >= 190 countries, got ${sortedEn.length}`);
  assert.equal(sortedEn[0].value, 'Afghanistan');
  assert.equal(sortedEn[sortedEn.length - 1].value, 'Zimbabwe');

  for (let i = 1; i < sortedEn.length; i++) {
    const cmp = sortedEn[i - 1].labelEn.localeCompare(sortedEn[i].labelEn, 'en', {
      sensitivity: 'base',
    });
    assert.ok(
      cmp <= 0,
      `Countries not strictly alphabetical at index ${i}: ${sortedEn[i - 1].labelEn} vs ${sortedEn[i].labelEn}`
    );
  }

  // Validate city-to-country membership check
  const validRomeInItaly = validateCityInCountry('Rome', 'Italy');
  assert.equal(validRomeInItaly.valid, true);
  assert.equal(validRomeInItaly.matchedCountry, 'Italy');

  const validKyotoInJapan = validateCityInCountry('Kyoto', 'Japan');
  assert.equal(validKyotoInJapan.valid, true);
  assert.equal(validKyotoInJapan.matchedCountry, 'Japan');

  const invalidTokyoInItaly = validateCityInCountry('Tokyo', 'Italy');
  assert.equal(invalidTokyoInItaly.valid, false);
  assert.equal(invalidTokyoInItaly.reason, 'wrong_country');
  assert.equal(invalidTokyoInItaly.matchedCountry, 'Japan');

  const invalidParisInPortugal = validateCityInCountry('Paris', 'Portugal');
  assert.equal(invalidParisInPortugal.valid, false);
  assert.equal(invalidParisInPortugal.reason, 'wrong_country');
  assert.equal(invalidParisInPortugal.matchedCountry, 'France');

  // Hotfix 1 & 2: Small towns like Santiago de Veraguas in Panama are valid
  const smallTownInPanama = validateCityInCountry('Santiago de Veraguas', 'Panama');
  assert.equal(smallTownInPanama.valid, true);
  assert.equal(smallTownInPanama.canonicalCity, 'Santiago de Veraguas');
  assert.equal(smallTownInPanama.matchedCountry, 'Panama');

  // Hotfix 2: Basic input sanitization blocks numbers, special characters, gibberish, and profanity on frontend before querying API
  const numbersBlocked = validateCityInCountry('Lisbon123', 'Portugal');
  assert.equal(numbersBlocked.valid, false);
  assert.equal(numbersBlocked.reason, 'invalid_characters');

  const specialCharsBlocked = validateCityInCountry('Porto@#$%', 'Portugal');
  assert.equal(specialCharsBlocked.valid, false);
  assert.equal(specialCharsBlocked.reason, 'invalid_characters');

  const gibberishBlocked = validateCityInCountry('xkcdqwertz', 'Portugal');
  assert.equal(gibberishBlocked.valid, false);
  assert.equal(gibberishBlocked.reason, 'gibberish');

  const repeatedCharsBlocked = validateCityInCountry('aaaaabbbbb', 'Portugal');
  assert.equal(repeatedCharsBlocked.valid, false);
  assert.equal(repeatedCharsBlocked.reason, 'gibberish');

  const profanityBlocked = validateCityInCountry('fuckville', 'United States');
  assert.equal(profanityBlocked.valid, false);
  assert.equal(profanityBlocked.reason, 'profanity');

  // Unindexed remote locations require Geocoding API verification (and become O(1) valid once verified)
  const unindexedVillage = validateCityInCountry('Parque Nacional de Ordesa', 'Spain');
  assert.equal(unindexedVillage.valid, false);
  assert.equal(unindexedVillage.reason, 'needs_geocoding');
});

test('Sprint 1.2 & 1.3: Geographic strictness system prompt, niche small-town adaptability, coordinate clamping, and map fitBounds calculation', () => {
  const sysPrompt = buildGenerateItinerarySystemPrompt('Santiago de Veraguas', 'Panama');
  assert.ok(
    sysPrompt.includes(
      "Never hallucinate or place activities in random cities. If you don't have enough data for a full day, add generic local walks within the correct city bounds rather than jumping to a different city."
    )
  );
  assert.ok(
    sysPrompt.includes(
      'The user may request small towns, rural areas, or nature reserves. If they do, adapt the itinerary to focus on local hiking trails, nature walks, and small-town exploration. Never reject a valid small town just because it lacks major tourist attractions.'
    )
  );
  assert.ok(sysPrompt.includes('Santiago de Veraguas, Panama'));

  // Coordinate clamping keeps activities strictly inside the requested city bounds
  const kyotoCenter = resolveDestinationCoordinates('Kyoto', 'Japan');
  assert.ok(Math.abs(kyotoCenter.lat - 35.0116) < 0.05);
  assert.ok(Math.abs(kyotoCenter.lng - 135.7681) < 0.05);

  // If AI hallucinates Lisbon coordinates (38.7139, -9.1334) for a Kyoto trip, clampCoordinatesToCityBounds pulls it into Kyoto
  const clamped = clampCoordinatesToCityBounds(38.7139, -9.1334, kyotoCenter, 1);
  assert.ok(Math.abs(clamped.lat - kyotoCenter.lat) < 0.05);
  assert.ok(Math.abs(clamped.lng - kyotoCenter.lng) < 0.05);

  // Map fitBounds tightly frames city activities and rejects rogue global outliers
  const bounds = computeActivityBounds([
    { location: { lat: 35.0116, lng: 135.7681 } },
    { location: { lat: 35.0037, lng: 135.7785 } },
    { location: { lat: 35.017, lng: 135.6713 } },
  ]);
  assert.ok(bounds.north > 35.017);
  assert.ok(bounds.south < 35.0037);
  assert.ok(bounds.east > 135.7785);
  assert.ok(bounds.west < 135.6713);
  assert.ok(Math.abs(bounds.centerLat - 35.01) < 0.05);
  assert.ok(Math.abs(bounds.centerLng - 135.72) < 0.08);
  assert.ok(bounds.recommendedZoom >= 11 && bounds.recommendedZoom <= 15);
});

test('Sprint 2: O(1) pre-sorted 197-country list reference stability and sub-millisecond lookup performance', async () => {
  const { findWorldCountry, resolveCountryFromQueryParam } = await import('./worldDestinations');

  // Verify reference equality so React.memo CountrySelectOptions never re-renders unnecessarily
  const enListA = getSortedWorldCountries('en');
  const enListB = getSortedWorldCountries('en');
  const ptListA = getSortedWorldCountries('pt');
  const ptListB = getSortedWorldCountries('pt');

  assert.equal(enListA, enListB);
  assert.equal(ptListA, ptListB);
  assert.ok(enListA.length >= 195);
  assert.equal(enListA.length, ptListA.length);

  // Verify O(1) query param resolution
  const fromTokyo = resolveCountryFromQueryParam('Tokyo');
  assert.equal(fromTokyo.country, 'Japan');
  assert.deepEqual(fromTokyo.initialCities, ['Tokyo']);

  const fromCountry = resolveCountryFromQueryParam('Portugal');
  assert.equal(fromCountry.country, 'Portugal');
  assert.deepEqual(fromCountry.initialCities, []);

  // Benchmark 1,000 country + city validations to ensure zero DOM/JS freeze (< 50ms total)
  const startMs = performance.now();
  for (let i = 0; i < 1000; i++) {
    findWorldCountry('Japan');
    findWorldCountry('Países Baixos');
    validateCityInCountry('Kyoto', 'Japan');
    validateCityInCountry('Lisbon', 'Italy');
  }
  const elapsedMs = performance.now() - startMs;
  assert.ok(elapsedMs < 150, `Expected 4,000 geo lookups to finish in < 150ms, took ${elapsedMs.toFixed(2)}ms`);
});

test('Sprint 3.1: deduplicateAndMergeProposals and applySingleProposalChange enforce strict ID-based updates without duplicating nodes', async () => {
  const {
    deduplicateActivitiesById,
    deduplicateAndMergeProposals,
    applySingleProposalChange,
    buildActivityExtendedDetails,
  } = await import('./domainLogic');

  const act1 = sampleActivity('act-1', 'Time Out Market', '12:30', 90, 10, 22, 45);
  const act2 = sampleActivity('act-2', 'Castelo de São Jorge', '15:00', 120, 0, 15, 40);
  const day: Day = {
    id: 'day-1',
    tripId: 'trip-1',
    ownerId: 'u1',
    date: '2026-11-10',
    dayNumber: 1,
    paceLevel: 3,
    paceScore: 50,
    activePlan: 'A',
    activities: [act1, act2],
    planB: [],
  };

  const replacementPayload = sampleActivity(
    'act-1-local-tasca',
    'Tasca da Esquina Local Lunch',
    '12:30',
    90,
    8,
    16,
    32
  );

  const proposalFirst = {
    id: 'prop-local-day-1-act-1',
    dayId: 'day-1',
    dayNumber: 1,
    type: 'replace' as const,
    targetActivityId: 'act-1',
    targetActivityTitle: 'Time Out Market',
    payload: replacementPayload,
    reason: 'Skip tourist queues with a neighborhood tasca.',
    source: 'local_alt' as const,
    status: 'pending' as const,
  };

  // Clicking "Test Diff Proposal" or "Escape the crowds" multiple times with same ID or same target slot
  const proposalSecondSameSlot = {
    ...proposalFirst,
    id: 'prop-chat-day-1-act-1',
    reason: 'Updated reasoning for the same target activity slot.',
  };

  const mergedOnce = deduplicateAndMergeProposals([], [proposalFirst], [day]);
  assert.equal(mergedOnce.length, 1);

  const mergedTwice = deduplicateAndMergeProposals(mergedOnce, [proposalFirst, proposalSecondSameSlot], [day]);
  assert.equal(mergedTwice.length, 1, 'Must not stack duplicate proposals for the same target activity');
  assert.equal(mergedTwice[0].reason, 'Updated reasoning for the same target activity slot.');

  // Apply proposal strictly by ID
  const daysAfterAccept = applySingleProposalChange([day], mergedTwice[0]);
  assert.equal(daysAfterAccept[0].activities.length, 2, 'Activity count must remain 2 after replace');
  assert.equal(daysAfterAccept[0].activities[0].id, 'act-1-local-tasca');
  assert.equal(daysAfterAccept[0].activities[1].id, 'act-2');

  // Re-applying the same replace proposal or an add proposal with the same ID must be idempotent (zero duplicates)
  const daysAfterRepeatAccept = applySingleProposalChange(daysAfterAccept, mergedTwice[0]);
  assert.equal(daysAfterRepeatAccept[0].activities.length, 2, 'Repeating accept must never duplicate activity nodes');

  // Attempting to re-queue a proposal whose payload is already in the day is skipped
  const mergedAfterApplied = deduplicateAndMergeProposals([], [proposalFirst], daysAfterAccept);
  assert.equal(mergedAfterApplied.length, 0, 'Proposal whose replacement is already in the itinerary must be skipped');

  // Verify deduplicateActivitiesById removes accidental duplicate IDs or duplicate titles while preserving stable ID
  const dedupedList = deduplicateActivitiesById([
    act1,
    act2,
    { ...act1, title: 'Time Out Market Updated' },
    { ...act2, id: 'act-2-duplicate-id', description: 'Updated Castelo description' },
  ]);
  assert.equal(dedupedList.length, 2);
  assert.equal(dedupedList[0].title, 'Time Out Market Updated');
  assert.equal(dedupedList[1].id, 'act-2');
  assert.equal(dedupedList[1].description, 'Updated Castelo description');

  // Verify two 'add' proposals with different generated IDs but same normalized payload title merge into 1 proposal
  const addProp1 = {
    id: 'prop-add-1',
    dayId: 'day-1',
    dayNumber: 1,
    type: 'add' as const,
    payload: sampleActivity('act-add-1', 'Miradouro da Graça Sunset', '18:00', 60, 0, 8, 20),
    reason: 'Sunset viewpoint stop',
    source: 'chat' as const,
    status: 'pending' as const,
  };
  const addProp2 = {
    id: 'prop-add-2',
    dayId: 'day-1',
    dayNumber: 1,
    type: 'add' as const,
    payload: sampleActivity('act-add-2', 'miradouro da graca   sunset', '18:30', 60, 0, 10, 24),
    reason: 'Updated sunset viewpoint stop',
    source: 'chat' as const,
    status: 'pending' as const,
  };
  const mergedAddProps = deduplicateAndMergeProposals([], [addProp1, addProp2], daysAfterAccept);
  assert.equal(mergedAddProps.length, 1, 'Add proposals with same title must merge into 1');
  assert.equal(mergedAddProps[0].id, 'prop-add-1', 'Stable proposal ID must be preserved');

  const daysAfterAdd1 = applySingleProposalChange(daysAfterAccept, addProp1);
  const daysAfterAdd2 = applySingleProposalChange(daysAfterAdd1, addProp2);
  assert.equal(
    daysAfterAdd2[0].activities.length,
    3,
    'Applying add proposals with same title and different IDs/times must update in-place without duplicating'
  );

  // Sprint 3.2: Verify buildActivityExtendedDetails returns rich overview, AI reasoning, and tips/warnings
  const highTrapAct: Activity = {
    ...act1,
    touristTrapScore: 78,
    isOutdoor: true,
  };
  const actDetails = buildActivityExtendedDetails(highTrapAct, undefined, 'en');
  assert.ok(actDetails.extendedOverview.includes('Sample description'));
  assert.ok(actDetails.subtitle.includes('Lisbon Center'));
  assert.ok(actDetails.aiReasoning.length > 20);
  assert.ok(actDetails.tipsAndWarnings.some((tip) => tip.level === 'warning'));

  const propDetails = buildActivityExtendedDetails(highTrapAct, mergedTwice[0], 'en');
  assert.ok(propDetails.subtitle.includes('Lisbon Center'));
  assert.ok(
    propDetails.proposalSummary &&
      propDetails.proposalSummary.includes('Replaces "Time Out Market" with "Tasca da Esquina Local Lunch"')
  );
});

test('Sprint 4: Chronological routing, day-level logistics, and distinct budget tier coordinates & bounds reactivity', () => {
  // 1. Chronological routing: complete all days in City A before moving to City B
  const fourDayTwoCities = assignContiguousCitiesToDays(['Rome', 'Florence'], 4, 'Rome');
  assert.deepEqual(fourDayTwoCities, ['Rome', 'Rome', 'Florence', 'Florence']);

  const fiveDayThreeCities = assignContiguousCitiesToDays(['Lisbon', 'Coimbra', 'Porto'], 5, 'Lisbon');
  assert.deepEqual(fiveDayThreeCities, ['Lisbon', 'Lisbon', 'Coimbra', 'Coimbra', 'Porto']);

  // 2. Gemini system prompt enforces chronological routing and distinct budget/premium venues & coordinates
  const prompt = buildGenerateItinerarySystemPrompt('Rome, Florence', 'Italy');
  assert.ok(
    prompt.includes('Complete all days in City A before moving to City B. Never alternate back and forth day-by-day.'),
    'Prompt must enforce chronological routing'
  );
  assert.ok(
    prompt.includes(
      'Budget and Premium variations MUST return completely different venues and distinct coordinates. Never recycle the exact same location across different budget tiers.'
    ),
    'Prompt must enforce distinct venues and coordinates across budget tiers'
  );

  // 3. Distinct tier venues & coordinates and reactive map bounds
  const lisbonDemo = DEMO_TRIPS['demo-lisbon-4d'];
  assert.ok(lisbonDemo, 'Lisbon demo trip should exist');

  // Verify every day has accommodation and meals (breakfast, lunch, dinner)
  for (const day of lisbonDemo.days) {
    assert.ok(day.accommodation, `Day ${day.dayNumber} must include accommodation`);
    assert.ok(day.accommodation.name.length > 0);
    assert.ok(['hotel', 'hostel', 'apartment'].includes(day.accommodation.type));
    assert.ok(day.accommodation.price > 0);
    assert.ok(day.accommodation.coordinates.lat !== 0 && day.accommodation.coordinates.lng !== 0);

    assert.ok(day.meals, `Day ${day.dayNumber} must include meals`);
    assert.ok(day.meals.breakfast.name !== day.meals.lunch.name);
    assert.ok(day.meals.lunch.name !== day.meals.dinner.name);
  }

  // Verify intercity_transit is ONLY on Day 4 (when crossing to Almada & Cacilhas)
  assert.equal(lisbonDemo.days[0].intercity_transit, undefined);
  assert.equal(lisbonDemo.days[1].intercity_transit, undefined);
  assert.equal(lisbonDemo.days[2].intercity_transit, undefined);
  assert.ok(lisbonDemo.days[3].intercity_transit, 'Day 4 should include intercity_transit');
  assert.ok(lisbonDemo.days[3].intercity_transit!.method.length > 0);

  // Verify switching budget tiers on an activity returns distinct venues and distinct coordinates, and updates computeActivityBounds
  const day1Acts = lisbonDemo.days[0].activities;
  const firstAct = day1Acts[0];

  const budgetLoc = getActiveActivityLocation({ ...firstAct, selectedTier: 'budget' });
  const midLoc = getActiveActivityLocation({ ...firstAct, selectedTier: 'mid' });
  const premiumLoc = getActiveActivityLocation({ ...firstAct, selectedTier: 'premium' });

  assert.notEqual(budgetLoc.venueName, premiumLoc.venueName, 'Budget and Premium venue names must be distinct');
  assert.ok(
    budgetLoc.lat !== premiumLoc.lat || budgetLoc.lng !== premiumLoc.lng,
    'Budget and Premium coordinates must be distinct'
  );
  assert.ok(
    budgetLoc.lat !== midLoc.lat || budgetLoc.lng !== midLoc.lng,
    'Budget and Mid coordinates must be distinct'
  );

  const boundsMid = computeActivityBounds(day1Acts);
  const boundsBudget = computeActivityBounds(
    day1Acts.map((a) => ({ ...a, selectedTier: 'budget' as const }))
  );
  const boundsPremium = computeActivityBounds(
    day1Acts.map((a) => ({ ...a, selectedTier: 'premium' as const }))
  );

  assert.ok(boundsMid && boundsBudget && boundsPremium);
  assert.notDeepEqual(
    boundsBudget,
    boundsPremium,
    'Map bounds must recalculate to distinct coordinates when switching between Budget and Premium tiers'
  );
});

test('Sprint 5: Dynamic daily subtotals, global trip total recalculation on Premium tier switch, and swappable accommodation proposals', async () => {
  const {
    computeDaySubtotal,
    computeTripTotalCost,
    applySingleProposalChange,
    deduplicateAndMergeProposals,
  } = await import('./domainLogic');

  const lisbonDemo = JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d'])) as FullTripBundle;
  const day1 = lisbonDemo.days[0];
  const day4 = lisbonDemo.days[3];

  // 1. Dynamic Daily Subtotal sums accommodation + intercity_transit + meals + active activities
  const day1MidSubtotal = computeDaySubtotal(day1);
  // Day 1 mid: accommodation (138) + transit (0) + meals (9+24+28 = 61) + activities (15+28+14+34 = 91) = 290
  assert.equal(day1MidSubtotal.accommodationCost, 138);
  assert.equal(day1MidSubtotal.transitCost, 0);
  assert.equal(day1MidSubtotal.mealsCost, 61);
  assert.equal(day1MidSubtotal.activitiesCost, 91);
  assert.equal(day1MidSubtotal.total, 290);

  // Day 4 includes intercity_transit (€3 ferry)
  const day4MidSubtotal = computeDaySubtotal(day4);
  assert.equal(day4MidSubtotal.transitCost, 3);
  assert.equal(
    day4MidSubtotal.total,
    day4MidSubtotal.accommodationCost +
      day4MidSubtotal.transitCost +
      day4MidSubtotal.mealsCost +
      day4MidSubtotal.activitiesCost
  );

  // 2. Switching Day 1 to Premium tier recalculates Daily Total immediately
  const day1Premium: Day = {
    ...day1,
    accommodation: day1.accommodation
      ? { ...day1.accommodation, selectedTier: 'premium' }
      : undefined,
    activities: day1.activities.map((a) => ({ ...a, selectedTier: 'premium' as const })),
  };
  const day1PremiumSubtotal = computeDaySubtotal(day1Premium);
  assert.equal(day1PremiumSubtotal.dominantTier, 'premium');
  assert.ok(
    day1PremiumSubtotal.total > day1MidSubtotal.total,
    `Expected Premium daily total (${day1PremiumSubtotal.total}) > Mid daily total (${day1MidSubtotal.total})`
  );

  // 3. Global Trip Total dynamically sums all days and updates when switched to Premium
  const midTripTotal = computeTripTotalCost(lisbonDemo.days);
  const premiumDays = lisbonDemo.days.map((d) => ({
    ...d,
    accommodation: d.accommodation ? { ...d.accommodation, selectedTier: 'premium' as const } : undefined,
    activities: d.activities.map((a) => ({ ...a, selectedTier: 'premium' as const })),
  }));
  const premiumTripTotal = computeTripTotalCost(premiumDays);
  assert.equal(premiumTripTotal.dominantTier, 'premium');
  assert.ok(
    premiumTripTotal.total > midTripTotal.total,
    `Expected Premium trip total (${premiumTripTotal.total}) > Mid trip total (${midTripTotal.total})`
  );

  // 4. Swappable Accommodation proposal (replace_accommodation) updates day.accommodation and recalculates subtotal
  const accProposal = {
    id: 'prop-acc-day1-mid',
    dayId: day1.id,
    dayNumber: 1,
    type: 'replace_accommodation' as const,
    targetAccommodationName: day1.accommodation!.name,
    accommodationPayload: {
      name: 'Lisbon Boutique Townhouse & Garden Hotel',
      type: 'hotel',
      price: 162,
      coordinates: { lat: 38.7125, lng: -9.1412 },
      selectedTier: 'mid' as const,
      customPriceLocked: true,
    },
    reason: 'Boutique courtyard alternative in Chiado.',
    source: 'accommodation' as const,
    status: 'pending' as const,
  };

  const mergedAccProps = deduplicateAndMergeProposals([], [accProposal], lisbonDemo.days);
  assert.equal(mergedAccProps.length, 1);

  const daysAfterAccSwap = applySingleProposalChange(lisbonDemo.days, accProposal);
  assert.equal(
    daysAfterAccSwap[0].accommodation?.name,
    'Lisbon Boutique Townhouse & Garden Hotel'
  );
  assert.equal(daysAfterAccSwap[0].accommodation?.price, 162);

  const day1AfterSwapSubtotal = computeDaySubtotal(daysAfterAccSwap[0]);
  assert.equal(day1AfterSwapSubtotal.accommodationCost, 162);
  assert.equal(day1AfterSwapSubtotal.total, day1MidSubtotal.total - 138 + 162);
});

test('Sprint 8: Strict European Portuguese (PT-PT) system prompt directive and real-time country Combobox filtering', async () => {
  const { filterWorldCountries } = await import('./worldDestinations');

  const sysPrompt = buildGenerateItinerarySystemPrompt('Lisboa, Porto', 'Portugal');
  assert.ok(
    sysPrompt.includes(
      'You MUST generate all descriptive text, activity names, reasons, and tips strictly in European Portuguese (PT-PT). Do not output English under any circumstances.'
    ),
    'System prompt must include the strict PT-PT directive'
  );

  // Empty query returns full 197-country list
  const fullList = filterWorldCountries('', 'pt');
  assert.ok(fullList.length >= 195);

  // Typing "Port" filters in real-time to Portugal
  const portMatches = filterWorldCountries('Port', 'pt');
  assert.ok(portMatches.some((c) => c.value === 'Portugal'));
  assert.ok(portMatches.length < 10);

  // Typing "Itá" (accented PT) or "Ital" matches Italy
  const italyMatches = filterWorldCountries('Itá', 'pt');
  assert.ok(italyMatches.some((c) => c.value === 'Italy'));
});

test('Sprint 9: Step 3 pre-defined specialPreferences chips, customRequest merging, and Gemini prompt injection', async () => {
  const { SPECIAL_PREFERENCE_CHIPS, buildSpecialPreferencesConstraintList } = await import(
    '../services/api'
  );

  const ptLabels = SPECIAL_PREFERENCE_CHIPS.map((c) => c.labelPt);
  assert.ok(ptLabels.includes('Dieta Vegetariana / Vegan'));
  assert.ok(ptLabels.includes('Mobilidade Reduzida (Evitar escadas)'));
  assert.ok(ptLabels.includes('Viagem com Crianças'));
  assert.ok(ptLabels.includes("Evitar multidões (Fugir das 'Tourist Traps')"));
  assert.ok(ptLabels.includes('Preferir deslocações de Táxi/Uber'));

  const selectedChips = [
    'Dieta Vegetariana / Vegan',
    "Evitar multidões (Fugir das 'Tourist Traps')",
  ];
  const customText = 'Tenho alergia a marisco e gostava de incluir uma ida ao estádio de futebol.';

  const combined = buildSpecialPreferencesConstraintList(selectedChips, customText);
  assert.deepEqual(combined, [
    'Dieta Vegetariana / Vegan',
    "Evitar multidões (Fugir das 'Tourist Traps')",
    'Tenho alergia a marisco e gostava de incluir uma ida ao estádio de futebol.',
  ]);

  const sysPrompt = buildGenerateItinerarySystemPrompt(
    'Lisboa',
    'Portugal',
    selectedChips,
    customText
  );
  assert.ok(
    sysPrompt.includes(
      'STRICT USER RESTRICTIONS & SPECIAL REQUESTS (MANDATORY FOR LOCATIONS, MEALS, AND LOGISTICS)'
    )
  );
  assert.ok(sysPrompt.includes('Dieta Vegetariana / Vegan'));
  assert.ok(
    sysPrompt.includes(
      'Tenho alergia a marisco e gostava de incluir uma ida ao estádio de futebol.'
    )
  );
});

test('Sprint 11: Decoupled per-activity tier selection does not alter day-level Accommodation or Meals pricing', async () => {
  const { computeDaySubtotal } = await import('./domainLogic');
  const lisbonDay1 = DEMO_TRIPS['demo-lisbon-4d'].days[0];
  const initialSubtotal = computeDaySubtotal(lisbonDay1);

  // Initial state: Mid tier accommodation (€138), Mid tier meals (€61), Mid tier activities (€91) => €290
  assert.equal(initialSubtotal.dominantTier, 'mid');
  assert.equal(initialSubtotal.accommodationCost, 138);
  assert.equal(initialSubtotal.mealsCost, 61);
  assert.equal(initialSubtotal.activitiesCost, 91);
  assert.equal(initialSubtotal.total, 290);

  // Switch ONLY Activity 1 (act-lis-1) from Mid (€15) to Premium (€45), delta = +€30
  const dayWithSinglePremiumActivity = {
    ...lisbonDay1,
    activities: lisbonDay1.activities.map((act, idx) =>
      idx === 0 ? { ...act, selectedTier: 'premium' as const } : act
    ),
  };

  const afterActivityUpgrade = computeDaySubtotal(dayWithSinglePremiumActivity);

  // Accommodation and Meals MUST remain at Mid (€138 and €61)
  assert.equal(afterActivityUpgrade.dominantTier, 'mid');
  assert.equal(afterActivityUpgrade.accommodationCost, 138);
  assert.equal(afterActivityUpgrade.mealsCost, 61);
  // Activities cost increases by +30 (91 + 30 = 121), Daily Total increases by +30 (290 + 30 = 320)
  assert.equal(afterActivityUpgrade.activitiesCost, 121);
  assert.equal(afterActivityUpgrade.total, 320);

  // Switch Activity 1 to Budget (€0), delta from Mid (€15) = -€15
  const dayWithSingleBudgetActivity = {
    ...lisbonDay1,
    activities: lisbonDay1.activities.map((act, idx) =>
      idx === 0 ? { ...act, selectedTier: 'budget' as const } : act
    ),
  };

  const afterActivityDowngrade = computeDaySubtotal(dayWithSingleBudgetActivity);
  assert.equal(afterActivityDowngrade.dominantTier, 'mid');
  assert.equal(afterActivityDowngrade.accommodationCost, 138);
  assert.equal(afterActivityDowngrade.mealsCost, 61);
  assert.equal(afterActivityDowngrade.activitiesCost, 76);
  assert.equal(afterActivityDowngrade.total, 275);
});

test('Sprint 12: Granular simulator selected proposals, expense grouping by payer (.reduce), and expense deletion recalculation (.filter)', async () => {
  const {
    optimizeBudgetTiers,
    applySelectedBudgetProposalsToDays,
    computeCurrentItineraryTotal,
    groupExpensesByPayer,
    removeExpenseById,
    computeExpenseBalancesAndSettlement,
  } = await import('./domainLogic');

  const lisbonBundle = DEMO_TRIPS['demo-lisbon-4d'];
  const scale = lisbonBundle.trip.travelersCount; // 3

  // 1. Simulator proposals default to selected: true, and Apply Tier Changes only applies selected === true
  const initialTotal = computeCurrentItineraryTotal(lisbonBundle.days, scale);
  assert.equal(initialTotal, 639);

  const opt = optimizeBudgetTiers(lisbonBundle.days, 950, scale);
  assert.ok(opt.changes.length >= 2);
  for (const chg of opt.changes) {
    assert.equal(chg.selected, true);
  }

  // Toggle first proposal selected = true, all other proposals selected = false (immutably)
  const firstProp = opt.changes[0];
  const secondProp = opt.changes[1];
  const toggledProposals = opt.changes.map((chg, idx) => ({
    ...chg,
    selected: idx === 0,
  }));

  const updatedDays = applySelectedBudgetProposalsToDays(lisbonBundle.days, toggledProposals);
  const firstUpdatedAct = updatedDays
    .flatMap((d) => d.activities)
    .find((a) => a.id === firstProp.activityId);
  const secondUpdatedAct = updatedDays
    .flatMap((d) => d.activities)
    .find((a) => a.id === secondProp.activityId);

  assert.equal(firstUpdatedAct?.selectedTier, firstProp.toTier);
  assert.equal(secondUpdatedAct?.selectedTier, secondProp.fromTier); // Unselected proposal NOT applied

  // Original days remain unmutated
  const originalFirstAct = lisbonBundle.days
    .flatMap((d) => d.activities)
    .find((a) => a.id === firstProp.activityId);
  assert.equal(originalFirstAct?.selectedTier, firstProp.fromTier);

  // 2. Expense Grouping Engine using .reduce() keyed by person displayName and sorted chronologically
  const sampleExpenses = [
    {
      ...lisbonBundle.expenses[0],
      id: 'exp-late',
      paidBy: 'ana',
      date: '2026-11-20',
      amount: 60,
    },
    {
      ...lisbonBundle.expenses[0],
      id: 'exp-early',
      paidBy: 'ana',
      date: '2026-11-18',
      amount: 30,
    },
    {
      ...lisbonBundle.expenses[0],
      id: 'exp-rui-1',
      paidBy: 'rui',
      date: '2026-11-19',
      amount: 45,
    },
  ];

  const grouped = groupExpensesByPayer(sampleExpenses, lisbonBundle.travelers);
  assert.ok(Array.isArray(grouped['Ana']));
  assert.ok(Array.isArray(grouped['Rui']));
  assert.equal(grouped['Ana'].length, 2);
  assert.equal(grouped['Ana'][0].id, 'exp-early'); // sorted chronologically (2026-11-18 before 2026-11-20)
  assert.equal(grouped['Ana'][1].id, 'exp-late');
  assert.equal(grouped['Rui'].length, 1);

  // 3. Expense Deletion (.filter) & Instant Balance Recalculation
  const initialSummary = computeExpenseBalancesAndSettlement(
    lisbonBundle.expenses,
    lisbonBundle.travelers
  );
  const firstExpense = lisbonBundle.expenses[0];
  const remainingExpenses = removeExpenseById(lisbonBundle.expenses, firstExpense.id);
  assert.equal(remainingExpenses.length, lisbonBundle.expenses.length - 1);
  assert.equal(
    remainingExpenses.some((e) => e.id === firstExpense.id),
    false
  );

  const recalculatedSummary = computeExpenseBalancesAndSettlement(
    remainingExpenses,
    lisbonBundle.travelers
  );
  assert.equal(
    Math.round((initialSummary.totalSpent - recalculatedSummary.totalSpent) * 100) / 100,
    firstExpense.amount
  );
});

test('Sprint 14: Strict Google Search Grounding directive & isPriceVerified schema across activities, accommodation, and meals', async () => {
  const { resolveActiveDayAccommodation } = await import('./domainLogic');
  const sysPrompt = buildGenerateItinerarySystemPrompt('Lisboa', 'Portugal');

  assert.ok(
    sysPrompt.includes(
      'You MUST use the Google Search tool to fetch current 2026 prices for venues, hotels, and transit.'
    )
  );
  assert.ok(
    sysPrompt.includes(
      'If you successfully find a current, real-world price via Search, you MUST set isPriceVerified: true.'
    )
  );
  assert.ok(
    sysPrompt.includes(
      'If the search fails or you cannot confirm the exact price and must rely on an estimate, you MUST set isPriceVerified: false.'
    )
  );

  const lisbonDay1 = DEMO_TRIPS['demo-lisbon-4d'].days[0];
  // Activity 1 (Castelo de São Jorge) has verified price
  assert.equal(lisbonDay1.activities[0].isPriceVerified, true);
  assert.equal(lisbonDay1.activities[0].costOptions.mid.isPriceVerified, true);
  // Activity 2 (Time Out Market) has estimated price
  assert.equal(lisbonDay1.activities[1].isPriceVerified, false);
  assert.equal(lisbonDay1.activities[1].costOptions.mid.isPriceVerified, false);

  // Day 1 Meals: breakfast is verified (true), lunch & dinner are estimated (false)
  assert.equal(lisbonDay1.meals?.breakfast.isPriceVerified, true);
  assert.equal(lisbonDay1.meals?.lunch.isPriceVerified, false);
  assert.equal(lisbonDay1.meals?.dinner.isPriceVerified, false);

  // Day 1 Accommodation: mid tier is verified (true), premium tier is estimated (false)
  const resolvedMidAcc = resolveActiveDayAccommodation(lisbonDay1.accommodation, 'mid');
  assert.equal(resolvedMidAcc?.isPriceVerified, true);

  const resolvedPremiumAcc = resolveActiveDayAccommodation(
    { ...lisbonDay1.accommodation!, selectedTier: 'premium' },
    'mid'
  );
  assert.equal(resolvedPremiumAcc?.isPriceVerified, false);
});

test('Sprint 15: Step 3 textarea placeholder and constraint chips localization (EN & PT-PT)', async () => {
  const { translations } = await import('../i18n/translations');
  const { SPECIAL_PREFERENCE_CHIPS } = await import('../services/api');

  // 1. Dynamic Placeholder Translation
  assert.equal(
    translations.en['wizard.otherRequestsPlaceholder'],
    "E.g., I have a seafood allergy, or I'd love to include a visit to a football stadium..."
  );
  assert.equal(
    translations.pt['wizard.otherRequestsPlaceholder'],
    'Ex: Tenho alergia a marisco, ou gostava de incluir uma ida ao estádio de futebol...'
  );

  // 2. Verify all 6 constraint chips are localized in both EN and PT-PT dictionaries
  for (const chip of SPECIAL_PREFERENCE_CHIPS) {
    assert.equal(translations.en[`wizard.prefChip.${chip.id}`], chip.labelEn);
    assert.equal(translations.pt[`wizard.prefChip.${chip.id}`], chip.labelPt);
  }
});

test('Sprint 16: Zero Repetition directive, Custom Requests (The Law) directive, and 100% unique activities across days', async () => {
  const { enforceUniqueActivitiesAndCustomRequests } = await import('../services/api');

  const sysPrompt = buildGenerateItinerarySystemPrompt(
    'Madrid',
    'Spain',
    [],
    'Queremos ir a discotecas à noite'
  );

  assert.ok(
    sysPrompt.includes(
      'You MUST maintain a global history of all generated venues. YOU ARE STRICTLY FORBIDDEN from repeating the same activity, museum, restaurant, or neighborhood walk on different days. Every single activity across the entire trip MUST be 100% unique.'
    ),
    'System prompt must include exact Zero Repetition directive'
  );

  assert.ok(
    sysPrompt.includes(
      "The user's preferences, age group, and custom requests (from the text area) are ABSOLUTE LAWS. If the user explicitly asks for 'discotecas', nightlife, or a specific niche, you MUST prioritize and include these over generic city highlights. Sacrifice standard attractions to guarantee the user's specific constraints are met on at least one of the days."
    ),
    'System prompt must include exact Custom Requests (The Law) directive'
  );

  // Simulate Day 4 copy-pasting Day 1 activities and omitting 'discotecas'
  const baseDay1 = {
    ...DEMO_TRIPS['demo-lisbon-4d'].days[0],
    activities: DEMO_TRIPS['demo-lisbon-4d'].days[0].activities.slice(0, 2),
  };
  const duplicateDay4 = {
    ...DEMO_TRIPS['demo-lisbon-4d'].days[3],
    dayNumber: 4,
    city: 'Lisbon',
    activities: DEMO_TRIPS['demo-lisbon-4d'].days[0].activities.slice(0, 2),
  };

  const enforcedDays = enforceUniqueActivitiesAndCustomRequests(
    [baseDay1, duplicateDay4],
    'discotecas',
    []
  );

  const allTitles = enforcedDays.flatMap((d) => d.activities.map((a) => a.title.toLowerCase()));
  const uniqueTitles = new Set(allTitles);
  assert.equal(
    uniqueTitles.size,
    allTitles.length,
    'Every single activity across the entire trip must be 100% unique'
  );

  const hasDiscotecasOrNightlife = enforcedDays.some((d) =>
    d.activities.some(
      (a) =>
        a.title.toLowerCase().includes('discoteca') ||
        a.description.toLowerCase().includes('discoteca')
    )
  );
  assert.equal(hasDiscotecasOrNightlife, true, 'Custom request for discotecas must be included');
});

test('Sprint 17: Form state persistence (atlasGenie_tripDraft) serialization, deserialization, and array immutability', async () => {
  const {
    TRIP_DRAFT_STORAGE_KEY,
    createDefaultTripWizardDraft,
    serializeTripWizardDraft,
    parseTripWizardDraft,
  } = await import('./domainLogic');

  assert.equal(TRIP_DRAFT_STORAGE_KEY, 'atlasGenie_tripDraft');

  const defaultDraft = createDefaultTripWizardDraft();
  assert.equal(defaultDraft.country, '');
  assert.deepEqual(defaultDraft.cities, []);
  assert.equal(defaultDraft.travelersCount, 2);
  assert.equal(defaultDraft.totalBudget, 900);

  const customDraft = {
    ...defaultDraft,
    country: 'Spain',
    cities: ['Madrid', 'Seville'],
    startDate: '2026-12-01',
    endDate: '2026-12-05',
    travelersCount: 4,
    totalBudget: 1850,
    selectedInterests: ['food', 'music', 'architecture'],
    defaultPace: 4,
    groupEnabled: true,
    specialPreferences: [
      'Dieta Vegetariana / Vegan',
      "Evitar multidões (Fugir das 'Tourist Traps')",
    ],
    customRequest: 'Queremos ir a discotecas e visitar o estádio Santiago Bernabéu.',
  };

  const json = serializeTripWizardDraft(customDraft);
  const restored = parseTripWizardDraft(json);

  assert.ok(restored);
  assert.equal(restored.country, 'Spain');
  assert.deepEqual(restored.cities, ['Madrid', 'Seville']);
  assert.notEqual(restored.cities, customDraft.cities); // Fresh array reference
  assert.equal(restored.travelersCount, 4);
  assert.equal(restored.totalBudget, 1850);
  assert.deepEqual(restored.specialPreferences, [
    'Dieta Vegetariana / Vegan',
    "Evitar multidões (Fugir das 'Tourist Traps')",
  ]);
  assert.notEqual(restored.specialPreferences, customDraft.specialPreferences);
  assert.equal(
    restored.customRequest,
    'Queremos ir a discotecas e visitar o estádio Santiago Bernabéu.'
  );

  // Invalid JSON returns null safely
  assert.equal(parseTripWizardDraft('invalid-json{'), null);
  assert.equal(parseTripWizardDraft(null), null);
});

test('Sprint 18: Demo trips mock data PT-PT localization and i18n dictionary switching', async () => {
  const { getLocalizedDemoTripMeta } = await import('../data/demoTrips');
  const { translations } = await import('../i18n/translations');

  // 1. Default DEMO_TRIPS mock data titles, locations, and summaries are strictly in PT-PT
  const lisbon = DEMO_TRIPS['demo-lisbon-4d'];
  const porto = DEMO_TRIPS['demo-porto-3d'];
  const rome = DEMO_TRIPS['demo-rome-5d'];

  assert.equal(lisbon.trip.destination, 'Lisboa');
  assert.equal(lisbon.trip.country, 'Portugal');
  assert.equal(lisbon.days[0].theme, 'Alma de Alfama, Azulejos e Pôr do Sol no Tejo');

  assert.equal(porto.trip.destination, 'Porto');
  assert.equal(porto.trip.country, 'Portugal');
  assert.equal(porto.days[0].theme, 'Azulejos de São Bento, Clérigos e Caves de Gaia');

  assert.equal(rome.trip.destination, 'Roma');
  assert.equal(rome.trip.country, 'Itália');
  assert.equal(rome.days[0].theme, 'Coliseu, Fórum Romano e Ruas de Monti');

  // 2. Helper function with PT dictionary produces exact PT-PT titles, summaries, and action buttons
  const tPt = (key: string, opts?: Record<string, any>) => {
    let val = translations.pt[key] ?? opts?.defaultValue ?? key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        if (k !== 'defaultValue') {
          val = val.replace(`{{${k}}}`, String(v));
        }
      }
    }
    return val;
  };

  const lisbonPtMeta = getLocalizedDemoTripMeta(lisbon, tPt);
  const romePtMeta = getLocalizedDemoTripMeta(rome, tPt);

  assert.equal(lisbonPtMeta.locationTitle, 'Lisboa, Portugal');
  assert.equal(lisbonPtMeta.openBtnLabel, 'Abrir Atlas Demo de Lisboa');

  assert.equal(romePtMeta.locationTitle, 'Roma, Itália');
  assert.equal(romePtMeta.theme, 'Coliseu, Fórum Romano e Ruas de Monti');
  assert.equal(romePtMeta.openBtnLabel, 'Abrir Atlas Demo de Roma');

  // 3. Helper function with EN dictionary switches seamlessly to English
  const tEn = (key: string, opts?: Record<string, any>) => {
    let val = translations.en[key] ?? opts?.defaultValue ?? key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        if (k !== 'defaultValue') {
          val = val.replace(`{{${k}}}`, String(v));
        }
      }
    }
    return val;
  };

  const lisbonEnMeta = getLocalizedDemoTripMeta(lisbon, tEn);
  const romeEnMeta = getLocalizedDemoTripMeta(rome, tEn);

  assert.equal(lisbonEnMeta.locationTitle, 'Lisbon, Portugal');
  assert.equal(lisbonEnMeta.openBtnLabel, 'Open Lisbon Demo Atlas');

  assert.equal(romeEnMeta.locationTitle, 'Rome, Italy');
  assert.equal(romeEnMeta.theme, 'Colosseum, Roman Forum & Monti Backstreets');
  assert.equal(romeEnMeta.openBtnLabel, 'Open Rome Demo Atlas');
});

test('Sprint 21: AI Grounding, Noun Preservation, sanitizeItineraryForAI, Multi-Option Proposals, and Non-Blocking Budget Guard', async () => {
  const {
    CHAT_ASSISTANT_PT_DIRECTIVE,
    PROPER_NOUN_PRESERVATION_DIRECTIVE,
    NON_LATIN_SCRIPT_DIRECTIVE,
    MULTI_OPTION_PROPOSALS_DIRECTIVE,
    sanitizeItineraryForAI,
    buildChatAssistantSystemPrompt,
    evaluateBudgetGuard,
    computeProposalPriceDifference,
    computeTripTotalCost,
    deduplicateAndMergeProposals,
  } = await import('./domainLogic');

  const lisbonBundle = DEMO_TRIPS['demo-lisbon-4d'];

  // 1. System Prompt Directives: PT-PT strictness, Proper Noun preservation, Non-Latin Script rule, Multi-Option rule
  const chatSysPrompt = buildChatAssistantSystemPrompt(lisbonBundle);
  assert.ok(chatSysPrompt.includes(CHAT_ASSISTANT_PT_DIRECTIVE));
  assert.ok(chatSysPrompt.includes(PROPER_NOUN_PRESERVATION_DIRECTIVE));
  assert.ok(chatSysPrompt.includes(NON_LATIN_SCRIPT_DIRECTIVE));
  assert.ok(chatSysPrompt.includes(MULTI_OPTION_PROPOSALS_DIRECTIVE));
  assert.ok(chatSysPrompt.includes('景福宫 (Palácio Gyeongbokgung)'));

  // 2. Optimized Context Injection: sanitizeItineraryForAI strips UI-specific & redundant properties
  const sanitized = sanitizeItineraryForAI(lisbonBundle);
  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.destination, 'Lisboa');
  assert.equal(sanitized.totalBudget, 1050);
  assert.equal(sanitized.days.length, 4);
  assert.ok(!serialized.includes('"lat"'), 'Sanitized JSON must strip lat coordinates');
  assert.ok(!serialized.includes('"lng"'), 'Sanitized JSON must strip lng coordinates');
  assert.ok(!serialized.includes('"isPriceVerified"'), 'Sanitized JSON must strip isPriceVerified flags');
  assert.ok(!serialized.includes('"priceConfidence"'), 'Sanitized JSON must strip priceConfidence');
  assert.ok(!serialized.includes('"hoursConfidence"'), 'Sanitized JSON must strip hoursConfidence');
  assert.ok(!serialized.includes('"votes"'), 'Sanitized JSON must strip votes');

  // 3. Multi-Option Proposals (2 to 3 distinct alternatives preserved side-by-side without collapsing)
  const day1 = lisbonBundle.days[0];
  const targetAct = day1.activities[0]; // Castelo de São Jorge (€15 mid)
  const threeProposals = [
    {
      id: 'prop-opt-1',
      dayId: day1.id,
      dayNumber: 1,
      type: 'replace' as const,
      targetActivityId: targetAct.id,
      targetActivityTitle: targetAct.title,
      payload: {
        ...targetAct,
        id: 'opt-1',
        title: 'Miradouro da Senhora do Monte',
        selectedTier: 'budget' as const,
      },
      reason: 'Opção 1 (Económico · 0€): Miradouro autêntico.',
      source: 'chat' as const,
      status: 'pending' as const,
    },
    {
      id: 'prop-opt-2',
      dayId: day1.id,
      dayNumber: 1,
      type: 'replace' as const,
      targetActivityId: targetAct.id,
      targetActivityTitle: targetAct.title,
      payload: {
        ...targetAct,
        id: 'opt-2',
        title: 'Museu Nacional do Azulejo',
        selectedTier: 'mid' as const,
      },
      reason: 'Opção 2 (Intermédio · 15€): Claustros históricos.',
      source: 'chat' as const,
      status: 'pending' as const,
    },
    {
      id: 'prop-opt-3',
      dayId: day1.id,
      dayNumber: 1,
      type: 'replace' as const,
      targetActivityId: targetAct.id,
      targetActivityTitle: targetAct.title,
      payload: {
        ...targetAct,
        id: 'opt-3',
        title: 'Clube de Fado',
        selectedTier: 'premium' as const,
      },
      reason: 'Opção 3 (Premium · 45€): Experiência exclusiva em Alfama.',
      source: 'chat' as const,
      status: 'pending' as const,
    },
  ];

  const mergedMulti = deduplicateAndMergeProposals([], threeProposals, lisbonBundle.days);
  assert.equal(
    mergedMulti.length,
    3,
    'All 3 distinct alternative proposals for the same activity slot must coexist side-by-side'
  );

  // 4. Non-Blocking Budget Guard: prospectiveTotal = currentTotal + priceDifference > targetBudget
  const currentTotal = computeTripTotalCost(lisbonBundle.days).total; // 1035€
  const targetBudget = lisbonBundle.trip.totalBudget; // 1050€
  assert.equal(currentTotal, 1035);
  assert.equal(targetBudget, 1050);

  // Option 1 (Budget, 0€ vs 15€ => delta -15€): 1020€ <= 1050€ (does not exceed)
  const diffOpt1 = computeProposalPriceDifference(lisbonBundle.days, threeProposals[0]);
  assert.equal(diffOpt1, -15);
  const guardOpt1 = evaluateBudgetGuard({
    currentTotal,
    priceDifference: diffOpt1,
    targetBudget,
  });
  assert.equal(guardOpt1.exceedsBudget, false);
  assert.equal(guardOpt1.prospectiveTotal, 1020);

  // Option 3 (Premium, 45€ vs 15€ => delta +30€): 1065€ > 1050€ (exceeds budget!)
  const diffOpt3 = computeProposalPriceDifference(lisbonBundle.days, threeProposals[2]);
  assert.equal(diffOpt3, 30);
  const guardOpt3 = evaluateBudgetGuard({
    currentTotal,
    priceDifference: diffOpt3,
    targetBudget,
  });
  assert.equal(guardOpt3.exceedsBudget, true);
  assert.equal(guardOpt3.prospectiveTotal, 1065);
  assert.equal(
    guardOpt3.warningMessage,
    'Atenção: Esta alteração vai colocar o custo total (1065€) acima do seu limite (1050€). Deseja continuar?'
  );
});

test('Sprint 22: Firebase Auth error code extraction and PT-PT localization mapping', async () => {
  const { extractFirebaseAuthErrorCode, mapFirebaseAuthErrorToPt } = await import('./domainLogic');

  assert.equal(
    extractFirebaseAuthErrorCode({ code: 'auth/invalid-credential' }),
    'auth/invalid-credential'
  );
  assert.equal(
    extractFirebaseAuthErrorCode(new Error('Firebase: Error (auth/email-already-in-use).')),
    'auth/email-already-in-use'
  );

  // Required exact PT-PT mappings
  assert.equal(
    mapFirebaseAuthErrorToPt({ code: 'auth/invalid-credential' }),
    'Email ou palavra-passe incorretos.'
  );
  assert.equal(
    mapFirebaseAuthErrorToPt(new Error('Firebase: Error (auth/invalid-credential).')),
    'Email ou palavra-passe incorretos.'
  );
  assert.equal(
    mapFirebaseAuthErrorToPt({ code: 'auth/email-already-in-use' }),
    'Já existe uma conta com este email.'
  );
  assert.equal(
    mapFirebaseAuthErrorToPt(new Error('Firebase: Error (auth/email-already-in-use).')),
    'Já existe uma conta com este email.'
  );
  assert.equal(
    mapFirebaseAuthErrorToPt({ code: 'auth/invalid-email' }),
    'O endereço de email introduzido não é válido.'
  );
  assert.equal(
    mapFirebaseAuthErrorToPt({ code: 'auth/weak-password' }),
    'A palavra-passe é demasiado fraca (mínimo de 6 caracteres).'
  );
});

test('Sprint 24: App-wide bilingual architecture, global AI prompt injection, proper noun rule, and 100% i18n dictionary key parity', async () => {
  const {
    buildGlobalLanguageDirective,
    buildUniversalProperNounDirective,
    buildChatAssistantSystemPrompt,
    normalizeTargetUiLanguage,
    evaluateBudgetGuard,
    mapFirebaseAuthError,
  } = await import('./domainLogic');
  const { buildGenerateItinerarySystemPrompt } = await import('../services/api');
  const { translations } = await import('../i18n/translations');

  // 1. Target language normalization
  assert.equal(normalizeTargetUiLanguage('en'), 'en');
  assert.equal(normalizeTargetUiLanguage('en-US'), 'en');
  assert.equal(normalizeTargetUiLanguage('pt'), 'pt-PT');
  assert.equal(normalizeTargetUiLanguage('pt-PT'), 'pt-PT');

  // 2. Global language directive & Universal Proper Noun Golden Rule in both EN and PT-PT
  const globalEn = buildGlobalLanguageDirective('en');
  assert.ok(
    globalEn.startsWith(
      'SYSTEM LANGUAGE: ENGLISH. You are strictly forbidden from generating any Portuguese text.'
    )
  );
  assert.ok(
    globalEn.includes(
      'You MUST generate all conversational text, descriptions, reasoning strings, and tips strictly in the provided target language: en. Do NOT mix languages.'
    )
  );
  const globalPt = buildGlobalLanguageDirective('pt-PT');
  assert.ok(
    globalPt.startsWith(
      'SYSTEM LANGUAGE: PORTUGUESE. You are strictly forbidden from generating any English text.'
    )
  );
  assert.ok(
    globalPt.includes(
      'You MUST generate all conversational text, descriptions, reasoning strings, and tips strictly in the provided target language: pt-PT. Do NOT mix languages.'
    )
  );

  const properNounEn = buildUniversalProperNounDirective('en');
  assert.equal(
    properNounEn,
    'You are STRICTLY FORBIDDEN from translating proper nouns. Names of specific venues, museums, restaurants, neighborhoods, and streets MUST remain in their original local language or international English, regardless of the en.'
  );
  const properNounPt = buildUniversalProperNounDirective('pt-PT');
  assert.equal(
    properNounPt,
    'You are STRICTLY FORBIDDEN from translating proper nouns. Names of specific venues, museums, restaurants, neighborhoods, and streets MUST remain in their original local language or international English, regardless of the pt-PT.'
  );

  // 3. Verify Initial Trip Generation & Chat Assistant system prompts inject both directives for EN and PT-PT
  const genPromptEn = buildGenerateItinerarySystemPrompt('Rome', 'Italy', [], '', 'en');
  assert.ok(genPromptEn.includes(globalEn));
  assert.ok(genPromptEn.includes(properNounEn));

  const genPromptPt = buildGenerateItinerarySystemPrompt('Rome', 'Italy', [], '', 'pt-PT');
  assert.ok(genPromptPt.includes(globalPt));
  assert.ok(genPromptPt.includes(properNounPt));

  const lisbonBundle = DEMO_TRIPS['demo-lisbon-4d'];
  const chatPromptEn = buildChatAssistantSystemPrompt(lisbonBundle, 'en');
  assert.ok(chatPromptEn.includes(globalEn));
  assert.ok(chatPromptEn.includes(properNounEn));

  const chatPromptPt = buildChatAssistantSystemPrompt(lisbonBundle, 'pt-PT');
  assert.ok(chatPromptPt.includes(globalPt));
  assert.ok(chatPromptPt.includes(properNounPt));

  // 4. Verify Budget Guard & Auth Error Mapper respect active UI language (EN vs PT-PT)
  const guardEn = evaluateBudgetGuard(
    { currentTotal: 1035, priceDifference: 30, targetBudget: 1050, language: 'en' }
  );
  assert.equal(
    guardEn.warningMessage,
    'Warning: This change will raise the total cost (1065€) above your budget limit (1050€). Do you want to continue?'
  );

  assert.equal(
    mapFirebaseAuthError({ code: 'auth/invalid-credential' }, 'en'),
    'Incorrect email or password.'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/invalid-credential' }, 'pt-PT'),
    'Email ou palavra-passe incorretos.'
  );

  // 5. Verify 100% translation dictionary parity between English (en) and European Portuguese (pt)
  const enKeys = Object.keys(translations.en).sort();
  const ptKeys = Object.keys(translations.pt).sort();
  const missingInPt = enKeys.filter((k) => !(k in translations.pt));
  const missingInEn = ptKeys.filter((k) => !(k in translations.en));
  assert.deepEqual(missingInPt, [], `Keys in EN missing from PT: ${missingInPt.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Keys in PT missing from EN: ${missingInEn.join(', ')}`);

  for (const key of enKeys) {
    assert.ok(
      typeof (translations.en as Record<string, string>)[key] === 'string' &&
        (translations.en as Record<string, string>)[key].trim().length > 0,
      `Empty EN translation for key: ${key}`
    );
    assert.ok(
      typeof (translations.pt as Record<string, string>)[key] === 'string' &&
        (translations.pt as Record<string, string>)[key].trim().length > 0,
      `Empty PT translation for key: ${key}`
    );
  }
});

test('Sprint 25: User Profile Firestore schema (defaultGroupSize, defaultPaceLevel, savedInterests, savedRestrictions), restriction chip matching, and Smart Auto-Fill', async () => {
  const {
    DEFAULT_TRAVELER_PROFILE_PREFERENCES,
    buildInitialUserProfileDocument,
    normalizeUserProfileSnapshot,
    doesRestrictionMatchChip,
    toggleRestrictionInList,
    applyUserProfileToTripDraft,
    createDefaultTripWizardDraft,
  } = await import('./domainLogic');
  const { SPECIAL_PREFERENCE_CHIPS } = await import('../services/api');

  // 1. Default schema creation for users/{uid} on signup
  const initialDoc = buildInitialUserProfileDocument({
    uid: 'user-abc-123',
    name: 'Joana Silva',
    email: 'joana@example.pt',
  });
  assert.equal(initialDoc.id, 'user-abc-123');
  assert.equal(initialDoc.name, 'Joana Silva');
  assert.equal(initialDoc.email, 'joana@example.pt');
  assert.equal(initialDoc.defaultGroupSize, DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultGroupSize);
  assert.equal(initialDoc.defaultPaceLevel, DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultPaceLevel);
  assert.deepEqual(initialDoc.savedInterests, ['food', 'history', 'viewpoints']);
  assert.deepEqual(initialDoc.savedRestrictions, []);

  // 2. Custom profile snapshot normalization with savedInterests & savedRestrictions (e.g., 'Vegan', 'Reduced Mobility')
  const normalized = normalizeUserProfileSnapshot('user-abc-123', {
    id: 'user-abc-123',
    name: 'Joana Silva',
    email: 'joana@example.pt',
    defaultGroupSize: 4,
    defaultPaceLevel: 2,
    savedInterests: ['food', 'art', 'nature'],
    savedRestrictions: ['Vegan', 'Reduced Mobility'],
  });
  assert.equal(normalized.defaultGroupSize, 4);
  assert.equal(normalized.defaultPaceLevel, 2);
  assert.deepEqual(normalized.savedInterests, ['food', 'art', 'nature']);
  assert.deepEqual(normalized.savedRestrictions, ['Vegan', 'Reduced Mobility']);

  // 3. Restriction chip matching supports both shorthand ('Vegan', 'Reduced Mobility') and full localized labels
  const vegChip = SPECIAL_PREFERENCE_CHIPS.find((c) => c.id === 'diet_veg')!;
  const mobilityChip = SPECIAL_PREFERENCE_CHIPS.find((c) => c.id === 'reduced_mobility')!;
  const kidsChip = SPECIAL_PREFERENCE_CHIPS.find((c) => c.id === 'kids_family')!;

  assert.equal(doesRestrictionMatchChip(normalized.savedRestrictions, vegChip), true);
  assert.equal(doesRestrictionMatchChip(normalized.savedRestrictions, mobilityChip), true);
  assert.equal(doesRestrictionMatchChip(normalized.savedRestrictions, kidsChip), false);

  // Toggling off an active restriction removes it immutably
  const afterRemoveVeg = toggleRestrictionInList(normalized.savedRestrictions, vegChip);
  assert.equal(doesRestrictionMatchChip(afterRemoveVeg, vegChip), false);
  assert.equal(doesRestrictionMatchChip(afterRemoveVeg, mobilityChip), true);

  // Toggling on an inactive restriction adds it immutably
  const afterAddKids = toggleRestrictionInList(afterRemoveVeg, kidsChip);
  assert.equal(doesRestrictionMatchChip(afterAddKids, kidsChip), true);

  // 4. Smart Auto-Fill into New Trip form draft state (immutably)
  const baseDraft = createDefaultTripWizardDraft(null);
  const autoFilled = applyUserProfileToTripDraft(baseDraft, normalized);

  assert.equal(autoFilled.travelersCount, 4);
  assert.equal(autoFilled.groupEnabled, true);
  assert.equal(autoFilled.defaultPace, 2);
  assert.deepEqual(autoFilled.selectedInterests, ['food', 'art', 'nature']);
  assert.deepEqual(autoFilled.specialPreferences, ['Vegan', 'Reduced Mobility']);
  // Verify original baseDraft was not mutated
  assert.equal(baseDraft.travelersCount, 2);
  assert.equal(baseDraft.defaultPace, 3);
});

test('Sprint 28: Nuclear language toggle prefix (EN vs PT-PT) and existing itinerary auto-translation', async () => {
  const {
    NUCLEAR_LANGUAGE_PREFIX_EN,
    NUCLEAR_LANGUAGE_PREFIX_PT,
    buildNuclearLanguagePrefix,
    buildChatAssistantSystemPrompt,
    translateItineraryBundleDeterministic,
  } = await import('./domainLogic');
  const { buildGenerateItinerarySystemPrompt } = await import('../services/api');

  // 1. Verify exact nuclear prefixes
  assert.equal(
    buildNuclearLanguagePrefix('en'),
    'SYSTEM LANGUAGE: ENGLISH. You are strictly forbidden from generating any Portuguese text.'
  );
  assert.equal(
    buildNuclearLanguagePrefix('pt-PT'),
    'SYSTEM LANGUAGE: PORTUGUESE. You are strictly forbidden from generating any English text.'
  );

  // 2. Verify AI generation & chat prompts strictly start with the nuclear language prefix
  const genEn = buildGenerateItinerarySystemPrompt('Rome', 'Italy', [], '', 'en');
  assert.ok(genEn.startsWith(NUCLEAR_LANGUAGE_PREFIX_EN));

  const genPt = buildGenerateItinerarySystemPrompt('Rome', 'Italy', [], '', 'pt-PT');
  assert.ok(genPt.startsWith(NUCLEAR_LANGUAGE_PREFIX_PT));

  const chatEn = buildChatAssistantSystemPrompt(DEMO_TRIPS['demo-lisbon-4d'], 'en');
  assert.ok(chatEn.startsWith(NUCLEAR_LANGUAGE_PREFIX_EN));

  const chatPt = buildChatAssistantSystemPrompt(DEMO_TRIPS['demo-lisbon-4d'], 'pt-PT');
  assert.ok(chatPt.startsWith(NUCLEAR_LANGUAGE_PREFIX_PT));

  // 3. Verify existing itinerary auto-translation between EN and PT-PT preserves proper nouns and translates descriptions/themes
  const lisbonPt = translateItineraryBundleDeterministic(DEMO_TRIPS['demo-lisbon-4d'], 'pt-PT');
  assert.equal(lisbonPt.days[0].theme, 'Alma de Alfama, Azulejos e Pôr do Sol no Tejo');
  assert.equal(
    lisbonPt.days[0].activities[0].description,
    'Cidadela mourisca no topo da colina com vistas panorâmicas sobre os telhados de terracota e o estuário do Tejo.'
  );
  assert.ok(lisbonPt.days[0].activities[0].title.includes('Castelo de São Jorge'));

  const lisbonEn = translateItineraryBundleDeterministic(lisbonPt, 'en');
  assert.equal(lisbonEn.days[0].theme, 'Soul of Alfama, Azulejos & Tagus Sunset');
  assert.equal(
    lisbonEn.days[0].activities[0].description,
    'Moorish hilltop citadel with sweeping panoramas over terracotta rooftops and the Tagus estuary.'
  );
  assert.ok(lisbonEn.days[0].activities[0].title.includes('Castelo de São Jorge'));
});

test('Sprint 30: Infinite loading bugfix — 15000ms timeout guard, console.error logging, error toast, and finally state recovery', async () => {
  const {
    TRANSLATION_TIMEOUT_MS,
    fetchWithTranslationTimeout,
    runAutoTranslateWithRecovery,
  } = await import('./domainLogic');
  const { translateTripItinerary } = await import('../services/api');

  // 1. Default timeout constant is strictly 15000ms (15 seconds)
  assert.equal(TRANSLATION_TIMEOUT_MS, 15000);

  // 2. Timeout guard aborts a hanging fetch request and rejects with AbortError
  const hangingFetch = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason || new Error('Aborted'));
      });
    })) as typeof fetch;

  await assert.rejects(
    () => fetchWithTranslationTimeout('/api/ai/translate-itinerary', { method: 'POST' }, 35, hangingFetch),
    (err: any) => {
      assert.equal(err.name, 'AbortError');
      assert.ok(String(err.message).includes('timed out after 35ms'));
      return true;
    }
  );

  // 3. Recovery wrapper guarantees setIsTranslating(false) in finally on success
  const loadingStatesSuccess: boolean[] = [];
  let savedBundleSuccess: any = null;
  const successRes = await runAutoTranslateWithRecovery({
    bundle: DEMO_TRIPS['demo-lisbon-4d'],
    activeLanguage: 'en',
    translateFn: (b, lang) => translateTripItinerary(b, lang),
    onSuccess: (b) => {
      savedBundleSuccess = b;
    },
    setIsTranslating: (state) => loadingStatesSuccess.push(state),
  });
  assert.equal(successRes.ok, true);
  assert.deepEqual(loadingStatesSuccess, [true, false]);
  assert.equal(savedBundleSuccess.days[0].theme, 'Soul of Alfama, Azulejos & Tagus Sunset');

  // 4. Recovery wrapper guarantees setIsTranslating(false) in finally, logs console.error("Translation API failed:", error), and triggers "Erro ao traduzir. Tente novamente." when API times out or fails
  const loadingStatesFailure: boolean[] = [];
  const toastMessages: string[] = [];
  const loggedErrors: any[][] = [];
  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    loggedErrors.push(args);
  };

  try {
    const failRes = await runAutoTranslateWithRecovery({
      bundle: {
        ...DEMO_TRIPS['demo-lisbon-4d'],
        trip: { ...DEMO_TRIPS['demo-lisbon-4d'].trip, isDemo: false },
      },
      activeLanguage: 'pt-PT',
      translateFn: (b, lang) =>
        translateTripItinerary(b, lang, {
          forceLiveApi: true,
          timeoutMs: 30,
          fetchImpl: hangingFetch,
        }),
      onSuccess: () => {},
      setIsTranslating: (state) => loadingStatesFailure.push(state),
      onErrorToast: (msg) => toastMessages.push(msg),
    });

    assert.equal(failRes.ok, false);
    // CRITICAL: loading state started as true and was strictly reset to false in finally
    assert.deepEqual(loadingStatesFailure, [true, false]);
    // Error toast triggered with exact PT-PT message
    assert.deepEqual(toastMessages, ['Erro ao traduzir. Tente novamente.']);
    // console.error("Translation API failed:", error) was logged
    assert.equal(loggedErrors.length, 1);
    assert.equal(loggedErrors[0][0], 'Translation API failed:');
  } finally {
    console.error = origConsoleError;
  }
});

test('Dynamic Budget Recalculation: Group multiplier (sumOfPerPersonCosts * travelers), defensive math, and per-person breakdown', async () => {
  const {
    computeDaySubtotal,
    computeTripTotalCost,
    calculateDaySubtotals,
    calculateTripTotal,
  } = await import('./domainLogic');

  const lisbonDemo = JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d'])) as FullTripBundle;
  const day1 = lisbonDemo.days[0];
  const travelers = lisbonDemo.trip.travelersCount; // 3 travelers

  // Day 1: accommodation = 138, transit = 0, per-person meals = 61 (9+24+28), per-person activities = 91 (15+28+14+34)
  // For 3 travelers: mealsCost = 61 * 3 = 183, activitiesCost = 91 * 3 = 273
  // Group day total = 138 + 0 + (61 + 91) * 3 = 138 + 456 = 594
  // Per-person day total = Math.round(594 / 3) = 198
  const day1Group = calculateDaySubtotals(day1, travelers);
  assert.equal(day1Group.accommodationCost, 138);
  assert.equal(day1Group.transitCost, 0);
  assert.equal(day1Group.mealsCost, 183);
  assert.equal(day1Group.activitiesCost, 273);
  assert.equal(day1Group.total, 594);
  assert.equal(day1Group.perPersonTotal, 198);

  // Full 4-day trip with 3 travelers
  const tripGroup = calculateTripTotal(lisbonDemo.days, travelers);
  assert.equal(
    tripGroup.perPersonTotal,
    Math.round(tripGroup.total / travelers)
  );
  assert.ok(tripGroup.total > computeTripTotalCost(lisbonDemo.days, 1).total);

  // Defensive math: undefined prices fallback to 0 and Math.round() prevents infinite decimals
  const sparseDay: any = {
    accommodation: { name: 'Test Stay', type: 'hotel', price: undefined },
    intercity_transit: { method: 'Train', duration: '1h', price: undefined },
    meals: {
      breakfast: { name: 'Cafe', estimatedPrice: undefined },
      lunch: { name: 'Bistro', estimatedPrice: 12.3333 },
      dinner: undefined,
    },
    activities: [
      {
        id: 'sparse-1',
        title: 'Museum',
        selectedTier: 'mid',
        costOptions: {
          budget: { title: 'B', estimatedCost: undefined },
          mid: { title: 'M', estimatedCost: 10.3333 },
          premium: { title: 'P', estimatedCost: undefined },
        },
      },
    ],
  };
  const sparseRes = computeDaySubtotal(sparseDay, 3);
  // (12.3333 + 10.3333) * 3 = 67.9998 -> Math.round = 68
  assert.equal(sparseRes.accommodationCost, 0);
  assert.equal(sparseRes.transitCost, 0);
  assert.equal(sparseRes.total, 68);
  assert.equal(sparseRes.perPersonTotal, Math.round(68 / 3));
});

test('Input Budget Normalization: perPersonBudget = inputTotalBudget / travelers and budget tier evaluation', async () => {
  const {
    normalizeInputBudget,
    evaluateBudgetTierFromPerPersonBudget,
    sanitizeItineraryForAI,
    buildChatAssistantSystemPrompt,
  } = await import('./domainLogic');
  const { buildGenerateItinerarySystemPrompt } = await import('../services/api');

  // Group of 3 travelers with €900 total budget -> €300/person -> 'budget' tier (NOT 'premium')
  const groupBudgetNorm = normalizeInputBudget(900, 3);
  assert.equal(groupBudgetNorm.inputTotalBudget, 900);
  assert.equal(groupBudgetNorm.travelers, 3);
  assert.equal(groupBudgetNorm.perPersonBudget, 300);
  assert.equal(groupBudgetNorm.budgetTier, 'budget');

  // Solo traveler with €900 total budget -> €900/person -> 'premium' tier
  const soloPremiumNorm = normalizeInputBudget(900, 1);
  assert.equal(soloPremiumNorm.perPersonBudget, 900);
  assert.equal(soloPremiumNorm.budgetTier, 'premium');

  // Group of 2 travelers with €1100 total budget -> €550/person -> 'mid' tier
  const coupleMidNorm = normalizeInputBudget(1100, 2);
  assert.equal(coupleMidNorm.perPersonBudget, 550);
  assert.equal(coupleMidNorm.budgetTier, 'mid');

  assert.equal(evaluateBudgetTierFromPerPersonBudget(280), 'budget');
  assert.equal(evaluateBudgetTierFromPerPersonBudget(500), 'mid');
  assert.equal(evaluateBudgetTierFromPerPersonBudget(950), 'premium');

  // AI system prompt must inject the normalized per-person budget and tier
  const genPrompt = buildGenerateItinerarySystemPrompt(
    'Lisboa',
    'Portugal',
    [],
    '',
    'pt-PT',
    900,
    3
  );
  assert.ok(genPrompt.includes('€300/person'));
  assert.ok(genPrompt.includes('"budget"'));

  const lisbonBundle = DEMO_TRIPS['demo-lisbon-4d']; // totalBudget: 1050, travelersCount: 3 -> €350/person ('mid')
  const sanitized = sanitizeItineraryForAI(lisbonBundle);
  assert.equal(sanitized.perPersonBudget, 350);
  assert.equal(sanitized.budgetTier, 'mid');

  const chatPrompt = buildChatAssistantSystemPrompt(lisbonBundle, 'en');
  assert.ok(chatPrompt.includes('€350/person'));
});

test('Active Trip Persistence (atlasgenie_active_trip) & Undo History Stack (max 10 deep-cloned states + instant budget recalculation)', async () => {
  const {
    ACTIVE_TRIP_STORAGE_KEY,
    MAX_TRIP_HISTORY_LENGTH,
    pushTripHistoryState,
    popTripHistoryState,
    serializeActiveTripToStorage,
    parseActiveTripFromStorage,
    computeDaySubtotal,
    computeTripTotalCost,
  } = await import('./domainLogic');

  assert.equal(ACTIVE_TRIP_STORAGE_KEY, 'atlasgenie_active_trip');
  assert.equal(MAX_TRIP_HISTORY_LENGTH, 10);

  const initialBundle = JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d'])) as FullTripBundle;
  const travelers = initialBundle.trip.travelersCount; // 3

  // 1. Serialize & rehydrate active trip from localStorage payload
  const rawJson = serializeActiveTripToStorage(initialBundle);
  const rehydrated = parseActiveTripFromStorage(rawJson);
  assert.ok(rehydrated);
  assert.equal(rehydrated.trip.id, 'demo-lisbon-4d');
  assert.equal(rehydrated.days.length, 4);
  assert.equal(parseActiveTripFromStorage(null), null);
  assert.equal(parseActiveTripFromStorage('{bad-json'), null);
  assert.equal(parseActiveTripFromStorage('{"trip":{}}'), null);

  // 2. Push before mutating and verify deep clone isolation
  const initialTripTotal = computeTripTotalCost(initialBundle.days, travelers);
  const initialDay1Subtotal = computeDaySubtotal(initialBundle.days[0], travelers);
  assert.equal(initialTripTotal.total, 2033);
  assert.equal(initialTripTotal.perPersonTotal, 678);
  assert.equal(initialDay1Subtotal.total, 594);
  assert.equal(initialDay1Subtotal.perPersonTotal, 198);

  let history: FullTripBundle[] = [];
  history = pushTripHistoryState(history, initialBundle);
  assert.equal(history.length, 1);

  // Mutate initialBundle to Premium tier across Day 1
  const mutatedBundle: FullTripBundle = {
    ...initialBundle,
    days: initialBundle.days.map((d, idx) =>
      idx === 0
        ? {
            ...d,
            accommodation: d.accommodation
              ? { ...d.accommodation, selectedTier: 'premium', price: 295 }
              : d.accommodation,
            activities: d.activities.map((a) => ({ ...a, selectedTier: 'premium' as const })),
          }
        : d
    ),
  };

  // Mutating the current bundle must NOT mutate the snapshot stored in history[0]
  assert.equal(history[0].days[0].activities[0].selectedTier, 'mid');
  const mutatedTripTotal = computeTripTotalCost(mutatedBundle.days, travelers);
  const mutatedDay1Subtotal = computeDaySubtotal(mutatedBundle.days[0], travelers);
  assert.ok(mutatedTripTotal.total > initialTripTotal.total);
  assert.ok(mutatedDay1Subtotal.total > initialDay1Subtotal.total);

  // 3. Pop from history (handleUndo) restores exact prior state and recalculates totals immediately
  const { restoredState, nextHistory } = popTripHistoryState(history);
  assert.ok(restoredState);
  assert.equal(nextHistory.length, 0);

  const restoredTripTotal = computeTripTotalCost(restoredState.days, travelers);
  const restoredDay1Subtotal = computeDaySubtotal(restoredState.days[0], travelers);
  assert.equal(restoredTripTotal.total, 2033);
  assert.equal(restoredTripTotal.perPersonTotal, 678);
  assert.equal(restoredDay1Subtotal.total, 594);
  assert.equal(restoredDay1Subtotal.perPersonTotal, 198);

  // 4. Cap history at MAX_TRIP_HISTORY_LENGTH (10 actions)
  let cappedHistory: FullTripBundle[] = [];
  for (let i = 1; i <= 14; i++) {
    const stepState: FullTripBundle = {
      ...initialBundle,
      trip: { ...initialBundle.trip, totalBudget: 1000 + i * 10 },
    };
    cappedHistory = pushTripHistoryState(cappedHistory, stepState);
  }
  assert.equal(cappedHistory.length, 10);
  // Oldest 4 states (1..4) were dropped; oldest remaining is step 5 (1050) and newest is step 14 (1140)
  assert.equal(cappedHistory[0].trip.totalBudget, 1050);
  assert.equal(cappedHistory[9].trip.totalBudget, 1140);
});

test('Synchronous Lazy Initialization, Guarded Persistence (hasValidItineraryData), and Form Draft Key Isolation (atlasgenie_form_draft)', async () => {
  const {
    ACTIVE_TRIP_STORAGE_KEY,
    FORM_DRAFT_STORAGE_KEY,
    TRIP_DRAFT_STORAGE_KEY,
    hasValidItineraryData,
    readActiveTripFromLocalStorage,
    writeActiveTripToLocalStorageGuarded,
  } = await import('./domainLogic');

  // 1. Storage keys are strictly distinct so form draft clear never touches active trip
  assert.equal(ACTIVE_TRIP_STORAGE_KEY, 'atlasgenie_active_trip');
  assert.equal(FORM_DRAFT_STORAGE_KEY, 'atlasgenie_form_draft');
  assert.notEqual(FORM_DRAFT_STORAGE_KEY, ACTIVE_TRIP_STORAGE_KEY);
  assert.notEqual(TRIP_DRAFT_STORAGE_KEY, ACTIVE_TRIP_STORAGE_KEY);

  // 2. Guard validation rejects null, empty objects, empty days, and days with empty activities
  assert.equal(hasValidItineraryData(null), false);
  assert.equal(hasValidItineraryData({}), false);
  assert.equal(hasValidItineraryData({ trip: { id: 'trip-1' }, days: [] }), false);
  assert.equal(
    hasValidItineraryData({
      trip: { id: 'trip-1' },
      days: [{ id: 'd1', activities: [], planB: [] }],
    }),
    false
  );

  const generatedTrip: FullTripBundle = {
    ...JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d'])),
    trip: {
      ...DEMO_TRIPS['demo-lisbon-4d'].trip,
      id: 'trip-generated-madrid-1',
      destination: 'Madrid, Spain',
      isDemo: false,
    },
  };
  assert.equal(hasValidItineraryData(generatedTrip), true);

  // 3. In-memory mock Storage to verify guarded setItem / removeItem lifecycle
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  // Write valid generated trip
  const wroteValid = writeActiveTripToLocalStorageGuarded(generatedTrip, { storage: mockStorage });
  assert.equal(wroteValid, true);
  assert.equal(readActiveTripFromLocalStorage(mockStorage)?.trip.id, 'trip-generated-madrid-1');

  // Attempt to overwrite with null or empty activities on mount MUST be blocked by guard
  const wroteNull = writeActiveTripToLocalStorageGuarded(null, { storage: mockStorage });
  assert.equal(wroteNull, false);
  const emptyActivitiesBundle: any = {
    ...generatedTrip,
    days: [{ ...generatedTrip.days[0], activities: [], planB: [] }],
  };
  const wroteEmpty = writeActiveTripToLocalStorageGuarded(emptyActivitiesBundle, {
    storage: mockStorage,
  });
  assert.equal(wroteEmpty, false);
  assert.equal(
    readActiveTripFromLocalStorage(mockStorage)?.trip.id,
    'trip-generated-madrid-1',
    'Valid localStorage data must NEVER be overwritten by null or empty state on mount'
  );

  // Attempt to overwrite user-generated trip with static demo fallback (`demo-lisbon-4d`) on mount MUST be blocked
  const wroteDemoFallback = writeActiveTripToLocalStorageGuarded(DEMO_TRIPS['demo-lisbon-4d'], {
    storage: mockStorage,
  });
  assert.equal(wroteDemoFallback, false);
  assert.equal(readActiveTripFromLocalStorage(mockStorage)?.trip.id, 'trip-generated-madrid-1');

  // Clearing form draft (`atlasgenie_form_draft`) leaves `atlasgenie_active_trip` intact
  mockStorage.setItem(FORM_DRAFT_STORAGE_KEY, '{"country":"Spain"}');
  mockStorage.removeItem(FORM_DRAFT_STORAGE_KEY);
  assert.equal(readActiveTripFromLocalStorage(mockStorage)?.trip.id, 'trip-generated-madrid-1');

  // Explicit user deletion removes `atlasgenie_active_trip`
  const cleared = writeActiveTripToLocalStorageGuarded(null, {
    storage: mockStorage,
    explicitClear: true,
  });
  assert.equal(cleared, true);
  assert.equal(readActiveTripFromLocalStorage(mockStorage), null);
});

test('Bug Triage: new_trip_draft Persistence, Strict Budget Enforcement (AI Prompting & Cap), and Date Min Validation', async () => {
  const {
    NEW_TRIP_DRAFT_STORAGE_KEY,
    buildStrictBudgetConstraintDirective,
    computeTripTotalCost,
    createDefaultTripWizardDraft,
    enforceStrictBudgetCapOnDays,
    getTodayIsoDateString,
    normalizeInputBudget,
    parseTripWizardDraft,
    serializeTripWizardDraft,
  } = await import('./domainLogic');

  // 1. new_trip_draft storage key & round-trip serialization
  assert.equal(NEW_TRIP_DRAFT_STORAGE_KEY, 'new_trip_draft');
  const draftInput = {
    country: 'Spain',
    cities: ['Madrid', 'Toledo'],
    cityInput: '',
    letAiDecideCities: false,
    startDate: '2026-11-20',
    endDate: '2026-11-24',
    travelersCount: 4,
    totalBudget: 1600,
    selectedInterests: ['food', 'nightlife'],
    defaultPace: 4,
    groupEnabled: true,
    specialPreferences: ['Vegetarian / Vegan Diet'],
    customRequest: 'We want rooftop tapas bars',
  };
  const serialized = serializeTripWizardDraft(draftInput);
  const restored = parseTripWizardDraft(serialized);
  assert.ok(restored);
  assert.equal(restored.country, 'Spain');
  assert.deepEqual(restored.cities, ['Madrid', 'Toledo']);
  assert.equal(restored.travelersCount, 4);
  assert.equal(restored.totalBudget, 1600);
  assert.equal(restored.customRequest, 'We want rooftop tapas bars');

  // 2. Strict Budget Enforcement: exact CRITICAL SYSTEM INSTRUCTION
  const { perPersonBudget } = normalizeInputBudget(1600, 4);
  assert.equal(perPersonBudget, 400);
  const strictDirective = buildStrictBudgetConstraintDirective(perPersonBudget);
  assert.equal(
    strictDirective,
    'You MUST STRICTLY adhere to the per-person budget of 400. The sum of all daily activities, meals, and accommodations MUST NOT exceed this exact number. This is a hard limit.'
  );

  const systemPrompt = buildGenerateItinerarySystemPrompt(
    'Madrid',
    'Spain',
    [],
    '',
    'en',
    1600,
    4
  );
  assert.ok(
    systemPrompt.includes(
      'You MUST STRICTLY adhere to the per-person budget of 400. The sum of all daily activities, meals, and accommodations MUST NOT exceed this exact number. This is a hard limit.'
    ),
    'System prompt must contain the exact strict per-person budget instruction'
  );

  // 3. Deterministic Budget Cap Enforcement on generated days
  const sampleDays = JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d'].days));
  const tightTotalBudget = 600;
  const groupTravelers = 3; // €200 per person across 4 days
  const uncalibratedTotals = computeTripTotalCost(sampleDays, groupTravelers);
  assert.ok(uncalibratedTotals.total > tightTotalBudget);

  const cappedDays = enforceStrictBudgetCapOnDays(sampleDays, tightTotalBudget, groupTravelers);
  const cappedTotals = computeTripTotalCost(cappedDays, groupTravelers);
  assert.ok(
    cappedTotals.total <= tightTotalBudget,
    `Capped trip total (${cappedTotals.total}) must not exceed totalBudget (${tightTotalBudget})`
  );
  assert.ok(
    cappedTotals.perPersonTotal <= 200,
    `Capped per-person total (${cappedTotals.perPersonTotal}) must not exceed perPersonBudget (200)`
  );

  // 4. Date min validation: todayIso is YYYY-MM-DD and default draft dates are never in the past
  const todayIso = getTodayIsoDateString();
  assert.match(todayIso, /^\d{4}-\d{2}-\d{2}$/);
  const defaultDraft = createDefaultTripWizardDraft();
  assert.ok(defaultDraft.startDate >= todayIso);
  assert.ok(defaultDraft.endDate >= defaultDraft.startDate);
});

test('37. JIT Translation Pipeline: system prompt, pure JSON merge, price/coordinate immutability, and language state sync', async () => {
  const {
    buildJitTranslateSystemPrompt,
    mergeJitTranslatedBundle,
    inferItineraryLanguage,
  } = await import('./domainLogic');
  const { requestJitTripTranslation } = await import('../services/api');

  // 1. Exact system prompt verification
  const promptEn = buildJitTranslateSystemPrompt('English (en)');
  assert.equal(
    promptEn,
    'You are a pure JSON translator. Translate all string values (titles, descriptions, reasoning) in the provided JSON to English (en). You MUST return the exact same JSON structure, keys, arrays, and numerical values. Do not alter prices or coordinates. Only translate the human-readable text.'
  );

  // 2. Demo itinerary has initial language 'pt'
  const originalBundle: FullTripBundle = JSON.parse(JSON.stringify(DEMO_TRIPS['demo-lisbon-4d']));
  assert.equal(originalBundle.language, 'pt');
  assert.equal(inferItineraryLanguage(originalBundle), 'pt');

  const origFirstAct = originalBundle.days[0].activities[0];
  const origLocation = { ...origFirstAct.location };
  const origMidCost = origFirstAct.costOptions.mid.estimatedCost;

  // 3. Simulate LLM candidate that translates text AND attempts to tamper with prices/coordinates
  const candidate = JSON.parse(JSON.stringify(originalBundle));
  candidate.days[0].theme = 'Historic Center, Belém & Tagus Sunset';
  candidate.days[0].activities[0].title = 'Guided Walk Through Alfama & Miradouro de Santa Luzia';
  candidate.days[0].activities[0].description = 'Morning stroll through Moorish alleys and viewpoints.';
  candidate.days[0].activities[0].whyThis = 'Matches historical culture interests with scenic views.';
  // Attempt to tamper with numerical price & coordinates (must be rejected by mergeJitTranslatedBundle)
  candidate.days[0].activities[0].costOptions.mid.estimatedCost = 8888;
  candidate.days[0].activities[0].location = { name: 'Fake', lat: 0, lng: 0, address: 'Fake' };

  const merged = mergeJitTranslatedBundle(originalBundle, candidate, 'en');
  assert.equal(merged.language, 'en');
  assert.equal(merged.trip.language, 'en');
  assert.equal(merged.days[0].theme, 'Historic Center, Belém & Tagus Sunset');
  assert.equal(merged.days[0].activities[0].title, 'Guided Walk Through Alfama & Miradouro de Santa Luzia');
  assert.equal(merged.days[0].activities[0].description, 'Morning stroll through Moorish alleys and viewpoints.');
  assert.equal(merged.days[0].activities[0].whyThis, 'Matches historical culture interests with scenic views.');

  // Numerical prices and coordinates MUST remain 100% identical to originalBundle
  assert.equal(merged.days[0].activities[0].costOptions.mid.estimatedCost, origMidCost);
  assert.deepEqual(merged.days[0].activities[0].location, origLocation);

  // 4. Verify requestJitTripTranslation calls /api/translate-trip and updates .language
  let calledUrl = '';
  let calledBody: Record<string, unknown> = {};
  const mockFetch: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ itinerary: merged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const translatedViaApi = await requestJitTripTranslation(originalBundle, 'en', {
    fetchImpl: mockFetch,
  });
  assert.equal(calledUrl, '/api/translate-trip');
  assert.equal(calledBody.uiLanguage, 'en');
  assert.equal(translatedViaApi.language, 'en');
  assert.equal(translatedViaApi.trip.language, 'en');
  assert.equal(translatedViaApi.days[0].activities[0].title, 'Guided Walk Through Alfama & Miradouro de Santa Luzia');
  assert.equal(translatedViaApi.days[0].activities[0].costOptions.mid.estimatedCost, origMidCost);
});

test('38. Bug Triage: Clean Firestore error formatting, Regional Mountain/Nature Geolocation Expansion, and Geographically Impossible Error Object', async () => {
  const {
    CUSTOM_ACTIVITY_GEOLOCATION_DIRECTIVE,
    buildCustomActivitySystemPrompt,
    formatCleanAuthOrFirestoreError,
    resolveRegionalCustomActivity,
  } = await import('./domainLogic');
  const { buildGenerateItinerarySystemPrompt } = await import('../services/api');

  // 1. Clean Firestore error formatting (never outputs raw JSON)
  const rawFirestoreJsonError = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'write',
      path: 'users/uid-123',
      authInfo: { userId: 'uid-123' },
    })
  );
  const cleanEn = formatCleanAuthOrFirestoreError(rawFirestoreJsonError, 'en');
  const cleanPt = formatCleanAuthOrFirestoreError(rawFirestoreJsonError, 'pt');
  assert.ok(!cleanEn.startsWith('{'), 'Must never return raw JSON');
  assert.ok(!cleanPt.startsWith('{'), 'Must never return raw JSON');
  assert.ok(cleanEn.includes('permissions'));
  assert.ok(cleanPt.includes('permissões'));

  // 2. Exact Geolocation System Prompt Instruction verification
  const expectedInstruction =
    "You are a precise geolocation engine. If the user's custom request implies nature, mountains, specific sports, or regional landmarks, you MUST expand your search radius to the wider metropolitan area or surrounding region. You MUST return real, existing venues/trails that match the request. NEVER fallback to generic city center walking tours. If the request is geographically impossible, return an explicit error object, do not hallucinate.";
  assert.equal(CUSTOM_ACTIVITY_GEOLOCATION_DIRECTIVE, expectedInstruction);

  const customSysPrompt = buildCustomActivitySystemPrompt('Lisbon', 'Portugal', 'en');
  assert.ok(customSysPrompt.includes(expectedInstruction));

  const itinerarySysPrompt = buildGenerateItinerarySystemPrompt(
    'Lisbon',
    'Portugal',
    [],
    'mountain hike nearby',
    'en',
    1200,
    2
  );
  assert.ok(itinerarySysPrompt.includes(expectedInstruction));

  // 3. Mountain hike request in Lisbon expands radius to Serra de Sintra (NOT Lisbon city center)
  const lisbonMountainRes = resolveRegionalCustomActivity({
    requestText: 'a mountain hike nearby',
    destination: 'Lisbon',
    country: 'Portugal',
    startTime: '09:00',
    estimatedCost: 15,
    baseCoords: { lat: 38.7139, lng: -9.1334 },
    uiLanguage: 'en',
  });
  assert.equal(lisbonMountainRes.error, undefined);
  assert.ok(lisbonMountainRes.activity);
  assert.ok(lisbonMountainRes.activity.title.includes('Serra de Sintra'));
  assert.equal(lisbonMountainRes.activity.category, 'nature');
  assert.equal(lisbonMountainRes.activity.isOutdoor, true);
  // Coordinates are in Serra de Sintra (~38.7804, -9.3906), well outside downtown Lisbon (-9.1334)
  assert.ok(Math.abs(lisbonMountainRes.activity.location.lng - -9.1334) > 0.15);

  // 4. Geographically impossible request returns an explicit error object and does NOT hallucinate an activity
  const impossibleSurfMadrid = resolveRegionalCustomActivity({
    requestText: 'ocean surfing and coral reef scuba diving',
    destination: 'Madrid',
    country: 'Spain',
    uiLanguage: 'en',
  });
  assert.ok(impossibleSurfMadrid.error);
  assert.equal(impossibleSurfMadrid.error.code, 'GEOGRAPHICALLY_IMPOSSIBLE');
  assert.equal(impossibleSurfMadrid.activity, undefined);

  const impossibleGlacierLisbon = resolveRegionalCustomActivity({
    requestText: 'glacier trek and northern lights',
    destination: 'Lisbon',
    country: 'Portugal',
    uiLanguage: 'en',
  });
  assert.ok(impossibleGlacierLisbon.error);
  assert.equal(impossibleGlacierLisbon.error.code, 'GEOGRAPHICALLY_IMPOSSIBLE');
  assert.equal(impossibleGlacierLisbon.activity, undefined);
});

test('39. Critical AI Hallucination Fix: Geographic Spoofing, Strict Intent Matching (Camping in Andorra), and Graceful Fallback', async () => {
  const {
    ANTI_SPOOFING_GEOFENCING_DIRECTIVE,
    STRICT_INTENT_MATCHING_DIRECTIVE,
    GRACEFUL_NO_HALLUCINATION_DIRECTIVE,
    buildChatAssistantSystemPrompt,
    buildCustomActivitySystemPrompt,
    isVenueSpoofedForDestination,
    isProposalIntentMismatched,
    resolveIntentAndRegionProposals,
    resolveRegionalCustomActivity,
    filterAndSanitizeProposalsForRegionAndIntent,
  } = await import('./domainLogic');

  // 1. Exact prompt constraint directives verification
  assert.equal(
    ANTI_SPOOFING_GEOFENCING_DIRECTIVE,
    "CRITICAL: You MUST NEVER append or stitch the target city's name to a venue from a different country to fake its location. Every suggested venue MUST physically exist in or near the requested target destination. If you use a tool like Google Places, strictly bound the search to the target coordinates/region."
  );
  assert.equal(
    STRICT_INTENT_MATCHING_DIRECTIVE,
    "You must strictly honor the activity type requested. If the user asks for 'camping', you MUST return campsites, nature parks, or outdoor reserves. Do not return restaurants, wine salons, or urban markets. If the exact request cannot be fulfilled, see the fallback rule."
  );
  assert.equal(
    GRACEFUL_NO_HALLUCINATION_DIRECTIVE,
    "If you cannot find real, verified venues that match both the geographic region AND the user's intent, DO NOT hallucinate. You must return an explicit error object or a specific message (e.g., 'No suitable camping sites found exactly in this area') so the UI can inform the user gracefully."
  );

  // Verify directives are injected into Chat Assistant, Custom Activity, and Itinerary Generation system prompts
  const chatSysPrompt = buildChatAssistantSystemPrompt(
    { destination: 'Andorra la Vella, Andorra', days: [] },
    'en'
  );
  assert.ok(chatSysPrompt.includes(ANTI_SPOOFING_GEOFENCING_DIRECTIVE));
  assert.ok(chatSysPrompt.includes(STRICT_INTENT_MATCHING_DIRECTIVE));
  assert.ok(chatSysPrompt.includes(GRACEFUL_NO_HALLUCINATION_DIRECTIVE));

  const customSysPrompt = buildCustomActivitySystemPrompt('Andorra la Vella', 'Andorra', 'en');
  assert.ok(customSysPrompt.includes(ANTI_SPOOFING_GEOFENCING_DIRECTIVE));
  assert.ok(customSysPrompt.includes(STRICT_INTENT_MATCHING_DIRECTIVE));
  assert.ok(customSysPrompt.includes(GRACEFUL_NO_HALLUCINATION_DIRECTIVE));

  const itinerarySysPrompt = buildGenerateItinerarySystemPrompt(
    'Andorra la Vella',
    'Andorra',
    ['Andorra la Vella'],
    'camping nearby',
    'en',
    1200,
    2
  );
  assert.ok(itinerarySysPrompt.includes(ANTI_SPOOFING_GEOFENCING_DIRECTIVE));
  assert.ok(itinerarySysPrompt.includes(STRICT_INTENT_MATCHING_DIRECTIVE));
  assert.ok(itinerarySysPrompt.includes(GRACEFUL_NO_HALLUCINATION_DIRECTIVE));

  // 2. Anti-Spoofing detection: Lisbon venues with "(Andorra la Vella)" stitched onto them MUST be flagged as spoofed
  assert.equal(
    isVenueSpoofedForDestination(
      'Mercado de Campo de Ourique & Tasca da Esquina (Andorra la Vella)',
      'Andorra la Vella'
    ),
    true
  );
  assert.equal(
    isVenueSpoofedForDestination(
      'Palácio Belmonte Private Wine Salon & Terrace (Andorra la Vella)',
      'Andorra la Vella'
    ),
    true
  );
  assert.equal(
    isVenueSpoofedForDestination(
      'Miradouro de Santa Catarina & Pharmacia Petiscos (Andorra)',
      'Andorra'
    ),
    true
  );
  // Real Andorra venues must NOT be flagged as spoofed
  assert.equal(
    isVenueSpoofedForDestination(
      'Camping Valira & Parc Central Mountain Basecamp',
      'Andorra la Vella'
    ),
    false
  );

  // 3. Strict Intent Matching: "camping nearby" in Andorra returns ONLY real Andorra campsites, nature parks, or outdoor reserves
  const andorraDay: Day = {
    id: 'day-andorra-1',
    tripId: 'trip-andorra',
    ownerId: 'u1',
    date: '2026-07-10',
    dayNumber: 1,
    city: 'Andorra la Vella',
    paceLevel: 3,
    paceScore: 45,
    activePlan: 'A',
    activities: [
      sampleActivity('act-and-1', 'Casa de la Vall Heritage Visit', '10:00', 90, 5, 10, 25),
    ],
    planB: [],
  };

  const andorraCampingRes = resolveIntentAndRegionProposals({
    destination: 'Andorra la Vella, Andorra',
    message: 'camping nearby',
    currentDay: andorraDay,
    uiLanguage: 'en',
  });

  assert.equal(andorraCampingRes.error, undefined);
  assert.equal(andorraCampingRes.proposals.length, 3);
  for (const prop of andorraCampingRes.proposals) {
    const payload = prop.payload;
    assert.ok(payload, 'Proposal must include concrete activity payload');
    assert.ok(!payload.title.includes('Mercado de Campo de Ourique'), 'Must never return Lisbon markets');
    assert.ok(!payload.title.includes('Palácio Belmonte'), 'Must never return Lisbon wine salons');
    assert.ok(!payload.title.includes('Miradouro de Santa Catarina'), 'Must never return Lisbon viewpoints');
    assert.equal(payload.category, 'nature');
    assert.equal(payload.isOutdoor, true);
    assert.equal(
      isProposalIntentMismatched(
        {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          locationName: payload.location?.name,
        },
        'camping nearby',
        'Andorra la Vella'
      ),
      false
    );
  }
  assert.ok(
    andorraCampingRes.proposals.some((p) => p.payload?.title.includes('Camping Valira')),
    'Should include verified Camping Valira in Andorra la Vella'
  );
  assert.ok(
    andorraCampingRes.proposals.some(
      (p) => p.payload?.title.includes('Sorteny') || p.payload?.title.includes('Comapedrosa')
    ),
    'Should include verified Andorra nature parks (Sorteny / Comapedrosa)'
  );

  // Custom activity modal for "camping nearby" in Andorra also returns real Camping Valira
  const customAndorraCamping = resolveRegionalCustomActivity({
    requestText: 'camping nearby',
    destination: 'Andorra la Vella',
    country: 'Andorra',
    uiLanguage: 'en',
  });
  assert.equal(customAndorraCamping.error, undefined);
  assert.ok(customAndorraCamping.activity);
  assert.ok(customAndorraCamping.activity.title.includes('Camping Valira'));
  assert.equal(customAndorraCamping.activity.category, 'nature');
  assert.equal(customAndorraCamping.activity.isOutdoor, true);

  // 4. Filter & Sanitize rejects spoofed Lisbon proposals when user asks for "camping nearby" in Andorra
  const spoofedProposals = [
    {
      id: 'spoof-1',
      dayId: 'day-andorra-1',
      dayNumber: 1,
      type: 'replace' as const,
      targetActivityId: 'act-and-1',
      payload: {
        ...sampleActivity(
          'act-spoof-1',
          'Mercado de Campo de Ourique & Tasca da Esquina (Andorra la Vella)',
          '12:00',
          90,
          8,
          14,
          28
        ),
        category: 'food' as const,
      },
      reason: 'Fits budget',
      source: 'chat' as const,
      status: 'pending' as const,
    },
    {
      id: 'spoof-2',
      dayId: 'day-andorra-1',
      dayNumber: 1,
      type: 'replace' as const,
      targetActivityId: 'act-and-1',
      payload: {
        ...sampleActivity(
          'act-spoof-2',
          'Palácio Belmonte Private Wine Salon & Terrace (Andorra la Vella)',
          '15:00',
          90,
          16,
          28,
          56
        ),
        category: 'food' as const,
      },
      reason: 'Premium',
      source: 'chat' as const,
      status: 'pending' as const,
    },
  ];
  const filtered = filterAndSanitizeProposalsForRegionAndIntent(
    spoofedProposals,
    'Andorra la Vella',
    'camping nearby'
  );
  assert.equal(filtered.length, 0, 'Must strip all spoofed and intent-mismatched proposals');

  // 5. Graceful Fallback (The "No Hallucination" Rule):
  // Asking for "camping nearby" in an area without verified campsites returns an explicit error object and 0 proposals
  const monacoDay: Day = {
    ...andorraDay,
    city: 'Monte Carlo',
  };
  const noCampingRes = resolveIntentAndRegionProposals({
    destination: 'Monte Carlo, Monaco',
    message: 'camping nearby',
    currentDay: monacoDay,
    uiLanguage: 'en',
  });
  assert.equal(noCampingRes.proposals.length, 0);
  assert.ok(noCampingRes.error, 'Must return explicit error object when no verified camping sites exist');
  assert.equal(noCampingRes.error.code, 'NO_SUITABLE_CAMPING_SITES');
  assert.ok(
    noCampingRes.error.message.includes('No suitable camping sites found exactly in this area'),
    'Error message must include "No suitable camping sites found exactly in this area"'
  );
});

test('Sprint 40: Prompt Tuning — Smart Radius Expansion (20-30km), Abstract Intent Translation ("More local spots"), and Relaxed Fallback Sweet Spot ("any park next to the town" in Algiers)', async () => {
  const {
    SMART_RADIUS_EXPANSION_DIRECTIVE,
    ABSTRACT_INTENT_TRANSLATION_DIRECTIVE,
    RELAXED_FALLBACK_SWEET_SPOT_DIRECTIVE,
    buildChatAssistantSystemPrompt,
    buildCustomActivitySystemPrompt,
    detectRequestedActivityIntent,
    resolveIntentAndRegionProposals,
    resolveRegionalCustomActivity,
  } = await import('./domainLogic');
  const { buildGenerateItinerarySystemPrompt } = await import('../services/api');

  // 1. Verify exact balanced prompt directives exist and are injected into system prompts
  assert.equal(
    SMART_RADIUS_EXPANSION_DIRECTIVE,
    'You must search for real venues within the target city AND its surrounding metropolitan area (allow up to a 20-30km radius for nature, parks, or regional specific requests). Do not artificially restrict your search to the exact city center.'
  );
  assert.equal(
    ABSTRACT_INTENT_TRANSLATION_DIRECTIVE,
    "If the user asks for abstract concepts like 'local spots', 'hidden gems', or 'less touristy places', you MUST intelligently translate this into finding authentic, highly-rated cafes, neighborhoods, or cultural venues frequented by locals. Do not fail just because 'local spots' isn't a rigid database category."
  );
  assert.equal(
    RELAXED_FALLBACK_SWEET_SPOT_DIRECTIVE,
    "Only trigger the 'No suitable venues found' error fallback if the request is geographically absurd for the country, or physically impossible to fulfill within the expanded radius. Otherwise, find the closest real, verified alternative that captures the user's requested vibe."
  );

  const chatPrompt = buildChatAssistantSystemPrompt(
    { destination: 'Algiers, Algeria', days: [] },
    'en'
  );
  assert.ok(chatPrompt.includes(SMART_RADIUS_EXPANSION_DIRECTIVE));
  assert.ok(chatPrompt.includes(ABSTRACT_INTENT_TRANSLATION_DIRECTIVE));
  assert.ok(chatPrompt.includes(RELAXED_FALLBACK_SWEET_SPOT_DIRECTIVE));

  const customActPrompt = buildCustomActivitySystemPrompt('Algiers', 'Algeria', 'en');
  assert.ok(customActPrompt.includes(SMART_RADIUS_EXPANSION_DIRECTIVE));
  assert.ok(customActPrompt.includes(ABSTRACT_INTENT_TRANSLATION_DIRECTIVE));
  assert.ok(customActPrompt.includes(RELAXED_FALLBACK_SWEET_SPOT_DIRECTIVE));

  const genPrompt = buildGenerateItinerarySystemPrompt('Algiers', 'Algeria', [], '', 'en');
  assert.ok(genPrompt.includes(SMART_RADIUS_EXPANSION_DIRECTIVE));
  assert.ok(genPrompt.includes(ABSTRACT_INTENT_TRANSLATION_DIRECTIVE));
  assert.ok(genPrompt.includes(RELAXED_FALLBACK_SWEET_SPOT_DIRECTIVE));

  // 2. Semantic intent classification for "More local spots" and "any park next to the town" in Algiers
  assert.equal(detectRequestedActivityIntent('More local spots', 'Algiers'), 'local_spots');
  assert.equal(detectRequestedActivityIntent('hidden gems and less touristy places', 'Algiers'), 'local_spots');
  assert.equal(detectRequestedActivityIntent('any park next to the town', 'Algiers'), 'park_nature');

  const algiersDay: Day = {
    id: 'day-algiers-1',
    tripId: 'trip-algiers',
    ownerId: 'u1',
    date: '2026-09-12',
    dayNumber: 1,
    city: 'Algiers',
    paceLevel: 3,
    paceScore: 48,
    activePlan: 'A',
    activities: [
      {
        ...sampleActivity('act-alg-1', 'Ketchaoua Mosque & Lower Casbah', '09:30', 90, 5, 12, 25),
        location: { name: 'Algiers', lat: 36.7851, lng: 3.0604 },
      },
    ],
    planB: [],
  };

  // 3. "More local spots" in Algiers must NEVER fail with NO_VERIFIED_VENUES_FOUND; returns authentic Algiers cafes/neighborhoods/cultural venues
  const localSpotsAlgiers = resolveIntentAndRegionProposals({
    destination: 'Algiers, Algeria',
    message: 'More local spots',
    currentDay: algiersDay,
    uiLanguage: 'en',
  });
  assert.equal(localSpotsAlgiers.error, undefined);
  assert.equal(localSpotsAlgiers.proposals.length, 3);
  assert.ok(
    localSpotsAlgiers.proposals.some(
      (p) =>
        p.payload?.title.includes("Casbah d'Alger") ||
        p.payload?.title.includes('Didouche Mourad') ||
        p.payload?.title.includes("Jardin d'Essai du Hamma")
    ),
    'Must return authentic Algiers neighborhoods, cafes, and cultural spots'
  );

  const customLocalSpotsAlgiers = resolveRegionalCustomActivity({
    requestText: 'More local spots',
    destination: 'Algiers',
    country: 'Algeria',
    uiLanguage: 'en',
  });
  assert.equal(customLocalSpotsAlgiers.error, undefined);
  assert.ok(customLocalSpotsAlgiers.activity);
  assert.ok(
    customLocalSpotsAlgiers.activity.title.includes("Casbah d'Alger") ||
      customLocalSpotsAlgiers.activity.location.name.includes('Alger')
  );

  // 4. "any park next to the town" in Algiers must expand radius (20-30km) and return real Algiers parks (Jardin d'Essai du Hamma, Forêt de Baïnem, Parc National de Chréa)
  const parkNextToTownAlgiers = resolveIntentAndRegionProposals({
    destination: 'Algiers, Algeria',
    message: 'any park next to the town',
    currentDay: algiersDay,
    uiLanguage: 'en',
  });
  assert.equal(parkNextToTownAlgiers.error, undefined);
  assert.equal(parkNextToTownAlgiers.proposals.length, 3);
  assert.ok(
    parkNextToTownAlgiers.proposals.some(
      (p) =>
        p.payload?.title.includes("Jardin d'Essai du Hamma") ||
        p.payload?.title.includes('Forêt Récréative de Baïnem') ||
        p.payload?.title.includes('Parc National de Chréa')
    ),
    'Must return real Algiers / Greater Algiers metropolitan parks within 20-30km'
  );

  const customParkAlgiers = resolveRegionalCustomActivity({
    requestText: 'any park next to the town',
    destination: 'Algiers',
    country: 'Algeria',
    uiLanguage: 'en',
  });
  assert.equal(customParkAlgiers.error, undefined);
  assert.ok(customParkAlgiers.activity);
  assert.equal(customParkAlgiers.activity.category, 'nature');
  assert.ok((customParkAlgiers.expandedRadiusKm ?? 0) >= 20);

  // 5. Relaxed Fallback Sweet Spot: Even for an unlisted global city (e.g. "Tunis" or "Ljubljana"), "More local spots" and "any park next to the town" succeed without throwing "No suitable verified venues found"
  const tunisLocalRes = resolveIntentAndRegionProposals({
    destination: 'Tunis, Tunisia',
    message: 'More local spots',
    currentDay: { ...algiersDay, city: 'Tunis' },
    uiLanguage: 'en',
  });
  assert.equal(tunisLocalRes.error, undefined);
  assert.equal(tunisLocalRes.proposals.length, 3);

  const tunisParkRes = resolveIntentAndRegionProposals({
    destination: 'Tunis, Tunisia',
    message: 'any park next to the town',
    currentDay: { ...algiersDay, city: 'Tunis' },
    uiLanguage: 'en',
  });
  assert.equal(tunisParkRes.error, undefined);
  assert.equal(tunisParkRes.proposals.length, 3);

  // While geographically absurd requests in Algiers (e.g. "glacier trek and northern lights") still trigger the error fallback
  const absurdAlgiersRes = resolveIntentAndRegionProposals({
    destination: 'Algiers, Algeria',
    message: 'glacier trek and northern lights',
    currentDay: algiersDay,
    uiLanguage: 'en',
  });
  assert.ok(absurdAlgiersRes.error);
  assert.equal(absurdAlgiersRes.error.code, 'GEOGRAPHICALLY_IMPOSSIBLE');
  assert.equal(absurdAlgiersRes.proposals.length, 0);
});




