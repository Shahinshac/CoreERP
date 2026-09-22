import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Activity, ArrowRight, CheckCircle2, XCircle } from "lucide-react"
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Phase 1
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">
            ERP Project Foundation
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Brand-new monorepo setup with FastAPI backend and React frontend.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Activity className="h-4 w-4 text-blue-600" />
            Backend Connectivity Status
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-3 rounded border border-slate-200">
              <span className="text-slate-500 block mb-1">Liveness (/api/ping)</span>
              {pingLoading && <span className="text-slate-400">Pinging...</span>}
              {pingError && (
                <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Unreachable
                </span>
              )}
              {pingData && (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {pingData.status}
                </span>
              )}
            </div>

            <div className="bg-white p-3 rounded border border-slate-200">
              <span className="text-slate-500 block mb-1">Health (/api/health)</span>
              {healthLoading && <span className="text-slate-400">Checking DB...</span>}
              {healthError && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Offline / No DB
                </span>
              )}
              {healthData && (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {healthData.status}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">Routes: / & /staff</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/staff" className="flex items-center gap-1">
              Go to Staff <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
