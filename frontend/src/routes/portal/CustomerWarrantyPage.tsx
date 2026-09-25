import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  ShieldCheck,
  AlertCircle,
  Calendar,
  Package,
  Clock,
  HelpCircle,
  CheckCircle2,
} from "lucide-react"
import { portalSupportApi } from "@/features/portal/supportApi"
import type { WarrantyItem } from "@/features/support/api"

export const CustomerWarrantyPage: React.FC = () => {
  const { data: warranties = [], isLoading, isError, error } = useQuery<WarrantyItem[]>({
    queryKey: ["portal", "warranties"],
    queryFn: portalSupportApi.getWarranties,
  })

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active Coverage
          </span>
        )
      case "claimed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Claimed
          </span>
        )
      case "expired":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" />
            Expired
          </span>
        )
    }
  }

  const activeCount = warranties.filter((w) => w.status.toLowerCase() === "active").length

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            Product Warranties
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Review active coverage periods, serial numbers, and protection status for your purchased equipment.
          </p>
        </div>

        <Link
          to="/portal/support"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-lg shadow-indigo-600/20 w-fit"
        >
          <HelpCircle className="w-4 h-4" />
          Request Support / Claim
        </Link>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active Warranties
          </span>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{activeCount}</p>
          <p className="text-xs text-slate-500 mt-1">Currently protected devices</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Registered
          </span>
          <p className="text-2xl font-bold text-white mt-2">{warranties.length}</p>
          <p className="text-xs text-slate-500 mt-1">Lifetime purchase protection</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Service Policy
          </span>
          <p className="text-sm font-semibold text-slate-200 mt-2">Authorized OEM Service</p>
          <p className="text-xs text-slate-500 mt-1">Genuine parts & certified repairs</p>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-xl border border-slate-800">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mb-4" />
          <p className="text-sm text-slate-400">Loading your warranty portfolio...</p>
        </div>
      )}

      {isError && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center text-rose-300">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
          <p className="font-semibold">Unable to fetch warranty records</p>
          <p className="text-xs text-rose-400/80 mt-1">
            {(error as Error)?.message || "An unexpected error occurred."}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && warranties.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Warranties on Record</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            When you purchase eligible products, your warranty registration will appear here automatically.
          </p>
        </div>
      )}

      {/* Warranties Grid */}
      {!isLoading && !isError && warranties.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {warranties.map((w) => {
            const isExp = w.status.toLowerCase() === "expired"
            const isClm = w.status.toLowerCase() === "claimed"

            return (
              <div
                key={w.id}
                className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {w.product_name || "Hardware Equipment"}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          SN: {w.serial_number || "N/A (Standard Coverage)"}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(w.status)}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block uppercase text-[10px]">Purchase Date</span>
                      <span className="font-medium text-slate-300 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {new Date(w.purchase_date).toLocaleDateString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block uppercase text-[10px]">Coverage Valid Until</span>
                      <span
                        className={`font-semibold flex items-center gap-1 mt-0.5 ${
                          isExp ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(w.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {isClm && w.claim_notes && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                      <strong>Claim Note:</strong> {w.claim_notes}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">
                    Registration ID: #{w.id.slice(0, 8)}
                  </span>
                  <Link
                    to="/portal/support"
                    className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                  >
                    Open Ticket <HelpCircle className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CustomerWarrantyPage
