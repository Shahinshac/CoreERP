import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Percent,
  Banknote,
  ShieldCheck,
} from 'lucide-react';
import { portalApi } from '@/features/portal/api';
import type { PortalEmiPlan, PortalEmiInstallment } from '@/features/portal/api';

export const CustomerEmiPage: React.FC = () => {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const {
    data: plans = [],
    isLoading,
    isError,
    error,
  } = useQuery<PortalEmiPlan[]>({
    queryKey: ['portal-emi-plans'],
    queryFn: portalApi.getEmiPlans,
  });

  const toggleExpand = (id: string) => {
    setExpandedPlanId((prev) => (prev === id ? null : id));
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'defaulted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Defaulted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" />
            {status}
          </span>
        );
    }
  };

  const getInstallmentBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const totalOutstanding = plans
    .filter((p) => p.status.toLowerCase() === 'active')
    .reduce((acc, p) => acc + Number(p.remaining_balance || 0), 0);

  const activePlansCount = plans.filter(
    (p) => p.status.toLowerCase() === 'active'
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-400" />
            EMI & Financing Plans
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track your active installment schedules, repayment progress, and interest terms.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Plans
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">{activePlansCount}</p>
          <p className="text-xs text-slate-500 mt-1">Total {plans.length} loans on record</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Remaining Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-500 mt-1">Across all active plans</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Installment Status
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {plans.filter((p) => p.status.toLowerCase() === 'completed').length} Cleared
          </p>
          <p className="text-xs text-slate-500 mt-1">Successfully fully paid loans</p>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-xl border border-slate-800">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4" />
          <p className="text-sm text-slate-400">Loading your financing plans...</p>
        </div>
      )}

      {isError && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center text-rose-300">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
          <p className="font-semibold">Unable to load EMI plans</p>
          <p className="text-xs text-rose-400/80 mt-1">
            {(error as Error)?.message || 'An unexpected error occurred while fetching plans.'}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && plans.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No EMI Plans Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            You do not currently have any active or past installment financing arrangements.
          </p>
        </div>
      )}

      {/* Plans List */}
      {!isLoading && !isError && plans.length > 0 && (
        <div className="space-y-4">
          {plans.map((plan) => {
            const isExpanded = expandedPlanId === plan.id;
            const totalFinanced = Number(plan.total_financed || 0);
            const remainingBalance = Number(plan.remaining_balance || 0);
            const totalPaid = Number(plan.total_paid || 0);
            const progressPercent = Math.min(
              100,
              Math.max(0, Math.round((totalPaid / (totalFinanced || 1)) * 100))
            );

            return (
              <div
                key={plan.id}
                className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all"
              >
                {/* Plan Header Card */}
                <div className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white">
                            Plan #{plan.id.slice(0, 8)}
                          </h3>
                          {getStatusBadge(plan.status)}
                          {plan.invoice_number && (
                            <span className="text-xs text-slate-500">
                              (Invoice #{plan.invoice_number})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            Start: {new Date(plan.start_date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5 text-slate-500" />
                            Interest: {plan.interest_rate ?? 0}%
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            Installments: {plan.number_of_installments}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Figures */}
                    <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                      <div className="text-left lg:text-right">
                        <span className="text-xs text-slate-500 uppercase tracking-wider block">
                          Installment Amount
                        </span>
                        <span className="text-base font-bold text-white">
                          ₹{Number(plan.installment_amount).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 uppercase tracking-wider block">
                          Remaining
                        </span>
                        <span className="text-base font-bold text-rose-400">
                          ₹{remainingBalance.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleExpand(plan.id)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 transition-colors"
                        title={isExpanded ? 'Collapse schedule' : 'Expand schedule'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Repayment Progress Bar */}
                  <div className="mt-4 pt-4 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span>
                        Paid: ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                        of ₹{totalFinanced.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="font-semibold text-indigo-400">
                        {progressPercent}% Complete
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded Installment Table */}
                {isExpanded && (
                  <div className="bg-slate-950/60 border-t border-slate-800 p-5">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Installment Schedule ({plan.installments.length} installments)
                    </h4>
                    {plan.installments.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        No individual installments scheduled for this plan.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="py-2.5 px-3">#</th>
                              <th className="py-2.5 px-3">Due Date</th>
                              <th className="py-2.5 px-3 text-right">Amount Due</th>
                              <th className="py-2.5 px-3 text-right">Amount Paid</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {plan.installments.map((inst: PortalEmiInstallment) => (
                              <tr
                                key={inst.id}
                                className="hover:bg-slate-900/40 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-medium text-slate-300">
                                  #{inst.installment_number}
                                </td>
                                <td className="py-2.5 px-3 text-slate-300">
                                  {new Date(inst.due_date).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold text-white">
                                  ₹{Number(inst.amount_due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                                  ₹{Number(inst.amount_paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {getInstallmentBadge(inst.status)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerEmiPage;
