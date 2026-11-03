import React, { useMemo, useState } from 'react';
import {
  ExpenseCategory,
  ExpenseSplitMode,
  FullTripBundle,
} from '../types/models';
import { computeExpenseBalancesAndSettlement } from '../utils/domainLogic';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';

interface ExpensesTabViewProps {
  bundle: FullTripBundle;
  preselectedActivityId?: string;
}

export const ExpensesTabView: React.FC<ExpensesTabViewProps> = ({
  bundle,
  preselectedActivityId = '',
}) => {
  const { t } = useI18n();
  const { addExpense, toggleExpenseSettled, showToast } = useAtlas();

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
      // custom amounts
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
      `AtlasGenie Expense Summary — ${bundle.trip.destination}`,
      `Total Spent: €${summary.totalSpent.toFixed(2)}`,
      ...summary.settlements.map(
        (s) => `${s.fromName} pays ${s.toName} €${s.amount.toFixed(2)}`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    showToast('Copied settlement summary to clipboard!');
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
    showToast('Exported expenses CSV.');
  };

  return (
    <div className="space-y-8">
      {/* Header & Export Actions */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
            {t('expenses.title')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('expenses.noPaymentNote')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopySummary}
            className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg whitespace-nowrap"
          >
            {t('expenses.copySummary')}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            {t('expenses.exportCsv')}
          </button>
        </div>
      </section>

      {/* Net Balances & Minimised Settle-Up Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            {t('expenses.balancesTitle')}
          </h3>
          <div className="space-y-2 text-xs">
            {summary.balances.map((b) => (
              <div
                key={b.travelerId}
                className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800"
              >
                <div>
                  <span className="font-semibold text-sm">{b.displayName}</span>
                  <span className="text-slate-500 ml-2 font-mono-tabular">
                    (Paid €{b.paidTotal.toFixed(2)} · Share €{b.owedTotal.toFixed(2)})
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

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            {t('expenses.settleTitle')}
          </h3>
          {summary.settlements.length === 0 ? (
            <p className="text-xs text-slate-500">All balances are settled! Everyone is at €0.00.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {summary.settlements.map((s, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
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
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
          {t('expenses.addBtn')}
        </h3>
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="exp-desc" className="block text-xs font-medium mb-1">
                Description
              </label>
              <input
                id="exp-desc"
                type="text"
                required
                placeholder="e.g. Tasca dinner, Museum tickets, Bolt taxi…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
              />
            </div>

            <div>
              <label htmlFor="exp-amount" className="block text-xs font-medium mb-1">
                Amount (€)
              </label>
              <input
                id="exp-amount"
                type="number"
                step="0.5"
                min="0.5"
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="exp-cat" className="block text-xs font-medium mb-1">
                Category
              </label>
              <select
                id="exp-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
              >
                <option value="food">Food &amp; Drinks</option>
                <option value="activities">Activities &amp; Tickets</option>
                <option value="transport">Transport</option>
                <option value="accommodation">Accommodation</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="exp-paidby" className="block text-xs font-medium mb-1">
                Paid By
              </label>
              <select
                id="exp-paidby"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
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
                Split Mode
              </label>
              <select
                id="exp-splitmode"
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as ExpenseSplitMode)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
              >
                <option value="equal">Equal Split</option>
                <option value="shares">By Shares (1x, 2x…)</option>
                <option value="custom">Custom Exact Amounts (€)</option>
              </select>
            </div>

            <div>
              <label htmlFor="exp-act" className="block text-xs font-medium mb-1">
                Link to Activity (Optional)
              </label>
              <select
                id="exp-act"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
              >
                <option value="">General Trip Expense</option>
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
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {tr.displayName} ({splitMode === 'shares' ? 'Shares' : '€'})
                  </label>
                  <input
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
                    className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 font-mono-tabular"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors"
          >
            + {t('expenses.addBtn')}
          </button>
        </form>
      </section>

      {/* Recorded Expenses List */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
          Recorded Expenses ({bundle.expenses.length})
        </h3>
        <div className="space-y-2.5">
          {bundle.expenses.map((exp) => {
            const payerName =
              bundle.travelers.find((tr) => tr.id === exp.paidBy)?.displayName || exp.paidBy;
            return (
              <div
                key={exp.id}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {exp.description}
                  </p>
                  <p className="text-xs text-slate-500 font-mono-tabular">
                    Paid by {payerName} · {exp.category} · Split: {exp.splitMode}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular text-sm font-bold">
                    €{exp.amount.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpenseSettled(bundle.trip.id, exp.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                      exp.settled
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {exp.settled ? `✓ ${t('expenses.settled')}` : t('expenses.markSettled')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
