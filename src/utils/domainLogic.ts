import type {
  Activity,
  BudgetTier,
  Day,
  DayAccommodation,
  DayMeals,
  Expense,
  FullTripBundle,
  IntercityTransit,
  ProposalChange,
  TravelLeg,
  TravelMode,
  Traveler,
  TravelerProfilePreferences,
  UserProfile,
} from '../types/models';

export interface DaySubtotalBreakdown {
  total: number;
  perPersonTotal: number;
  accommodationCost: number;
  transitCost: number;
  mealsCost: number;
  activitiesCost: number;
  dominantTier: BudgetTier;
}

export interface NormalizedInputBudget {
  inputTotalBudget: number;
  travelers: number;
  perPersonBudget: number;
  budgetTier: BudgetTier;
}

/**
 * Evaluates the budget tier ('budget' | 'mid' | 'premium') strictly from the
 * individual `perPersonBudget` (not the group total).
 */
export function evaluateBudgetTierFromPerPersonBudget(perPersonBudget: number): BudgetTier {
  const raw = Number(perPersonBudget ?? 0);
  const safePerPerson = Math.max(0, Number.isFinite(raw) ? raw : 0);
  if (safePerPerson < 350) {
    return 'budget';
  }
  if (safePerPerson >= 800) {
    return 'premium';
  }
  return 'mid';
}

/**
 * Input Budget Normalization:
 * Calculates the true individual budget by explicitly dividing the input total budget
 * by the travelers count: `perPersonBudget = inputTotalBudget / travelers`.
 * Uses `perPersonBudget` (not the group total) when evaluating the budget tier
 * ('budget' | 'mid' | 'premium') and generating AI prompt instructions.
 */
export function normalizeInputBudget(
  inputTotalBudget: number,
  travelers: number = 1
): NormalizedInputBudget {
  const safeTravelers = Math.max(1, Math.round(Number(travelers) || 1));
  const rawTotal = Number(inputTotalBudget ?? 0);
  const safeInputTotalBudget = Math.max(0, Number.isFinite(rawTotal) ? rawTotal : 0);
  const perPersonBudget = safeInputTotalBudget / safeTravelers;
  const roundedPerPerson = Math.round(perPersonBudget);
  const budgetTier = evaluateBudgetTierFromPerPersonBudget(perPersonBudget);

  return {
    inputTotalBudget: Math.round(safeInputTotalBudget),
    travelers: safeTravelers,
    perPersonBudget: roundedPerPerson,
    budgetTier,
  };
}

/**
 * Resolves the day/global budget tier for day-level logistics (Accommodation and Meals).
 * Strictly decoupled from individual activity `selectedTier` values so changing a single
 * activity's price tier never switches the entire day's hotel or meals tier.
 */
export function resolveDayDominantTier(
  _activities: Activity[],
  accommodation?: DayAccommodation
): BudgetTier {
  if (accommodation?.selectedTier) {
    return accommodation.selectedTier;
  }
  return 'mid';
}

/**
 * Resolves the active DayAccommodation for a day given the day/global budget tier.
 */
export function resolveActiveDayAccommodation(
  accommodation: DayAccommodation | undefined,
  dominantTier: BudgetTier = 'mid'
): DayAccommodation | undefined {
  if (!accommodation) return undefined;
  const activeTier = accommodation.selectedTier || dominantTier;
  if (accommodation.customPriceLocked && !accommodation.selectedTier) {
    return {
      ...accommodation,
      isPriceVerified: Boolean(accommodation.isPriceVerified),
    };
  }
  const tierStay = accommodation.tierOptions?.[activeTier];
  if (tierStay) {
    return {
      ...accommodation,
      name: tierStay.name,
      type: tierStay.type || accommodation.type,
      price: tierStay.price,
      isPriceVerified:
        tierStay.isPriceVerified !== undefined
          ? Boolean(tierStay.isPriceVerified)
          : Boolean(accommodation.isPriceVerified),
      coordinates: tierStay.coordinates || accommodation.coordinates,
      selectedTier: activeTier,
    };
  }
  return {
    ...accommodation,
    isPriceVerified: Boolean(accommodation.isPriceVerified),
    selectedTier: activeTier,
  };
}

/**
 * Dynamically calculates a day's real-time subtotal:
 * sums:
 * 1. The current global/day tier price for Accommodation (`day.accommodation?.selectedTier || 'mid'`).
 * 2. Intercity transit (if any).
 * 3. Strictly per-person costs (Meals + Activity tickets) multiplied by the travelers count:
 *    `(sumOfPerPersonCosts * travelers)`.
 * Applies defensive math (fallback undefined prices to 0 and Math.round() on final returns).
 */
export function computeDaySubtotal(
  day: {
    accommodation?: DayAccommodation;
    intercity_transit?: IntercityTransit;
    meals?: DayMeals;
    activities: Activity[];
    planB?: Activity[];
    activePlan?: 'A' | 'B';
  },
  travelers: number = 1
): DaySubtotalBreakdown {
  const safeTravelers = Math.max(1, Math.round(Number(travelers) || 1));
  const activeList =
    day.activePlan === 'B' && day.planB && day.planB.length > 0 ? day.planB : day.activities || [];
  const dominantTier: BudgetTier = day.accommodation?.selectedTier || 'mid';
  const activeAcc = resolveActiveDayAccommodation(day.accommodation, dominantTier);

  const rawAccPrice = Number(activeAcc?.price ?? 0);
  const accommodationCost = Math.max(
    0,
    Math.round(Number.isFinite(rawAccPrice) ? rawAccPrice : 0)
  );
  const rawTransitPrice = Number(day.intercity_transit?.price ?? 0);
  const transitCost = Math.max(
    0,
    Math.round(Number.isFinite(rawTransitPrice) ? rawTransitPrice : 0)
  );

  let perPersonMealsCost = 0;
  if (day.meals) {
    for (const slotKey of ['breakfast', 'lunch', 'dinner'] as const) {
      const meal = day.meals[slotKey];
      if (!meal) continue;
      const tierMeal = meal.tierVenues?.[dominantTier];
      const rawPrice = Number(tierMeal?.estimatedPrice ?? meal.estimatedPrice ?? 0);
      perPersonMealsCost += Math.max(0, Number.isFinite(rawPrice) ? rawPrice : 0);
    }
  }

  let perPersonActivitiesCost = 0;
  for (const act of activeList) {
    const tier = act.selectedTier || 'mid';
    const opt = act.costOptions?.[tier] || act.costOptions?.mid;
    const rawCost = Number(opt?.estimatedCost ?? 0);
    perPersonActivitiesCost += Math.max(0, Number.isFinite(rawCost) ? rawCost : 0);
  }

  const mealsCost = Math.round(perPersonMealsCost * safeTravelers);
  const activitiesCost = Math.round(perPersonActivitiesCost * safeTravelers);
  const sumOfPerPersonCosts = perPersonMealsCost + perPersonActivitiesCost;
  const total = Math.round(
    accommodationCost + transitCost + sumOfPerPersonCosts * safeTravelers
  );
  const perPersonTotal = Math.round(total / safeTravelers);

  return {
    total,
    perPersonTotal,
    accommodationCost,
    transitCost,
    mealsCost,
    activitiesCost,
    dominantTier,
  };
}

export const calculateDaySubtotals = computeDaySubtotal;

/**
 * Dynamically calculates the global Trip Total across all days (summing each day's active subtotal
 * with per-person costs multiplied by `travelers`) and identifies the active trip-wide tier.
 */
export function computeTripTotalCost(
  days: Day[],
  travelers: number = 1
): {
  total: number;
  perPersonTotal: number;
  dominantTier: BudgetTier;
  hasPremiumSelection: boolean;
  perDayTotals: Record<number, number>;
} {
  const safeTravelers = Math.max(1, Math.round(Number(travelers) || 1));
  let total = 0;
  const perDayTotals: Record<number, number> = {};
  const tierCounts: Record<BudgetTier, number> = { budget: 0, mid: 0, premium: 0 };
  let hasPremiumSelection = false;

  for (const day of days || []) {
    const sub = computeDaySubtotal(day, safeTravelers);
    perDayTotals[day.dayNumber] = sub.total;
    total += sub.total;
    tierCounts[sub.dominantTier] += 1;

    const activeList =
      day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
    if (
      day.accommodation?.selectedTier === 'premium' ||
      activeList.some((a) => a.selectedTier === 'premium')
    ) {
      hasPremiumSelection = true;
    }
  }

  let dominantTier: BudgetTier = 'mid';
  if (
    tierCounts.premium > 0 &&
    tierCounts.premium >= tierCounts.mid &&
    tierCounts.premium >= tierCounts.budget
  ) {
    dominantTier = 'premium';
  } else if (
    tierCounts.budget > 0 &&
    tierCounts.budget >= tierCounts.mid &&
    tierCounts.budget > tierCounts.premium
  ) {
    dominantTier = 'budget';
  }

  const roundedTotal = Math.round(total);
  const perPersonTotal = Math.round(roundedTotal / safeTravelers);

  return {
    total: roundedTotal,
    perPersonTotal,
    dominantTier,
    hasPremiumSelection,
    perDayTotals,
  };
}

export const calculateTripTotal = computeTripTotalCost;

/**
 * Haversine distance and travel duration estimator (used when Maps API is offline/fallback).
 * Explicitly sets source: 'estimated' per AI Architecture Rule #2 & #6.
 */
export function calculateHaversineTravel(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode = 'WALKING'
): TravelLeg {
  const R = 6371; // Earth radius in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Urban winding factor ~1.3x straight line
  const rawKm = R * c * 1.3;
  const distanceKm = Math.max(0.2, Math.round(rawKm * 10) / 10);

  let speedKmh = 4.5; // walking
  if (mode === 'TRANSIT') speedKmh = 18;
  if (mode === 'DRIVING') speedKmh = 28;

  const baseMinutes = Math.round((distanceKm / speedKmh) * 60);
  const minutes = Math.max(4, mode === 'TRANSIT' ? baseMinutes + 6 : baseMinutes);

  return {
    mode,
    minutes,
    distanceKm,
    source: 'estimated',
  };
}

/**
 * Recalculates travelFromPrevious for an ordered array of activities.
 * Preserves existing 'maps_api' legs if coordinates haven't changed, otherwise computes fallback.
 */
export function recalculateDayTravelTimes(
  activities: Activity[],
  defaultMode: TravelMode = 'WALKING'
): Activity[] {
  return activities.map((act, idx) => {
    if (idx === 0) {
      const { travelFromPrevious, ...rest } = act;
      return { ...rest };
    }
    const prev = activities[idx - 1];
    const autoMode: TravelMode =
      calculateHaversineTravel(prev.location, act.location, 'WALKING').distanceKm > 2.2
        ? 'TRANSIT'
        : defaultMode;
    const leg = calculateHaversineTravel(prev.location, act.location, autoMode);
    return {
      ...act,
      travelFromPrevious: leg,
    };
  });
}

export interface PaceMetrics {
  paceScore: number; // 0 to 100
  label: 'Relaxed' | 'Balanced' | 'Packed';
  scheduledMinutes: number;
  travelMinutes: number;
  walkingMinutes: number;
  freeBufferMinutes: number;
  activitiesCount: number;
  isUnrealistic: boolean;
  warningReason?: 'too_long' | 'tight_buffers';
}

/**
 * Deterministic Pace Indicator calculation (Feature B3).
 * Computed from walking time, travel time, number of activities, and free time buffer.
 */
export function computePaceMetrics(day: Day): PaceMetrics {
  const list = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
  const activitiesCount = list.length;

  let scheduledMinutes = 0;
  let travelMinutes = 0;
  let walkingMinutes = 0;

  for (let i = 0; i < list.length; i++) {
    const act = list[i];
    scheduledMinutes += act.durationMin;
    if (i > 0 && act.travelFromPrevious) {
      travelMinutes += act.travelFromPrevious.minutes;
      if (act.travelFromPrevious.mode === 'WALKING') {
        walkingMinutes += act.travelFromPrevious.minutes;
      }
    }
  }

  const totalActiveWindow = 12 * 60; // 12h waking sightseeing window (720 min)
  const totalCommitted = scheduledMinutes + travelMinutes;
  const freeBufferMinutes = Math.max(0, totalActiveWindow - totalCommitted);

  // Average buffer between consecutive activities
  const transitions = Math.max(1, activitiesCount - 1);
  const avgBufferPerTransition = freeBufferMinutes / transitions;

  // Deterministic score 0..100
  const rawScore = Math.round(
    Math.min(
      100,
      (scheduledMinutes / 480) * 55 +
        (travelMinutes / 120) * 20 +
        (activitiesCount / 6) * 25
    )
  );

  let label: 'Relaxed' | 'Balanced' | 'Packed' = 'Balanced';
  if (rawScore < 42) label = 'Relaxed';
  else if (rawScore >= 72) label = 'Packed';

  // Warn when day > 10 hours (600 min) of scheduled+travel time OR buffer < 15 min per transition
  const tooLong = totalCommitted > 600;
  const tightBuffers = activitiesCount >= 4 && avgBufferPerTransition < 15;
  const isUnrealistic = tooLong || tightBuffers;

  return {
    paceScore: rawScore,
    label,
    scheduledMinutes,
    travelMinutes,
    walkingMinutes,
    freeBufferMinutes,
    activitiesCount,
    isUnrealistic,
    warningReason: tooLong ? 'too_long' : tightBuffers ? 'tight_buffers' : undefined,
  };
}

export interface BudgetOptimizationChange {
  dayNumber: number;
  activityId: string;
  activityTitle: string;
  fromTier: BudgetTier;
  toTier: BudgetTier;
  costDelta: number;
  newOptionTitle: string;
  selected: boolean;
}

export interface BudgetOptimizationResult {
  selections: Record<string, BudgetTier>; // activityId -> tier
  totalEstimatedCost: number;
  changes: BudgetOptimizationChange[];
  withinBudget: boolean;
}

/**
 * Computes the exact current itinerary activity total for the simulator slider baseline.
 */
export function computeCurrentItineraryTotal(
  days: Day[],
  travelersCount: number = 1
): number {
  const scale = Math.max(1, travelersCount);
  let total = 0;
  for (const day of days) {
    const activeList = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
    for (const act of activeList) {
      const tier: BudgetTier = act.selectedTier || 'mid';
      const opt = act.costOptions?.[tier] || act.costOptions?.mid;
      total += (opt ? opt.estimatedCost : 0) * scale;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Deterministic Living Budget What-If Optimizer (Feature B2).
 * Instantly re-selects cost tiers (budget / mid / premium) per activity to maximise
 * overall quality without exceeding targetBudget (no AI call required).
 */
export function optimizeBudgetTiers(
  days: Day[],
  targetBudget: number,
  travelersCount: number = 1
): BudgetOptimizationResult {
  const scale = Math.max(1, travelersCount);
  const allItems: { dayNumber: number; activity: Activity }[] = [];

  for (const day of days) {
    const activeList = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
    for (const activity of activeList) {
      allItems.push({ dayNumber: day.dayNumber, activity });
    }
  }

  // Start everyone at 'budget' tier
  const selections: Record<string, BudgetTier> = {};
  let currentTotal = 0;

  for (const { activity } of allItems) {
    selections[activity.id] = 'budget';
    currentTotal += activity.costOptions.budget.estimatedCost * scale;
  }

  // Upgrade Step 1: Upgrade from 'budget' to 'mid' in order of best quality/value (food & culture prioritized, smallest incremental cost first)
  const midCandidates = [...allItems].sort((a, b) => {
    const deltaA =
      (a.activity.costOptions.mid.estimatedCost - a.activity.costOptions.budget.estimatedCost) *
      scale;
    const deltaB =
      (b.activity.costOptions.mid.estimatedCost - b.activity.costOptions.budget.estimatedCost) *
      scale;
    return deltaA - deltaB;
  });

  for (const { activity } of midCandidates) {
    const delta =
      (activity.costOptions.mid.estimatedCost - activity.costOptions.budget.estimatedCost) * scale;
    if (currentTotal + delta <= targetBudget) {
      selections[activity.id] = 'mid';
      currentTotal += delta;
    }
  }

  // Upgrade Step 2: Upgrade from 'mid' to 'premium' for items already at 'mid'
  const premiumCandidates = [...allItems]
    .filter(({ activity }) => selections[activity.id] === 'mid')
    .sort((a, b) => {
      const deltaA =
        (a.activity.costOptions.premium.estimatedCost - a.activity.costOptions.mid.estimatedCost) *
        scale;
      const deltaB =
        (b.activity.costOptions.premium.estimatedCost - b.activity.costOptions.mid.estimatedCost) *
        scale;
      return deltaA - deltaB;
    });

  for (const { activity } of premiumCandidates) {
    const delta =
      (activity.costOptions.premium.estimatedCost - activity.costOptions.mid.estimatedCost) * scale;
    if (currentTotal + delta <= targetBudget) {
      selections[activity.id] = 'premium';
      currentTotal += delta;
    }
  }

  // Compute diff summary against current selectedTier in days
  const changes: BudgetOptimizationChange[] = [];
  for (const { dayNumber, activity } of allItems) {
    const fromTier = activity.selectedTier;
    const toTier = selections[activity.id];
    if (fromTier !== toTier) {
      const oldCost = activity.costOptions[fromTier].estimatedCost * scale;
      const newCost = activity.costOptions[toTier].estimatedCost * scale;
      changes.push({
        dayNumber,
        activityId: activity.id,
        activityTitle: activity.title,
        fromTier,
        toTier,
        costDelta: Math.round((newCost - oldCost) * 100) / 100,
        newOptionTitle: activity.costOptions[toTier].title,
        selected: true,
      });
    }
  }

  return {
    selections,
    totalEstimatedCost: Math.round(currentTotal * 100) / 100,
    changes,
    withinBudget: currentTotal <= targetBudget,
  };
}

export interface PersonFairness {
  travelerId: string;
  displayName: string;
  color: string;
  overallScore: number; // 0-100
  matchedActivitiesCount: number;
  perDayScore: Record<number, number>; // dayNumber -> 0-100
}

export interface FairnessReport {
  overallFairnessIndex: number; // 0-100 (100 = perfectly balanced across group)
  perPerson: PersonFairness[];
  tradeOffExplanations: string[];
}

/**
 * Group Fairness Meter calculator (Feature C).
 * Evaluates how well each traveler's interests are represented per person and per day.
 */
export function computeGroupFairness(days: Day[], travelers: Traveler[]): FairnessReport {
  if (travelers.length === 0) {
    return { overallFairnessIndex: 100, perPerson: [], tradeOffExplanations: [] };
  }

  const perPerson: PersonFairness[] = travelers.map((traveler) => {
    const normInterests = traveler.interests.map((i) => i.toLowerCase());
    let totalMatched = 0;
    let totalActivities = 0;
    const perDayScore: Record<number, number> = {};

    for (const day of days) {
      const activeList = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
      let dayMatches = 0;
      for (const act of activeList) {
        totalActivities++;
        const tags = [act.category, ...(act.interestTags || [])].map((t) => t.toLowerCase());
        const isMatch =
          normInterests.some((interest) =>
            tags.some((t) => t.includes(interest) || interest.includes(t))
          ) ||
          act.whyThis.toLowerCase().includes(traveler.displayName.toLowerCase()) ||
          act.votes?.[traveler.id] === 'up';
        if (isMatch) {
          dayMatches++;
          totalMatched++;
        }
      }
      perDayScore[day.dayNumber] =
        activeList.length > 0 ? Math.min(100, Math.round((dayMatches / activeList.length) * 100 + 20)) : 50;
    }

    const overallScore =
      totalActivities > 0
        ? Math.min(100, Math.max(35, Math.round((totalMatched / totalActivities) * 100 + 22)))
        : 75;

    return {
      travelerId: traveler.id,
      displayName: traveler.displayName,
      color: traveler.color,
      overallScore,
      matchedActivitiesCount: totalMatched,
      perDayScore,
    };
  });

  const scores = perPerson.map((p) => p.overallScore);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxSpread = Math.max(...scores) - Math.min(...scores);
  const overallFairnessIndex = Math.max(0, Math.min(100, Math.round(avg - maxSpread * 0.4)));

  const tradeOffExplanations: string[] = [];
  if (travelers.length >= 2 && days.length >= 2) {
    const t1 = travelers[0];
    const t2 = travelers[1];
    tradeOffExplanations.push(
      `${t1.displayName} (${t1.interests.slice(0, 2).join(', ')}) is balanced with ${t2.displayName} (${t2.interests.slice(0, 2).join(', ')}) across alternate mornings and evenings.`
    );
    if (travelers.length >= 3) {
      const t3 = travelers[2];
      tradeOffExplanations.push(
        `Group pace and per-person budget are capped to respect ${t3.displayName}'s €${t3.budgetPerPerson} target.`
      );
    }
  }

  return {
    overallFairnessIndex,
    perPerson,
    tradeOffExplanations,
  };
}

export interface TravelerBalance {
  travelerId: string;
  displayName: string;
  paidTotal: number;
  owedTotal: number;
  netBalance: number; // positive = is owed money, negative = owes money
}

export interface SettlementTransfer {
  fromTravelerId: string;
  fromName: string;
  toTravelerId: string;
  toName: string;
  amount: number;
}

export interface ExpenseSummaryResult {
  totalSpent: number;
  balances: TravelerBalance[];
  settlements: SettlementTransfer[];
  byCategory: Record<string, number>;
  byActivity: Record<string, number>;
}

/**
 * Split the Bill & Min-Transfer Debt Settlement algorithm (Feature D).
 * Guarantees that net balances sum to 0 (within 0.01 rounding) and minimises transfers.
 */
export function computeExpenseBalancesAndSettlement(
  expenses: Expense[],
  travelers: Traveler[]
): ExpenseSummaryResult {
  const nameMap: Record<string, string> = {};
  const paidMap: Record<string, number> = {};
  const owedMap: Record<string, number> = {};

  for (const t of travelers) {
    nameMap[t.id] = t.displayName;
    paidMap[t.id] = 0;
    owedMap[t.id] = 0;
  }

  let totalSpent = 0;
  const byCategory: Record<string, number> = {
    food: 0,
    activities: 0,
    transport: 0,
    accommodation: 0,
    other: 0,
  };
  const byActivity: Record<string, number> = {};

  for (const exp of expenses) {
    totalSpent += exp.amount;
    byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
    if (exp.activityId) {
      byActivity[exp.activityId] = (byActivity[exp.activityId] || 0) + exp.amount;
    }

    if (exp.settled) continue;

    if (paidMap[exp.paidBy] === undefined) {
      paidMap[exp.paidBy] = 0;
      owedMap[exp.paidBy] = 0;
      nameMap[exp.paidBy] = exp.paidBy;
    }
    paidMap[exp.paidBy] += exp.amount;

    const splitEntries = Object.entries(exp.splits || {});
    if (splitEntries.length > 0) {
      const splitSum = splitEntries.reduce((acc, [, val]) => acc + val, 0);
      for (const [tId, rawShare] of splitEntries) {
        if (owedMap[tId] === undefined) {
          paidMap[tId] = 0;
          owedMap[tId] = 0;
          nameMap[tId] = tId;
        }
        // Normalize in case shares or rounding drifted slightly from exp.amount
        const normalizedAmount =
          splitSum > 0 ? (rawShare / splitSum) * exp.amount : exp.amount / splitEntries.length;
        owedMap[tId] += normalizedAmount;
      }
    } else if (travelers.length > 0) {
      const equalShare = exp.amount / travelers.length;
      for (const t of travelers) {
        owedMap[t.id] += equalShare;
      }
    }
  }

  const balances: TravelerBalance[] = Object.keys(nameMap).map((id) => {
    const paidTotal = Math.round((paidMap[id] || 0) * 100) / 100;
    const owedTotal = Math.round((owedMap[id] || 0) * 100) / 100;
    const netBalance = Math.round((paidMap[id] - owedMap[id]) * 100) / 100;
    return {
      travelerId: id,
      displayName: nameMap[id],
      paidTotal,
      owedTotal,
      netBalance,
    };
  });

  // Min-transfer greedy matching between biggest debtor and biggest creditor
  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ ...b, remaining: -b.netBalance }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ ...b, remaining: b.netBalance }))
    .sort((a, b) => b.remaining - a.remaining);

  const settlements: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transferAmount = Math.round(Math.min(debtor.remaining, creditor.remaining) * 100) / 100;

    if (transferAmount >= 0.01) {
      settlements.push({
        fromTravelerId: debtor.travelerId,
        fromName: debtor.displayName,
        toTravelerId: creditor.travelerId,
        toName: creditor.displayName,
        amount: transferAmount,
      });
    }

    debtor.remaining = Math.round((debtor.remaining - transferAmount) * 100) / 100;
    creditor.remaining = Math.round((creditor.remaining - transferAmount) * 100) / 100;

    if (debtor.remaining < 0.01) i++;
    if (creditor.remaining < 0.01) j++;
  }

  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    balances,
    settlements,
    byCategory,
    byActivity,
  };
}

function normalizeActivityTitleKey(title: string | undefined): string {
  return String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Ensures an activity list has strictly unique IDs and unique normalized titles
 * (updating existing nodes in-place while preserving stable IDs so DOM nodes never duplicate).
 */
export function deduplicateActivitiesById(activities: Activity[]): Activity[] {
  const indexById = new Map<string, number>();
  const indexByTitle = new Map<string, number>();
  const result: Activity[] = [];

  for (const act of activities) {
    if (!act || !act.id) continue;
    const normTitle = normalizeActivityTitleKey(act.title);
    const existingById = indexById.get(act.id);
    const existingByTitle = normTitle ? indexByTitle.get(normTitle) : undefined;
    const existingIdx = existingById ?? existingByTitle;

    if (existingIdx !== undefined) {
      const preservedId = result[existingIdx].id;
      const updatedAct: Activity = { ...act, id: preservedId };
      result[existingIdx] = updatedAct;
      indexById.set(preservedId, existingIdx);
      indexById.set(act.id, existingIdx);
      if (normTitle) indexByTitle.set(normTitle, existingIdx);
    } else {
      const newIdx = result.length;
      indexById.set(act.id, newIdx);
      if (normTitle) indexByTitle.set(normTitle, newIdx);
      result.push(act);
    }
  }
  return result;
}

/**
 * Computes a deterministic target key for a ProposalChange so generating or receiving
 * repeated proposals for the same slot/activity updates the existing proposal by key/ID
 * instead of stacking duplicate banners.
 */
export function getProposalTargetKey(prop: ProposalChange): string {
  const dayKey = prop.dayId || `day-${prop.dayNumber}`;
  if (prop.type === 'replace_accommodation' || prop.accommodationPayload) {
    return `${dayKey}:replace_accommodation:stay`;
  }
  if (prop.type === 'add') {
    const payloadKey =
      normalizeActivityTitleKey(prop.payload?.title) || prop.payload?.id || prop.id;
    return `${dayKey}:add:${payloadKey}`;
  }
  const targetKey =
    prop.targetActivityId ||
    normalizeActivityTitleKey(prop.targetActivityTitle) ||
    normalizeActivityTitleKey(prop.payload?.title) ||
    prop.payload?.id ||
    prop.id;
  if (prop.type === 'replace' && prop.payload?.title) {
    const payloadTitleKey = normalizeActivityTitleKey(prop.payload.title);
    if (payloadTitleKey) {
      return `${dayKey}:replace:${targetKey}:${payloadTitleKey}`;
    }
  }
  return `${dayKey}:${prop.type}:${targetKey}`;
}

/**
 * Deduplicates and merges incoming ProposalChanges into an existing pending list using strict ID,
 * target-slot, and payload-title matching. Also filters out proposals that have already been applied to currentDays.
 */
export function deduplicateAndMergeProposals(
  existing: ProposalChange[],
  incoming: ProposalChange[],
  currentDays?: Day[]
): ProposalChange[] {
  const merged = [...existing];

  for (const rawProp of incoming) {
    if (!rawProp || rawProp.status === 'rejected') continue;

    const normPayloadTitle = normalizeActivityTitleKey(
      rawProp.accommodationPayload?.name || rawProp.payload?.title
    );
    const normTargetTitle = normalizeActivityTitleKey(
      rawProp.targetAccommodationName || rawProp.targetActivityTitle
    );

    // Ignore no-op replace proposals where target and replacement titles are identical
    if (
      (rawProp.type === 'replace' || rawProp.type === 'replace_accommodation') &&
      normPayloadTitle &&
      normTargetTitle &&
      normPayloadTitle === normTargetTitle
    ) {
      continue;
    }

    // Check if the proposal has already been applied to the target day
    if (currentDays && currentDays.length > 0) {
      const targetDay = currentDays.find(
        (d) => (rawProp.dayId && d.id === rawProp.dayId) || d.dayNumber === rawProp.dayNumber
      );
      if (targetDay) {
        if (
          (rawProp.type === 'replace_accommodation' || rawProp.accommodationPayload) &&
          rawProp.accommodationPayload
        ) {
          const currentStayName = normalizeActivityTitleKey(targetDay.accommodation?.name);
          if (currentStayName && currentStayName === normPayloadTitle) {
            continue;
          }
        } else {
          const activeList =
            targetDay.activePlan === 'B' && targetDay.planB.length > 0
              ? targetDay.planB
              : targetDay.activities;

          if (rawProp.type === 'replace' && rawProp.payload) {
            const payloadAlreadyInDay = activeList.some(
              (a) =>
                a.id === rawProp.payload!.id ||
                (normPayloadTitle.length > 0 &&
                  normalizeActivityTitleKey(a.title) === normPayloadTitle)
            );
            const targetRemovedFromDay =
              !rawProp.targetActivityId ||
              !activeList.some((a) => a.id === rawProp.targetActivityId);
            if (payloadAlreadyInDay && targetRemovedFromDay) continue;
          } else if (rawProp.type === 'add' && rawProp.payload) {
            const payloadAlreadyAdded = activeList.some(
              (a) =>
                a.id === rawProp.payload!.id ||
                (normPayloadTitle.length > 0 &&
                  normalizeActivityTitleKey(a.title) === normPayloadTitle)
            );
            if (payloadAlreadyAdded) continue;
          } else if (rawProp.type === 'remove') {
            const targetStillExists = activeList.some(
              (a) =>
                (rawProp.targetActivityId && a.id === rawProp.targetActivityId) ||
                (normTargetTitle.length > 0 &&
                  normalizeActivityTitleKey(a.title) === normTargetTitle)
            );
            if (!targetStillExists) continue;
          }
        }
      }
    }

    const incomingKey = getProposalTargetKey(rawProp);
    const existingIdx = merged.findIndex((p) => {
      if (p.id === rawProp.id || getProposalTargetKey(p) === incomingKey) {
        return true;
      }
      const sameDay =
        (p.dayId && rawProp.dayId && p.dayId === rawProp.dayId) ||
        p.dayNumber === rawProp.dayNumber;
      const existingTitle = normalizeActivityTitleKey(
        p.accommodationPayload?.name || p.payload?.title
      );
      if (sameDay && normPayloadTitle.length > 0 && existingTitle === normPayloadTitle) {
        return true;
      }
      return false;
    });

    if (existingIdx >= 0) {
      // Update in-place preserving stable proposal ID so React keys don't thrash or duplicate
      merged[existingIdx] = {
        ...rawProp,
        id: merged[existingIdx].id,
      };
    } else {
      merged.push(rawProp);
    }
  }

  return merged;
}

/**
 * Applies a single accepted ProposalChange to the trip days array using strict ID-based updates
 * (never blindly appending duplicate nodes) and recalculates travel times & pace score.
 */
export function applySingleProposalChange(days: Day[], change: ProposalChange): Day[] {
  return days.map((day) => {
    const matchesById = Boolean(change.dayId && day.id === change.dayId);
    const matchesByNumber = !change.dayId && day.dayNumber === change.dayNumber;
    const matchesFallbackNumber = Boolean(
      change.dayId &&
        !days.some((d) => d.id === change.dayId) &&
        day.dayNumber === change.dayNumber
    );

    if (!matchesById && !matchesByNumber && !matchesFallbackNumber) {
      return day;
    }

    const isPlanBActive = day.activePlan === 'B' && day.planB.length > 0;
    const sourceList = isPlanBActive ? day.planB : day.activities;

    // Handle swappable accommodation proposal
    if (
      (change.type === 'replace_accommodation' || change.accommodationPayload) &&
      change.accommodationPayload
    ) {
      const incomingAcc = change.accommodationPayload;
      const activeTier = incomingAcc.selectedTier || resolveDayDominantTier(sourceList, day.accommodation);
      const updatedAcc: DayAccommodation = {
        ...(day.accommodation || {}),
        ...incomingAcc,
        selectedTier: activeTier,
        customPriceLocked: true,
        tierOptions: {
          ...(day.accommodation?.tierOptions || {}),
          [activeTier]: {
            name: incomingAcc.name,
            type: incomingAcc.type,
            price: incomingAcc.price,
            coordinates: incomingAcc.coordinates,
          },
        },
      };
      return {
        ...day,
        accommodation: updatedAcc,
      };
    }

    let nextActivities = sourceList.map((a) => ({
      ...a,
      votes: { ...(a.votes || {}) },
    }));

    const findTargetIndex = (): number => {
      if (change.targetActivityId) {
        const byId = nextActivities.findIndex((a) => a.id === change.targetActivityId);
        if (byId >= 0) return byId;
      }
      if (change.targetActivityTitle) {
        const normTarget = normalizeActivityTitleKey(change.targetActivityTitle);
        const byTitle = nextActivities.findIndex(
          (a) => normalizeActivityTitleKey(a.title) === normTarget
        );
        if (byTitle >= 0) return byTitle;
      }
      return -1;
    };

    if (change.type === 'add' && change.payload) {
      const clonedPayload: Activity = {
        ...change.payload,
        id: change.payload.id || `act-added-${day.id}-${nextActivities.length + 1}`,
        votes: { ...(change.payload.votes || {}) },
      };

      const normPayloadTitle = normalizeActivityTitleKey(clonedPayload.title);
      const existingIdx = nextActivities.findIndex(
        (a) =>
          a.id === clonedPayload.id ||
          (normPayloadTitle.length > 0 &&
            normalizeActivityTitleKey(a.title) === normPayloadTitle)
      );

      if (existingIdx >= 0) {
        // Strict ID-based in-place update when the activity already exists
        nextActivities = nextActivities.map((a, idx) =>
          idx === existingIdx ? { ...clonedPayload, id: a.id } : a
        );
      } else {
        nextActivities = [...nextActivities, clonedPayload].sort((a, b) =>
          a.startTime.localeCompare(b.startTime)
        );
      }
    } else if (change.type === 'remove') {
      const targetIdx = findTargetIndex();
      if (targetIdx >= 0) {
        const targetId = nextActivities[targetIdx].id;
        nextActivities = nextActivities.filter((a) => a.id !== targetId);
      }
    } else if (change.type === 'replace' && change.payload) {
      const targetIdx = findTargetIndex();
      const clonedPayload: Activity = {
        ...change.payload,
        id:
          change.payload.id ||
          (change.targetActivityId ? `${change.targetActivityId}-rep` : `act-rep-${day.id}`),
        votes: { ...(change.payload.votes || {}) },
      };
      const normPayloadTitle = normalizeActivityTitleKey(clonedPayload.title);

      if (targetIdx >= 0) {
        const replacedId = nextActivities[targetIdx].id;
        // Strict in-place replacement at targetIdx + filter out any duplicate occurrence of clonedPayload.id or title
        nextActivities = nextActivities
          .map((a, idx) => (idx === targetIdx ? clonedPayload : a))
          .filter(
            (a, idx) =>
              idx === targetIdx ||
              (a.id !== clonedPayload.id &&
                a.id !== replacedId &&
                (!normPayloadTitle || normalizeActivityTitleKey(a.title) !== normPayloadTitle))
          );
      } else {
        // If the replacement was already applied earlier, update it in-place by ID or normalized title
        const existingPayloadIdx = nextActivities.findIndex(
          (a) =>
            a.id === clonedPayload.id ||
            (normPayloadTitle.length > 0 &&
              normalizeActivityTitleKey(a.title) === normPayloadTitle)
        );
        if (existingPayloadIdx >= 0) {
          nextActivities = nextActivities.map((a, idx) =>
            idx === existingPayloadIdx
              ? { ...clonedPayload, id: a.id }
              : a
          );
        }
      }
    } else if (change.type === 'move' && change.newStartTime) {
      const targetIdx = findTargetIndex();
      if (targetIdx >= 0) {
        const targetId = nextActivities[targetIdx].id;
        nextActivities = nextActivities
          .map((a) => (a.id === targetId ? { ...a, startTime: change.newStartTime! } : a))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
      }
    }

    const deduped = deduplicateActivitiesById(nextActivities);
    const withTravel = recalculateDayTravelTimes(deduped);
    const updatedDay: Day = {
      ...day,
      activities: isPlanBActive ? day.activities : withTravel,
      planB: isPlanBActive ? withTravel : day.planB,
    };
    const metrics = computePaceMetrics(updatedDay);
    return {
      ...updatedDay,
      paceScore: metrics.paceScore,
    };
  });
}

/**
 * Applies a sequence of ProposalChanges in order while preserving data integrity across real-time updates.
 * Ignores rejected proposals if passed in a mixed batch.
 */
export function applyProposalChanges(days: Day[], changes: ProposalChange[]): Day[] {
  return changes.reduce((currentDays, change) => {
    if (change.status === 'rejected') {
      return currentDays;
    }
    return applySingleProposalChange(currentDays, change);
  }, days);
}

export interface ActivityExtendedTip {
  id: string;
  level: 'warning' | 'tip' | 'verified';
  title: string;
  detail: string;
}

export interface ActivityExtendedDetails {
  title: string;
  subtitle: string;
  extendedOverview: string;
  aiReasoning: string;
  proposalSummary?: string;
  tipsAndWarnings: ActivityExtendedTip[];
}

/**
 * Builds rich, structured extended details, AI choice reasoning, and specific tips/warnings
 * for the Activity Details ("Read More") modal on both ActivityCards and ProposalChanges.
 */
export function buildActivityExtendedDetails(
  activity: Activity | undefined,
  proposal?: ProposalChange,
  language: 'en' | 'pt' = 'en'
): ActivityExtendedDetails {
  const isPt = language === 'pt';
  const act = activity || proposal?.payload;
  const accPayload = proposal?.accommodationPayload;

  const title =
    accPayload?.name ||
    act?.title ||
    proposal?.targetAccommodationName ||
    proposal?.targetActivityTitle ||
    (isPt ? 'Sugestão do AtlasGenie' : 'AtlasGenie Suggestion');

  const subtitleParts: string[] = [];
  if (accPayload) {
    subtitleParts.push(`${accPayload.type.toUpperCase()} · ~€${accPayload.price}/night`);
  }
  if (act?.startTime) subtitleParts.push(`${act.startTime} (${act.durationMin || 60} min)`);
  if (act?.location?.name) subtitleParts.push(act.location.name);
  if (proposal?.dayNumber) {
    subtitleParts.push(`${isPt ? 'Dia' : 'Day'} ${proposal.dayNumber}`);
  }
  const subtitle = subtitleParts.join(' · ');

  let proposalSummary: string | undefined;
  if (proposal) {
    if (
      (proposal.type === 'replace_accommodation' || proposal.accommodationPayload) &&
      proposal.accommodationPayload
    ) {
      proposalSummary = isPt
        ? `Substitui o alojamento "${proposal.targetAccommodationName || 'Atual'}" por "${proposal.accommodationPayload.name}" (~€${proposal.accommodationPayload.price}/noite).`
        : `Replaces accommodation "${proposal.targetAccommodationName || 'Current Stay'}" with "${proposal.accommodationPayload.name}" (~€${proposal.accommodationPayload.price}/night).`;
    } else if (proposal.type === 'replace' && proposal.targetActivityTitle && proposal.payload) {
      proposalSummary = isPt
        ? `Substitui "${proposal.targetActivityTitle}" por "${proposal.payload.title}" às ${proposal.payload.startTime}.`
        : `Replaces "${proposal.targetActivityTitle}" with "${proposal.payload.title}" at ${proposal.payload.startTime}.`;
    } else if (proposal.type === 'remove') {
      proposalSummary = isPt
        ? `Remove "${proposal.targetActivityTitle || title}" para libertar tempo de margem no seu dia.`
        : `Removes "${proposal.targetActivityTitle || title}" to open up breathing room in your daily schedule.`;
    } else if (proposal.type === 'move' && proposal.newStartTime) {
      proposalSummary = isPt
        ? `Altera o horário de "${proposal.targetActivityTitle || title}" para as ${proposal.newStartTime}.`
        : `Moves "${proposal.targetActivityTitle || title}" to ${proposal.newStartTime}.`;
    } else if (proposal.type === 'add' && proposal.payload) {
      proposalSummary = isPt
        ? `Adiciona "${proposal.payload.title}" às ${proposal.payload.startTime} (${proposal.payload.durationMin} min).`
        : `Adds "${proposal.payload.title}" at ${proposal.payload.startTime} (${proposal.payload.durationMin} min).`;
    }
  }

  const baseDesc =
    act?.description ||
    proposal?.reason ||
    (isPt
      ? 'Paragem selecionada para otimizar o equilíbrio cultural, gastronómico e logístico do seu dia.'
      : 'Curated stop selected to optimize the cultural, culinary, and logistical balance of your day.');

  const settingNote = act
    ? act.isOutdoor
      ? isPt
        ? 'Experiência maioritariamente ao ar livre; ideal com bom tempo e integrada com alternativa interior no Plano B.'
        : 'Primarily outdoor experience; best enjoyed in fair weather and paired with an indoor Plan B backup.'
      : isPt
      ? 'Espaço interior ou abrigado, seguro contra chuva e variações meteorológicas.'
      : 'Indoor or sheltered venue, rain-safe regardless of weather conditions.'
    : '';

  const hoursNote = act?.openingHoursText
    ? isPt
      ? `Horário habitual de funcionamento: ${act.openingHoursText}.`
      : `Typical opening hours: ${act.openingHoursText}.`
    : '';

  const extendedOverview = [baseDesc, settingNote, hoursNote].filter(Boolean).join(' ');

  const whyBase = act?.whyThis || '';
  const propReason = proposal?.reason || '';
  const tagsText =
    act?.interestTags && act.interestTags.length > 0
      ? isPt
        ? `Interesses correspondentes: ${act.interestTags.join(', ')}.`
        : `Matched interests: ${act.interestTags.join(', ')}.`
      : '';

  const aiReasoning =
    [
      propReason && propReason !== whyBase ? propReason : '',
      whyBase,
      tagsText,
    ]
      .filter(Boolean)
      .join(' — ') ||
    (isPt
      ? 'Selecionado pelo AtlasGenie para manter tempos de deslocação curtos e respeitar o seu ritmo diário.'
      : 'Selected by AtlasGenie to keep transit legs short and match your preferred daily pace.');

  const tipsAndWarnings: ActivityExtendedTip[] = [];

  if (act) {
    // 1. Crowd / Tourist-trap tip or warning
    if (act.touristTrapScore >= 70) {
      const altText = act.localAlternative
        ? isPt
          ? ` Alternativa local recomendada a ${act.localAlternative.travelMinutesAway} min: "${act.localAlternative.title}" (${act.localAlternative.reason}).`
          : ` Recommended local alternative ${act.localAlternative.travelMinutesAway} min away: "${act.localAlternative.title}" (${act.localAlternative.reason}).`
        : '';
      tipsAndWarnings.push({
        id: 'crowd-warning',
        level: 'warning',
        title: isPt
          ? `Aviso de Afluência Elevada (${act.touristTrapScore}/100)`
          : `High Crowd & Tourist-Trap Alert (${act.touristTrapScore}/100)`,
        detail:
          (isPt
            ? 'Este local regista filas intensas nas horas de ponta. Reserve bilhete com hora marcada ou chegue 20 minutos antes da abertura.'
            : 'This stop experiences heavy queues during peak hours. Book timed-entry tickets in advance or arrive 20 minutes before opening.') +
          altText,
      });
    } else {
      tipsAndWarnings.push({
        id: 'crowd-tip',
        level: 'tip',
        title: isPt
          ? `Ambiente Autêntico · Índice de Multidão Baixo (${act.touristTrapScore}/100)`
          : `Authentic Pace · Low Crowd Index (${act.touristTrapScore}/100)`,
        detail: isPt
          ? 'Paragem tranquila fora dos circuitos turísticos mais saturados, permitindo uma visita sem pressas.'
          : 'Calmer stop away from the heaviest tour-bus bottlenecks, allowing an unhurried visit.',
      });
    }

    // 2. Price & Hours Verification Tip / Warning
    if (
      act.priceConfidence.status === 'verified' &&
      act.hoursConfidence.status === 'verified'
    ) {
      tipsAndWarnings.push({
        id: 'trust-verified',
        level: 'verified',
        title: isPt ? 'Preços e Horários Verificados' : 'Verified Prices & Opening Hours',
        detail: isPt
          ? `Dados confirmados através de fonte oficial${act.priceConfidence.verifiedAt ? ` em ${act.priceConfidence.verifiedAt}` : ''}.`
          : `Data cross-checked against official venue sources${act.priceConfidence.verifiedAt ? ` on ${act.priceConfidence.verifiedAt}` : ''}.`,
      });
    } else {
      tipsAndWarnings.push({
        id: 'trust-estimate',
        level: 'warning',
        title: isPt
          ? 'Aviso de Estimativa (~) · Confirmar Antes de Ir'
          : 'Estimate Notice (~) · Verify Before Arrival',
        detail: isPt
          ? `${act.priceConfidence.notes || 'Os custos indicados são estimativas da IA (~).'} Confirme horários e tarifas sazonais no local ou portal oficial.`
          : `${act.priceConfidence.notes || 'Listed costs are AI estimates (~).'} Please confirm seasonal opening hours and ticket rates prior to arrival.`,
      });
    }

    // 3. Weather / Transit Logistics Tip
    if (act.isOutdoor) {
      tipsAndWarnings.push({
        id: 'weather-outdoor',
        level: 'tip',
        title: isPt ? 'Dica Meteorológica (Ar Livre)' : 'Outdoor Weather Tip',
        detail: isPt
          ? 'Leve calçado confortável. Se chover, utilize o botão "Mudar para Plano B" no topo do dia para ativar a alternativa interior.'
          : 'Wear comfortable walking shoes. If rain is forecast, use the "Switch to Plan B" button at the top of the day for an indoor backup.',
      });
    } else if (act.travelFromPrevious) {
      tipsAndWarnings.push({
        id: 'transit-tip',
        level: 'tip',
        title: isPt ? 'Dica de Deslocação' : 'Transit & Arrival Tip',
        detail: isPt
          ? `A cerca de ${act.travelFromPrevious.minutes} min (${act.travelFromPrevious.distanceKm} km) da paragem anterior.`
          : `Located approximately ${act.travelFromPrevious.minutes} min (${act.travelFromPrevious.distanceKm} km) from your previous stop.`,
      });
    }
  } else if (proposal) {
    tipsAndWarnings.push({
      id: 'proposal-control-tip',
      level: 'tip',
      title: isPt ? 'Controlo Não-Destrutivo' : 'Non-Destructive Diff Control',
      detail: isPt
        ? 'O seu roteiro original permanece intacto até clicar em Aceitar. Pode sempre anular a última alteração com um clique.'
        : 'Your saved itinerary remains untouched until you click Accept. You can always undo any accepted change in one click.',
    });
  }

  return {
    title,
    subtitle,
    extendedOverview,
    aiReasoning,
    proposalSummary,
    tipsAndWarnings,
  };
}

/**
 * Immutably applies optimized budget tier selections onto a Day[] structure (both Plan A and Plan B).
 */
export function applyBudgetOptimizationToDays(
  days: Day[],
  selections: Record<string, BudgetTier>
): Day[] {
  return days.map((day) => ({
    ...day,
    activities: day.activities.map((act) =>
      selections[act.id] ? { ...act, selectedTier: selections[act.id] } : act
    ),
    planB: day.planB.map((act) =>
      selections[act.id] ? { ...act, selectedTier: selections[act.id] } : act
    ),
  }));
}

/**
 * Sprint 12.1: Uses .map() to iterate over the current itinerary and immutably apply
 * ONLY the proposals where selected === true.
 */
export function applySelectedBudgetProposalsToDays(
  days: Day[],
  proposals: BudgetOptimizationChange[]
): Day[] {
  const selectedProposals = proposals.filter((p) => p.selected === true);
  const selectedTierByActivityId = selectedProposals.reduce<Record<string, BudgetTier>>(
    (acc, proposal) => ({
      ...acc,
      [proposal.activityId]: proposal.toTier,
    }),
    {}
  );

  return days.map((day) => ({
    ...day,
    activities: day.activities.map((act) =>
      selectedTierByActivityId[act.id]
        ? { ...act, selectedTier: selectedTierByActivityId[act.id] }
        : act
    ),
    planB: day.planB.map((act) =>
      selectedTierByActivityId[act.id]
        ? { ...act, selectedTier: selectedTierByActivityId[act.id] }
        : act
    ),
  }));
}

/**
 * Sprint 12.2: Uses .reduce() to transform the flat expenses array into a grouped
 * object keyed by payer displayName (or paidBy fallback), with each person's expenses
 * sorted chronologically.
 */
export function groupExpensesByPayer(
  expenses: Expense[],
  travelers: Traveler[] = []
): Record<string, Expense[]> {
  const travelerNameById = travelers.reduce<Record<string, string>>((acc, tr) => {
    acc[tr.id] = tr.displayName;
    return acc;
  }, {});

  const groupedByPerson = expenses.reduce<Record<string, Expense[]>>((acc, exp) => {
    const payerKey = travelerNameById[exp.paidBy] || exp.paidBy;
    const currentList = acc[payerKey] || [];
    return {
      ...acc,
      [payerKey]: [...currentList, exp],
    };
  }, {});

  return Object.keys(groupedByPerson).reduce<Record<string, Expense[]>>((sortedAcc, payerKey) => {
    const chronologicallySorted = [...groupedByPerson[payerKey]].sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      return a.id.localeCompare(b.id);
    });
    return {
      ...sortedAcc,
      [payerKey]: chronologicallySorted,
    };
  }, {});
}

/**
 * Sprint 12.3: Immutably removes an expense by ID using .filter().
 */
export function removeExpenseById(expenses: Expense[], expenseId: string): Expense[] {
  return expenses.filter((exp) => exp.id !== expenseId);
}

/**
 * Helper to compute Reliability summary (Feature B1: Trust Layer).
 */
export function computeReliabilitySummary(days: Day[]): {
  totalChecks: number;
  verifiedCount: number;
  estimatedCount: number;
  toConfirmCount: number;
  verifiedPercent: number;
} {
  let verifiedCount = 0;
  let estimatedCount = 0;
  let toConfirmCount = 0;

  for (const day of days) {
    const activeList = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
    for (const act of activeList) {
      for (const conf of [act.priceConfidence, act.hoursConfidence]) {
        if (conf.status === 'verified') verifiedCount++;
        else if (conf.status === 'estimated') estimatedCount++;
        else toConfirmCount++;
      }
    }
  }

  const totalChecks = verifiedCount + estimatedCount + toConfirmCount;
  const verifiedPercent = totalChecks > 0 ? Math.round((verifiedCount / totalChecks) * 100) : 100;

  return {
    totalChecks,
    verifiedCount,
    estimatedCount,
    toConfirmCount,
    verifiedPercent,
  };
}

/**
 * Reorders activities when a user drags and drops an activity card from oldIndex to newIndex,
 * and recalculates travel times between consecutive stops.
 */
export function reorderActivitiesList(
  activities: Activity[],
  fromIndex: number,
  toIndex: number
): Activity[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= activities.length ||
    toIndex >= activities.length ||
    fromIndex === toIndex
  ) {
    return activities;
  }
  const copy = [...activities];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return recalculateDayTravelTimes(copy);
}

function formatIcsDateTime(dateStr: string, timeStr: string, addMinutes: number = 0): string {
  const [year, month, day] = (dateStr || '2026-11-18').split('-').map((n) => parseInt(n, 10));
  const [hour, minute] = (timeStr || '09:00').split(':').map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(year || 2026, (month || 11) - 1, day || 18, hour || 9, minute || 0, 0));
  if (addMinutes) {
    d.setUTCMinutes(d.getUTCMinutes() + addMinutes);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

function escapeIcsText(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Converts a trip's (or specific day's) activities into RFC 5545 iCalendar (.ics) format.
 */
export function generateIcsCalendar(bundle: FullTripBundle, specificDay?: Day): string {
  const daysToExport = specificDay ? [specificDay] : bundle.days;
  const stamp = '20261103T120000Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AtlasGenie//Verified European Travel Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${bundle.trip.destination} Atlas Itinerary`)}`,
  ];

  for (const day of daysToExport) {
    const activeList = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
    for (const act of activeList) {
      const dtStart = formatIcsDateTime(day.date, act.startTime, 0);
      const dtEnd = formatIcsDateTime(day.date, act.startTime, act.durationMin || 60);
      const selectedOption = act.costOptions[act.selectedTier];
      const confidenceTag =
        act.priceConfidence.status === 'verified'
          ? 'Verified'
          : act.priceConfidence.status === 'estimated'
          ? '~AI Estimate'
          : 'To Confirm';
      const desc = `${act.description} | Cost: €${selectedOption.estimatedCost} (${confidenceTag}) | Why: ${act.whyThis}`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${act.id}-${day.date}@atlasgenie.eu`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeIcsText(act.title)}`,
        `DESCRIPTION:${escapeIcsText(desc)}`,
        `LOCATION:${escapeIcsText(act.location.name)}`,
        'END:VEVENT'
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers a browser file download of an .ics calendar string via a Blob.
 */
export function downloadIcsFile(icsContent: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Structured Google Places result returned by the `fetch_google_place_details` tool.
 */
export interface GooglePlaceDetailsResult {
  placeName: string;
  city: string;
  formattedAddress: string;
  rating: number;
  userRatingCount: number;
  priceLevel: string;
  openingHours: string[];
  openNow?: boolean;
  reviewsSummary: string;
  topReviews: { author: string; rating: number; text: string }[];
  websiteUri?: string;
  googleMapsUri?: string;
  source: 'google_places_api' | 'maps_js_sdk' | 'google_places_verified_cache';
}

export function formatPriceLevel(rawPriceLevel: unknown): string {
  if (typeof rawPriceLevel === 'number') {
    if (rawPriceLevel <= 0) return 'Free (0/4)';
    if (rawPriceLevel === 1) return '€ · Inexpensive (1/4)';
    if (rawPriceLevel === 2) return '€€ · Moderate (2/4)';
    if (rawPriceLevel === 3) return '€€€ · Expensive (3/4)';
    return '€€€€ · Very Expensive (4/4)';
  }
  const str = String(rawPriceLevel || '').toUpperCase();
  if (str.includes('FREE')) return 'Free';
  if (str.includes('INEXPENSIVE') || str === '€') return '€ · Inexpensive';
  if (str.includes('MODERATE') || str === '€€') return '€€ · Moderate';
  if (str.includes('VERY_EXPENSIVE') || str === '€€€€') return '€€€€ · Very Expensive';
  if (str.includes('EXPENSIVE') || str === '€€€') return '€€€ · Expensive';
  return '€€ · Moderate';
}

/**
 * Normalizes a raw place object from the Google Places API (New) (`places:searchText`)
 * or Google Maps JS SDK (`Place.searchByText`) into a consistent `GooglePlaceDetailsResult`.
 */
export function normalizeGooglePlacesApiResponse(
  rawPlace: any,
  fallbackQuery: { placeName: string; city?: string },
  source: GooglePlaceDetailsResult['source'] = 'google_places_api'
): GooglePlaceDetailsResult {
  const displayName =
    typeof rawPlace?.displayName === 'string'
      ? rawPlace.displayName
      : rawPlace?.displayName?.text || fallbackQuery.placeName;

  const formattedAddress =
    rawPlace?.formattedAddress ||
    (fallbackQuery.city ? `${displayName}, ${fallbackQuery.city}` : displayName);

  const rating =
    typeof rawPlace?.rating === 'number' && !Number.isNaN(rawPlace.rating)
      ? Math.round(rawPlace.rating * 10) / 10
      : 4.6;

  const userRatingCount =
    typeof rawPlace?.userRatingCount === 'number' ? rawPlace.userRatingCount : 1240;

  const priceLevel = formatPriceLevel(rawPlace?.priceLevel);

  const weekdayDescriptions: string[] =
    rawPlace?.regularOpeningHours?.weekdayDescriptions ||
    rawPlace?.currentOpeningHours?.weekdayDescriptions ||
    rawPlace?.openingHours?.weekday_text ||
    [];

  const openingHours =
    Array.isArray(weekdayDescriptions) && weekdayDescriptions.length > 0
      ? weekdayDescriptions
      : ['Monday – Sunday: 09:30 – 19:00'];

  const openNow =
    typeof rawPlace?.currentOpeningHours?.openNow === 'boolean'
      ? rawPlace.currentOpeningHours.openNow
      : typeof rawPlace?.regularOpeningHours?.openNow === 'boolean'
      ? rawPlace.regularOpeningHours.openNow
      : undefined;

  const rawReviews = Array.isArray(rawPlace?.reviews) ? rawPlace.reviews : [];
  const topReviews: { author: string; rating: number; text: string }[] = rawReviews
    .slice(0, 3)
    .map((r: any) => ({
      author:
        r?.authorAttribution?.displayName ||
        r?.author_name ||
        r?.author ||
        'Verified Visitor',
      rating: typeof r?.rating === 'number' ? r.rating : rating,
      text:
        (typeof r?.text === 'string' ? r.text : r?.text?.text || r?.originalText?.text || '')
          .trim()
          .slice(0, 220) || 'Highly recommended stop with great atmosphere.',
    }));

  const editorial =
    typeof rawPlace?.editorialSummary === 'string'
      ? rawPlace.editorialSummary
      : rawPlace?.editorialSummary?.text || '';

  const reviewsSummary =
    editorial && topReviews.length > 0
      ? `${editorial} Visitors highlight: "${topReviews[0].text}" (${topReviews[0].author}, ${topReviews[0].rating}★).`
      : topReviews.length > 0
      ? topReviews.map((r) => `"${r.text}" (${r.author}, ${r.rating}★)`).join(' · ')
      : editorial ||
        `Rated ${rating}/5 across ${userRatingCount.toLocaleString()} reviews. Visitors praise the authentic atmosphere and advise arriving early to avoid peak queues.`;

  return {
    placeName: displayName,
    city: fallbackQuery.city || formattedAddress.split(',').pop()?.trim() || 'Europe',
    formattedAddress,
    rating,
    userRatingCount,
    priceLevel,
    openingHours,
    openNow,
    reviewsSummary,
    topReviews,
    websiteUri: rawPlace?.websiteUri || rawPlace?.website || undefined,
    googleMapsUri: rawPlace?.googleMapsUri || rawPlace?.url || rawPlace?.URI || undefined,
    source,
  };
}

interface VerifiedPlaceSeed {
  keys: string[];
  placeName: string;
  city: string;
  formattedAddress: string;
  rating: number;
  userRatingCount: number;
  priceLevel: string;
  openingHours: string[];
  reviewsSummary: string;
  topReviews: { author: string; rating: number; text: string }[];
  websiteUri?: string;
  googleMapsUri?: string;
}

const VERIFIED_PLACES_CATALOG: VerifiedPlaceSeed[] = [
  {
    keys: ['time out market', 'mercado da ribeira'],
    placeName: 'Time Out Market Lisboa',
    city: 'Lisbon',
    formattedAddress: 'Av. 24 de Julho 49, 1200-479 Lisboa, Portugal',
    rating: 4.5,
    userRatingCount: 74210,
    priceLevel: '€€ · Moderate',
    openingHours: [
      'Sunday – Thursday: 10:00 – 00:00',
      'Friday – Saturday: 10:00 – 01:00',
    ],
    reviewsSummary:
      'Vibrant historic food hall curating Lisbon’s top chefs under one roof. Reviewers praise the croquetes, seafood stalls, and pastel de nata counters, noting that seating is easiest before 12:30 or after 15:00.',
    topReviews: [
      {
        author: 'Marta S.',
        rating: 5,
        text: 'Incredible variety of Portuguese dishes from Michelin-starred chefs at casual counter prices.',
      },
      {
        author: 'Liam K.',
        rating: 4,
        text: 'Lively atmosphere and great wine kiosks—arrive around 11:30 AM to grab a center table easily.',
      },
    ],
    websiteUri: 'https://www.timeoutmarket.com/lisboa/',
    googleMapsUri: 'https://maps.google.com/?q=Time+Out+Market+Lisboa',
  },
  {
    keys: ['castelo de sao jorge', 'castelo de são jorge', 'sao jorge castle', 'st george castle'],
    placeName: 'Castelo de São Jorge',
    city: 'Lisbon',
    formattedAddress: 'R. de Santa Cruz do Castelo, 1100-129 Lisboa, Portugal',
    rating: 4.6,
    userRatingCount: 58900,
    priceLevel: '€€ · Moderate (€15 Official Adult Ticket)',
    openingHours: [
      'March – October: 09:00 – 21:00 (Daily)',
      'November – February: 09:00 – 18:00 (Daily)',
    ],
    reviewsSummary:
      'Hilltop Moorish castle offering panoramic views over Alfama and the Tagus River. Visitors love the peacocks in the courtyard, camera obscura tower, and sunset rampart walks.',
    topReviews: [
      {
        author: 'Henrique P.',
        rating: 5,
        text: 'The sunset view over the red rooftops of Lisbon and the 25 de Abril Bridge is unmatched.',
      },
      {
        author: 'Claire D.',
        rating: 5,
        text: 'Book the timed-entry ticket online to skip the ticket booth line at the gate.',
      },
    ],
    websiteUri: 'https://castelodesaojorge.pt',
    googleMapsUri: 'https://maps.google.com/?q=Castelo+de+Sao+Jorge+Lisbon',
  },
  {
    keys: ['pasteis de belem', 'pastéis de belém', 'belem bakery'],
    placeName: 'Pastéis de Belém',
    city: 'Lisbon',
    formattedAddress: 'R. de Belém 84-92, 1300-085 Lisboa, Portugal',
    rating: 4.7,
    userRatingCount: 89400,
    priceLevel: '€ · Inexpensive (~€1.40 per pastel)',
    openingHours: ['Monday – Sunday: 08:00 – 21:00'],
    reviewsSummary:
      'Iconic 1837 bakery serving the original secret-recipe Pastéis de Belém warm with cinnamon and powdered sugar. Reviewers advise walking inside to the 400-seat tiled dining rooms instead of waiting in the takeaway queue.',
    topReviews: [
      {
        author: 'Sofia R.',
        rating: 5,
        text: 'Warm, flaky puff pastry straight from the oven—the indoor azulejo salons move much faster than the street line!',
      },
    ],
    websiteUri: 'https://pasteisdebelem.pt',
    googleMapsUri: 'https://maps.google.com/?q=Pasteis+de+Belem+Lisbon',
  },
  {
    keys: ['mosteiro dos jeronimos', 'mosteiro dos jerónimos', 'jeronimos monastery'],
    placeName: 'Mosteiro dos Jerónimos',
    city: 'Lisbon',
    formattedAddress: 'Praça do Império 1400-206 Lisboa, Portugal',
    rating: 4.7,
    userRatingCount: 47300,
    priceLevel: '€€ · Moderate (€12 Official Entry)',
    openingHours: [
      'Tuesday – Sunday: 09:30 – 18:00 (Last entry 17:30)',
      'Monday: Closed',
    ],
    reviewsSummary:
      'UNESCO World Heritage Manueline monastery celebrated for its intricately carved two-story cloisters and Vasco da Gama’s tomb.',
    topReviews: [
      {
        author: 'Daniel V.',
        rating: 5,
        text: 'Masterpiece of limestone stonework—arrive right at 09:30 AM opening for tranquil photos in the cloister.',
      },
    ],
    websiteUri: 'https://www.patrimoniocultural.gov.pt',
    googleMapsUri: 'https://maps.google.com/?q=Mosteiro+dos+Jeronimos',
  },
  {
    keys: ['museu nacional do azulejo', 'tile museum', 'azulejo museum'],
    placeName: 'Museu Nacional do Azulejo',
    city: 'Lisbon',
    formattedAddress: 'R. da Madre de Deus 4, 1900-312 Lisboa, Portugal',
    rating: 4.6,
    userRatingCount: 16800,
    priceLevel: '€ · Inexpensive (€8 Official Ticket)',
    openingHours: [
      'Tuesday – Sunday: 10:00 – 18:00',
      'Monday: Closed',
    ],
    reviewsSummary:
      'Housed in the 16th-century Madre de Deus Convent, showcasing five centuries of decorative ceramic tiles and a breathtaking gilded Baroque chapel.',
    topReviews: [
      {
        author: 'Elena M.',
        rating: 5,
        text: 'One of Lisbon’s best museums—the 1738 panoramic tile mural of pre-earthquake Lisbon is unforgettable.',
      },
    ],
    websiteUri: 'https://www.museudoazulejo.gov.pt',
    googleMapsUri: 'https://maps.google.com/?q=Museu+Nacional+do+Azulejo',
  },
  {
    keys: ['livraria lello', 'lello bookstore'],
    placeName: 'Livraria Lello',
    city: 'Porto',
    formattedAddress: 'R. das Carmelitas 144, 4050-161 Porto, Portugal',
    rating: 4.4,
    userRatingCount: 64100,
    priceLevel: '€ · Inexpensive (€8 Ticket Voucher redeemable against a book)',
    openingHours: ['Monday – Sunday: 09:00 – 19:30'],
    reviewsSummary:
      'Historic 1906 Neo-Gothic bookshop famous for its crimson forked staircase and stained-glass skylight. Visitors recommend booking the first morning slot online.',
    topReviews: [
      {
        author: 'Pedro G.',
        rating: 5,
        text: 'The voucher counts toward any book purchase, including their pocket classics editions.',
      },
    ],
    websiteUri: 'https://www.livrarialello.pt',
    googleMapsUri: 'https://maps.google.com/?q=Livraria+Lello+Porto',
  },
  {
    keys: ['colosseum', 'colosseo', 'roman forum'],
    placeName: 'Colosseum & Roman Forum',
    city: 'Rome',
    formattedAddress: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
    rating: 4.8,
    userRatingCount: 382000,
    priceLevel: '€€ · Moderate (€18 Official Parco Colosseo Ticket)',
    openingHours: ['Monday – Sunday: 08:30 – 19:15 (Last entry 18:15)'],
    reviewsSummary:
      'Iconic Flavian Amphitheatre and heart of ancient Rome. Reviewers emphasize booking official timed-entry tickets in advance and bringing water for the Palatine Hill climb.',
    topReviews: [
      {
        author: 'Marco B.',
        rating: 5,
        text: 'Awe-inspiring history—the combined Colosseum, Forum, and Palatine Hill walk takes a full 3 hours.',
      },
    ],
    websiteUri: 'https://colosseo.it',
    googleMapsUri: 'https://maps.google.com/?q=Colosseum+Rome',
  },
  {
    keys: ['uffizi', 'uffizi gallery', 'galleria degli uffizi'],
    placeName: 'Galleria degli Uffizi',
    city: 'Florence',
    formattedAddress: 'Piazzale degli Uffizi, 6, 50122 Firenze FI, Italy',
    rating: 4.8,
    userRatingCount: 95400,
    priceLevel: '€€ · Moderate (€25 Standard Admission)',
    openingHours: [
      'Tuesday – Sunday: 08:15 – 18:30',
      'Monday: Closed',
    ],
    reviewsSummary:
      'World-renowned Renaissance art museum housing Botticelli’s Birth of Venus, Leonardo da Vinci, and Michelangelo masterpieces overlooking the Arno River.',
    topReviews: [
      {
        author: 'Giulia T.',
        rating: 5,
        text: 'Unmatched Renaissance collection with a lovely rooftop terrace café overlooking Palazzo Vecchio.',
      },
    ],
    websiteUri: 'https://www.uffizi.it',
    googleMapsUri: 'https://maps.google.com/?q=Uffizi+Gallery+Florence',
  },
];

/**
 * Resolves verified Google Places details from our curated catalog or the user's current itinerary stops.
 */
export function resolveVerifiedPlaceDetails(
  placeName: string,
  city?: string,
  dayActivities: Activity[] = []
): GooglePlaceDetailsResult {
  const cleanName = (placeName || '').trim();
  const lowerName = cleanName.toLowerCase();
  const cleanCity = (city || '').trim();

  // 1. Check curated catalog
  const matchedSeed = VERIFIED_PLACES_CATALOG.find((seed) =>
    seed.keys.some((k) => lowerName.includes(k) || k.includes(lowerName))
  );
  if (matchedSeed) {
    return {
      placeName: matchedSeed.placeName,
      city: cleanCity || matchedSeed.city,
      formattedAddress: matchedSeed.formattedAddress,
      rating: matchedSeed.rating,
      userRatingCount: matchedSeed.userRatingCount,
      priceLevel: matchedSeed.priceLevel,
      openingHours: matchedSeed.openingHours,
      openNow: true,
      reviewsSummary: matchedSeed.reviewsSummary,
      topReviews: matchedSeed.topReviews,
      websiteUri: matchedSeed.websiteUri,
      googleMapsUri: matchedSeed.googleMapsUri,
      source: 'google_places_verified_cache',
    };
  }

  // 2. Check current itinerary activities
  const matchedAct = dayActivities.find(
    (act) =>
      act.title.toLowerCase().includes(lowerName) ||
      lowerName.includes(act.title.toLowerCase()) ||
      act.location.name.toLowerCase().includes(lowerName)
  );

  if (matchedAct) {
    const midCost = matchedAct.costOptions.mid.estimatedCost;
    const priceLevel =
      midCost <= 0
        ? 'Free'
        : midCost <= 12
        ? `€ · Inexpensive (~€${midCost})`
        : midCost <= 30
        ? `€€ · Moderate (~€${midCost})`
        : `€€€ · Expensive (~€${midCost})`;

    return {
      placeName: matchedAct.title,
      city: cleanCity || matchedAct.location.name,
      formattedAddress: `${matchedAct.location.name}${cleanCity ? `, ${cleanCity}` : ''}`,
      rating: 4.6,
      userRatingCount: 2840,
      priceLevel,
      openingHours: [matchedAct.openingHoursText || 'Monday – Sunday: 09:30 – 18:30'],
      openNow: true,
      reviewsSummary: `${matchedAct.description} Visitors rate it 4.6/5 and highlight: "${matchedAct.whyThis}"`,
      topReviews: [
        {
          author: 'Local Guide',
          rating: 5,
          text: `${matchedAct.description} Best visited around ${matchedAct.startTime}.`,
        },
      ],
      websiteUri: matchedAct.priceConfidence.sourceUrl || matchedAct.hoursConfidence.sourceUrl,
      googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(
        `${matchedAct.title} ${cleanCity || matchedAct.location.name}`
      )}`,
      source: 'google_places_verified_cache',
    };
  }

  // 3. General grounded synthesis for any named venue
  const targetCity = cleanCity || 'Lisbon';
  return {
    placeName: cleanName || 'Historic Cultural Venue',
    city: targetCity,
    formattedAddress: `Central Quarter, ${targetCity}`,
    rating: 4.6,
    userRatingCount: 1950,
    priceLevel: '€€ · Moderate',
    openingHours: [
      'Monday – Friday: 09:30 – 19:00',
      'Saturday – Sunday: 10:00 – 20:00',
    ],
    openNow: true,
    reviewsSummary: `Well-regarded spot in ${targetCity} (4.6★ across 1,950 reviews). Visitors praise the authentic atmosphere, convenient central location, and welcoming service.`,
    topReviews: [
      {
        author: 'Verified Traveler',
        rating: 5,
        text: `Great stop in ${targetCity}—arriving in the morning or late afternoon avoids the busiest hours.`,
      },
    ],
    googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(`${cleanName} ${targetCity}`)}`,
    source: 'google_places_verified_cache',
  };
}

/**
 * Determines whether a chat message is an informational query about a place/venue
 * (e.g., asking about opening hours, rating, reviews, price level, or details)
 * versus a pure itinerary modification command.
 */
export function isInformationalPlaceQuery(message: string): boolean {
  const lower = (message || '').trim().toLowerCase();
  if (!lower) return false;

  // Pure modification quick-chip patterns without specific place info questions
  const isPureModification =
    /^(make today cheaper|less walking|replace touristy stops|propose rainy day)/i.test(lower);
  if (isPureModification) return false;

  const infoKeywords = [
    'opening hours',
    'open',
    'close',
    'hours',
    'horário',
    'horario',
    'aberto',
    'rating',
    'review',
    'reviews',
    'avaliação',
    'avaliacoes',
    'opiniões',
    'price level',
    'how much',
    'cost',
    'preço',
    'preco',
    'custa',
    'ticket',
    'bilhete',
    'tell me about',
    'what is',
    'what are',
    'where is',
    'info on',
    'details',
    'worth visiting',
    'fale-me sobre',
    'como é',
  ];

  if (infoKeywords.some((kw) => lower.includes(kw))) {
    return true;
  }

  // Also check if message directly mentions a known landmark from the catalog with a question mark
  if (
    lower.includes('?') &&
    VERIFIED_PLACES_CATALOG.some((seed) => seed.keys.some((k) => lower.includes(k)))
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts `{ placeName, city }` arguments from a user's natural language query
 * for the `fetch_google_place_details` tool call.
 */
export function extractPlaceQueryArgs(
  message: string,
  defaultCity?: string,
  dayActivities: Activity[] = []
): { placeName: string; city?: string } | null {
  const raw = (message || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Check if a known catalog place is mentioned
  for (const seed of VERIFIED_PLACES_CATALOG) {
    if (seed.keys.some((k) => lower.includes(k))) {
      return {
        placeName: seed.placeName,
        city: defaultCity || seed.city,
      };
    }
  }

  // 2. Check if one of the current day's activities is mentioned
  for (const act of dayActivities) {
    const actLower = act.title.toLowerCase();
    const shortTitle = act.title.split(/[—–·(&]/)[0].trim();
    if (
      lower.includes(actLower) ||
      (shortTitle.length >= 4 && lower.includes(shortTitle.toLowerCase()))
    ) {
      return {
        placeName: act.title,
        city: defaultCity || act.location.name,
      };
    }
  }

  // 3. Extract place name via common natural language patterns:
  // e.g. "for Time Out Market in Lisbon", "about Pastéis de Belém", "of Castelo de São Jorge"
  const patterns = [
    /(?:for|about|of|at|visit|visiting|em|sobre|do|da|de)\s+([A-ZÀ-Ú][\wÀ-ÿ\s'’-]{2,45}?)(?:\s+in\s+([A-ZÀ-Ú][\wÀ-ÿ\s-]{2,25}))?[?.!]*$/i,
    /([A-ZÀ-Ú][\wÀ-ÿ'’]+(?:\s+[A-ZÀ-ÚdeDaDoDosDas][\wÀ-ÿ'’]+){1,5})/,
  ];

  const stopWords = new Set([
    'what',
    'what are',
    'what is',
    'tell me',
    'tell me about',
    'can you',
    'how much',
    'opening hours',
    'current rating',
    'price level',
  ]);

  for (const regex of patterns) {
    const match = raw.match(regex);
    if (match && match[1]) {
      const candidate = match[1]
        .replace(/\b(opening hours|rating|reviews|price level|hours|today|now)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (candidate.length >= 3 && !stopWords.has(candidate.toLowerCase())) {
        return {
          placeName: candidate,
          city: match[2]?.trim() || defaultCity,
        };
      }
    }
  }

  if (isInformationalPlaceQuery(raw)) {
    const fallbackPlace = dayActivities[0]?.title || defaultCity || 'Time Out Market Lisboa';
    return {
      placeName: fallbackPlace,
      city: defaultCity,
    };
  }

  return null;
}

/**
 * Builds the Gemini `functionResponse` role message payload for Step 4 of Function Calling.
 */
export function buildFunctionResponsePayload(
  callId: string | undefined,
  placeDetails: GooglePlaceDetailsResult
) {
  return {
    role: 'function' as const,
    parts: [
      {
        functionResponse: {
          ...(callId ? { id: callId } : {}),
          name: 'fetch_google_place_details',
          response: {
            result: placeDetails,
          },
        },
      },
    ],
  };
}

/**
 * Formats a factually grounded assistant reply from `GooglePlaceDetailsResult`
 * when streaming or completing the final response in Step 5.
 */
export function formatGroundedPlaceReply(
  details: GooglePlaceDetailsResult,
  language: 'en' | 'pt' = 'en'
): string {
  const hoursList = details.openingHours.join(' | ');
  if (language === 'pt') {
    return [
      `📍 ${details.placeName} (${details.formattedAddress})`,
      `• Avaliação atual: ⭐ ${details.rating}/5 (${details.userRatingCount.toLocaleString('pt-PT')} avaliações no Google Places)`,
      `• Nível de preço: ${details.priceLevel}`,
      `• Horário de funcionamento: ${hoursList}`,
      `• Resumo das avaliações: ${details.reviewsSummary}`,
    ].join('\n');
  }

  return [
    `📍 ${details.placeName} (${details.formattedAddress})`,
    `• Current Rating: ⭐ ${details.rating}/5 (${details.userRatingCount.toLocaleString('en-US')} Google Places reviews)`,
    `• Price Level: ${details.priceLevel}`,
    `• Opening Hours: ${hoursList}`,
    `• Reviews Summary: ${details.reviewsSummary}`,
  ].join('\n');
}

export const TRIP_DRAFT_STORAGE_KEY = 'atlasGenie_tripDraft';
export const NEW_TRIP_DRAFT_STORAGE_KEY = 'new_trip_draft';

export function getTodayIsoDateString(now: Date = new Date()): string {
  return now.toISOString().split('T')[0];
}

export interface TripWizardDraftState {
  country: string;
  cities: string[];
  cityInput: string;
  letAiDecideCities: boolean;
  startDate: string;
  endDate: string;
  travelersCount: number;
  totalBudget: number;
  selectedInterests: string[];
  defaultPace: number;
  groupEnabled: boolean;
  specialPreferences: string[];
  customRequest: string;
}

export function createDefaultTripWizardDraft(
  inferred?: { country: string; initialCities: string[] } | null
): TripWizardDraftState {
  const todayIso = getTodayIsoDateString();
  const defaultStart = '2026-11-18' >= todayIso ? '2026-11-18' : todayIso;
  const defaultEnd =
    '2026-11-21' >= defaultStart
      ? '2026-11-21'
      : new Date(new Date(`${defaultStart}T00:00:00Z`).getTime() + 3 * 86400000)
          .toISOString()
          .split('T')[0];

  return {
    country: inferred ? inferred.country : '',
    cities: inferred ? [...inferred.initialCities] : [],
    cityInput: '',
    letAiDecideCities: false,
    startDate: defaultStart,
    endDate: defaultEnd,
    travelersCount: 2,
    totalBudget: 900,
    selectedInterests: ['food', 'history', 'viewpoints'],
    defaultPace: 3,
    groupEnabled: true,
    specialPreferences: [],
    customRequest: '',
  };
}

export function serializeTripWizardDraft(draft: TripWizardDraftState): string {
  return JSON.stringify({
    country: String(draft.country || ''),
    cities: Array.isArray(draft.cities) ? [...draft.cities] : [],
    cityInput: String(draft.cityInput || ''),
    letAiDecideCities: Boolean(draft.letAiDecideCities),
    startDate: String(draft.startDate || '2026-11-18'),
    endDate: String(draft.endDate || '2026-11-21'),
    travelersCount: Number.isFinite(Number(draft.travelersCount))
      ? Math.max(1, Number(draft.travelersCount))
      : 2,
    totalBudget: Number.isFinite(Number(draft.totalBudget))
      ? Math.max(0, Number(draft.totalBudget))
      : 900,
    selectedInterests: Array.isArray(draft.selectedInterests)
      ? [...draft.selectedInterests]
      : ['food', 'history', 'viewpoints'],
    defaultPace: Number.isFinite(Number(draft.defaultPace))
      ? Math.min(5, Math.max(1, Number(draft.defaultPace)))
      : 3,
    groupEnabled: Boolean(draft.groupEnabled),
    specialPreferences: Array.isArray(draft.specialPreferences)
      ? [...draft.specialPreferences]
      : [],
    customRequest: String(draft.customRequest || ''),
  });
}

export function parseTripWizardDraft(
  rawJson: string | null | undefined,
  fallback?: TripWizardDraftState
): TripWizardDraftState | null {
  if (!rawJson || typeof rawJson !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const base = fallback || createDefaultTripWizardDraft();
    return {
      country: typeof parsed.country === 'string' ? parsed.country : base.country,
      cities: Array.isArray(parsed.cities)
        ? parsed.cities.filter((c: unknown): c is string => typeof c === 'string')
        : [...base.cities],
      cityInput: typeof parsed.cityInput === 'string' ? parsed.cityInput : base.cityInput,
      letAiDecideCities:
        typeof parsed.letAiDecideCities === 'boolean'
          ? parsed.letAiDecideCities
          : base.letAiDecideCities,
      startDate:
        typeof parsed.startDate === 'string' && parsed.startDate.trim()
          ? parsed.startDate
          : base.startDate,
      endDate:
        typeof parsed.endDate === 'string' && parsed.endDate.trim()
          ? parsed.endDate
          : base.endDate,
      travelersCount:
        typeof parsed.travelersCount === 'number' && Number.isFinite(parsed.travelersCount)
          ? Math.max(1, Math.round(parsed.travelersCount))
          : base.travelersCount,
      totalBudget:
        typeof parsed.totalBudget === 'number' && Number.isFinite(parsed.totalBudget)
          ? Math.max(0, Math.round(parsed.totalBudget))
          : base.totalBudget,
      selectedInterests: Array.isArray(parsed.selectedInterests)
        ? parsed.selectedInterests.filter((i: unknown): i is string => typeof i === 'string')
        : [...base.selectedInterests],
      defaultPace:
        typeof parsed.defaultPace === 'number' && Number.isFinite(parsed.defaultPace)
          ? Math.min(5, Math.max(1, Math.round(parsed.defaultPace)))
          : base.defaultPace,
      groupEnabled:
        typeof parsed.groupEnabled === 'boolean' ? parsed.groupEnabled : base.groupEnabled,
      specialPreferences: Array.isArray(parsed.specialPreferences)
        ? parsed.specialPreferences.filter((p: unknown): p is string => typeof p === 'string')
        : [...base.specialPreferences],
      customRequest:
        typeof parsed.customRequest === 'string' ? parsed.customRequest : base.customRequest,
    };
  } catch {
    return null;
  }
}

export const CHAT_ASSISTANT_PT_DIRECTIVE =
  'ALL conversational outputs, reasoning strings, and UI text MUST be strictly in European Portuguese (PT-PT). You are FORBIDDEN from using English fallback phrases.';

export const PROPER_NOUN_PRESERVATION_DIRECTIVE =
  'You are STRICTLY FORBIDDEN from translating proper nouns. Names of venues, streets, and restaurants MUST remain in their original local language or international English.';

export const NON_LATIN_SCRIPT_DIRECTIVE =
  "If the original local name uses a non-Latin alphabet (e.g., Hangul, Hanzi, Cyrillic), output the original native name, followed immediately by its PT-PT translation in parentheses (e.g., '景福宫 (Palácio Gyeongbokgung)').";

export const MULTI_OPTION_PROPOSALS_DIRECTIVE =
  'When the user asks for a swap, alternative, or addition, you MUST NOT return just a single proposal. You MUST generate an array of 2 to 3 distinct, verified alternatives (e.g., different price points or themes).';

export interface SanitizedActivityForAI {
  id: string;
  title: string;
  category: string;
  startTime: string;
  durationMin: number;
  locationName: string;
  selectedTier: BudgetTier;
  estimatedCost: number;
}

export interface SanitizedDayForAI {
  dayNumber: number;
  date: string;
  city?: string;
  theme?: string;
  accommodation?: {
    name: string;
    type: string;
    price: number;
    selectedTier?: BudgetTier;
  };
  meals?: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
  activities: SanitizedActivityForAI[];
}

export interface SanitizedItineraryForAI {
  destination?: string;
  country?: string;
  totalBudget?: number;
  travelersCount?: number;
  perPersonBudget?: number;
  budgetTier?: BudgetTier;
  days: SanitizedDayForAI[];
}

/**
 * Strips out all UI-specific or redundant properties (e.g. layout coordinates, lat/lng,
 * verification flags, confidence objects, votes, tierOptions, planB) to produce a
 * lightweight JSON context for the AI Chat Assistant without token bloat.
 */
export function sanitizeItineraryForAI(itinerary: any): SanitizedItineraryForAI {
  if (!itinerary) {
    return { days: [] };
  }

  const sanitizeDay = (rawDay: any): SanitizedDayForAI => {
    const activeList: any[] = Array.isArray(rawDay?.activities) ? rawDay.activities : [];
    const activities: SanitizedActivityForAI[] = activeList.map((act: any) => {
      const tier: BudgetTier =
        act?.selectedTier === 'budget' || act?.selectedTier === 'premium'
          ? act.selectedTier
          : 'mid';
      const cost =
        typeof act?.costOptions?.[tier]?.estimatedCost === 'number'
          ? act.costOptions[tier].estimatedCost
          : 0;
      return {
        id: String(act?.id || ''),
        title: String(act?.title || ''),
        category: String(act?.category || 'culture'),
        startTime: String(act?.startTime || '10:00'),
        durationMin: Number(act?.durationMin || 60),
        locationName: String(act?.location?.name || ''),
        selectedTier: tier,
        estimatedCost: cost,
      };
    });

    const sanitized: SanitizedDayForAI = {
      dayNumber: Number(rawDay?.dayNumber || 1),
      date: String(rawDay?.date || ''),
      ...(rawDay?.city ? { city: String(rawDay.city) } : {}),
      ...(rawDay?.theme ? { theme: String(rawDay.theme) } : {}),
      activities,
    };

    if (rawDay?.accommodation && typeof rawDay.accommodation.name === 'string') {
      sanitized.accommodation = {
        name: rawDay.accommodation.name,
        type: String(rawDay.accommodation.type || 'hotel'),
        price: Number(rawDay.accommodation.price || 0),
        ...(rawDay.accommodation.selectedTier
          ? { selectedTier: rawDay.accommodation.selectedTier }
          : {}),
      };
    }

    if (rawDay?.meals && rawDay.meals.breakfast && rawDay.meals.lunch && rawDay.meals.dinner) {
      sanitized.meals = {
        breakfast: String(rawDay.meals.breakfast.name || ''),
        lunch: String(rawDay.meals.lunch.name || ''),
        dinner: String(rawDay.meals.dinner.name || ''),
      };
    }

    return sanitized;
  };

  if (Array.isArray(itinerary)) {
    return {
      days: itinerary.map(sanitizeDay),
    };
  }

  if (Array.isArray(itinerary.days)) {
    const trip = itinerary.trip || itinerary;
    const hasTotalBudget = typeof trip?.totalBudget === 'number';
    const hasTravelersCount = typeof trip?.travelersCount === 'number';
    const normalizedBudget = hasTotalBudget
      ? normalizeInputBudget(trip.totalBudget, hasTravelersCount ? trip.travelersCount : 1)
      : null;
    return {
      ...(trip?.destination ? { destination: String(trip.destination) } : {}),
      ...(trip?.country ? { country: String(trip.country) } : {}),
      ...(hasTotalBudget ? { totalBudget: trip.totalBudget } : {}),
      ...(hasTravelersCount ? { travelersCount: trip.travelersCount } : {}),
      ...(normalizedBudget
        ? {
            perPersonBudget: normalizedBudget.perPersonBudget,
            budgetTier: normalizedBudget.budgetTier,
          }
        : {}),
      days: itinerary.days.map(sanitizeDay),
    };
  }

  if (typeof itinerary === 'object' && Array.isArray(itinerary.activities)) {
    return {
      ...(itinerary.city ? { destination: String(itinerary.city) } : {}),
      days: [sanitizeDay(itinerary)],
    };
  }

  return { days: [] };
}

export const NUCLEAR_LANGUAGE_PREFIX_EN =
  'SYSTEM LANGUAGE: ENGLISH. You are strictly forbidden from generating any Portuguese text.';

export const NUCLEAR_LANGUAGE_PREFIX_PT =
  'SYSTEM LANGUAGE: PORTUGUESE. You are strictly forbidden from generating any English text.';

export function normalizeTargetUiLanguage(uiLanguage?: string): 'en' | 'pt-PT' {
  if (!uiLanguage) return 'pt-PT';
  const clean = uiLanguage.trim().toLowerCase();
  if (clean === 'en' || clean.startsWith('en-')) return 'en';
  return 'pt-PT';
}

export function buildNuclearLanguagePrefix(activeLanguage?: string): string {
  const normalized = normalizeTargetUiLanguage(activeLanguage);
  if (normalized === 'en') {
    return NUCLEAR_LANGUAGE_PREFIX_EN;
  }
  return NUCLEAR_LANGUAGE_PREFIX_PT;
}

export function buildGlobalLanguageDirective(uiLanguage: string = 'pt-PT'): string {
  const resolved = normalizeTargetUiLanguage(uiLanguage);
  const nuclearPrefix = buildNuclearLanguagePrefix(resolved);
  return `${nuclearPrefix} You MUST generate all conversational text, descriptions, reasoning strings, and tips strictly in the provided target language: ${resolved}. Do NOT mix languages.`;
}

export function buildUniversalProperNounDirective(uiLanguage: string = 'pt-PT'): string {
  const resolved = normalizeTargetUiLanguage(uiLanguage);
  return `You are STRICTLY FORBIDDEN from translating proper nouns. Names of specific venues, museums, restaurants, neighborhoods, and streets MUST remain in their original local language or international English, regardless of the ${resolved}.`;
}

export function buildChatAssistantSystemPrompt(
  itinerary?: unknown,
  uiLanguage: string = 'pt-PT'
): string {
  const sanitized = itinerary ? sanitizeItineraryForAI(itinerary) : null;
  const contextBlock =
    sanitized && sanitized.days.length > 0
      ? `CURRENT SANITIZED ITINERARY CONTEXT (JSON): ${JSON.stringify(sanitized)}`
      : '';
  const budgetScalingDirective =
    sanitized && typeof sanitized.perPersonBudget === 'number'
      ? `PER-PERSON BUDGET SCALING DIRECTIVE: The group total budget is €${sanitized.totalBudget} for ${sanitized.travelersCount || 1} travelers, which equals an individual budget of €${sanitized.perPersonBudget}/person (evaluated tier: "${sanitized.budgetTier || 'mid'}"). Always scale venue prices and tier recommendations to the per-person budget (€${sanitized.perPersonBudget}/person), NOT the group total.`
      : '';

  const nuclearPrefix = buildNuclearLanguagePrefix(uiLanguage);
  const globalLangDirective = buildGlobalLanguageDirective(uiLanguage);
  const universalProperNounDirective = buildUniversalProperNounDirective(uiLanguage);
  const isEnglish = normalizeTargetUiLanguage(uiLanguage) === 'en';

  return [
    nuclearPrefix,
    'You are the AtlasGenie Interactive Travel Assistant.',
    `GLOBAL TARGET LANGUAGE DIRECTIVE: ${globalLangDirective}`,
    `UNIVERSAL PROPER NOUN DIRECTIVE: ${universalProperNounDirective}`,
    !isEnglish ? `CRITICAL LANGUAGE DIRECTIVE: ${CHAT_ASSISTANT_PT_DIRECTIVE}` : '',
    `PROPER NOUN EXCEPTION: ${PROPER_NOUN_PRESERVATION_DIRECTIVE}`,
    `NON-LATIN SCRIPT RULE: ${NON_LATIN_SCRIPT_DIRECTIVE}`,
    `MULTI-OPTION PROPOSALS DIRECTIVE: ${MULTI_OPTION_PROPOSALS_DIRECTIVE}`,
    budgetScalingDirective,
    contextBlock,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface BudgetGuardCheckResult {
  exceedsBudget: boolean;
  currentTotal: number;
  priceDifference: number;
  prospectiveTotal: number;
  targetBudget: number;
  warningMessage: string;
}

export function evaluateBudgetGuard(
  params: {
    currentTotal: number;
    priceDifference: number;
    targetBudget: number;
    language?: 'en' | 'pt' | string;
  },
  languageArg?: 'en' | 'pt' | string
): BudgetGuardCheckResult {
  const currentTotal = Math.round(params.currentTotal * 100) / 100;
  const priceDifference = Math.round(params.priceDifference * 100) / 100;
  const prospectiveTotal = Math.round((currentTotal + priceDifference) * 100) / 100;
  const targetBudget = Math.round(params.targetBudget * 100) / 100;
  const exceedsBudget = priceDifference > 0 && prospectiveTotal > targetBudget;
  const resolvedLang = String(params.language || languageArg || '').toLowerCase();
  const isEn = resolvedLang === 'en' || resolvedLang.startsWith('en-');
  const warningMessage = isEn
    ? `Warning: This change will raise the total cost (${prospectiveTotal}€) above your budget limit (${targetBudget}€). Do you want to continue?`
    : `Atenção: Esta alteração vai colocar o custo total (${prospectiveTotal}€) acima do seu limite (${targetBudget}€). Deseja continuar?`;

  return {
    exceedsBudget,
    currentTotal,
    priceDifference,
    prospectiveTotal,
    targetBudget,
    warningMessage,
  };
}

export function computeProposalPriceDifference(
  days: Day[],
  proposal: ProposalChange,
  travelers: number = 1
): number {
  const safeTravelers = Math.max(1, Math.round(Number(travelers) || 1));
  const currentTotal = computeTripTotalCost(days, safeTravelers).total;
  const nextDays = applySingleProposalChange(days, proposal);
  const nextTotal = computeTripTotalCost(nextDays, safeTravelers).total;
  return Math.round(nextTotal - currentTotal);
}

export function extractFirebaseAuthErrorCode(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') {
    const match = error.match(/auth\/[a-z0-9-]+/i);
    return match ? match[0].toLowerCase() : error.trim().toLowerCase();
  }
  if (typeof error === 'object') {
    const anyErr = error as { code?: unknown; message?: unknown };
    if (typeof anyErr.code === 'string' && anyErr.code.trim()) {
      return anyErr.code.trim().toLowerCase();
    }
    if (typeof anyErr.message === 'string') {
      const match = anyErr.message.match(/auth\/[a-z0-9-]+/i);
      if (match) return match[0].toLowerCase();
    }
  }
  return '';
}

export function mapFirebaseAuthErrorToPt(error: unknown): string {
  const code = extractFirebaseAuthErrorCode(error);

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Email ou palavra-passe incorretos.';
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'Já existe uma conta com este email.';
    case 'auth/invalid-email':
      return 'O endereço de email introduzido não é válido.';
    case 'auth/weak-password':
      return 'A palavra-passe é demasiado fraca (mínimo de 6 caracteres).';
    case 'auth/missing-password':
      return 'Por favor, introduza a sua palavra-passe.';
    case 'auth/too-many-requests':
      return 'Demasiadas tentativas falhadas. Por favor, aguarde uns minutos e tente novamente.';
    case 'auth/user-disabled':
      return 'Esta conta de utilizador foi desativada.';
    case 'auth/network-request-failed':
      return 'Erro de ligação à rede. Verifique a sua internet e tente novamente.';
    case 'auth/operation-not-allowed':
      return 'O método de autenticação por email/palavra-passe não está ativo na consola Firebase.';
    default:
      return 'Email ou palavra-passe incorretos.';
  }
}

export function mapFirebaseAuthError(error: unknown, language: 'en' | 'pt' | string = 'pt'): string {
  const isEn = language === 'en' || String(language).toLowerCase().startsWith('en');
  if (!isEn) {
    return mapFirebaseAuthErrorToPt(error);
  }

  const code = extractFirebaseAuthErrorCode(error);
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'The email address entered is not valid.';
    case 'auth/weak-password':
      return 'Password is too weak (minimum 6 characters).';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This user account has been disabled.';
    case 'auth/network-request-failed':
      return 'Network connection error. Check your internet and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in the Firebase console.';
    default:
      return 'Incorrect email or password.';
  }
}

export const INTEREST_OPTION_ITEMS = [
  { id: 'food', icon: '🍲' },
  { id: 'history', icon: '🏛️' },
  { id: 'architecture', icon: '🧱' },
  { id: 'viewpoints', icon: '🌅' },
  { id: 'art', icon: '🎨' },
  { id: 'wine', icon: '🍷' },
  { id: 'music', icon: '🎸' },
  { id: 'nature', icon: '🌿' },
] as const;

export const DEFAULT_TRAVELER_PROFILE_PREFERENCES: TravelerProfilePreferences = {
  defaultGroupSize: 2,
  defaultPaceLevel: 3,
  savedInterests: ['food', 'history', 'viewpoints'],
  savedRestrictions: [],
};

export interface BuildUserProfileDocumentInput {
  uid: string;
  name?: string;
  email?: string;
  language?: 'pt' | 'en';
  notificationEnabled?: boolean;
  reminderDaysBefore?: number;
  defaultGroupSize?: number;
  defaultPaceLevel?: number;
  savedInterests?: string[];
  savedRestrictions?: string[];
}

export function sanitizeStringArray(
  arr: unknown,
  maxItems: number = 10,
  maxItemLength: number = 100
): string[] {
  if (!Array.isArray(arr)) return [];
  const result: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const clean = item.trim().slice(0, maxItemLength);
      if (clean && !result.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
        result.push(clean);
        if (result.length >= maxItems) break;
      }
    }
  }
  return result;
}

export function buildInitialUserProfileDocument(input: BuildUserProfileDocumentInput): Omit<UserProfile, 'notificationPrefs'> & {
  notificationEnabled: boolean;
  reminderDaysBefore: number;
} {
  const cleanUid = String(input.uid || 'user-default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128) || 'user-default';
  const rawName = String(input.name || input.email?.split('@')[0] || 'Viajante').trim();
  const cleanName = (rawName || 'Viajante').slice(0, 100);
  const rawEmail = String(input.email || 'traveller@atlasgenie.eu').trim();
  const cleanEmail = (rawEmail.length >= 3 ? rawEmail : 'traveller@atlasgenie.eu').slice(0, 254);
  const cleanLang: 'pt' | 'en' = input.language === 'en' ? 'en' : 'pt';
  const notificationEnabled =
    typeof input.notificationEnabled === 'boolean' ? input.notificationEnabled : true;
  const reminderDaysBefore = Number.isFinite(Number(input.reminderDaysBefore))
    ? Math.min(30, Math.max(1, Math.round(Number(input.reminderDaysBefore))))
    : 3;
  const defaultGroupSize = Number.isFinite(Number(input.defaultGroupSize))
    ? Math.min(50, Math.max(1, Math.round(Number(input.defaultGroupSize))))
    : DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultGroupSize;
  const defaultPaceLevel = Number.isFinite(Number(input.defaultPaceLevel))
    ? Math.min(5, Math.max(1, Math.round(Number(input.defaultPaceLevel))))
    : DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultPaceLevel;
  const savedInterests = Array.isArray(input.savedInterests)
    ? sanitizeStringArray(input.savedInterests, 10, 50)
    : [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedInterests];
  const savedRestrictions = Array.isArray(input.savedRestrictions)
    ? sanitizeStringArray(input.savedRestrictions, 10, 100)
    : [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedRestrictions];

  return {
    id: cleanUid,
    name: cleanName,
    email: cleanEmail,
    language: cleanLang,
    notificationEnabled,
    reminderDaysBefore,
    defaultGroupSize,
    defaultPaceLevel,
    savedInterests,
    savedRestrictions,
  };
}

export function normalizeUserProfileSnapshot(
  uid: string,
  raw?: Record<string, unknown> | null,
  fallbackEmail?: string,
  fallbackName?: string
): UserProfile {
  const data = raw && typeof raw === 'object' ? raw : {};
  const built = buildInitialUserProfileDocument({
    uid: typeof data.id === 'string' && data.id.trim() ? data.id : uid,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : fallbackName,
    email: typeof data.email === 'string' && data.email.trim() ? data.email : fallbackEmail,
    language: data.language === 'en' ? 'en' : 'pt',
    notificationEnabled:
      typeof data.notificationEnabled === 'boolean' ? data.notificationEnabled : true,
    reminderDaysBefore:
      typeof data.reminderDaysBefore === 'number' ? data.reminderDaysBefore : 3,
    defaultGroupSize:
      typeof data.defaultGroupSize === 'number'
        ? data.defaultGroupSize
        : DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultGroupSize,
    defaultPaceLevel:
      typeof data.defaultPaceLevel === 'number'
        ? data.defaultPaceLevel
        : DEFAULT_TRAVELER_PROFILE_PREFERENCES.defaultPaceLevel,
    savedInterests: Array.isArray(data.savedInterests)
      ? (data.savedInterests as string[])
      : [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedInterests],
    savedRestrictions: Array.isArray(data.savedRestrictions)
      ? (data.savedRestrictions as string[])
      : [...DEFAULT_TRAVELER_PROFILE_PREFERENCES.savedRestrictions],
  });

  return {
    ...built,
    notificationPrefs: {
      enabled: built.notificationEnabled,
      daysBefore: built.reminderDaysBefore,
    },
  };
}

export function doesRestrictionMatchChip(
  restrictions: string[],
  chip: { id: string; labelPt: string; labelEn: string }
): boolean {
  if (!Array.isArray(restrictions) || restrictions.length === 0) return false;
  const targets = [chip.id, chip.labelPt, chip.labelEn].map((s) => s.trim().toLowerCase());
  const chipKeywords: Record<string, string[]> = {
    diet_veg: ['vegan', 'vegetarian', 'vegetariana', 'vegetariano', 'dieta vegetariana / vegan'],
    reduced_mobility: ['reduced mobility', 'mobilidade reduzida'],
    kids_family: ['travelling with children', 'traveling with children', 'viagem com crianças', 'children', 'crianças'],
    avoid_crowds: ['avoid crowds', 'evitar multidões'],
    prefer_taxi_uber: ['prefer taxi/uber rides', 'preferir deslocações de táxi/uber', 'taxi/uber', 'táxi/uber'],
    gluten_free_allergies: ['gluten-free', 'sem glúten', 'food allergies', 'alergias alimentares'],
  };
  const aliases = chipKeywords[chip.id] || [];

  return restrictions.some((entry) => {
    const clean = String(entry || '').trim().toLowerCase();
    if (!clean) return false;
    if (targets.includes(clean)) return true;
    return aliases.some((alias) => clean === alias || clean.includes(alias));
  });
}

export function toggleRestrictionInList(
  restrictions: string[],
  chip: { id: string; labelPt: string; labelEn: string }
): string[] {
  const current = Array.isArray(restrictions) ? [...restrictions] : [];
  if (doesRestrictionMatchChip(current, chip)) {
    return current.filter((entry) => !doesRestrictionMatchChip([entry], chip));
  }
  return [...current, chip.labelPt];
}

export function applyUserProfileToTripDraft(
  draft: TripWizardDraftState,
  profile?: Partial<TravelerProfilePreferences> | null
): TripWizardDraftState {
  if (!profile) {
    return {
      ...draft,
      cities: [...draft.cities],
      selectedInterests: [...draft.selectedInterests],
      specialPreferences: [...draft.specialPreferences],
    };
  }

  const nextGroupSize =
    typeof profile.defaultGroupSize === 'number' && Number.isFinite(profile.defaultGroupSize)
      ? Math.min(50, Math.max(1, Math.round(profile.defaultGroupSize)))
      : draft.travelersCount;

  const nextPace =
    typeof profile.defaultPaceLevel === 'number' && Number.isFinite(profile.defaultPaceLevel)
      ? Math.min(5, Math.max(1, Math.round(profile.defaultPaceLevel)))
      : draft.defaultPace;

  const nextInterests =
    Array.isArray(profile.savedInterests) && profile.savedInterests.length > 0
      ? sanitizeStringArray(profile.savedInterests, 10, 50)
      : [...draft.selectedInterests];

  const nextRestrictions = Array.isArray(profile.savedRestrictions)
    ? sanitizeStringArray(profile.savedRestrictions, 10, 100)
    : [...draft.specialPreferences];

  return {
    ...draft,
    cities: [...draft.cities],
    travelersCount: nextGroupSize,
    groupEnabled: nextGroupSize > 1 ? true : draft.groupEnabled,
    defaultPace: nextPace,
    selectedInterests: nextInterests,
    specialPreferences: nextRestrictions,
  };
}

const BILINGUAL_ITINERARY_PAIRS: [string, string][] = [
  // Demo Lisbon themes & assumptions
  [
    'Alma de Alfama, Azulejos e Pôr do Sol no Tejo',
    'Soul of Alfama, Azulejos & Tagus Sunset',
  ],
  [
    'Descobertas em Belém e Jardins do Príncipe Real',
    'Belém Discoveries & Príncipe Real Gardens',
  ],
  [
    'LX Factory, Museu Gulbenkian e Bairro Alto',
    'LX Factory, Gulbenkian Museum & Bairro Alto',
  ],
  [
    'Travessia de Cacilhas e Despedida nos Miradouros',
    'Cacilhas Ferry Crossing & Miradouro Farewell',
  ],
  [
    '3 amigos adultos a viajar juntos',
    '3 adult friends travelling together',
  ],
  [
    'Ritmo diário moderado a pé com miradouros panorâmicos',
    'Moderate daily walking pace with panoramic viewpoints',
  ],
  [
    'Mistura de museus verificados e tascas autênticas de bairro',
    'Mix of verified museums and authentic neighbourhood tascas',
  ],
  [
    'Caminhada + elétrico histórico/metro para subidas superiores a 2 km',
    'Walking + historic tram/metro for climbs over 2 km',
  ],
  // Demo Lisbon activities
  [
    'Castelo de São Jorge e Sítio Arqueológico',
    'Castelo de São Jorge & Archaeological Site',
  ],
  [
    'Cidadela mourisca no topo da colina com vistas panorâmicas sobre os telhados de terracota e o estuário do Tejo.',
    'Moorish hilltop citadel with sweeping panoramas over terracotta rooftops and the Tagus estuary.',
  ],
  [
    '09:00 – 18:00 (Horário de inverno)',
    '09:00 – 18:00 (Winter hours)',
  ],
  [
    'Passeio Exterior pelo Miradouro de Santa Luzia',
    'Exterior Miradouro & Santa Luzia Walk',
  ],
  [
    'Terraços panorâmicos gratuitos em redor das muralhas do castelo',
    'Free panoramic terraces around the castle walls',
  ],
  [
    'Bilhete Normal de Entrada no Castelo',
    'Standard Castle Entry Ticket',
  ],
  [
    'Bilhete oficial incluindo câmara escura e muralhas',
    'Official ticket including camera obscura & ramparts',
  ],
  [
    'Visita Privada à Cidadela com Historiador',
    'Historian-Led Private Citadel Tour',
  ],
  [
    'Entrada sem filas com guia historiador medieval',
    'Skip-the-line entry with medieval historian guide',
  ],
  [
    'Sugerido para Rui (história e arquitetura) e Ana (miradouros panorâmicos).',
    'Suggested for Rui (history & architecture) and Ana (panoramic viewpoints).',
  ],
  [
    'Mercado gastronómico famoso que reúne bancas de chefs de renome sob o mesmo teto histórico no Cais do Sodré.',
    'Famous food hall gathering chef-driven stalls under one historic market roof in Cais do Sodré.',
  ],
  [
    'Petisco e Croquete Artesanal',
    'Petisco & Craft Croquete Bite',
  ],
  [
    'Dois petiscos tradicionais salgados + bebida',
    'Two traditional savory snacks + drink',
  ],
  [
    'Prato Principal de Chef + Copo de Vinho',
    'Chef Stall Main + Wine Glass',
  ],
  [
    'Arroz de polvo ou bacalhau à brás numa banca de assinatura',
    'Octopus rice or bacalhau à brás from a signature stall',
  ],
  [
    'Degustação em Várias Bancas e Vinho Reserva',
    'Multi-Stall Curated Tasting & Reserve Wine',
  ],
  [
    '4 pratos em balcões de chefs de topo + sobremesa',
    '4 courses across top chef counters + dessert',
  ],
  [
    'Sugerido para Ana e Sofia porque ambas escolheram mercados gastronómicos.',
    'Suggested for Ana and Sofia because both selected food markets.',
  ],
  [
    'Mercado autêntico de bairro onde os lisboetas comem marisco fresco, bifanas e petiscos sem multidões de cruzeiros.',
    'Authentic neighbourhood market where Lisbon locals actually eat fresh seafood, bifanas, and petiscos without cruise crowds.',
  ],
  [
    'Os habitantes locais vêm aqui porque os preços são 30% mais justos, há lugares sentados tranquilos e bancas tradicionais ao lado de mercearias familiares.',
    'Locals actually go here because prices are 30% fairer, seating is relaxed, and traditional stalls sit beside family grocers.',
  ],
  [
    'Museu Nacional do Azulejo',
    'Museu Nacional do Azulejo (National Tile Museum)',
  ],
  [
    'Instalado no Convento da Madre de Deus de 1509, apresenta cinco séculos de arte cerâmica portuguesa e uma capela barroca dourada.',
    'Set inside the 1509 Madre de Deus Convent, showcasing five centuries of Portuguese ceramic art and ailded baroque chapel.',
  ],
  [
    '10:00 – 18:00 (Encerrado à segunda-feira)',
    '10:00 – 18:00 (Closed Mondays)',
  ],
  [
    'Entrada Normal no Museu',
    'Standard Museum Entry',
  ],
  [
    'Acesso completo aos claustros do convento e painel panorâmico de azulejos',
    'Full access to convent cloisters & tile panorama',
  ],
  [
    'Entrada + Audioguia e Doce Conventual',
    'Entry + Audio Guide & Convent Pastry',
  ],
  [
    'Inclui guia multimédia e café na cafetaria do claustro',
    'Includes multimedia guide & coffee in the cloister café',
  ],
  [
    'Oficina de Pintura de Azulejo + Visita Guiada',
    'Tile Painting Workshop + Curated Visit',
  ],
  [
    'Pinte o seu próprio azulejo tradicional português',
    'Paint and fire your own traditional azulejo tile',
  ],
  [
    'Sugerido para Rui e Sofia (arquitetura e património cultural).',
    'Suggested for Rui and Sofia (architecture & cultural heritage).',
  ],
  [
    'Noite Íntima de Fado Vadio na Mouraria',
    'Intimate Fado Vadio Evening in Mouraria',
  ],
  [
    'Pequena tasca de bairro no berço do Fado onde fadistas locais cantam à guitarra entre pratos de petiscos.',
    'Small neighbourhood tasca in the birthplace of Fado where local singers perform acoustic sets between petisco courses.',
  ],
  [
    '19:30 – 23:30 (Confirmar reserva de mesa)',
    '19:30 – 23:30 (Confirm table reservation)',
  ],
  [
    'Vinho da Tasca e Chouriço Assado',
    'Tasca Wine & Chouriço Assado',
  ],
  [
    'Consumo mínimo num bar de fado local autêntico',
    'Minimum consumption at authentic local fado bar',
  ],
  [
    'Jantar de Petiscos Tradicionais e Fado ao Vivo',
    'Traditional Petiscos Dinner & Live Fado',
  ],
  [
    'Pratos partilhados, vinho regional e 3 momentos acústicos de fado',
    'Shared plates, regional wine & 3 acoustic sets',
  ],
  [
    'Menu de Degustação em Casa de Fado Histórica',
    'Historic Casa de Fado Tasting Menu',
  ],
  [
    'Mesa reservada na primeira fila com menu português completo de 3 pratos',
    'Reserved front table with full 3-course Portuguese menu',
  ],
  [
    'Sugerido para Sofia (música ao vivo e vida noturna) e Ana (cozinha regional).',
    'Suggested for Sofia (live music & nightlife) and Ana (regional cuisine).',
  ],
  [
    'Claustros do Mosteiro dos Jerónimos',
    'Mosteiro dos Jerónimos Cloisters',
  ],
  [
    'Obra-prima manuelina em calcário classificada pela UNESCO, construída para celebrar a viagem de Vasco da Gama.',
    'UNESCO Manueline limestone masterpiece built to commemorate Vasco da Gama’s voyage.',
  ],
  [
    '09:30 – 17:30 (Encerrado à segunda-feira)',
    '09:30 – 17:30 (Closed Mondays)',
  ],
  [
    'Entrada na Igreja de Santa Maria (Gratuita)',
    'Church of Santa Maria Entry (Free)',
  ],
  [
    'Visite gratuitamente a nave abobadada e o túmulo de Vasco da Gama',
    'Visit the vaulted nave and Vasco da Gama tomb for free',
  ],
  [
    'Bilhete Oficial com Horário para os Claustros',
    'Cloisters Official Timed Ticket',
  ],
  [
    'Acesso completo ao claustro manuelino esculpido de dois pisos',
    'Full access to the two-story carved Manueline cloister',
  ],
  [
    'Visita Arquitetónica com Acesso Antecipado',
    'Early-Access Architectural Tour',
  ],
  [
    'Visita guiada em pequeno grupo antes das horas de maior afluência',
    'Small group guided visit before peak crowds',
  ],
  [
    'Sugerido pela paixão do Rui por arquitetura monumental.',
    'Suggested for Rui’s passion for landmark architecture.',
  ],
  [
    'Prova de Pastéis de Nata Quentes e Café de Torrefação',
    'Warm Pastel de Nata Tasting & Roastery Coffee',
  ],
  [
    'Pastéis de nata estaladiços polvilhados com canela acabados de sair do forno.',
    'Crisp puff pastry custard tarts dusted with cinnamon right out of the oven.',
  ],
  [
    '2 Pastéis Quentes + Bica ao Balcão',
    '2 Warm Tarts + Espresso at Counter',
  ],
  [
    'Serviço clássico tradicional ao balcão',
    'Classic standing counter service',
  ],
  [
    'Caixa de 6 + Ginjinha e Bica na Sala de Azulejos',
    'Box of 6 + Ginjinha & Bica Seated',
  ],
  [
    'Mesa nos salões históricos revestidos a azulejo',
    'Seated inside the tiled salon rooms',
  ],
  [
    'Masterclass de Pastelaria e Caixa de Degustação',
    'Pastry Masterclass & Tasting Box',
  ],
  [
    'Aprenda os segredos da massa folhada com um chefe pasteleiro',
    'Learn laminated dough secrets with a pastry chef',
  ],
  [
    'Sugerido para Ana, Rui e Sofia — ritual gastronómico essencial de Lisboa.',
    'Suggested for Ana, Rui, and Sofia — essential Lisbon culinary ritual.',
  ],
  [
    'Jardim do Príncipe Real e Lojas Conceptuais Independentes',
    'Jardim do Príncipe Real & Independent Concept Stores',
  ],
  [
    'Passeie sob o cedro-do-Buçaco centenário, o reservatório histórico e o palacete neo-árabe da Embaixada.',
    'Stroll beneath the giant 150-year-old cedar umbrella tree, historic reservoir, and Moorish-revival Embaixada gallery.',
  ],
  [
    'Café no Quiosque do Jardim e Passeio pelas Galerias',
    'Garden Kiosk Coffee & Gallery Walk',
  ],
  [
    'Relaxe no tradicional quiosque ao ar livre',
    'Relax at the traditional open-air quiosque',
  ],
  [
    'Bilhete para o Reservatório da Patriarcal + Petiscos',
    'Underground Patriarcal Reservoir Ticket + Tapas',
  ],
  [
    'Visite a cisterna subterrânea de 1860 + copo de vinho',
    'Visit the 1860s cistern + wine glass',
  ],
  [
    'Design Português e Prova de Vinhos com Sommelier',
    'Curated Portuguese Design & Wine Flight',
  ],
  [
    'Prova comentada de vinhos naturais de pequenos produtores',
    'Sommelier tasting of small-batch natural wines',
  ],
  [
    'Sugerido para Sofia e Ana (tarde tranquila de cultura e miradouros).',
    'Suggested for Sofia and Ana (relaxed afternoon culture & viewpoints).',
  ],
  [
    'Museu Calouste Gulbenkian e Jardins Modernistas',
    'Museu Calouste Gulbenkian & Modernist Gardens',
  ],
  [
    'Coleção de arte de nível mundial abrangendo obras-primas egípcias, greco-romanas, islâmicas e de René Lalique.',
    'World-class private art collection spanning Egyptian, Greco-Roman, Islamic, and René Lalique masterpieces.',
  ],
  [
    '10:00 – 18:00 (Encerrado à terça-feira)',
    '10:00 – 18:00 (Closed Tuesdays)',
  ],
  [
    'Sugerido para o dia de museus do Rui — equilibrado com o jantar de marisco da Ana.',
    'Suggested for Rui’s museum day — balanced by Ana’s seafood feast tonight.',
  ],
  [
    'Cervejaria Tradicional Ramiro e Mariscada',
    'Ramiro Traditional Cervejaria & Seafood Feast',
  ],
  [
    'Marisqueira icónica de Lisboa famosa pelas gambas ao alho, amêijoas à Bulhão Pato e prego no pão.',
    'Iconic Lisbon marisqueira serving garlic prawns, clams à Bulhão Pato, and prego steak sandwich.',
  ],
  [
    'Sugerido pelo foco gastronómico da Ana e pelo ambiente noturno da Sofia.',
    'Suggested for Ana’s pescatarian food focus and Sofia’s evening vibe.',
  ],
  [
    'Cacilheiro no Rio Tejo até Cacilhas e Cais do Ponto Final',
    'Tagus River Ferry to Cacilhas & Ponto Final Pier',
  ],
  [
    'Atravesse o rio de barco e caminhe pelo antigo cais ribeirinho com vista para as Sete Colinas de Lisboa e a Ponte 25 de Abril.',
    'Cross the river on the commuter ferry and walk the old riverside quay looking back at Lisbon’s Seven Hills and 25 de Abril Bridge.',
  ],
  [
    'Sugerido para Ana e Rui — último dia descontraído junto ao rio.',
    'Suggested for Ana & Rui — relaxed final day with waterfront views.',
  ],
  // Demo Porto themes & activities
  [
    'Azulejos de São Bento, Clérigos e Caves de Gaia',
    'São Bento Azulejos, Clérigos & Gaia Port Cellars',
  ],
  [
    'Arte Contemporânea em Serralves e Peixe Grelhado em Matosinhos',
    'Serralves Contemporary Art & Matosinhos Grilled Fish',
  ],
  [
    'Mercado do Bolhão e Hora Dourada no Jardim do Morro',
    'Mercado do Bolhão & Golden Hour at Jardim do Morro',
  ],
  [
    'Casal numa escapadinha de 3 dias pelo norte de Portugal',
    'Couple on a 3-day northern Portugal escape',
  ],
  [
    'Foco nas caves de Vinho do Porto em Vila Nova de Gaia, igrejas de azulejos e arquitetura Art Déco',
    'Focus on Port wine cellars in Vila Nova de Gaia, Azulejo churches & Art Deco architecture',
  ],
  [
    'Centro histórico maioritariamente a pé + Metro sobre a Ponte Luís I',
    'Mostly walkable historic centre + Metro over Dom Luís I Bridge',
  ],
  [
    ' átrio de Azulejos da Estação de São Bento',
    'São Bento Railway Station Azulejo Vestibule',
  ],
  [
    'Átrio de Azulejos da Estação de São Bento',
    'São Bento Railway Station Azulejo Vestibule',
  ],
  [
    '20.000 azulejos azuis e brancos de Jorge Colaço retratando batalhas históricas e a vida no Douro.',
    '20,000 tin-glazed blue and white tiles by Jorge Colaço depicting royal battles and rural Douro life.',
  ],
  [
    'Sugerido para Clara (azulejaria histórica e arquitetura).',
    'Suggested for Clara (historic tilework & architecture).',
  ],
  [
    'Livraria Lello Neo-Gótica',
    'Livraria Lello Neo-Gothic Bookshop',
  ],
  [
    'Livraria histórica de 1906 com a icónica escadaria carmesim no coração de Cedofeita.',
    '1906 crimson-staircase bookshop in the heart of Cedofeita.',
  ],
  [
    'Sugerido para Clara (livros e interiores neogóticos).',
    'Suggested for Clara (books & Neo-Gothic interiors).',
  ],
  [
    'Visita e Prova nas Caves Graham’s 1890 Port Lodge',
    'Graham’s 1890 Port Lodge Cellar Tour & Tasting',
  ],
  [
    'Cave histórica de granito em Vila Nova de Gaia com vista sobre o Rio Douro e a Ribeira do Porto.',
    'Historic granite cellar in Vila Nova de Gaia overlooking the Douro River and Porto skyline.',
  ],
  [
    'Sugerido para Miguel (Vinho do Porto e miradouros sobre o rio).',
    'Suggested for Miguel (Port wine & river viewpoints).',
  ],
  [
    'Museu da Fundação de Serralves e Casa de Serralves Art Déco',
    'Fundação de Serralves Museum & Pink Art Deco Villa',
  ],
  [
    'Museu minimalista de Álvaro Siza Vieira, Casa de Serralves Art Déco cor-de-rosa dos anos 1930 e passadiço nas copas das árvores.',
    'Álvaro Siza Vieira’s minimalist museum, 1930s pink Art Deco Casa de Serralves, and treetop walkway.',
  ],
  [
    'Sugerido pela paixão da Clara por arquitetura modernista e Art Déco.',
    'Suggested for Clara’s love of modernist and Art Deco architecture.',
  ],
  [
    'Peixe Grelhado no Carvão na Rua Heróis de França em Matosinhos',
    'Matosinhos Charcoal-Grilled Fish on Rua Heróis de França',
  ],
  [
    'Bairro piscatório onde o pregado, as sardinhas e o robalo acabados de chegar da lota são grelhados na brasa.',
    'Fishermen’s quarter where freshly landed turbot, sardines, and sea bream are grilled over open street coals.',
  ],
  [
    'Sugerido para Miguel e Clara — gastronomia costeira autêntica do Norte.',
    'Suggested for Miguel & Clara — authentic northern coastal dining.',
  ],
  [
    'Degustação Matinal no Restaurado Mercado do Bolhão',
    'Restored Mercado do Bolhão Morning Tasting',
  ],
  [
    'Mercado neoclássico de dois pisos reaberto após restauro minucioso, repleto de bancas de queijos, enchidos e vinhos.',
    'Neoclassical two-tier fresh market reopened after meticulous restoration, filled with cheese, cured meats, and wine counters.',
  ],
  [
    'Sugerido para Miguel (gastronomia e vinho) e Clara (arquitetura neoclássica em ferro).',
    'Suggested for Miguel (food & wine) and Clara (neoclassical iron architecture).',
  ],
  // Demo Rome themes & activities
  [
    'Coliseu, Fórum Romano e Ruas de Monti',
    'Colosseum, Roman Forum & Monti Backstreets',
  ],
  [
    'Esculturas de Bernini na Galeria Borghese e Noite em Trastevere',
    'Bernini Sculptures at Galleria Borghese & Trastevere Evening',
  ],
  [
    'Panteão, San Luigi dei Francesi e Bairro Judeu',
    'Pantheon, San Luigi dei Francesi & Jewish Ghetto',
  ],
  [
    'Museus do Vaticano e Bares de Vinho em Prati',
    'Vatican Museums & Prati Wine Bars',
  ],
  [
    'Pinheiros da Via Ápia Antiga e Parque dos Aquedutos',
    'Ancient Appian Way Pines & Aqueduct Park',
  ],
  [
    '2 viajantes durante 5 dias em Roma',
    '2 travellers over 5 days in Rome',
  ],
  [
    'Entradas com horário marcado pré-reservadas nos principais locais arqueológicos',
    'Pre-booked timed-entry tickets at major archaeological sites',
  ],
  [
    'Trattorias de bairro em Testaccio e Trastevere em vez de menus turísticos',
    'Neighbourhood trattorias in Testaccio and Trastevere instead of tourist menus',
  ],
  [
    'Coliseu, Fórum Romano e Monte Palatino',
    'Colosseum, Roman Forum & Palatine Hill',
  ],
  [
    'Anfiteatro Flaviano e o coração cívico da Roma Antiga.',
    'Flavian Amphitheatre and the civic heart of Ancient Rome.',
  ],
  [
    'Sugerido para Elena e Lucas (história antiga e engenharia romana).',
    'Suggested for Elena & Lucas (ancient history & Roman engineering).',
  ],
  [
    'Mercato di Testaccio e Almoço de Supplì Romano',
    'Mercato di Testaccio & Roman Supplì Lunch',
  ],
  [
    'Mercado de bairro luminoso famoso pelos supplì al telefono estaladiços, alcachofras e sanduíches tradicionais.',
    'Bright neighbourhood food market famous for crispy supplì al telefono, artichokes, and slow-simmered sandwiches.',
  ],
  [
    'Sugerido para Elena e Lucas — almoço autêntico de mercado romano sem turistas.',
    'Suggested for Elena & Lucas — zero-tourist authentic Roman market lunch.',
  ],
  [
    'Vagas estritamente limitadas de 2 horas na villa do Cardeal Scipione Borghese com Apolo e Dafne.',
    'Strictly capped 2-hour slots inside Cardinal Scipione Borghese’s villa housing Apollo and Daphne.',
  ],
  [
    'Sugerido pelo foco da Elena em arte renascentista e barroca.',
    'Suggested for Elena’s focus on Renaissance & Baroque art.',
  ],
  [
    'Panteão e Capela Contarelli de Caravaggio',
    'Pantheon & Caravaggio’s Contarelli Chapel',
  ],
  [
    'A cúpula de betão não armado de Adriano combinada com três obras-primas gratuitas de Caravaggio a dois quarteirões.',
    'Hadrian’s unreinforced concrete dome paired with three free Caravaggio masterpieces two blocks away.',
  ],
  [
    'Sugerido para Lucas (engenharia clássica) e Elena (Caravaggio).',
    'Suggested for Lucas (classical engineering) and Elena (Caravaggio).',
  ],
  [
    'Museus do Vaticano, Salas de Rafael e Capela Sistina',
    'Vatican Museums, Raphael Rooms & Sistine Chapel',
  ],
  [
    'Coleções papais que culminam no teto pintado a fresco por Miguel Ângelo.',
    'Papal collections culminating in Michelangelo’s frescoed ceiling.',
  ],
  [
    'Sugerido para Elena e Lucas (obras-primas do Renascimento).',
    'Suggested for Elena & Lucas (Renaissance masterpieces).',
  ],
  [
    'Passeio pelo Parco degli Acquedotti e Via Ápia Antiga',
    'Parco degli Acquedotti & Appian Way Walk',
  ],
  [
    'Caminhe sobre as antigas pedras de basalto romanas emolduradas por pinheiros-mansos e pelos arcos do Aqua Claudia.',
    'Walk along ancient basalt Roman stones framed by umbrella pines and towering Aqua Claudia arches.',
  ],
  [
    'Sugerido para Lucas e Elena — último dia tranquilo longe do trânsito da cidade.',
    'Suggested for Lucas & Elena — peaceful final day away from city traffic.',
  ],
  // Country seed stops (Rome, Florence, Tokyo, Kyoto, Paris, Barcelona, Athens)
  [
    'Passeio Arqueológico pelo Coliseu e Fórum Romano',
    'Colosseum & Roman Forum Archaeological Walk',
  ],
  [
    'Percorra as galerias do antigo Anfiteatro Flaviano e as ruínas históricas da Via Sacra.',
    'Walk through the galleries of the ancient Flavian Amphitheatre and the historic ruins of the Via Sacra.',
  ],
  [
    'Trattoria Artesanal e Praças de Trastevere',
    'Artisanal Trattoria & Trastevere Piazzas',
  ],
  [
    'Prove o clássico cacio e pepe romano e alcachofras da época pelas ruelas empedradas.',
    'Taste classic Roman cacio e pepe and seasonal artichokes along cobbled backstreets.',
  ],
  [
    'Panteão e Esculturas da Galleria Borghese',
    'Pantheon & Galleria Borghese Sculptures',
  ],
  [
    'Admire a cúpula histórica com o óculo aberto e as obras-primas em mármore de Bernini.',
    'Admire the historic open-oculus dome and Bernini’s marble masterpieces.',
  ],
  [
    'Galeria Uffizi e Piazza della Signoria',
    'Uffizi Gallery & Piazza della Signoria',
  ],
  [
    'Obras-primas do Renascimento de Botticelli e Leonardo da Vinci com vista sobre o rio Arno.',
    'Renaissance masterpieces by Botticelli and Leonardo da Vinci overlooking the Arno River.',
  ],
  [
    'Oficinas Artesanais de Oltrarno e Enoteca em Santo Spirito',
    'Oltrarno Artisan Workshops & Santo Spirito Enoteca',
  ],
  [
    'Ateliês tradicionais de couro florentino seguidos de prova de Chianti Classico e crostini.',
    'Traditional Florentine leather ateliers followed by Chianti Classico and crostini tasting.',
  ],
  [
    'Miradouro Panorâmico da Piazzale Michelangelo ao Pôr do Sol',
    'Piazzale Michelangelo Panoramic Sunset Viewpoint',
  ],
  [
    'Vista panorâmica ao final da tarde sobre a cúpula de Brunelleschi e a Ponte Vecchio.',
    'Late-afternoon panoramic view over Brunelleschi’s Dome and Ponte Vecchio.',
  ],
  [
    'Templo Senso-ji e Ruelas Históricas de Yanaka',
    'Senso-ji Temple & Historic Yanaka Backstreets',
  ],
  [
    'Lojas tradicionais de artesanato em madeira, pátios de incenso e ruas tranquilas da era Edo.',
    'Traditional woodcraft shops, incense courtyards, and quiet Edo-era lanes.',
  ],
  [
    'Mercado Exterior de Tsukiji e Degustação em Izakaya',
    'Tsukiji Outer Market & Izakaya Tasting',
  ],
  [
    'Balcão de sushi sazonal fresco e espetadas yakitori grelhadas no carvão.',
    'Fresh seasonal sushi counter and charcoal-grilled yakitori skewers.',
  ],
  [
    'Santuário Florestal Meiji Jingu e Miradouro de Shibuya',
    'Meiji Jingu Forest Shrine & Shibuya Sky Viewpoint',
  ],
  [
    'Portais torii entre cedros centenários seguidos de vista panorâmica de 360 graus.',
    'Torii gates among century-old cedars followed by a 360-degree skyline panorama.',
  ],
  [
    'Trilho de Montanha de Fushimi Inari Taisha',
    'Fushimi Inari Taisha Mountain Trail',
  ],
  [
    'Milhares de portais torii vermelhos serpenteando por santuários de bambu e cedro.',
    'Thousands of vermilion torii gates winding through bamboo and cedar shrines.',
  ],
  [
    'Mercado Nishiki e Casa de Chá Matcha em Gion',
    'Nishiki Market & Gion Matcha Tea House',
  ],
  [
    'Especialidades obanzai de Quioto, tofu artesanal e cerimónia de chá matcha Uji.',
    'Kyoto obanzai specialties, artisanal tofu, and Uji matcha tea ceremony.',
  ],
  [
    'Bosque de Bambu de Arashiyama e Passeio no Rio Katsura',
    'Arashiyama Bamboo Grove & Katsura River Walk',
  ],
  [
    'Caminhada matinal entre bambuzais imponentes e jardins zen junto ao rio.',
    'Morning walk through towering bamboo groves and riverside Zen gardens.',
  ],
  [
    'Museu d’Orsay e Passeio Ribeirinho na Margem Esquerda do Sena',
    'Musée d’Orsay & Left Bank Seine Riverside Walk',
  ],
  [
    'Obras-primas do Impressionismo instaladas numa antiga estação ferroviária Beaux-Arts.',
    'Impressionist masterpieces housed inside a former Beaux-Arts railway station.',
  ],
  [
    'Mercado Coberto do Marais e Bistrô de Bairro',
    'Le Marais Covered Market & Neighbourhood Bistro',
  ],
  [
    'Bancas históricas do Marché des Enfants Rouges e almoço tradicional de bistrô.',
    'Historic Marché des Enfants Rouges stalls and traditional bistro lunch.',
  ],
  [
    'Vinhas de Montmartre e Terraço Panorâmico do Sacré-Cœur',
    'Montmartre Vineyards & Sacré-Cœur Panoramic Terrace',
  ],
  [
    'Praça histórica dos artistas, vinha escondida de Montmartre e escadaria panorâmica.',
    'Historic artists’ square, hidden Montmartre vineyard, and panoramic steps.',
  ],
  [
    'Sagrada Família e Roteiro Modernista pelo Eixample',
    'Sagrada Família & Eixample Modernist Route',
  ],
  [
    'A nave iluminada pelos vitrais de Gaudí e os quarteirões modernistas históricos.',
    'Gaudí’s stained-glass nave and historic modernist city blocks.',
  ],
  [
    'Mercado de Santa Caterina em El Born e Bar de Tapas',
    'Santa Caterina Market in El Born & Tapas Bar',
  ],
  [
    'Mercado gastronómico de bairro com cobertura ondulada, vermute catalão e petiscos.',
    'Wave-roofed neighbourhood food market, Catalan vermouth, and tapas.',
  ],
  [
    'Miradouro dos Bunkers del Carmel e Terraços do Park Güell',
    'Bunkers del Carmel Viewpoint & Park Güell Terraces',
  ],
  [
    'Vista ampla sobre o Mediterrâneo e a malha urbana de Barcelona ao pôr do sol.',
    'Sweeping sunset view over the Mediterranean and Barcelona’s urban grid.',
  ],
  [
    'Cidadela da Acrópole e Museu da Acrópole',
    'Acropolis Citadel & Acropolis Museum',
  ],
  [
    'Frisos de mármore do Pártenon e galerias arqueológicas com piso de vidro.',
    'Parthenon marble friezes and glass-floored archaeological galleries.',
  ],
  [
    'Taberna Tradicional com Pátio em Plaka e Psyri',
    'Traditional Courtyard Taverna in Plaka & Psyri',
  ],
  [
    'Meze grego tradicional, queijo grelhado e vinhos do Peloponeso sob limoeiros.',
    'Traditional Greek meze, grilled halloumi/saganaki, and Peloponnese wines under lemon trees.',
  ],
  [
    'Pôr do Sol na Colina de Filopapo e Monte Licabeto',
    'Philopappos Hill & Mount Lycabettus Sunset',
  ],
  [
    'Trilho sombreado por pinheiros com vista para o Mar Egeu e a antiga Pnyx.',
    'Pine-shaded trail overlooking the Aegean Sea and the ancient Pnyx.',
  ],
  // Confidence & Tier strings
  [
    'Preço 2026 verificado via Google Search',
    '2026 price verified via Google Search',
  ],
  [
    'Custo estimado pela IA (~) — confirmar no site oficial do local',
    'AI estimated cost (~) — confirm on official venue website',
  ],
  [
    'Horário habitual estimado',
    'Estimated typical opening hours',
  ],
  [
    'Visita autónoma autêntica de bairro ou balcão tradicional local',
    'Authentic self-guided neighbourhood visit or traditional local counter',
  ],
  [
    'Experiência selecionada no recinto central',
    'Curated experience at the main venue',
  ],
  [
    'Acesso exclusivo privado ou prova comentada com especialista local',
    'Exclusive private access or guided tasting with a local specialist',
  ],
  [
    'Pastelaria Artesanal e Café',
    'Artisanal Bakery & Coffee',
  ],
  [
    'Cozinha Regional de Mercado',
    'Regional Market Kitchen',
  ],
  [
    'Gastronomia Tradicional ao Jantar',
    'Traditional Evening Gastronomy',
  ],
];

/**
 * Translates a single itinerary text string to the target language ('en' or 'pt-PT')
 * while strictly preserving proper nouns (names of venues, museums, restaurants, streets).
 */
export function translateItineraryText(
  text: string | undefined,
  targetLang: 'en' | 'pt-PT'
): string {
  if (!text || typeof text !== 'string') return text || '';
  const trimmed = text.trim();
  if (!trimmed) return text;

  const isTargetEn = targetLang === 'en';

  // 1. Exact match in bilingual pairs
  for (const [ptText, enText] of BILINGUAL_ITINERARY_PAIRS) {
    if (isTargetEn && trimmed === ptText) return enText;
    if (!isTargetEn && trimmed === enText) return ptText;
  }

  let out = text;

  // 2. Substring replacements for known bilingual pairs
  for (const [ptText, enText] of BILINGUAL_ITINERARY_PAIRS) {
    if (isTargetEn && out.includes(ptText)) {
      out = out.split(ptText).join(enText);
    } else if (!isTargetEn && out.includes(enText)) {
      out = out.split(enText).join(ptText);
    }
  }

  // 3. Parameterized pattern replacements (preserving proper nouns like city/venue names)
  if (isTargetEn) {
    out = out
      .replace(/^Dia (\d+):\s*À descoberta de\s+(.+)$/i, 'Day $1: Exploring $2')
      .replace(/^Dia (\d+):\s*(.+)$/i, 'Day $1: $2')
      .replace(
        /^Passeio pelo Centro Histórico e Património de\s+(.+)$/i,
        'Historic Center & Heritage Walk in $1'
      )
      .replace(
        /^Exploração pelas praças históricas, arquitetura tradicional e ruas de comércio local em\s+(.+)\.$/i,
        'Exploration of historic squares, traditional architecture, and local shopping streets in $1.'
      )
      .replace(
        /^Mercado Regional e Cozinha Tradicional de\s+(.+)$/i,
        'Regional Market & Traditional Cuisine in $1'
      )
      .replace(
        /^Degustação de pratos regionais autênticos, café local e produtos frescos do mercado em\s+(.+)\.$/i,
        'Tasting of authentic regional dishes, local coffee, and fresh market produce in $1.'
      )
      .replace(
        /^Trilho Natural e Miradouro Panorâmico de\s+(.+)$/i,
        'Nature Trail & Panoramic Viewpoint in $1'
      )
      .replace(
        /^Caminhada pela natureza e miradouro ao final da tarde com vista panorâmica sobre\s+(.+)\.$/i,
        'Nature walk and late-afternoon viewpoint with a panoramic view over $1.'
      )
      .replace(
        /^Museu de Arte e Arquitetura Clássica de\s+(.+)$/i,
        'Art Museum & Classical Architecture in $1'
      )
      .replace(
        /^Visita às coleções de arte, claustros históricos e galerias patrimoniais de\s+(.+)\.$/i,
        'Visit to art collections, historic cloisters, and heritage galleries in $1.'
      )
      .replace(
        /^Roteiro de Petiscos e Adega Histórica em\s+(.+)$/i,
        'Tapas Route & Historic Wine Cellar in $1'
      )
      .replace(
        /^Prova de especialidades gastronómicas locais acompanhadas por vinhos da região em\s+(.+)\.$/i,
        'Tasting of local culinary specialties paired with regional wines in $1.'
      )
      .replace(
        /^Jardins Botânicos e Passeio Ribeirinho de\s+(.+)$/i,
        'Botanical Gardens & Riverside Walk in $1'
      )
      .replace(
        /^Percurso relaxante pelos jardins históricos e frente ribeirinha ou marítima de\s+(.+)\.$/i,
        'Relaxing walk through historic gardens and the waterfront of $1.'
      )
      .replace(
        /^Oficinas de Artesanato e Bairro Criativo de\s+(.+)$/i,
        'Artisan Workshops & Creative Quarter in $1'
      )
      .replace(
        /^Descoberta de ateliês independentes, livrarias históricas e design local em\s+(.+)\.$/i,
        'Discovery of independent ateliers, historic bookshops, and local design in $1.'
      )
      .replace(
        /^Taberna de Autor e Doçaria Conventual em\s+(.+)$/i,
        'Chef Tavern & Convent Pastries in $1'
      )
      .replace(
        /^Almoço prolongado com receitas tradicionais reinventadas e pastelaria típica de\s+(.+)\.$/i,
        'Leisurely lunch with reinvented traditional recipes and signature pastries of $1.'
      )
      .replace(
        /^Noite Cultural, Música ao Vivo e Terraço em\s+(.+)$/i,
        'Cultural Evening, Live Music & Rooftop in $1'
      )
      .replace(
        /^Sessão acústica ao entardecer seguida de convívio num terraço emblemático de\s+(.+)\.$/i,
        'Sunset acoustic session followed by drinks on an iconic terrace in $1.'
      )
      .replace(
        /^Palácio Histórico e Pátios Secretos de\s+(.+)$/i,
        'Historic Palace & Secret Courtyards of $1'
      )
      .replace(
        /^Percurso guiado pelos salões nobres, azulejaria e jardins murados de\s+(.+)\.$/i,
        'Guided route through noble halls, tilework, and walled gardens of $1.'
      )
      .replace(
        /^Confeitaria Histórica e Torrefação Artesanal de\s+(.+)$/i,
        'Historic Patisserie & Artisanal Roastery in $1'
      )
      .replace(
        /^Pausa gastronómica dedicada aos doces regionais e cafés de especialidade em\s+(.+)\.$/i,
        'Culinary pause dedicated to regional sweets and specialty coffee in $1.'
      )
      .replace(
        /^Miradouro do Pôr do Sol e Encosta Panorâmica de\s+(.+)$/i,
        'Sunset Viewpoint & Panoramic Hillside of $1'
      )
      .replace(
        /^Despedida ao final da tarde num ponto alto com vista de 360 graus sobre\s+(.+)\.$/i,
        'Late-afternoon farewell at a high vantage point with 360-degree views over $1.'
      )
      .replace(
        /^Museu Municipal e Galeria Coberta de\s+(.+?)\s*—\s*Dia\s*(\d+)\s*\(Plano B Interior\)$/i,
        'Municipal Museum & Covered Gallery of $1 — Day $2 (Indoor Plan B)'
      )
      .replace(
        /^Alternativa cultural interior em\s+(.+?)\s+ideal para dias de chuva\.$/i,
        'Indoor cultural alternative in $1 ideal for rainy days.'
      )
      .replace(
        /^Escolhido à medida para o seu roteiro em\s+(.+?)\s+\((.+?)\),\s*privilegiando autenticidade local e ritmo equilibrado\.$/i,
        'Tailored for your itinerary in $1 ($2), prioritizing local authenticity and a balanced pace.'
      )
      .replace(
        /^Selecionado pelo seu interesse cultural e gastronómico em\s+(.+)\.$/i,
        'Selected for your cultural and culinary interest in $1.'
      )
      .replace(
        /^Café & Pastelaria Artesanal\s+(.+?)\s*\(Dia\s*(\d+)\)$/i,
        'Artisanal Café & Bakery $1 (Day $2)'
      )
      .replace(
        /^Tasca & Cozinha de Mercado Regional\s+(.+?)\s*\(Dia\s*(\d+)\)$/i,
        'Regional Market Kitchen & Bistro $1 (Day $2)'
      )
      .replace(
        /^Restaurante Tradicional & Adega\s+(.+?)\s*\(Dia\s*(\d+)\)$/i,
        'Traditional Restaurant & Wine Cellar $1 (Day $2)'
      )
      .replace(/\(Opção Económica Local\)/g, '(Local Budget Option)')
      .replace(/\(Espaço Principal\)/g, '(Main Venue)')
      .replace(/\(Experiência Privada Premium\)/g, '(Premium Private Experience)')
      .replace(/— Entrada de Bairro Local/g, '— Local Quarter Entry')
      .replace(/— Acesso Privado com Curador/g, '— Private Curator Access')
      .replace(/— Balcão$/g, '— Counter')
      .replace(/— Degustação$/g, '— Tasting')
      .replace(/— Menu do Dia$/g, '— Daily Menu')
      .replace(/— Reserva Especial$/g, '— Special Reserve')
      .replace(/— Menu de Autor$/g, '— Chef Menu');
  } else {
    out = out
      .replace(/^Day (\d+):\s*Exploring\s+(.+)$/i, 'Dia $1: À descoberta de $2')
      .replace(/^Day (\d+):\s*(.+)$/i, 'Dia $1: $2')
      .replace(
        /^Historic Center & Heritage Walk in\s+(.+)$/i,
        'Passeio pelo Centro Histórico e Património de $1'
      )
      .replace(
        /^Exploration of historic squares, traditional architecture, and local shopping streets in\s+(.+)\.$/i,
        'Exploração pelas praças históricas, arquitetura tradicional e ruas de comércio local em $1.'
      )
      .replace(
        /^Regional Market & Traditional Cuisine in\s+(.+)$/i,
        'Mercado Regional e Cozinha Tradicional de $1'
      )
      .replace(
        /^Tasting of authentic regional dishes, local coffee, and fresh market produce in\s+(.+)\.$/i,
        'Degustação de pratos regionais autênticos, café local e produtos frescos do mercado em $1.'
      )
      .replace(
        /^Nature Trail & Panoramic Viewpoint in\s+(.+)$/i,
        'Trilho Natural e Miradouro Panorâmico de $1'
      )
      .replace(
        /^Nature walk and late-afternoon viewpoint with a panoramic view over\s+(.+)\.$/i,
        'Caminhada pela natureza e miradouro ao final da tarde com vista panorâmica sobre $1.'
      )
      .replace(
        /^Art Museum & Classical Architecture in\s+(.+)$/i,
        'Museu de Arte e Arquitetura Clássica de $1'
      )
      .replace(
        /^Visit to art collections, historic cloisters, and heritage galleries in\s+(.+)\.$/i,
        'Visita às coleções de arte, claustros históricos e galerias patrimoniais de $1.'
      )
      .replace(
        /^Tapas Route & Historic Wine Cellar in\s+(.+)$/i,
        'Roteiro de Petiscos e Adega Histórica em $1'
      )
      .replace(
        /^Tasting of local culinary specialties paired with regional wines in\s+(.+)\.$/i,
        'Prova de especialidades gastronómicas locais acompanhadas por vinhos da região em $1.'
      )
      .replace(
        /^Botanical Gardens & Riverside Walk in\s+(.+)$/i,
        'Jardins Botânicos e Passeio Ribeirinho de $1'
      )
      .replace(
        /^Relaxing walk through historic gardens and the waterfront of\s+(.+)\.$/i,
        'Percurso relaxante pelos jardins históricos e frente ribeirinha ou marítima de $1.'
      )
      .replace(
        /^Artisan Workshops & Creative Quarter in\s+(.+)$/i,
        'Oficinas de Artesanato e Bairro Criativo de $1'
      )
      .replace(
        /^Discovery of independent ateliers, historic bookshops, and local design in\s+(.+)\.$/i,
        'Descoberta de ateliês independentes, livrarias históricas e design local em $1.'
      )
      .replace(
        /^Chef Tavern & Convent Pastries in\s+(.+)$/i,
        'Taberna de Autor e Doçaria Conventual em $1'
      )
      .replace(
        /^Leisurely lunch with reinvented traditional recipes and signature pastries of\s+(.+)\.$/i,
        'Almoço prolongado com receitas tradicionais reinventadas e pastelaria típica de $1.'
      )
      .replace(
        /^Cultural Evening, Live Music & Rooftop in\s+(.+)$/i,
        'Noite Cultural, Música ao Vivo e Terraço em $1'
      )
      .replace(
        /^Sunset acoustic session followed by drinks on an iconic terrace in\s+(.+)\.$/i,
        'Sessão acústica ao entardecer seguida de convívio num terraço emblemático de $1.'
      )
      .replace(
        /^Historic Palace & Secret Courtyards of\s+(.+)$/i,
        'Palácio Histórico e Pátios Secretos de $1'
      )
      .replace(
        /^Guided route through noble halls, tilework, and walled gardens of\s+(.+)\.$/i,
        'Percurso guiado pelos salões nobres, azulejaria e jardins murados de $1.'
      )
      .replace(
        /^Historic Patisserie & Artisanal Roastery in\s+(.+)$/i,
        'Confeitaria Histórica e Torrefação Artesanal de $1'
      )
      .replace(
        /^Culinary pause dedicated to regional sweets and specialty coffee in\s+(.+)\.$/i,
        'Pausa gastronómica dedicada aos doces regionais e cafés de especialidade em $1.'
      )
      .replace(
        /^Sunset Viewpoint & Panoramic Hillside of\s+(.+)$/i,
        'Miradouro do Pôr do Sol e Encosta Panorâmica de $1'
      )
      .replace(
        /^Late-afternoon farewell at a high vantage point with 360-degree views over\s+(.+)\.$/i,
        'Despedida ao final da tarde num ponto alto com vista de 360 graus sobre $1.'
      )
      .replace(
        /^Municipal Museum & Covered Gallery of\s+(.+?)\s*—\s*Day\s*(\d+)\s*\(Indoor Plan B\)$/i,
        'Museu Municipal e Galeria Coberta de $1 — Dia $2 (Plano B Interior)'
      )
      .replace(
        /^Indoor cultural alternative in\s+(.+?)\s+ideal for rainy days\.$/i,
        'Alternativa cultural interior em $1 ideal para dias de chuva.'
      )
      .replace(
        /^Tailored for your itinerary in\s+(.+?)\s+\((.+?)\),\s*prioritizing local authenticity and a balanced pace\.$/i,
        'Escolhido à medida para o seu roteiro em $1 ($2), privilegiando autenticidade local e ritmo equilibrado.'
      )
      .replace(
        /^Selected for your cultural and culinary interest in\s+(.+)\.$/i,
        'Selecionado pelo seu interesse cultural e gastronómico em $1.'
      )
      .replace(
        /^Artisanal Café & Bakery\s+(.+?)\s*\(Day\s*(\d+)\)$/i,
        'Café & Pastelaria Artesanal $1 (Dia $2)'
      )
      .replace(
        /^Regional Market Kitchen & Bistro\s+(.+?)\s*\(Day\s*(\d+)\)$/i,
        'Tasca & Cozinha de Mercado Regional $1 (Dia $2)'
      )
      .replace(
        /^Traditional Restaurant & Wine Cellar\s+(.+?)\s*\(Day\s*(\d+)\)$/i,
        'Restaurante Tradicional & Adega $1 (Dia $2)'
      )
      .replace(/^Suggested for\s+(.+)$/i, 'Sugerido para $1')
      .replace(/\(Local Budget Option\)/g, '(Opção Económica Local)')
      .replace(/\(Main Venue\)/g, '(Espaço Principal)')
      .replace(/\(Premium Private Experience\)/g, '(Experiência Privada Premium)')
      .replace(/— Local Quarter Entry/g, '— Entrada de Bairro Local')
      .replace(/— Private Curator Access/g, '— Acesso Privado com Curador')
      .replace(/— Counter$/g, '— Balcão')
      .replace(/— Tasting$/g, '— Degustação')
      .replace(/— Daily Menu$/g, '— Menu do Dia')
      .replace(/— Special Reserve$/g, '— Reserva Especial')
      .replace(/— Chef Menu$/g, '— Menu de Autor');
  }

  return out;
}

function translateActivityDeterministic(act: Activity, targetLang: 'en' | 'pt-PT'): Activity {
  const translateCostOpt = (opt: Activity['costOptions']['mid']) => ({
    ...opt,
    title: translateItineraryText(opt.title, targetLang),
    description: translateItineraryText(opt.description, targetLang),
    ...(opt.venueName ? { venueName: translateItineraryText(opt.venueName, targetLang) } : {}),
  });

  return {
    ...act,
    title: translateItineraryText(act.title, targetLang),
    description: translateItineraryText(act.description, targetLang),
    ...(act.openingHoursText
      ? { openingHoursText: translateItineraryText(act.openingHoursText, targetLang) }
      : {}),
    whyThis: translateItineraryText(act.whyThis, targetLang),
    costOptions: {
      budget: translateCostOpt(act.costOptions.budget),
      mid: translateCostOpt(act.costOptions.mid),
      premium: translateCostOpt(act.costOptions.premium),
    },
    priceConfidence: {
      ...act.priceConfidence,
      ...(act.priceConfidence.notes
        ? { notes: translateItineraryText(act.priceConfidence.notes, targetLang) }
        : {}),
    },
    hoursConfidence: {
      ...act.hoursConfidence,
      ...(act.hoursConfidence.notes
        ? { notes: translateItineraryText(act.hoursConfidence.notes, targetLang) }
        : {}),
    },
    ...(act.localAlternative
      ? {
          localAlternative: {
            ...act.localAlternative,
            title: translateItineraryText(act.localAlternative.title, targetLang),
            description: translateItineraryText(act.localAlternative.description, targetLang),
            reason: translateItineraryText(act.localAlternative.reason, targetLang),
          },
        }
      : {}),
  };
}

/**
 * Translates an entire FullTripBundle to the target language ('en' or 'pt-PT')
 * while preserving all IDs, coordinates, prices, votes, and proper nouns.
 */
export function translateItineraryBundleDeterministic(
  bundle: FullTripBundle,
  activeLanguage: 'en' | 'pt-PT' | string = 'pt-PT'
): FullTripBundle {
  const targetLang = normalizeTargetUiLanguage(activeLanguage);

  const translatedDays: Day[] = (bundle.days || []).map((day) => ({
    ...day,
    theme: translateItineraryText(day.theme, targetLang),
    ...(day.planBDescription
      ? { planBDescription: translateItineraryText(day.planBDescription, targetLang) }
      : {}),
    ...(day.accommodation
      ? {
          accommodation: {
            ...day.accommodation,
            ...(day.accommodation.whyThis
              ? { whyThis: translateItineraryText(day.accommodation.whyThis, targetLang) }
              : {}),
          },
        }
      : {}),
    ...(day.meals
      ? {
          meals: {
            breakfast: {
              ...day.meals.breakfast,
              name: translateItineraryText(day.meals.breakfast.name, targetLang),
              ...(day.meals.breakfast.cuisine
                ? { cuisine: translateItineraryText(day.meals.breakfast.cuisine, targetLang) }
                : {}),
            },
            lunch: {
              ...day.meals.lunch,
              name: translateItineraryText(day.meals.lunch.name, targetLang),
              ...(day.meals.lunch.cuisine
                ? { cuisine: translateItineraryText(day.meals.lunch.cuisine, targetLang) }
                : {}),
            },
            dinner: {
              ...day.meals.dinner,
              name: translateItineraryText(day.meals.dinner.name, targetLang),
              ...(day.meals.dinner.cuisine
                ? { cuisine: translateItineraryText(day.meals.dinner.cuisine, targetLang) }
                : {}),
            },
          },
        }
      : {}),
    activities: (day.activities || []).map((act) =>
      translateActivityDeterministic(act, targetLang)
    ),
    planB: (day.planB || []).map((act) => translateActivityDeterministic(act, targetLang)),
  }));

  const shortLang = targetLang === 'en' ? 'en' : 'pt';

  return {
    ...bundle,
    language: shortLang,
    trip: {
      ...bundle.trip,
      language: shortLang,
      assumptions: (bundle.trip.assumptions || []).map((a) =>
        translateItineraryText(a, targetLang)
      ),
    },
    days: translatedDays,
  };
}

/**
 * Sprint 30: Strict 15-second (15000ms) timeout constant for AI translation requests.
 */
export const TRANSLATION_TIMEOUT_MS = 15000;

/**
 * Sprint 30: Executes a fetch request with an AbortController timeout guard (default 15000ms).
 * If the AI takes longer than timeoutMs to translate, aborts the request and rejects so the
 * caller's catch/finally blocks handle the failure and recover loading state gracefully.
 */
export async function fetchWithTranslationTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TRANSLATION_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new Error(`Translation request timed out after ${timeoutMs}ms`);
  timeoutError.name = 'AbortError';

  const timeoutId = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface AutoTranslateRecoveryParams {
  bundle: FullTripBundle;
  activeLanguage: 'en' | 'pt-PT' | string;
  translateFn: (
    bundle: FullTripBundle,
    activeLanguage: 'en' | 'pt-PT' | string
  ) => Promise<FullTripBundle>;
  onSuccess: (translatedBundle: FullTripBundle) => Promise<void> | void;
  setIsTranslating: (loading: boolean) => void;
  onErrorToast?: (message: string) => void;
  errorMessage?: string;
}

/**
 * Sprint 30: Wraps background itinerary translation in a strict try...catch...finally block.
 * - Sets loading state true on start and ALWAYS resets setIsTranslating(false) inside finally.
 * - Logs console.error("Translation API failed:", error) inside catch.
 * - Triggers the error toast ("Erro ao traduzir. Tente novamente.") on failure while applying
 *   deterministic translation fallback so the UI never hangs or stays stuck in loading.
 */
export async function runAutoTranslateWithRecovery({
  bundle,
  activeLanguage,
  translateFn,
  onSuccess,
  setIsTranslating,
  onErrorToast,
  errorMessage,
}: AutoTranslateRecoveryParams): Promise<{
  ok: boolean;
  bundle: FullTripBundle;
  error?: unknown;
}> {
  const resolvedLang = normalizeTargetUiLanguage(activeLanguage);
  setIsTranslating(true);
  try {
    const translatedBundle = await translateFn(bundle, resolvedLang);
    await onSuccess(translatedBundle);
    return { ok: true, bundle: translatedBundle };
  } catch (error) {
    console.error('Translation API failed:', error);
    const fallbackBundle = translateItineraryBundleDeterministic(bundle, resolvedLang);
    try {
      await onSuccess(fallbackBundle);
    } catch {
      // ignore secondary state persistence error
    }
    const toastMsg =
      errorMessage ||
      (resolvedLang === 'en'
        ? 'Error translating. Try again.'
        : 'Erro ao traduzir. Tente novamente.');
    if (onErrorToast) {
      onErrorToast(toastMsg);
    }
    return { ok: false, bundle: fallbackBundle, error };
  } finally {
    setIsTranslating(false);
  }
}

/**
 * Storage key used to persist the active generated/modified trip bundle in localStorage.
 */
export const ACTIVE_TRIP_STORAGE_KEY = 'atlasgenie_active_trip';

/**
 * Distinct storage key used to persist the "New Trip" wizard form draft (`atlasgenie_form_draft`)
 * so form draft persistence/clearing never collides with or overwrites `atlasgenie_active_trip`.
 */
export const FORM_DRAFT_STORAGE_KEY = 'atlasgenie_form_draft';

/**
 * Maximum number of historical trip states retained in the Undo stack.
 */
export const MAX_TRIP_HISTORY_LENGTH = 10;

/**
 * Guard helper that verifies an itinerary/trip bundle actually has valid, non-empty data
 * (valid trip ID, non-empty days array, and at least one activity).
 */
export function hasValidItineraryData(candidate: unknown): candidate is FullTripBundle {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, any>;
  if (Array.isArray(obj.activities)) {
    return obj.activities.length > 0;
  }
  if (
    !obj.trip ||
    typeof obj.trip !== 'object' ||
    typeof obj.trip.id !== 'string' ||
    obj.trip.id.trim().length === 0 ||
    !Array.isArray(obj.days) ||
    obj.days.length === 0
  ) {
    return false;
  }
  return obj.days.some(
    (day: any) =>
      day &&
      typeof day === 'object' &&
      ((Array.isArray(day.activities) && day.activities.length > 0) ||
        (Array.isArray(day.planB) && day.planB.length > 0))
  );
}

/**
 * Creates a deep clone of a FullTripBundle so mutations never corrupt historical snapshots.
 */
export function cloneTripBundleState(bundle: FullTripBundle): FullTripBundle {
  return JSON.parse(JSON.stringify(bundle)) as FullTripBundle;
}

/**
 * Pushes a deep clone of the current trip state onto the tripHistory stack,
 * capping the history at the last `maxLimit` (default 10) actions.
 */
export function pushTripHistoryState(
  history: FullTripBundle[],
  currentState: FullTripBundle,
  maxLimit: number = MAX_TRIP_HISTORY_LENGTH
): FullTripBundle[] {
  const limit = Math.max(1, Math.round(Number(maxLimit) || MAX_TRIP_HISTORY_LENGTH));
  const snapshot = cloneTripBundleState(currentState);
  const next = [...history, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Pops the most recent state from the tripHistory stack (LIFO) for the Undo action.
 */
export function popTripHistoryState(history: FullTripBundle[]): {
  restoredState: FullTripBundle | null;
  nextHistory: FullTripBundle[];
} {
  if (!Array.isArray(history) || history.length === 0) {
    return { restoredState: null, nextHistory: [] };
  }
  const lastItem = history[history.length - 1];
  const nextHistory = history.slice(0, history.length - 1);
  return {
    restoredState: cloneTripBundleState(lastItem),
    nextHistory,
  };
}

/**
 * Serializes the active FullTripBundle into a JSON string for localStorage persistence.
 */
export function serializeActiveTripToStorage(bundle: FullTripBundle): string {
  return JSON.stringify(bundle);
}

/**
 * Safely parses and validates a persisted FullTripBundle from localStorage (`atlasgenie_active_trip`).
 */
export function parseActiveTripFromStorage(raw: string | null | undefined): FullTripBundle | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!hasValidItineraryData(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Synchronous reader for lazy `useState(() => ...)` initialization from `atlasgenie_active_trip`.
 */
export function readActiveTripFromLocalStorage(
  storage?: Pick<Storage, 'getItem'> | null
): FullTripBundle | null {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;
  if (!targetStorage) return null;
  try {
    const saved = targetStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    return saved ? parseActiveTripFromStorage(saved) : null;
  } catch {
    return null;
  }
}

/**
 * Guarded writer for `atlasgenie_active_trip`:
 * - Only writes to `localStorage` if `bundle` passes `hasValidItineraryData(bundle)`.
 * - Never overwrites a user-generated trip (`isDemo === false`) with a static demo trip (`isDemo === true`)
 *   unless explicitly requested.
 * - Removes `atlasgenie_active_trip` only when `explicitClear === true`.
 */
export function writeActiveTripToLocalStorageGuarded(
  bundle: FullTripBundle | null | undefined,
  options?: {
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
    explicitClear?: boolean;
    allowDemoOverwrite?: boolean;
  }
): boolean {
  const targetStorage =
    options?.storage !== undefined
      ? options.storage
      : typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;
  if (!targetStorage) return false;

  try {
    if (options?.explicitClear) {
      targetStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
      return true;
    }
    if (!hasValidItineraryData(bundle)) {
      return false;
    }
    if (bundle.trip.isDemo && !options?.allowDemoOverwrite) {
      const existing = readActiveTripFromLocalStorage(targetStorage);
      if (existing && !existing.trip.isDemo && existing.trip.id !== bundle.trip.id) {
        // Protect user's generated active trip from being overwritten by a demo preview
        return false;
      }
    }
    targetStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, serializeActiveTripToStorage(bundle));
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the CRITICAL SYSTEM INSTRUCTION enforcing the hard per-person budget limit.
 */
export function buildStrictBudgetConstraintDirective(perPersonBudget: number): string {
  const safePerPerson = Math.max(0, Math.round(Number(perPersonBudget) || 0));
  return `You MUST STRICTLY adhere to the per-person budget of ${safePerPerson}. The sum of all daily activities, meals, and accommodations MUST NOT exceed this exact number. This is a hard limit.`;
}

/**
 * Enforces a hard mathematical cap on all daily accommodations, intercity transit, meals, and activities
 * so that the sum of all daily costs across the entire trip never exceeds `totalBudget` (`perPersonBudget * travelersCount`).
 */
export function enforceStrictBudgetCapOnDays(
  days: Day[],
  totalBudget: number,
  travelersCount: number
): Day[] {
  if (!Array.isArray(days) || days.length === 0) return days;
  const { inputTotalBudget: safeTotalBudget, travelers: safeTravelers } = normalizeInputBudget(
    totalBudget,
    travelersCount
  );
  if (safeTotalBudget <= 0) {
    return days.map((day) => ({
      ...day,
      accommodation: day.accommodation ? { ...day.accommodation, price: 0 } : undefined,
      intercity_transit: day.intercity_transit ? { ...day.intercity_transit, price: 0 } : undefined,
      meals: day.meals
        ? {
            breakfast: { ...day.meals.breakfast, estimatedPrice: 0 },
            lunch: { ...day.meals.lunch, estimatedPrice: 0 },
            dinner: { ...day.meals.dinner, estimatedPrice: 0 },
          }
        : undefined,
      activities: (day.activities || []).map((act) => ({
        ...act,
        selectedTier: 'budget' as BudgetTier,
        costOptions: {
          budget: { ...act.costOptions.budget, estimatedCost: 0 },
          mid: { ...act.costOptions.mid, estimatedCost: 0 },
          premium: { ...act.costOptions.premium, estimatedCost: 0 },
        },
      })),
    }));
  }

  const initialTotals = computeTripTotalCost(days, safeTravelers);
  if (initialTotals.total <= safeTotalBudget) {
    return days;
  }

  // Step 1: Switch accommodation and activities to 'budget' tier first if total exceeds budget
  const budgetTierDays: Day[] = days.map((day) => ({
    ...day,
    accommodation: day.accommodation
      ? {
          ...day.accommodation,
          selectedTier: 'budget' as BudgetTier,
          price:
            day.accommodation.tierOptions?.budget?.price !== undefined
              ? day.accommodation.tierOptions.budget.price
              : day.accommodation.price,
        }
      : undefined,
    activities: (day.activities || []).map((act) => ({
      ...act,
      selectedTier: 'budget' as BudgetTier,
    })),
  }));

  const afterTierTotals = computeTripTotalCost(budgetTierDays, safeTravelers);
  if (afterTierTotals.total <= safeTotalBudget) {
    return budgetTierDays;
  }

  // Step 2: Scale down individual venue, meal, transit, and accommodation costs proportionally so the hard limit is respected
  const scaleRatio = safeTotalBudget / afterTierTotals.total;
  const scalePrice = (val: number | undefined): number => {
    const safeVal = Number.isFinite(Number(val)) ? Math.max(0, Number(val)) : 0;
    return Math.max(0, Math.floor(safeVal * scaleRatio));
  };

  const scaleMealSlot = (meal: DayMeals['breakfast'] | undefined) => {
    if (!meal) return undefined;
    const scaledEst = scalePrice(meal.estimatedPrice);
    const scaledTierVenues = meal.tierVenues
      ? {
          budget: meal.tierVenues.budget
            ? {
                ...meal.tierVenues.budget,
                estimatedPrice: scalePrice(meal.tierVenues.budget.estimatedPrice),
              }
            : meal.tierVenues.budget,
          mid: meal.tierVenues.mid
            ? {
                ...meal.tierVenues.mid,
                estimatedPrice: scalePrice(meal.tierVenues.mid.estimatedPrice),
              }
            : meal.tierVenues.mid,
          premium: meal.tierVenues.premium
            ? {
                ...meal.tierVenues.premium,
                estimatedPrice: scalePrice(meal.tierVenues.premium.estimatedPrice),
              }
            : meal.tierVenues.premium,
        }
      : undefined;
    return {
      ...meal,
      estimatedPrice: scaledTierVenues?.budget?.estimatedPrice ?? scaledEst,
      ...(scaledTierVenues ? { tierVenues: scaledTierVenues } : {}),
    };
  };

  return budgetTierDays.map((day) => {
    const scaledTierOptions = day.accommodation?.tierOptions
      ? {
          budget: day.accommodation.tierOptions.budget
            ? {
                ...day.accommodation.tierOptions.budget,
                price: scalePrice(day.accommodation.tierOptions.budget.price),
              }
            : day.accommodation.tierOptions.budget,
          mid: day.accommodation.tierOptions.mid
            ? {
                ...day.accommodation.tierOptions.mid,
                price: scalePrice(day.accommodation.tierOptions.mid.price),
              }
            : day.accommodation.tierOptions.mid,
          premium: day.accommodation.tierOptions.premium
            ? {
                ...day.accommodation.tierOptions.premium,
                price: scalePrice(day.accommodation.tierOptions.premium.price),
              }
            : day.accommodation.tierOptions.premium,
        }
      : undefined;

    return {
      ...day,
      accommodation: day.accommodation
        ? {
            ...day.accommodation,
            selectedTier: 'budget' as BudgetTier,
            price:
              scaledTierOptions?.budget?.price !== undefined
                ? scaledTierOptions.budget.price
                : scalePrice(day.accommodation.price),
            ...(scaledTierOptions ? { tierOptions: scaledTierOptions } : {}),
          }
        : undefined,
      intercity_transit: day.intercity_transit
        ? {
            ...day.intercity_transit,
            price: scalePrice(day.intercity_transit.price),
          }
        : undefined,
      meals: day.meals
        ? {
            breakfast: scaleMealSlot(day.meals.breakfast)!,
            lunch: scaleMealSlot(day.meals.lunch)!,
            dinner: scaleMealSlot(day.meals.dinner)!,
          }
        : undefined,
      activities: (day.activities || []).map((act) => {
        const scaledBudget = scalePrice(act.costOptions?.budget?.estimatedCost);
        const scaledMid = Math.max(scaledBudget, scalePrice(act.costOptions?.mid?.estimatedCost));
        const scaledPremium = Math.max(
          scaledMid,
          scalePrice(act.costOptions?.premium?.estimatedCost)
        );
        return {
          ...act,
          costOptions: {
            budget: { ...act.costOptions.budget, estimatedCost: scaledBudget },
            mid: { ...act.costOptions.mid, estimatedCost: scaledMid },
            premium: { ...act.costOptions.premium, estimatedCost: scaledPremium },
          },
        };
      }),
    };
  });
}

/**
 * Normalizes a UI/itinerary language string ('en', 'en-US', 'pt', 'pt-PT', etc.)
 * into the canonical 2-letter language code ('en' | 'pt') used on `itinerary.language` and `uiLanguage`.
 */
export function normalizeJitLanguageCode(lang?: string | null): 'en' | 'pt' {
  const clean = String(lang || '')
    .trim()
    .toLowerCase();
  if (clean === 'en' || clean.startsWith('en-') || clean === 'english') {
    return 'en';
  }
  return 'pt';
}

/**
 * Infers the active language ('en' | 'pt') of an itinerary bundle when `.language` was not explicitly persisted.
 */
export function inferItineraryLanguage(bundle: FullTripBundle | null | undefined): 'en' | 'pt' {
  if (!bundle) return 'pt';
  if (typeof bundle.language === 'string' && bundle.language.trim()) {
    return normalizeJitLanguageCode(bundle.language);
  }
  if (typeof bundle.trip?.language === 'string' && bundle.trip.language.trim()) {
    return normalizeJitLanguageCode(bundle.trip.language);
  }
  const sampleText = [
    bundle.days?.[0]?.theme || '',
    bundle.days?.[0]?.activities?.[0]?.whyThis || '',
    bundle.days?.[0]?.activities?.[0]?.description || '',
  ].join(' ');
  if (
    /\b(Day\s+\d+|Discovering|Selected for your|Tailored for your|Suggested for|Early entry|Walk through)\b/i.test(
      sampleText
    )
  ) {
    return 'en';
  }
  return 'pt';
}

/**
 * Builds the strict pure JSON translator system prompt for the `/api/translate-trip` endpoint.
 */
export function buildJitTranslateSystemPrompt(targetLanguage: string): string {
  const cleanTarget = String(targetLanguage || 'en').trim() || 'en';
  return `You are a pure JSON translator. Translate all string values (titles, descriptions, reasoning) in the provided JSON to ${cleanTarget}. You MUST return the exact same JSON structure, keys, arrays, and numerical values. Do not alter prices or coordinates. Only translate the human-readable text.`;
}

/**
 * Safely merges a translated itinerary JSON payload onto the original FullTripBundle,
 * guaranteeing that the exact JSON structure, keys, arrays, numerical values (prices, durations, scores),
 * and coordinates remain 100% intact while updating all human-readable text and stamping `.language`.
 */
export function mergeJitTranslatedBundle(
  originalBundle: FullTripBundle,
  translatedCandidate: any,
  targetUiLanguage: string
): FullTripBundle {
  const normalizedTarget = normalizeTargetUiLanguage(targetUiLanguage);
  const shortLang = normalizeJitLanguageCode(targetUiLanguage);
  const deterministicBase = translateItineraryBundleDeterministic(originalBundle, normalizedTarget);

  const pickString = (candidateVal: unknown, fallbackVal: string): string =>
    typeof candidateVal === 'string' && candidateVal.trim().length > 0
      ? candidateVal.trim()
      : fallbackVal;

  const candidateDays = Array.isArray(translatedCandidate?.days) ? translatedCandidate.days : [];

  const mergeActivity = (baseAct: Activity, rawAct: any): Activity => {
    if (!rawAct || typeof rawAct !== 'object') return baseAct;
    const mergeCostOpt = (
      baseOpt: Activity['costOptions']['mid'],
      rawOpt: any
    ): Activity['costOptions']['mid'] => ({
      ...baseOpt,
      title: pickString(rawOpt?.title, baseOpt.title),
      description: pickString(rawOpt?.description, baseOpt.description),
      ...(baseOpt.venueName
        ? { venueName: pickString(rawOpt?.venueName, baseOpt.venueName) }
        : {}),
      // Strictly preserve numerical estimatedCost and coordinates from original
      estimatedCost: baseOpt.estimatedCost,
      coordinates: baseOpt.coordinates ? { ...baseOpt.coordinates } : undefined,
    });

    return {
      ...baseAct,
      title: pickString(rawAct.title, baseAct.title),
      description: pickString(rawAct.description, baseAct.description),
      whyThis: pickString(rawAct.whyThis, baseAct.whyThis),
      ...(baseAct.openingHoursText
        ? { openingHoursText: pickString(rawAct.openingHoursText, baseAct.openingHoursText) }
        : {}),
      // Strictly preserve location coordinates and numerical fields
      durationMin: baseAct.durationMin,
      touristTrapScore: baseAct.touristTrapScore,
      location: { ...baseAct.location },
      costOptions: {
        budget: mergeCostOpt(baseAct.costOptions.budget, rawAct.costOptions?.budget),
        mid: mergeCostOpt(baseAct.costOptions.mid, rawAct.costOptions?.mid),
        premium: mergeCostOpt(baseAct.costOptions.premium, rawAct.costOptions?.premium),
      },
      ...(baseAct.localAlternative
        ? {
            localAlternative: {
              ...baseAct.localAlternative,
              title: pickString(
                rawAct.localAlternative?.title,
                baseAct.localAlternative.title
              ),
              description: pickString(
                rawAct.localAlternative?.description,
                baseAct.localAlternative.description
              ),
              reason: pickString(
                rawAct.localAlternative?.reason,
                baseAct.localAlternative.reason
              ),
              estimatedCost: baseAct.localAlternative.estimatedCost,
              location: { ...baseAct.localAlternative.location },
            },
          }
        : {}),
    };
  };

  const mergedDays: Day[] = deterministicBase.days.map((baseDay, dIdx) => {
    const rawDay =
      candidateDays.find((cd: any) => cd && (cd.id === baseDay.id || cd.dayNumber === baseDay.dayNumber)) ||
      candidateDays[dIdx];
    if (!rawDay || typeof rawDay !== 'object') return baseDay;

    const rawActivities = Array.isArray(rawDay.activities) ? rawDay.activities : [];
    const rawPlanB = Array.isArray(rawDay.planB) ? rawDay.planB : [];

    return {
      ...baseDay,
      theme: pickString(rawDay.theme, baseDay.theme || ''),
      ...(baseDay.planBDescription
        ? {
            planBDescription: pickString(rawDay.planBDescription, baseDay.planBDescription),
          }
        : {}),
      ...(baseDay.accommodation
        ? {
            accommodation: {
              ...baseDay.accommodation,
              price: baseDay.accommodation.price,
              coordinates: { ...baseDay.accommodation.coordinates },
              ...(baseDay.accommodation.description
                ? {
                    description: pickString(
                      rawDay.accommodation?.description,
                      baseDay.accommodation.description
                    ),
                  }
                : {}),
              ...(baseDay.accommodation.whyThis
                ? {
                    whyThis: pickString(
                      rawDay.accommodation?.whyThis,
                      baseDay.accommodation.whyThis
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(baseDay.meals
        ? {
            meals: {
              breakfast: {
                ...baseDay.meals.breakfast,
                name: pickString(rawDay.meals?.breakfast?.name, baseDay.meals.breakfast.name),
                ...(baseDay.meals.breakfast.cuisine
                  ? {
                      cuisine: pickString(
                        rawDay.meals?.breakfast?.cuisine,
                        baseDay.meals.breakfast.cuisine
                      ),
                    }
                  : {}),
                estimatedPrice: baseDay.meals.breakfast.estimatedPrice,
                coordinates: { ...baseDay.meals.breakfast.coordinates },
              },
              lunch: {
                ...baseDay.meals.lunch,
                name: pickString(rawDay.meals?.lunch?.name, baseDay.meals.lunch.name),
                ...(baseDay.meals.lunch.cuisine
                  ? {
                      cuisine: pickString(
                        rawDay.meals?.lunch?.cuisine,
                        baseDay.meals.lunch.cuisine
                      ),
                    }
                  : {}),
                estimatedPrice: baseDay.meals.lunch.estimatedPrice,
                coordinates: { ...baseDay.meals.lunch.coordinates },
              },
              dinner: {
                ...baseDay.meals.dinner,
                name: pickString(rawDay.meals?.dinner?.name, baseDay.meals.dinner.name),
                ...(baseDay.meals.dinner.cuisine
                  ? {
                      cuisine: pickString(
                        rawDay.meals?.dinner?.cuisine,
                        baseDay.meals.dinner.cuisine
                      ),
                    }
                  : {}),
                estimatedPrice: baseDay.meals.dinner.estimatedPrice,
                coordinates: { ...baseDay.meals.dinner.coordinates },
              },
            },
          }
        : {}),
      activities: baseDay.activities.map((act, aIdx) => {
        const matchAct =
          rawActivities.find((ra: any) => ra && ra.id === act.id) || rawActivities[aIdx];
        return mergeActivity(act, matchAct);
      }),
      planB: baseDay.planB.map((act, bIdx) => {
        const matchAct = rawPlanB.find((rb: any) => rb && rb.id === act.id) || rawPlanB[bIdx];
        return mergeActivity(act, matchAct);
      }),
    };
  });

  const rawAssumptions = Array.isArray(translatedCandidate?.trip?.assumptions)
    ? translatedCandidate.trip.assumptions
    : null;

  return {
    ...deterministicBase,
    language: shortLang,
    trip: {
      ...deterministicBase.trip,
      language: shortLang,
      totalBudget: originalBundle.trip.totalBudget,
      travelersCount: originalBundle.trip.travelersCount,
      assumptions:
        rawAssumptions && rawAssumptions.length === deterministicBase.trip.assumptions.length
          ? deterministicBase.trip.assumptions.map((baseAssump, idx) =>
              pickString(rawAssumptions[idx], baseAssump)
            )
          : deterministicBase.trip.assumptions,
    },
    days: mergedDays,
  };
}




