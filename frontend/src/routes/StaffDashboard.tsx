import React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  Boxes,
  CheckCircle2,
  CreditCard,
  Package,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from "lucide-react"
import { api } from "@/lib/api"
import { useAuth, StaffRole } from "@/features/auth/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const StaffDashboard: React.FC = () => {
  const { user } = useAuth()
  const staffUser = user as { email: string; role: StaffRole } | null

  const { data: pingData } = useQuery({
    queryKey: ["backend-ping"],
    queryFn: api.ping,
  })

  const { data: healthData } = useQuery({
    queryKey: ["backend-health"],
    queryFn: api.health,
  })

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back, {staffUser?.email.split("@")[0]}
            </h1>
            <Badge variant="secondary">{staffUser?.role}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise resource planning operations console.
          </p>
        </div>

        {/* Live status indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-50 text-xs font-medium">
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            <span>Ping:</span>
            {pingData ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> OK
              </span>
            ) : (
              <span className="text-red-500 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Offline
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-50 text-xs font-medium">
            <span>DB:</span>
            {healthData?.database === "connected" ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Live
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Not Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid Placeholders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Ready for catalog setup</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Stock Items
            </CardTitle>
            <Boxes className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.000</div>
            <p className="text-xs text-muted-foreground mt-1">Append-only ledger</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Purchases
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground mt-1">Supplier procurements</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operating Expenses
            </CardTitle>
            <CreditCard className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground mt-1">Overheads & costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Status Section */}
      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" /> Phase 1–4 Foundation Operational
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          The core schema, dual-identity Argon2 authentication, role-based access control, and design system shell are loaded. Module business routes are scaffolded and protected with strict RBAC rules.
        </p>
      </div>
    </div>
  )
}
