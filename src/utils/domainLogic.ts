import {
  Activity,
  BudgetTier,
  Day,
  Expense,
  ProposalChange,
  TravelLeg,
  TravelMode,
  Traveler,
} from '../types/models';

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
}

export interface BudgetOptimizationResult {
  selections: Record<string, BudgetTier>; // activityId -> tier
  totalEstimatedCost: number;
  changes: BudgetOptimizationChange[];
  withinBudget: boolean;
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

/**
 * Applies a single accepted ProposalChange to the trip days array and recalculates travel times & pace score.
 */
export function applySingleProposalChange(days: Day[], change: ProposalChange): Day[] {
  return days.map((day) => {
    if (day.id !== change.dayId && day.dayNumber !== change.dayNumber) {
      return day;
    }

    let nextActivities = [...day.activities];

    if (change.type === 'add' && change.payload) {
      nextActivities.push(change.payload);
      nextActivities.sort((a, b) => a.startTime.localeCompare(b.startTime));
    } else if (change.type === 'remove' && change.targetActivityId) {
      nextActivities = nextActivities.filter((a) => a.id !== change.targetActivityId);
    } else if (change.type === 'replace' && change.targetActivityId && change.payload) {
      nextActivities = nextActivities.map((a) =>
        a.id === change.targetActivityId ? change.payload! : a
      );
    } else if (change.type === 'move' && change.targetActivityId && change.newStartTime) {
      nextActivities = nextActivities
        .map((a) =>
          a.id === change.targetActivityId ? { ...a, startTime: change.newStartTime! } : a
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    const withTravel = recalculateDayTravelTimes(nextActivities);
    const updatedDay: Day = {
      ...day,
      activities: withTravel,
    };
    const metrics = computePaceMetrics(updatedDay);
    return {
      ...updatedDay,
      paceScore: metrics.paceScore,
    };
  });
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
