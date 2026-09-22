import { Link } from "react-router-dom"
import { ArrowLeft, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

export function StaffPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Staff Portal Placeholder
            </h1>
            <p className="text-xs text-slate-500">
              Module route placeholder for Phase 1.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          This is a placeholder page for the staff route. Business logic, authentication, and management views will be implemented in subsequent phases.
        </p>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/" className="flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Home
            </Link>
          </Button>
          <span className="text-xs text-slate-400">Route: /staff</span>
        </div>
      </div>
    </div>
  )
}
