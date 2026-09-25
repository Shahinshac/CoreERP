import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingBag,
  FileText,
  CreditCard,
  RotateCcw,
  LifeBuoy,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { portalApi } from '@/features/portal/api';
import type { PortalDashboardSummary } from '@/features/portal/api';

export const CustomerDashboard: React.FC = () => {
  const { user } = useAuth();
  const customerUser = user as { name?: string; email?: string } | null;

  const {
    data: summary,
    isLoading,
    isError,
    error,
  } = useQuery<PortalDashboardSummary>({
    queryKey: ['portal-dashboard-summary'],
    queryFn: portalApi.getDashboard,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/60 via-slate-900/80 to-slate-900/60 border border-indigo-500/20 p-6 sm:p-8 backdrop-blur-md shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Verified Client Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {customerUser?.name || 'Valued Customer'}
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Access your invoices, track your recent orders, verify payments, and manage your active financing schedules in one secure hub.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/portal/invoices"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-lg shadow-indigo-600/20"
            >
              <FileText className="w-4 h-4" />
              View Invoices
            </Link>
            <Link
              to="/portal/profile"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors"
            >
              Account Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 bg-slate-900/40 rounded-xl border border-slate-800">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4" />
          <p className="text-sm text-slate-400">Loading your account metrics...</p>
        </div>
      )}

      {isError && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-5 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Unable to fetch dashboard overview</p>
            <p className="text-xs text-rose-400/80">
              {(error as Error)?.message || 'An error occurred.'}
            </p>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      {!isLoading && !isError && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Outstanding Balance */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Outstanding Balance
                </span>
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                ₹{Number(summary.outstanding_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>Pending invoices & dues</span>
                <Link
                  to="/portal/invoices"
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                >
                  Pay dues <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Total Purchases / Spend */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Purchases
                </span>
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                ₹{Number(summary.total_spent).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {summary.total_purchases_count} total orders placed
              </p>
            </div>

            {/* Active EMI Plans */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Active EMIs
                </span>
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <RotateCcw className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {summary.active_emi_plans_count}
              </p>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>Installment schedules</span>
                <Link
                  to="/portal/emi"
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                >
                  View plans <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Open Support Tickets */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Support Tickets
                </span>
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <LifeBuoy className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {summary.open_tickets_count}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Customer support & warranty portal (Phase 14)
              </p>
            </div>
          </div>

          {/* Recent Purchases & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Purchases List */}
            <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    Recent Purchases
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your latest orders and sales transactions
                  </p>
                </div>
                <Link
                  to="/portal/purchases"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                >
                  View All Orders <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {summary.recent_purchases.length === 0 ? (
                <div className="py-12 text-center text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800/60">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-medium text-slate-400">No purchases found</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your completed store purchases and orders will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {summary.recent_purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="py-3.5 flex items-center justify-between hover:bg-slate-800/20 rounded-lg px-2 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-semibold text-xs">
                          #{purchase.id.slice(0, 6)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">
                              {purchase.invoice_number}
                            </span>
                            <span className="text-xs text-slate-500">
                              ({purchase.items.length} items)
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {new Date(purchase.created_at).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-white block">
                          ₹{Number(purchase.total_amount).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <Link
                          to="/portal/purchases"
                          className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 mt-0.5"
                        >
                          Details <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links & Information */}
            <div className="space-y-4">
              <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-6 shadow-lg">
                <h3 className="font-bold text-base text-white mb-3">Quick Navigation</h3>
                <div className="space-y-2">
                  <Link
                    to="/portal/invoices"
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-blue-400" />
                      Invoices & PDF Downloads
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </Link>
                  <Link
                    to="/portal/payments"
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4 text-violet-400" />
                      Payment History & Receipts
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </Link>
                  <Link
                    to="/portal/emi"
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <RotateCcw className="w-4 h-4 text-emerald-400" />
                      EMI Plans & Repayment
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </Link>
                  <Link
                    to="/portal/profile"
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <ShoppingBag className="w-4 h-4 text-amber-400" />
                      Manage Contact & Billing Info
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </Link>
                </div>
              </div>

              {/* Tax & GST notice */}
              <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 text-xs text-indigo-300">
                <p className="font-semibold text-indigo-200 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                  GST Compliance Ready
                </p>
                <p className="text-slate-400 leading-relaxed">
                  All customer invoices feature full Indian statutory tax breakdowns including HSN/SAC codes, CGST, SGST, and IGST breakdowns.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomerDashboard;
