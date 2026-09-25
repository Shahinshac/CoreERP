import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Activity, ArrowRight, CheckCircle2, ShieldCheck, User, XCircle } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

export function HomePage() {
  const { data: pingData, isLoading: pingLoading, isError: pingError } = useQuery({
    queryKey: ["backend-ping"],
    queryFn: api.ping,
    retry: 1,
  })

  const { data: healthData, isLoading: healthLoading, isError: healthError } = useQuery({
    queryKey: ["backend-health"],
    queryFn: api.health,
    retry: 1,
  })

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-card rounded-2xl shadow-none border border-white/[0.08] p-8 space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            System Operational
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-2">
            Enterprise ERP Platform
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dual-identity architecture with Argon2 RBAC, PostgreSQL/Supabase core models, and partitioned application shells.
          </p>
        </div>

        {/* Live Connectivity Status */}
        <div className="rounded-xl border border-white/[0.08] bg-surface-elevated/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Activity className="h-4 w-4 text-primary" />
            Backend Connectivity Status
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#0A0A0B] p-3 rounded-lg border border-white/[0.08]">
              <span className="text-muted-foreground block mb-1">Liveness (/api/ping)</span>
              {pingLoading && <span className="text-muted-foreground">Pinging...</span>}
              {pingError && (
                <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Unreachable
                </span>
              )}
              {pingData && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {pingData.status}
                </span>
              )}
            </div>

            <div className="bg-[#0A0A0B] p-3 rounded-lg border border-white/[0.08]">
              <span className="text-muted-foreground block mb-1">Health (/api/health)</span>
              {healthLoading && <span className="text-muted-foreground">Checking DB...</span>}
              {healthError && (
                <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Offline / No DB
                </span>
              )}
              {healthData && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {healthData.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Portals Access */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dual Identity Portals
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-white/[0.08] rounded-xl p-4 bg-surface-elevated/40 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm text-zinc-100">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Staff Operations
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enterprise console with RBAC-filtered navigation and module management.
                </p>
              </div>
              <Button asChild size="sm" className="w-full">
                <Link to="/staff/login" className="flex items-center justify-center gap-1">
                  Staff Login <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="border border-white/[0.08] rounded-xl p-4 bg-surface-elevated/40 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm text-zinc-100">
                  <User className="h-4 w-4 text-primary" /> Client Portal
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Self-service portal for purchases, order tracking, and invoice downloads.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/customer/login" className="flex items-center justify-center gap-1">
                  Client Portal <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
