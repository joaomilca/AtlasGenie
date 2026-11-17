import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { useAtlas } from '../context/AtlasContext';
import { useAuth, formatCleanAuthOrFirestoreError } from '../context/AuthContext';
import { fetchTripByIdOrInviteCode, joinTripWithArrayUnion } from '../firebase';
import { LoginModal } from '../components/LoginModal';
import type { FullTripBundle } from '../types/models';

interface JoinTripProfileFormValues {
  displayName: string;
  interests: string;
  budgetPerPerson: number;
  constraints: string;
  preferredPace: number;
}

interface JoinTripProfileFormProps {
  destination: string;
  inviteCode: string;
  initialDisplayName: string;
  joining: boolean;
  joinError: string | null;
  isSignedIn: boolean;
  onRequireSignIn: () => void;
  onSubmitJoin: (values: JoinTripProfileFormValues) => Promise<void> | void;
}

const JoinTripProfileForm: React.FC<JoinTripProfileFormProps> = React.memo(
  ({
    destination,
    inviteCode,
    initialDisplayName,
    joining,
    joinError,
    isSignedIn,
    onRequireSignIn,
    onSubmitJoin,
  }) => {
    const { t, i18n } = useTranslation();
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [interests, setInterests] = useState('food, history, viewpoints');
    const [budgetPerPerson, setBudgetPerPerson] = useState(350);
    const [constraints, setConstraints] = useState('');
    const [preferredPace, setPreferredPace] = useState(3);

    useEffect(() => {
      if (initialDisplayName && !displayName) {
        setDisplayName(initialDisplayName);
      }
    }, [initialDisplayName, displayName]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      void onSubmitJoin({
        displayName,
        interests,
        budgetPerPerson,
        constraints,
        preferredPace,
      });
    };

    return (
      <form
        onSubmit={handleSubmit}
        data-testid="join-trip-form"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5"
      >
        <div>
          <p className="text-xs font-mono-tabular uppercase text-amber-700 dark:text-amber-400">
            {t('group.inviteCode')} · {inviteCode}
          </p>
          <h1 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {t('join.title', { destination })}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('join.subtitle')}
          </p>
        </div>

        {!isSignedIn && (
          <div
            data-testid="join-auth-required-banner"
            className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-amber-950 dark:text-amber-200">
                {i18n.language.startsWith('en')
                  ? 'Please sign in first so we can link your account to this group itinerary.'
                  : 'Inicie sessão primeiro para associarmos a sua conta ao roteiro de grupo.'}
              </p>
            </div>
            <button
              type="button"
              data-testid="join-trip-signin-btn"
              onClick={onRequireSignIn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('nav.signIn')}</span>
            </button>
          </div>
        )}

        {joinError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200"
          >
            {joinError}
          </div>
        )}

        <div>
          <label htmlFor="join-name" className="block text-xs font-medium mb-1">
            {t('join.yourName')}
          </label>
          <input
            id="join-name"
            type="text"
            required
            placeholder={t('join.namePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <div>
          <label htmlFor="join-interests" className="block text-xs font-medium mb-1">
            {t('join.interestsLabel')}
          </label>
          <input
            id="join-interests"
            type="text"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="join-budget" className="block text-xs font-medium mb-1">
              {t('group.budgetPlaceholder')}
            </label>
            <input
              id="join-budget"
              type="number"
              min={50}
              value={budgetPerPerson}
              onChange={(e) => setBudgetPerPerson(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="join-pace" className="block text-xs font-medium mb-1">
              {t('join.paceLabel')}
            </label>
            <input
              id="join-pace"
              type="number"
              min={1}
              max={5}
              value={preferredPace}
              onChange={(e) => setPreferredPace(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
            />
          </div>
        </div>

        <div>
          <label htmlFor="join-constraints" className="block text-xs font-medium mb-1">
            {t('join.constraintsLabel')}
          </label>
          <input
            id="join-constraints"
            type="text"
            placeholder={t('join.constraintsPlaceholder')}
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          data-testid="join-trip-submit-btn"
          disabled={joining}
          className="w-full py-3 px-4 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
        >
          {joining
            ? i18n.language.startsWith('en')
              ? 'Joining Trip...'
              : 'A aderir à viagem...'
            : t('join.submitBtn')}
        </button>
      </form>
    );
  }
);

JoinTripProfileForm.displayName = 'JoinTripProfileForm';

export const JoinTripPage: React.FC = () => {
  const { inviteCode: paramCode } = useParams<{ inviteCode: string }>();
  const [searchParams] = useSearchParams();
  const queryCode = searchParams.get('invite') || searchParams.get('code') || '';
  const inviteCode = (paramCode || queryCode || 'LISBOA26').trim();

  const { trips, findTripByInviteCode, addTraveler, registerFetchedTrips, showToast } = useAtlas();
  const { user, loading: authLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<FullTripBundle | undefined>(() =>
    findTripByInviteCode(inviteCode)
  );
  const [fetchingTrip, setFetchingTrip] = useState<boolean>(!findTripByInviteCode(inviteCode));
  const [joining, setJoining] = useState<boolean>(false);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const initialDisplayName = user
    ? user.displayName || (user.email ? user.email.split('@')[0] : '') || 'Traveller'
    : '';

  // Step 1 & Step 2: Await User Auth, then Fetch Trip by ID/Code from Firestore (or local cache)
  useEffect(() => {
    let isMounted = true;
    if (authLoading) return;

    (async () => {
      setFetchingTrip(true);
      try {
        const fetched = await fetchTripByIdOrInviteCode(inviteCode, trips);
        if (!isMounted) return;
        if (fetched) {
          setBundle(fetched);
          registerFetchedTrips([fetched]);
        } else {
          setBundle(findTripByInviteCode(inviteCode));
        }
      } catch (err) {
        if (isMounted) {
          setJoinError(formatCleanAuthOrFirestoreError(err, i18n.language));
        }
      } finally {
        if (isMounted) {
          setFetchingTrip(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [authLoading, inviteCode, user?.uid]);

  if (authLoading || fetchingTrip) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Loader2 className="w-4 h-4 text-[#D97706] animate-spin" aria-hidden="true" />
          <span>
            {i18n.language.startsWith('en')
              ? 'Verifying invite link & authentication...'
              : 'A verificar convite e autenticação...'}
          </span>
        </div>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-serif-atlas text-2xl font-bold">{t('join.notFoundTitle')}</h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t('join.notFoundSub', { code: inviteCode })}
        </p>
        <button
          type="button"
          onClick={() => navigate('/demo')}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] rounded-lg cursor-pointer"
        >
          {t('join.browseDemosBtn')}
        </button>
      </main>
    );
  }

  // Step 3 & Step 4: Execute Firestore arrayUnion with authenticated user.uid, then Redirect to Trip Workspace
  const handleJoin = async (values: JoinTripProfileFormValues) => {
    setJoinError(null);

    // Step 1 Enforcement: Await/require authenticated user so we have a valid user.uid
    if (!user?.uid) {
      setLoginModalOpen(true);
      return;
    }

    const cleanName =
      values.displayName.trim() ||
      user.displayName ||
      (user.email ? user.email.split('@')[0] : 'Traveller');
    setJoining(true);

    try {
      // Ensure the fetched bundle (including creator & existing travelers) is registered in context before appending
      registerFetchedTrips([bundle]);

      const createdTraveler = await addTraveler(bundle.trip.id, {
        userId: user.uid,
        displayName: cleanName,
        interests: values.interests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        budgetPerPerson: Number(values.budgetPerPerson) || 350,
        constraints: values.constraints.trim() || 'None',
        preferredPace: values.preferredPace,
        color: '#0D9488',
        avatar: cleanName[0].toUpperCase(),
      });

      // Step 3: Execute Firestore arrayUnion to append user.uid & traveler object without overwriting existing travelers
      await joinTripWithArrayUnion(bundle.trip.id, user.uid, createdTraveler);

      // Step 4: Redirect to the Trip Workspace
      navigate(`/trips/${bundle.trip.id}`);
    } catch (err) {
      const cleanMsg = formatCleanAuthOrFirestoreError(err, i18n.language);
      setJoinError(cleanMsg);
      showToast(cleanMsg, 'alert');
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <JoinTripProfileForm
        destination={bundle.trip.destination}
        inviteCode={bundle.trip.inviteCode}
        initialDisplayName={initialDisplayName}
        joining={joining}
        joinError={joinError}
        isSignedIn={Boolean(user?.uid)}
        onRequireSignIn={() => setLoginModalOpen(true)}
        onSubmitJoin={handleJoin}
      />

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
    </main>
  );
};


