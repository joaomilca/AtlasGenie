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
