import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  ExpenseCategory,
  ExpenseSplitMode,
  FullTripBundle,
} from '../types/models';
import {
  computeExpenseBalancesAndSettlement,
  groupExpensesByPayer,
} from '../utils/domainLogic';
import { useAtlas } from '../context/AtlasContext';

interface ExpensesTabViewProps {
  bundle: FullTripBundle;
  preselectedActivityId?: string;
}

export const ExpensesTabView: React.FC<ExpensesTabViewProps> = ({
  bundle,
  preselectedActivityId = '',
}) => {
  const { t } = useTranslation();
  const { addExpense, deleteExpense: deleteExpenseFromContext, toggleExpenseSettled, showToast } =
    useAtlas();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(30);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [activityId, setActivityId] = useState<string>(preselectedActivityId);
  const [paidBy, setPaidBy] = useState<string>(bundle.travelers[0]?.id || 'ana');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equal');
  const [customValues, setCustomValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    bundle.travelers.forEach((tr) => {
      init[tr.id] = 1;
    });
    return init;
  });

  const summary = useMemo(
    () => computeExpenseBalancesAndSettlement(bundle.expenses, bundle.travelers),
    [bundle.expenses, bundle.travelers]
  );

  // Sprint 12.2: Transform flat expenses array into a grouped object by paidBy using .reduce()
  const groupedExpensesByPerson = useMemo(
    () => groupExpensesByPayer(bundle.expenses, bundle.travelers),
    [bundle.expenses, bundle.travelers]
  );

  const deleteExpense = (id: string) => {
    void deleteExpenseFromContext(bundle.trip.id, id);
  };

  const allActivities = useMemo(
    () => bundle.days.flatMap((d) => d.activities),
    [bundle.days]
  );

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount <= 0) return;

    const splits: Record<string, number> = {};
    const count = Math.max(1, bundle.travelers.length);

    if (splitMode === 'equal') {
      const share = Math.round((amount / count) * 100) / 100;
      bundle.travelers.forEach((tr) => {
        splits[tr.id] = share;
      });
    } else if (splitMode === 'shares') {
      const totalShares = bundle.travelers.reduce(
        (acc, tr) => acc + (customValues[tr.id] ?? 1),
        0
      );
      bundle.travelers.forEach((tr) => {
        const s = customValues[tr.id] ?? 1;
        splits[tr.id] =
          totalShares > 0
            ? Math.round(((s / totalShares) * amount) * 100) / 100
            : Math.round((amount / count) * 100) / 100;
      });
    } else {
      bundle.travelers.forEach((tr) => {
        splits[tr.id] = Number(customValues[tr.id] ?? amount / count);
      });
    }

    await addExpense(bundle.trip.id, {
      activityId,
      category,
      description: description.trim(),
      amount: Number(amount),
      currency: bundle.trip.currency || 'EUR',
      paidBy,
      splitMode,
      splits,
      date: bundle.trip.startDate,
      settled: false,
    });

    setDescription('');
  };

  const handleCopySummary = () => {
    const lines = [
      `AtlasGenie — ${bundle.trip.destination}`,
      `${t('budget.actualSpent')}: €${summary.totalSpent.toFixed(2)}`,
      ...summary.settlements.map(
        (s) => `${s.fromName} ${t('expenses.pays')} ${s.toName} €${s.amount.toFixed(2)}`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    showToast(t('expenses.copySummary'));
  };

  const handleExportCsv = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Currency', 'PaidBy', 'SplitMode', 'Settled'],
      ...bundle.expenses.map((e) => [
        e.date,
        `"${e.description.replace(/"/g, '""')}"`,
        e.category,
        e.amount.toFixed(2),
        e.currency,
        e.paidBy,
        e.splitMode,
        String(e.settled),
      ]),
    ];
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${bundle.trip.destination.toLowerCase()}-expenses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(t('expenses.exportCsv'));
  };

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
          <div className="space-y-2 text-xs">
            {summary.balances.map((b) => (
              <div
                key={b.travelerId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-sm">{b.displayName}</span>
                  <span className="text-slate-500 ml-2 font-mono-tabular">
                    ({t('expenses.paid')} €{b.paidTotal.toFixed(2)} · {t('expenses.share')} €
                    {b.owedTotal.toFixed(2)})
                  </span>
                </div>
                <span
                  className={`font-mono-tabular font-bold ${
                    b.netBalance > 0.01
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : b.netBalance < -0.01
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500'
                  }`}
                >
                  {b.netBalance > 0 ? `+€${b.netBalance.toFixed(2)}` : `€${b.netBalance.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
          <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
            {t('expenses.settleTitle')}
          </h3>
          {summary.settlements.length === 0 ? (
            <p className="text-xs text-slate-500">{t('expenses.allSettled')}</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {summary.settlements.map((s, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    <strong>{s.fromName}</strong> {t('expenses.pays')}{' '}
                    <strong>{s.toName}</strong>
                  </span>
                  <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-400">
                    {s.amount.toFixed(2)}€
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Add Expense Form */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
          {t('expenses.addBtn')}
        </h3>
        <form onSubmit={handleAddExpense} className="space-y-4">
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
                {bundle.travelers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.displayName}
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
                {allActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {splitMode !== 'equal' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {bundle.travelers.map((tr) => (
                <div key={tr.id}>
                  <label
                    htmlFor={`exp-custom-${tr.id}`}
                    className="block text-[11px] text-slate-500 mb-1"
                  >
                    {tr.displayName} ({splitMode === 'shares' ? t('expenses.sharesUnit') : '€'})
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
            className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
          >
            + {t('expenses.addBtn')}
          </button>
        </form>
      </section>

      {/* Recorded Expenses List Grouped by Person */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
          {t('expenses.recordedTitle', { count: bundle.expenses.length })}
        </h3>
        {Object.keys(groupedExpensesByPerson).length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('expenses.allSettled')}
          </p>
        ) : (
          <div data-testid="expenses-grouped-by-person" className="space-y-4">
            {Object.entries(groupedExpensesByPerson).map(([personName, personExpenses]) => {
              const personSubtotal = personExpenses.reduce((sum, item) => sum + item.amount, 0);
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
                        {personExpenses.length}
                      </span>
                    </div>
                    <span className="text-xs font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
                      {t('expenses.paid')} €{personSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {personExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        data-testid={`expense-row-${exp.id}`}
                        className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                            {exp.description}
                          </p>
                          <p className="text-xs text-slate-500 font-mono-tabular break-words">
                            {exp.date} · {t('expenses.paidByPrefix')} {personName} ·{' '}
                            {t(`interest.${exp.category}`, { defaultValue: exp.category })} ·{' '}
                            {t('expenses.splitPrefix')} {exp.splitMode}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          <span className="font-mono-tabular text-sm font-bold">
                            €{exp.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            data-testid={`toggle-settled-${exp.id}`}
                            onClick={() => toggleExpenseSettled(bundle.trip.id, exp.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                              exp.settled
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {exp.settled ? `✓ ${t('expenses.settled')}` : t('expenses.markSettled')}
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-expense-${exp.id}`}
                            aria-label={t('expenses.deleteExpenseAria', {
                              description: exp.description,
                            })}
                            onClick={() => deleteExpense(exp.id)}
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
