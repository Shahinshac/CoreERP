import React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  LifeBuoy,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react"
import { api } from "@/lib/api"
import { useAuth, StaffRole } from "@/features/auth/AuthContext"
import { dashboardApi } from "@/features/dashboard/api"
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

  const { data: todaySummary } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: dashboardApi.getTodaySummary,
    refetchInterval: 60000,
  })

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-white/[0.08] rounded-xl p-6 shadow-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Welcome back, {staffUser?.email.split("@")[0]}
            </h1>
            <Badge variant="secondary">{staffUser?.role}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise resource planning operations console.
          </p>
        </div>

        {/* Live status indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-surface-elevated/40 text-xs font-medium">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Ping:</span>
            {pingData ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> OK
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Offline
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-surface-elevated/40 text-xs font-medium">
            <span className="text-muted-foreground">DB:</span>
            {healthData?.database === "connected" ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Live
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Not Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Today's Operational Summary (60s Cache) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Today's Glanceable Summary
          </h2>
          {todaySummary?.date && (
            <span className="text-xs font-mono text-zinc-400">
              Date: {todaySummary.date}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Today's Total Sales */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Sales
              </CardTitle>
              <Receipt className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-zinc-100">
                ₹{parseFloat(todaySummary?.total_sales || "0.00").toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {todaySummary?.sales_count || 0} completed {todaySummary?.sales_count === 1 ? "order" : "orders"}
              </p>
            </CardContent>
          </Card>

          {/* 2. Cash Collected & Breakdown */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cash Collected
              </CardTitle>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                ₹{parseFloat(todaySummary?.cash_collected || "0.00").toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate" title={`UPI: ₹${parseFloat(todaySummary?.payment_method_totals?.upi || "0.00").toFixed(2)} | Card: ₹${parseFloat(todaySummary?.payment_method_totals?.card || "0.00").toFixed(2)}`}>
                UPI: ₹{parseFloat(todaySummary?.payment_method_totals?.upi || "0.00").toFixed(2)} • Card: ₹{parseFloat(todaySummary?.payment_method_totals?.card || "0.00").toFixed(2)}
              </p>
            </CardContent>
          </Card>

          {/* 3. Customers Served Today */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Customers Served
              </CardTitle>
              <Users className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-zinc-100">
                {todaySummary?.customers_served || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Registered & walk-in clients
              </p>
            </CardContent>
          </Card>

          {/* 4. Low-Stock Alerts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock SKUs
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold font-mono ${
                (todaySummary?.low_stock_count || 0) > 0 ? "text-amber-400" : "text-zinc-100"
              }`}>
                {todaySummary?.low_stock_count || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                At or below reorder threshold
              </p>
            </CardContent>
          </Card>

          {/* 5. Open Support Tickets */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open Tickets
              </CardTitle>
              <LifeBuoy className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold font-mono ${
                (todaySummary?.open_tickets_count || 0) > 0 ? "text-purple-400" : "text-zinc-100"
              }`}>
                {todaySummary?.open_tickets_count || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting resolution
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Module Status Section */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-6 shadow-none space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" /> Enterprise Operations Console
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The core schema, dual-identity Argon2 authentication, role-based access control, and design system shell are loaded. Module business routes are scaffolded and protected with strict RBAC rules.
        </p>
      </div>
    </div>
  )
}
