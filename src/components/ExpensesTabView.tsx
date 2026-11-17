import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  Activity,
  Expense,
  ExpenseCategory,
  ExpenseSplitMode,
  FullTripBundle,
  Traveler,
} from '../types/models';
import {
  computeExpenseBalancesAndSettlement,
  groupExpensesByPayer,
  normalizeTravelersList,
} from '../utils/domainLogic';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';

interface AddExpenseFormProps {
  travelers: Traveler[];
  activities: Activity[];
  preselectedActivityId?: string;
  currency: string;
  startDate: string;
  onAddExpense: (payload: Omit<Expense, 'id' | 'tripId' | 'ownerId' | 'authorId'>) => Promise<void>;
}

/**
 * Isolated memoized child form component so keystrokes in "Add Expense"
 * never re-render the parent ExpensesTabView or TripWorkspacePage.
 */
const AddExpenseForm = React.memo<AddExpenseFormProps>(
  ({ travelers, activities, preselectedActivityId = '', currency, startDate, onAddExpense }) => {
    const { t } = useTranslation();
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(30);
    const [category, setCategory] = useState<ExpenseCategory>('food');
    const [activityId, setActivityId] = useState<string>(preselectedActivityId);
    const [paidBy, setPaidBy] = useState<string>(() => travelers[0]?.id || '');
    const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equal');
    const [customValues, setCustomValues] = useState<Record<string, number>>(() => {
      const init: Record<string, number> = {};
      travelers.forEach((tr) => {
        if (tr?.id) init[tr.id] = 1;
      });
      return init;
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
      if (travelers.length > 0 && (!paidBy || !travelers.some((tr) => tr.id === paidBy))) {
        setPaidBy(travelers[0].id);
      }
    }, [paidBy, travelers]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const cleanDesc = description.trim();
      const safeAmount = Number(amount);
      if (!cleanDesc || !Number.isFinite(safeAmount) || safeAmount <= 0 || submitting) return;

      const splits: Record<string, number> = {};
      const count = Math.max(1, travelers.length);

      if (splitMode === 'equal') {
        const share = Math.round((safeAmount / count) * 100) / 100;
        travelers.forEach((tr) => {
          if (tr?.id) splits[tr.id] = share;
        });
      } else if (splitMode === 'shares') {
        const totalShares = travelers.reduce(
          (acc, tr) => acc + (tr?.id ? customValues[tr.id] ?? 1 : 0),
          0
        );
        travelers.forEach((tr) => {
          if (!tr?.id) return;
          const s = customValues[tr.id] ?? 1;
          splits[tr.id] =
            totalShares > 0
              ? Math.round(((s / totalShares) * safeAmount) * 100) / 100
              : Math.round((safeAmount / count) * 100) / 100;
        });
      } else {
        travelers.forEach((tr) => {
          if (tr?.id) {
            splits[tr.id] = Number(customValues[tr.id] ?? safeAmount / count);
          }
        });
      }

      setSubmitting(true);
      try {
        await onAddExpense({
          activityId,
          category,
          description: cleanDesc,
          amount: safeAmount,
          currency: currency || 'EUR',
          paidBy: paidBy || travelers[0]?.id || '',
          splitMode,
          splits,
          date: startDate || new Date().toISOString().slice(0, 10),
          settled: false,
        });
        setDescription('');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
          {t('expenses.addBtn')}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="exp-desc" className="block text-xs font-medium mb-1">
                {t('expenses.descLabel')}
              </label>
              <input
                id="exp-desc"
                type="text"
                required
                placeholder={t('expenses.descPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="exp-amount" className="block text-xs font-medium mb-1">
                {t('expenses.amountLabel')}
              </label>
              <input
                id="exp-amount"
                type="number"
                step="0.5"
                min="0.5"
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="exp-cat" className="block text-xs font-medium mb-1">
                {t('expenses.categoryLabel')}
              </label>
              <select
                id="exp-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="food">{t('expenses.catFood')}</option>
                <option value="activities">{t('expenses.catActivities')}</option>
                <option value="transport">{t('expenses.catTransport')}</option>
                <option value="accommodation">{t('expenses.catAccommodation')}</option>
                <option value="other">{t('expenses.catOther')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="exp-paidby" className="block text-xs font-medium mb-1">
                {t('expenses.paidByLabel')}
              </label>
              <select
                id="exp-paidby"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {travelers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr?.displayName || 'Traveler'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="exp-splitmode" className="block text-xs font-medium mb-1">
                {t('expenses.splitModeLabel')}
              </label>
              <select
                id="exp-splitmode"
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as ExpenseSplitMode)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="equal">{t('expenses.splitEqual')}</option>
                <option value="shares">{t('expenses.splitShares')}</option>
                <option value="custom">{t('expenses.splitCustom')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="exp-act" className="block text-xs font-medium mb-1">
                {t('expenses.linkActivityLabel')}
              </label>
              <select
                id="exp-act"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">{t('expenses.generalExpense')}</option>
                {activities.map((act) => (
                  <option key={act?.id} value={act?.id}>
                    {act?.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {splitMode !== 'equal' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {travelers.map((tr) => (
                <div key={tr.id}>
                  <label
                    htmlFor={`exp-custom-${tr.id}`}
                    className="block text-[11px] text-slate-500 mb-1"
                  >
                    {tr?.displayName || 'Traveler'} (
                    {splitMode === 'shares' ? t('expenses.sharesUnit') : '€'})
                  </label>
                  <input
                    id={`exp-custom-${tr.id}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={customValues[tr.id] ?? 1}
                    onChange={(e) =>
                      setCustomValues((prev) => ({
                        ...prev,
                        [tr.id]: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || travelers.length === 0}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
          >
            + {t('expenses.addBtn')}
          </button>
        </form>
      </section>
    );
  }
);

AddExpenseForm.displayName = 'AddExpenseForm';

interface ExpensesTabViewProps {
  bundle: FullTripBundle;
  preselectedActivityId?: string;
}

export const ExpensesTabView: React.FC<ExpensesTabViewProps> = ({
  bundle,
  preselectedActivityId = '',
}) => {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { addExpense, deleteExpense: deleteExpenseFromContext, toggleExpenseSettled, showToast } =
    useAtlas();

  const liveDays = useMemo(() => (Array.isArray(bundle?.days) ? bundle.days : []), [bundle?.days]);
  const liveExpenses = useMemo(
    () => (Array.isArray(bundle?.expenses) ? bundle.expenses : []),
    [bundle?.expenses]
  );
  const liveTravelers = useMemo(
    () =>
      normalizeTravelersList(bundle?.travelers, undefined, {
        tripId: bundle?.trip?.id,
        ownerId: bundle?.trip?.ownerId,
        defaultInterests: bundle?.trip?.interests,
        totalBudget: bundle?.trip?.totalBudget,
        travelersCount: bundle?.trip?.travelersCount,
      }),
    [
      bundle?.travelers,
      bundle?.trip?.id,
      bundle?.trip?.interests,
      bundle?.trip?.ownerId,
      bundle?.trip?.totalBudget,
      bundle?.trip?.travelersCount,
    ]
  );

  const summary = useMemo(
    () => computeExpenseBalancesAndSettlement(liveExpenses, liveTravelers),
    [liveExpenses, liveTravelers]
  );

  // Sprint 12.2: Transform flat expenses array into a grouped object by paidBy using .reduce()
  const groupedExpensesByPerson = useMemo(
    () => groupExpensesByPayer(liveExpenses, liveTravelers),
    [liveExpenses, liveTravelers]
  );

  const tripId = bundle?.trip?.id || '';

  const deleteExpense = useCallback(
    (id: string) => {
      if (!tripId) return;
      void deleteExpenseFromContext(tripId, id);
    },
    [deleteExpenseFromContext, tripId]
  );

  const allActivities = useMemo(
    () => liveDays.flatMap((d) => (Array.isArray(d?.activities) ? d.activities : [])),
    [liveDays]
  );

  const handleAddExpense = useCallback(
    async (payload: Omit<Expense, 'id' | 'tripId' | 'ownerId' | 'authorId'>) => {
      if (!tripId) return;
      await addExpense(tripId, payload);
    },
    [addExpense, tripId]
  );

  const handleCopySummary = useCallback(() => {
    const totalSpent = Number(summary?.totalSpent) || 0;
    const lines = [
      `AtlasGenie — ${bundle?.trip?.destination || ''}`,
      `${t('budget.actualSpent')}: €${totalSpent.toFixed(2)}`,
      ...(summary?.settlements || []).map(
        (s) =>
          `${s?.fromName || ''} ${t('expenses.pays')} ${s?.toName || ''} €${(
            Number(s?.amount) || 0
          ).toFixed(2)}`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    showToast(t('expenses.copySummary'));
  }, [bundle?.trip?.destination, showToast, summary?.settlements, summary?.totalSpent, t]);

  const handleExportCsv = useCallback(() => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Currency', 'PaidBy', 'SplitMode', 'Settled'],
      ...liveExpenses.map((e) => [
        e?.date || '',
        `"${String(e?.description || '').replace(/"/g, '""')}"`,
        e?.category || 'other',
        (Number(e?.amount) || 0).toFixed(2),
        e?.currency || 'EUR',
        e?.paidBy || '',
        e?.splitMode || 'equal',
        String(Boolean(e?.settled)),
      ]),
    ];
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${(bundle?.trip?.destination || 'trip').toLowerCase()}-expenses.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(t('expenses.exportCsv'));
  }, [bundle?.trip?.destination, liveExpenses, showToast, t]);

  const waitingMessage =
    language === 'en' ? 'Waiting for traveler data...' : 'A aguardar dados dos viajantes...';

  return (
    <div className="space-y-8">
      {/* Header & Export Actions */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif-atlas text-xl md:text-2xl font-bold text-slate-900 dark:text-white break-words">
            {t('expenses.title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            {t('expenses.noPaymentNote')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopySummary}
            className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('expenses.copySummary')}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {t('expenses.exportCsv')}
          </button>
        </div>
      </section>

      {/* Net Balances & Minimised Settle-Up Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
          <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
            {t('expenses.balancesTitle')}
          </h3>
          {liveTravelers.length === 0 ? (
            <div
              data-testid="expenses-waiting-traveler-data"
              className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400"
            >
              {waitingMessage}
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {(summary?.balances || []).map((b) => {
                const paidTotal = Number(b?.paidTotal) || 0;
                const owedTotal = Number(b?.owedTotal) || 0;
                const netBalance = Number(b?.netBalance) || 0;
                return (
                  <div
                    key={b?.travelerId || b?.displayName}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-sm">
                        {b?.displayName || 'Traveler'}
                      </span>
                      <span className="text-slate-500 ml-2 font-mono-tabular">
                        ({t('expenses.paid')} €{paidTotal.toFixed(2)} · {t('expenses.share')} €
                        {owedTotal.toFixed(2)})
                      </span>
                    </div>
                    <span
                      className={`font-mono-tabular font-bold ${
                        netBalance > 0.01
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : netBalance < -0.01
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {netBalance > 0 ? `+€${netBalance.toFixed(2)}` : `€${netBalance.toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
          <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
            {t('expenses.settleTitle')}
          </h3>
          {(summary?.settlements || []).length === 0 ? (
            <p className="text-xs text-slate-500">{t('expenses.allSettled')}</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {(summary?.settlements || []).map((s, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    <strong>{s?.fromName || ''}</strong> {t('expenses.pays')}{' '}
                    <strong>{s?.toName || ''}</strong>
                  </span>
                  <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-400">
                    {(Number(s?.amount) || 0).toFixed(2)}€
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Isolated Add Expense Form */}
      <AddExpenseForm
        travelers={liveTravelers}
        activities={allActivities}
        preselectedActivityId={preselectedActivityId}
        currency={bundle?.trip?.currency || 'EUR'}
        startDate={bundle?.trip?.startDate || ''}
        onAddExpense={handleAddExpense}
      />

      {/* Recorded Expenses List Grouped by Person */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
          {t('expenses.recordedTitle', { count: liveExpenses.length })}
        </h3>
        {Object.keys(groupedExpensesByPerson || {}).length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('expenses.allSettled')}
          </p>
        ) : (
          <div data-testid="expenses-grouped-by-person" className="space-y-4">
            {Object.entries(groupedExpensesByPerson || {}).map(([personName, personExpenses]) => {
              const safeList = Array.isArray(personExpenses) ? personExpenses : [];
              const personSubtotal = safeList.reduce(
                (sum, item) => sum + (Number(item?.amount) || 0),
                0
              );
              return (
                <div
                  key={personName}
                  data-testid={`expense-person-group-${personName}`}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#FAF6F0]/60 dark:bg-slate-950/50 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif-atlas text-sm md:text-base font-bold text-slate-900 dark:text-white">
                        {personName}
                      </h4>
                      <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                        {safeList.length}
                      </span>
                    </div>
                    <span className="text-xs font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
                      {t('expenses.paid')} €{personSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {safeList.map((exp) => (
                      <div
                        key={exp?.id}
                        data-testid={`expense-row-${exp?.id}`}
                        className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                            {exp?.description || ''}
                          </p>
                          <p className="text-xs text-slate-500 font-mono-tabular break-words">
                            {exp?.date || ''} · {t('expenses.paidByPrefix')} {personName} ·{' '}
                            {t(`interest.${exp?.category || 'other'}`, {
                              defaultValue: exp?.category || 'other',
                            })}{' '}
                            · {t('expenses.splitPrefix')} {exp?.splitMode || 'equal'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          <span className="font-mono-tabular text-sm font-bold">
                            €{(Number(exp?.amount) || 0).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            data-testid={`toggle-settled-${exp?.id}`}
                            onClick={() => exp?.id && toggleExpenseSettled(tripId, exp.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                              exp?.settled
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {exp?.settled ? `✓ ${t('expenses.settled')}` : t('expenses.markSettled')}
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-expense-${exp?.id}`}
                            aria-label={t('expenses.deleteExpenseAria', {
                              description: exp?.description || '',
                            })}
                            onClick={() => exp?.id && deleteExpense(exp.id)}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 hover:border-rose-300 dark:hover:text-rose-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

