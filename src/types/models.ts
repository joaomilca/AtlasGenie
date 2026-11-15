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
  isPriceVerified?: boolean;
  description: string;
  venueName?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface DayAccommodation {
  name: string;
  type: 'hotel' | 'hostel' | 'apartment' | string;
  price: number;
  isPriceVerified?: boolean;
  coordinates: {
    lat: number;
    lng: number;
  };
  selectedTier?: BudgetTier;
  description?: string;
  whyThis?: string;
  customPriceLocked?: boolean;
  tierOptions?: {
    budget?: {
      name: string;
      type: string;
      price: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
    mid?: {
      name: string;
      type: string;
      price: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
    premium?: {
      name: string;
      type: string;
      price: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
  };
}

export interface IntercityTransit {
  method: string;
  duration: string;
  price: number;
  isPriceVerified?: boolean;
  fromCity?: string;
  toCity?: string;
}

export interface MealRecommendation {
  name: string;
  cuisine?: string;
  estimatedPrice: number;
  isPriceVerified?: boolean;
  coordinates: {
    lat: number;
    lng: number;
  };
  tierVenues?: {
    budget?: {
      name: string;
      estimatedPrice: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
    mid?: {
      name: string;
      estimatedPrice: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
    premium?: {
      name: string;
      estimatedPrice: number;
      isPriceVerified?: boolean;
      coordinates: { lat: number; lng: number };
    };
  };
}

export interface DayMeals {
  breakfast: MealRecommendation;
  lunch: MealRecommendation;
  dinner: MealRecommendation;
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
  isPriceVerified?: boolean;
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
  isPriceVerified?: boolean;
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
  city?: string;
  theme?: string;
  paceLevel: number; // 1 (Relaxed) to 5 (Intense)
  paceScore: number; // 0-100 calculated
  activePlan: 'A' | 'B';
  accommodation?: DayAccommodation;
  intercity_transit?: IntercityTransit;
  meals?: DayMeals;
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

export interface TravelerProfilePreferences {
  defaultGroupSize: number;
  defaultPaceLevel: number;
  savedInterests: string[];
  savedRestrictions: string[];
}

export interface UserProfile extends TravelerProfilePreferences {
  id: string;
  name: string;
  email: string;
  language: Language;
  notificationEnabled?: boolean;
  reminderDaysBefore?: number;
  notificationPrefs: {
    enabled: boolean;
    daysBefore: number;
  };
}

export type ProposalChangeType = 'add' | 'remove' | 'replace' | 'move' | 'replace_accommodation';

export interface ProposalChange {
  id: string;
  dayId: string;
  dayNumber: number;
  type: ProposalChangeType;
  targetActivityId?: string;
  targetActivityTitle?: string;
  targetAccommodationName?: string;
  payload?: Activity;
  accommodationPayload?: DayAccommodation;
  newStartTime?: string;
  reason: string;
  source: 'chat' | 'pace' | 'local_alt' | 'budget' | 'compromise' | 'accommodation';
  status: 'pending' | 'accepted' | 'rejected';
  optionGroupId?: string;
  optionIndex?: number;
}

export interface FullTripBundle {
  trip: Trip;
  days: Day[];
  travelers: Traveler[];
  expenses: Expense[];
}
