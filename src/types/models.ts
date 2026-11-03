export type Language = 'pt' | 'en';

export type ConfidenceStatus = 'verified' | 'estimated' | 'to_confirm';

export interface ConfidenceInfo {
  status: ConfidenceStatus;
  sourceUrl?: string;
  verifiedAt?: string;
  notes?: string;
}

export type BudgetTier = 'budget' | 'mid' | 'premium';

export interface CostOption {
  title: string;
  estimatedCost: number;
  description: string;
}

export type ActivityCategory = 'food' | 'culture' | 'nature' | 'nightlife' | 'shopping' | 'relax' | 'transport' | 'other';

export type TravelMode = 'WALKING' | 'TRANSIT' | 'DRIVING';

export interface TravelLeg {
  mode: TravelMode;
  minutes: number;
  distanceKm: number;
  source: 'maps_api' | 'estimated';
}

export interface LocalAlternative {
  id: string;
  title: string;
  category: ActivityCategory;
  description: string;
  reason: string;
  location: {
    name: string;
    lat: number;
    lng: number;
    placeId?: string;
  };
  estimatedCost: number;
  travelMinutesAway: number;
  travelSource: 'maps_api' | 'estimated';
  priceConfidence: ConfidenceInfo;
  hoursConfidence: ConfidenceInfo;
}

export type VoteValue = 'up' | 'neutral' | 'down';

export interface Activity {
  id: string;
  title: string;
  category: ActivityCategory;
  description: string;
  startTime: string; // "09:30"
  durationMin: number;
  openingHoursText?: string;
  isOutdoor?: boolean;
  interestTags: string[];
  location: {
    name: string;
    lat: number;
    lng: number;
    placeId?: string;
  };
  costOptions: {
    budget: CostOption;
    mid: CostOption;
    premium: CostOption;
  };
  selectedTier: BudgetTier;
  priceConfidence: ConfidenceInfo;
  hoursConfidence: ConfidenceInfo;
  whyThis: string;
  touristTrapScore: number; // 0-100
  localAlternative?: LocalAlternative;
  travelFromPrevious?: TravelLeg;
  votes: Record<string, VoteValue>;
}

export interface Day {
  id: string;
  tripId: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  dayNumber: number;
  theme?: string;
  paceLevel: number; // 1 (Relaxed) to 5 (Intense)
  paceScore: number; // 0-100 calculated
  activePlan: 'A' | 'B';
  activities: Activity[];
  planB: Activity[];
  planBDescription?: string;
}

export interface Traveler {
  id: string;
  tripId: string;
  ownerId: string;
  userId: string;
  displayName: string;
  interests: string[];
  budgetPerPerson: number;
  constraints: string;
  preferredPace: number; // 1-5
  color: string;
  avatar: string;
}

export type ExpenseSplitMode = 'equal' | 'custom' | 'shares';
export type ExpenseCategory = 'food' | 'activities' | 'transport' | 'accommodation' | 'other';

export interface Expense {
  id: string;
  tripId: string;
  ownerId: string;
  authorId: string;
  activityId: string; // "" if general trip expense
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  paidBy: string; // travelerId
  splitMode: ExpenseSplitMode;
  splits: Record<string, number>; // travelerId -> amount in currency
  shares?: Record<string, number>; // optional raw shares if splitMode === 'shares'
  date: string;
  settled: boolean;
}

export type TripStatus = 'draft' | 'planned' | 'ongoing' | 'completed';

export interface Trip {
  id: string;
  ownerId: string;
  destination: string;
  country?: string;
  startDate: string;
  endDate: string;
  currency: string;
  totalBudget: number;
  travelersCount: number;
  interests: string[];
  defaultPace: number; // 1-5
  status: TripStatus;
  memberIds: string[];
  inviteCode: string;
  assumptions: string[];
  groupEnabled: boolean;
  isDemo?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  language: Language;
  notificationPrefs: {
    enabled: boolean;
    daysBefore: number;
  };
}

export type ProposalChangeType = 'add' | 'remove' | 'replace' | 'move';

export interface ProposalChange {
  id: string;
  dayId: string;
  dayNumber: number;
  type: ProposalChangeType;
  targetActivityId?: string;
  targetActivityTitle?: string;
  payload?: Activity;
  newStartTime?: string;
  reason: string;
  source: 'chat' | 'pace' | 'local_alt' | 'budget' | 'compromise';
  status: 'pending' | 'accepted' | 'rejected';
}

export interface FullTripBundle {
  trip: Trip;
  days: Day[];
  travelers: Traveler[];
  expenses: Expense[];
}
