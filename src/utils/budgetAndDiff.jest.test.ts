import {
  optimizeBudgetTiers,
  applyBudgetOptimizationToDays,
  computeExpenseBalancesAndSettlement,
  applySingleProposalChange,
  applyProposalChanges,
  recalculateDayTravelTimes,
  computePaceMetrics,
  reorderActivitiesList,
} from './domainLogic';
import { Activity, Day, Expense, ProposalChange, Traveler } from '../types/models';

const createActivity = (
  id: string,
  title: string,
  startTime: string,
  durationMin: number,
  costs: { budget: number; mid: number; premium: number },
  coords: { lat: number; lng: number } = { lat: 38.711, lng: -9.136 },
  selectedTier: 'budget' | 'mid' | 'premium' = 'mid'
): Activity => ({
  id,
  title,
  category: 'culture',
  description: `${title} description`,
  startTime,
  durationMin,
  interestTags: ['history', 'culture'],
  location: { name: `${title} Location`, lat: coords.lat, lng: coords.lng },
  costOptions: {
    budget: { title: `${title} Budget`, estimatedCost: costs.budget, description: 'Entry tier' },
    mid: { title: `${title} Standard`, estimatedCost: costs.mid, description: 'Standard tier' },
    premium: { title: `${title} VIP`, estimatedCost: costs.premium, description: 'VIP tier' },
  },
  selectedTier,
  priceConfidence: { status: 'verified', sourceUrl: 'https://example.com', verifiedAt: '2026-10-15' },
  hoursConfidence: { status: 'verified', sourceUrl: 'https://example.com', verifiedAt: '2026-10-15' },
  whyThis: 'Matches cultural preferences',
  touristTrapScore: 20,
  votes: { ana: 'up' },
});

const createDay = (id: string, dayNumber: number, activities: Activity[], planB: Activity[] = []): Day => ({
  id,
  tripId: 'trip-1',
  ownerId: 'user-1',
  date: `2026-11-${String(10 + dayNumber).padStart(2, '0')}`,
  dayNumber,
  paceLevel: 3,
  paceScore: 45,
  activePlan: 'A',
  activities,
  planB,
});

const createTravelers = (): Traveler[] => [
  {
    id: 'ana',
    tripId: 'trip-1',
    ownerId: 'user-1',
    userId: 'user-1',
    displayName: 'Ana',
    interests: ['food', 'culture'],
    budgetPerPerson: 500,
    constraints: '',
    preferredPace: 3,
    color: '#D97706',
    avatar: 'A',
  },
  {
    id: 'rui',
    tripId: 'trip-1',
    ownerId: 'user-1',
    userId: 'user-2',
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
    tripId: 'trip-1',
    ownerId: 'user-1',
    userId: 'user-3',
    displayName: 'Sofia',
    interests: ['nature'],
    budgetPerPerson: 500,
    constraints: '',
    preferredPace: 2,
    color: '#4F46E5',
    avatar: 'S',
  },
];

describe('Core Budget Calculation Logic', () => {
  describe('optimizeBudgetTiers (Living Budget What-If Optimizer)', () => {
    it('selects lowest incremental upgrades to mid and premium without exceeding targetBudget', () => {
      const a1 = createActivity('act-1', 'Morning Museum', '09:00', 90, { budget: 0, mid: 10, premium: 30 });
      const a2 = createActivity('act-2', 'Walking Tour', '11:30', 120, { budget: 10, mid: 35, premium: 80 });
      const a3 = createActivity('act-3', 'Sunset Fado Dinner', '19:30', 120, { budget: 20, mid: 35, premium: 90 });
      const day = createDay('day-1', 1, [a1, a2, a3]);

      // Baseline budget cost = 0 + 10 + 20 = 30
      // Upgrade deltas to mid: act-1 (+10), act-3 (+15), act-2 (+25)
      // With targetBudget = 60 (1 traveler):
      // 1) Start at 30
      // 2) Upgrade act-1 to mid (+10 -> 40)
      // 3) Upgrade act-3 to mid (+15 -> 55)
      // 4) act-2 to mid needs +25 (55 + 25 = 80 > 60, skipped)
      // 5) Premium upgrades from mid: act-1 needs +20 (55 + 20 = 75 > 60, skipped)
      const result = optimizeBudgetTiers([day], 60, 1);

      expect(result.withinBudget).toBe(true);
      expect(result.totalEstimatedCost).toBe(55);
      expect(result.selections).toEqual({
        'act-1': 'mid',
        'act-2': 'budget',
        'act-3': 'mid',
      });
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        dayNumber: 1,
        activityId: 'act-2',
        fromTier: 'mid',
        toTier: 'budget',
        costDelta: -25,
        newOptionTitle: 'Walking Tour Budget',
      });
    });

    it('upgrades activities all the way to premium when budget allows and scales by travelersCount', () => {
      const a1 = createActivity('act-1', 'Tile Workshop', '10:00', 90, { budget: 10, mid: 20, premium: 35 }, undefined, 'budget');
      const a2 = createActivity('act-2', 'River Cruise', '15:00', 90, { budget: 15, mid: 30, premium: 60 }, undefined, 'mid');
      const day = createDay('day-1', 1, [a1, a2]);

      // 2 travelers:
      // Baseline budget = (10 + 15) * 2 = 50
      // Mid upgrades: a1 (+20 -> 70), a2 (+30 -> 100)
      // Premium upgrades: a1 (+30 -> 130), a2 (+60 -> 190)
      // With targetBudget = 140: a1 reaches premium, a2 stays mid, total = 130
      const result = optimizeBudgetTiers([day], 140, 2);

      expect(result.withinBudget).toBe(true);
      expect(result.totalEstimatedCost).toBe(130);
      expect(result.selections['act-1']).toBe('premium');
      expect(result.selections['act-2']).toBe('mid');
      expect(result.changes).toEqual([
        {
          dayNumber: 1,
          activityId: 'act-1',
          activityTitle: 'Tile Workshop',
          fromTier: 'budget',
          toTier: 'premium',
          costDelta: 50, // (35 - 10) * 2
          newOptionTitle: 'Tile Workshop VIP',
        },
      ]);
    });

    it('marks withinBudget as false and falls back to all budget tiers when targetBudget is below minimum cost', () => {
      const a1 = createActivity('act-1', 'Paid Monument', '09:00', 60, { budget: 25, mid: 40, premium: 75 });
      const a2 = createActivity('act-2', 'Guided Tasting', '14:00', 90, { budget: 30, mid: 50, premium: 95 });
      const day = createDay('day-1', 1, [a1, a2]);

      // Minimum possible cost for 2 travelers = (25 + 30) * 2 = 110
      const result = optimizeBudgetTiers([day], 80, 2);

      expect(result.withinBudget).toBe(false);
      expect(result.totalEstimatedCost).toBe(110);
      expect(result.selections).toEqual({
        'act-1': 'budget',
        'act-2': 'budget',
      });
    });

    it('optimizes Plan B activities when day.activePlan is B and applies selections immutably', () => {
      const planAAct = createActivity('act-a', 'Outdoor Hike', '10:00', 120, { budget: 0, mid: 10, premium: 25 });
      const planBAct = createActivity('act-b', 'Indoor Aquarium', '10:00', 120, { budget: 18, mid: 28, premium: 55 });
      const day: Day = {
        ...createDay('day-1', 1, [planAAct], [planBAct]),
        activePlan: 'B',
      };

      const result = optimizeBudgetTiers([day], 22, 1);
      expect(result.selections['act-b']).toBe('budget');
      expect(result.selections['act-a']).toBeUndefined();
      expect(result.totalEstimatedCost).toBe(18);

      const updatedDays = applyBudgetOptimizationToDays([day], result.selections);
      expect(updatedDays[0].planB[0].selectedTier).toBe('budget');
      // Original day must remain unmutated
      expect(day.planB[0].selectedTier).toBe('mid');
    });
  });

  describe('computeExpenseBalancesAndSettlement (Split the Bill & Debt Settlement)', () => {
    it('maintains zero-sum net balances and computes minimal transfers across multi-payer expenses', () => {
      const travelers = createTravelers();
      const expenses: Expense[] = [
        {
          id: 'exp-1',
          tripId: 'trip-1',
          ownerId: 'user-1',
          authorId: 'user-1',
          activityId: 'act-1',
          category: 'food',
          description: 'Group Tapas',
          amount: 120,
          currency: 'EUR',
          paidBy: 'ana',
          splitMode: 'equal',
          splits: { ana: 40, rui: 40, sofia: 40 },
          date: '2026-11-11',
          settled: false,
        },
        {
          id: 'exp-2',
          tripId: 'trip-1',
          ownerId: 'user-1',
          authorId: 'user-2',
          activityId: 'act-2',
          category: 'activities',
          description: 'Museum Tickets',
          amount: 60,
          currency: 'EUR',
          paidBy: 'rui',
          splitMode: 'equal',
          splits: { ana: 20, rui: 20, sofia: 20 },
          date: '2026-11-11',
          settled: false,
        },
      ];

      const summary = computeExpenseBalancesAndSettlement(expenses, travelers);

      expect(summary.totalSpent).toBe(180);
      expect(summary.byCategory.food).toBe(120);
      expect(summary.byCategory.activities).toBe(60);
      expect(summary.byActivity['act-1']).toBe(120);
      expect(summary.byActivity['act-2']).toBe(60);

      const netSum = summary.balances.reduce((sum, b) => sum + b.netBalance, 0);
      expect(Math.abs(netSum)).toBeLessThan(0.01);

      // Ana paid 120, owed 60 -> +60
      // Rui paid 60, owed 60 -> 0
      // Sofia paid 0, owed 60 -> -60
      // Only 1 transfer required: Sofia pays Ana 60
      expect(summary.settlements).toEqual([
        {
          fromTravelerId: 'sofia',
          fromName: 'Sofia',
          toTravelerId: 'ana',
          toName: 'Ana',
          amount: 60,
        },
      ]);
    });

    it('normalizes drifted custom splits and excludes settled expenses from active debt while preserving totalSpent', () => {
      const travelers = createTravelers();
      const expenses: Expense[] = [
        {
          id: 'exp-settled',
          tripId: 'trip-1',
          ownerId: 'user-1',
          authorId: 'user-1',
          activityId: '',
          category: 'accommodation',
          description: 'Boutique Hotel Deposit',
          amount: 300,
          currency: 'EUR',
          paidBy: 'ana',
          splitMode: 'equal',
          splits: { ana: 100, rui: 100, sofia: 100 },
          date: '2026-11-10',
          settled: true,
        },
        {
          id: 'exp-drifted',
          tripId: 'trip-1',
          ownerId: 'user-1',
          authorId: 'user-2',
          activityId: '',
          category: 'transport',
          description: 'Van Rental (drifted shares 1:1:2)',
          amount: 100,
          currency: 'EUR',
          paidBy: 'rui',
          splitMode: 'shares',
          // Raw shares sum to 4 instead of 100; normalizer must scale to 25, 25, 50
          splits: { ana: 1, rui: 1, sofia: 2 },
          date: '2026-11-11',
          settled: false,
        },
      ];

      const summary = computeExpenseBalancesAndSettlement(expenses, travelers);

      // Total spent includes settled expenses
      expect(summary.totalSpent).toBe(400);
      expect(summary.byCategory.accommodation).toBe(300);
      expect(summary.byCategory.transport).toBe(100);

      // Active balances only reflect unsettled Van Rental (100 paid by Rui; owed: Ana 25, Rui 25, Sofia 50)
      const ana = summary.balances.find((b) => b.travelerId === 'ana')!;
      const rui = summary.balances.find((b) => b.travelerId === 'rui')!;
      const sofia = summary.balances.find((b) => b.travelerId === 'sofia')!;

      expect(ana.netBalance).toBe(-25);
      expect(rui.netBalance).toBe(75);
      expect(sofia.netBalance).toBe(-50);

      expect(summary.settlements).toEqual([
        {
          fromTravelerId: 'sofia',
          fromName: 'Sofia',
          toTravelerId: 'rui',
          toName: 'Rui',
          amount: 50,
        },
        {
          fromTravelerId: 'ana',
          fromName: 'Ana',
          toTravelerId: 'rui',
          toName: 'Rui',
          amount: 25,
        },
      ]);
    });
  });
});

describe('Itinerary Diff-Apply Utility & Real-Time Data Integrity', () => {
  const stopAlfama = { lat: 38.711, lng: -9.13 };
  const stopChiado = { lat: 38.7105, lng: -9.142 }; // ~1.05 km from Alfama (WALKING)
  const stopBelem = { lat: 38.697, lng: -9.206 }; // ~5.7 km from Chiado (TRANSIT)

  it('adds an activity in chronological order, recalculates Haversine travel legs, and updates paceScore', () => {
    const morning = createActivity('act-1', 'Alfama Walk', '09:00', 90, { budget: 0, mid: 15, premium: 40 }, stopAlfama);
    const afternoon = createActivity('act-2', 'Belém Tower', '14:30', 120, { budget: 10, mid: 20, premium: 50 }, stopBelem);
    const day1 = createDay('day-1', 1, recalculateDayTravelTimes([morning, afternoon]));
    const day2 = createDay('day-2', 2, [
      createActivity('act-d2', 'Sintra Palace', '09:30', 180, { budget: 15, mid: 30, premium: 75 }, stopAlfama),
    ]);

    const middayAddition = createActivity(
      'act-midday',
      'Chiado Literary Cafe',
      '11:30',
      75,
      { budget: 8, mid: 18, premium: 35 },
      stopChiado
    );

    const addChange: ProposalChange = {
      id: 'prop-add-1',
      dayId: 'day-1',
      dayNumber: 1,
      type: 'add',
      payload: middayAddition,
      reason: 'Add a midday coffee stop between Alfama and Belém',
      source: 'chat',
      status: 'accepted',
    };

    const updatedDays = applySingleProposalChange([day1, day2], addChange);

    // Non-targeted day2 reference is preserved
    expect(updatedDays[1]).toBe(day2);

    // Input day1 is not mutated
    expect(day1.activities).toHaveLength(2);

    // Updated day1 has 3 chronologically sorted activities
    const acts = updatedDays[0].activities;
    expect(acts.map((a) => a.id)).toEqual(['act-1', 'act-midday', 'act-2']);

    // First activity never has travelFromPrevious
    expect(acts[0].travelFromPrevious).toBeUndefined();

    // Second activity (Alfama -> Chiado ~1km) uses WALKING
    expect(acts[1].travelFromPrevious).toBeDefined();
    expect(acts[1].travelFromPrevious?.mode).toBe('WALKING');
    expect(acts[1].travelFromPrevious?.source).toBe('estimated');

    // Third activity (Chiado -> Belém > 2.2km) automatically switches to TRANSIT
    expect(acts[2].travelFromPrevious).toBeDefined();
    expect(acts[2].travelFromPrevious?.mode).toBe('TRANSIT');
    expect(acts[2].travelFromPrevious?.distanceKm).toBeGreaterThan(2.2);

    // Pace score is freshly recomputed to match computePaceMetrics
    expect(updatedDays[0].paceScore).toBe(computePaceMetrics(updatedDays[0]).paceScore);
  });

  it('guarantees idempotency when the same add ProposalChange is applied multiple times in real-time', () => {
    const baseAct = createActivity('act-1', 'Alfama Walk', '09:00', 90, { budget: 0, mid: 15, premium: 40 }, stopAlfama);
    const day1 = createDay('day-1', 1, [baseAct]);
    const newAct = createActivity('act-2', 'Chiado Lunch', '12:30', 60, { budget: 12, mid: 25, premium: 50 }, stopChiado);

    const change: ProposalChange = {
      id: 'prop-dup',
      dayId: 'day-1',
      dayNumber: 1,
      type: 'add',
      payload: newAct,
      reason: 'Lunch stop',
      source: 'chat',
      status: 'accepted',
    };

    const once = applySingleProposalChange([day1], change);
    const twice = applySingleProposalChange(once, change);

    expect(twice[0].activities).toHaveLength(2);
    expect(twice[0].activities.map((a) => a.id)).toEqual(['act-1', 'act-2']);
    expect(twice[0].paceScore).toBe(once[0].paceScore);
  });

  it('removes the first activity and strips stale travelFromPrevious from the new first activity', () => {
    const a1 = createActivity('act-1', 'Stop 1', '09:00', 60, { budget: 5, mid: 10, premium: 20 }, stopAlfama);
    const a2 = createActivity('act-2', 'Stop 2', '11:00', 60, { budget: 5, mid: 10, premium: 20 }, stopChiado);
    const a3 = createActivity('act-3', 'Stop 3', '14:00', 60, { budget: 5, mid: 10, premium: 20 }, stopBelem);
    const day = createDay('day-1', 1, recalculateDayTravelTimes([a1, a2, a3]));

    // Before removal, a2 has travelFromPrevious from a1
    expect(day.activities[1].travelFromPrevious).toBeDefined();

    const removeChange: ProposalChange = {
      id: 'prop-rem',
      dayId: 'day-1',
      dayNumber: 1,
      type: 'remove',
      targetActivityId: 'act-1',
      reason: 'Start later in the morning',
      source: 'pace',
      status: 'accepted',
    };

    const updated = applySingleProposalChange([day], removeChange);
    expect(updated[0].activities.map((a) => a.id)).toEqual(['act-2', 'act-3']);
    // a2 is now the first stop of the day, so its travelFromPrevious MUST be cleared
    expect(updated[0].activities[0].travelFromPrevious).toBeUndefined();
    // a3 still has travel leg from a2
    expect(updated[0].activities[1].travelFromPrevious).toBeDefined();
  });

  it('moves an activity to a new startTime, resorts the timeline, and updates travel legs', () => {
    const a1 = createActivity('act-1', 'Morning Stop', '09:00', 60, { budget: 5, mid: 10, premium: 20 }, stopAlfama);
    const a2 = createActivity('act-2', 'Midday Stop', '12:00', 60, { budget: 5, mid: 10, premium: 20 }, stopChiado);
    const a3 = createActivity('act-3', 'Afternoon Stop', '15:00', 60, { budget: 5, mid: 10, premium: 20 }, stopBelem);
    const day = createDay('day-1', 1, recalculateDayTravelTimes([a1, a2, a3]));

    const moveChange: ProposalChange = {
      id: 'prop-move',
      dayId: 'day-1',
      dayNumber: 1,
      type: 'move',
      targetActivityId: 'act-3',
      newStartTime: '10:30',
      reason: 'Visit Belém earlier to beat crowds',
      source: 'chat',
      status: 'accepted',
    };

    const updated = applySingleProposalChange([day], moveChange);
    expect(updated[0].activities.map((a) => a.id)).toEqual(['act-1', 'act-3', 'act-2']);
    expect(updated[0].activities[1].startTime).toBe('10:30');
    expect(updated[0].activities[1].travelFromPrevious?.mode).toBe('TRANSIT'); // Alfama -> Belém
    expect(updated[0].activities[2].travelFromPrevious?.mode).toBe('TRANSIT'); // Belém -> Chiado
  });

  it('applies a batch of sequential ProposalChanges via applyProposalChanges while skipping rejected items', () => {
    const a1 = createActivity('act-1', 'Tourist Trap Cafe', '09:00', 60, { budget: 15, mid: 25, premium: 40 }, stopAlfama);
    const a2 = createActivity('act-2', 'City Lookout', '11:00', 60, { budget: 0, mid: 5, premium: 15 }, stopChiado);
    const day = createDay('day-1', 1, recalculateDayTravelTimes([a1, a2]));

    const localReplacement = createActivity(
      'act-1-local',
      'Authentic Neighborhood Tasca',
      '09:00',
      75,
      { budget: 8, mid: 14, premium: 22 },
      stopAlfama
    );
    const eveningSpot = createActivity(
      'act-3',
      'Riverfront Wine Bar',
      '18:30',
      90,
      { budget: 12, mid: 24, premium: 45 },
      stopBelem
    );
    const rejectedRemove: ProposalChange = {
      id: 'prop-rejected',
      dayId: 'day-1',
      dayNumber: 1,
      type: 'remove',
      targetActivityId: 'act-2',
      reason: 'Remove lookout',
      source: 'pace',
      status: 'rejected',
    };

    const changes: ProposalChange[] = [
      {
        id: 'prop-1',
        dayId: 'day-1',
        dayNumber: 1,
        type: 'replace',
        targetActivityId: 'act-1',
        payload: localReplacement,
        reason: 'Swap tourist trap for authentic local spot',
        source: 'local_alt',
        status: 'accepted',
      },
      rejectedRemove,
      {
        id: 'prop-2',
        dayId: 'day-1',
        dayNumber: 1,
        type: 'add',
        payload: eveningSpot,
        reason: 'Add evening wine bar',
        source: 'chat',
        status: 'accepted',
      },
    ];

    const finalDays = applyProposalChanges([day], changes);
    expect(finalDays[0].activities.map((a) => a.id)).toEqual(['act-1-local', 'act-2', 'act-3']);
    expect(finalDays[0].activities[0].title).toBe('Authentic Neighborhood Tasca');
  });

  it('preserves integrity during drag-and-drop reorderActivitiesList with out-of-bounds safety', () => {
    const a1 = createActivity('act-1', 'Stop 1', '09:00', 60, { budget: 5, mid: 10, premium: 20 }, stopAlfama);
    const a2 = createActivity('act-2', 'Stop 2', '11:00', 60, { budget: 5, mid: 10, premium: 20 }, stopChiado);
    const list = recalculateDayTravelTimes([a1, a2]);

    // Out-of-bounds or no-op indices return original array safely
    expect(reorderActivitiesList(list, -1, 1)).toBe(list);
    expect(reorderActivitiesList(list, 0, 5)).toBe(list);
    expect(reorderActivitiesList(list, 1, 1)).toBe(list);

    // Valid reorder swaps items and recalculates travelFromPrevious
    const swapped = reorderActivitiesList(list, 1, 0);
    expect(swapped.map((a) => a.id)).toEqual(['act-2', 'act-1']);
    expect(swapped[0].travelFromPrevious).toBeUndefined();
    expect(swapped[1].travelFromPrevious).toBeDefined();
  });
});
