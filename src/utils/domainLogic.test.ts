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


