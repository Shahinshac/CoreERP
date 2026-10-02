import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Activity,
  Building2,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  History,
  Layers,
  Lock,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Terminal,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  UserPlus,
  Users,
  X,
  AlertTriangle,
  Check,
  KeyRound,
} from "lucide-react"
import { adminApi, StaffAdmin } from "@/features/admin/api"
import { auditApi } from "@/features/audit/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// ======================================================================
// SECTION NAVIGATION
// ======================================================================

interface NavSection {
  id: string
  label: string
  icon: React.ElementType
  description: string
}

const SECTIONS: NavSection[] = [
  { id: "overview", label: "Overview", icon: Activity, description: "System status & health" },
  { id: "business", label: "Business", icon: Building2, description: "Business information" },
  { id: "gst", label: "GST & Tax", icon: Receipt, description: "Tax configuration" },
  { id: "invoice", label: "Invoice & Billing", icon: FileText, description: "Invoice settings" },
  { id: "inventory", label: "Inventory", icon: Package, description: "Stock configuration" },
  { id: "payment", label: "Payments & Finance", icon: CreditCard, description: "Payment settings" },
  { id: "staff", label: "Staff & Permissions", icon: Users, description: "User management" },
  { id: "system", label: "System Controls", icon: Terminal, description: "System-level settings" },
  { id: "audit", label: "Audit Log", icon: History, description: "Configuration change history" },
]

// ======================================================================
// MAIN COMPONENT
// ======================================================================

export const SystemAdminPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState("overview")

  return (
    <div className="space-y-0">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">System Administration</h1>
            <p className="text-sm text-zinc-400">Configuration console & system controls</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar Navigation */}
        <nav className="lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-4 space-y-1 bg-[#0C0C0E] rounded-xl border border-white/[0.08] p-2">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon
              const isActive = activeSection === sec.id
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-indigo-500/15 to-purple-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-indigo-400" : "")} />
                  <span>{sec.label}</span>
                  {isActive && <ChevronRight className="h-3 w-3 ml-auto text-indigo-400/60" />}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {activeSection === "overview" && <OverviewSection />}
          {activeSection === "business" && <ConfigSection category="business" title="Business Configuration" icon={Building2} description="Business identity, contact details, and statutory information used across invoices, receipts, and reports." />}
          {activeSection === "gst" && <ConfigSection category="gst" title="GST & Tax Configuration" icon={Receipt} description="GST rates, tax calculation modes, and rounding rules. Changes apply only to future transactions — historical invoices remain unchanged." critical />}
          {activeSection === "invoice" && <ConfigSection category="invoice" title="Invoice & Billing Configuration" icon={FileText} description="Invoice numbering, prefixes, terms, and print settings." />}
          {activeSection === "inventory" && <ConfigSection category="inventory" title="Inventory System Configuration" icon={Package} description="Stock tracking, SKU generation, and low-stock threshold settings." />}
          {activeSection === "payment" && <ConfigSection category="payment" title="Payment & Financial Configuration" icon={CreditCard} description="Payment methods, rounding rules, and EMI defaults." />}
          {activeSection === "staff" && <StaffSection />}
          {activeSection === "system" && <ConfigSection category="system" title="System Controls" icon={Terminal} description="Maintenance mode, application version, and system-level toggles." critical />}
          {activeSection === "audit" && <AuditSection />}
        </main>
      </div>
    </div>
  )
}

// ======================================================================
// OVERVIEW SECTION
// ======================================================================

const OverviewSection: React.FC = () => {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: adminApi.getOverview,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-zinc-900/50 animate-pulse border border-white/[0.06]" />
        ))}
      </div>
    )
  }

  if (!overview) return null

  const statusCards = [
    { label: "API Status", value: overview.api_status, icon: Server, color: overview.api_status === "operational" ? "text-emerald-400" : "text-red-400", bg: overview.api_status === "operational" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20" },
    { label: "Database", value: overview.database_status, icon: Database, color: overview.database_status === "connected" ? "text-emerald-400" : "text-red-400", bg: overview.database_status === "connected" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20" },
    { label: "Environment", value: overview.environment, icon: Layers, color: overview.environment === "production" ? "text-amber-400" : "text-blue-400", bg: overview.environment === "production" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20" },
  ]

  const metricCards = [
    { label: "Total Products", value: overview.total_products, icon: Package },
    { label: "Total Customers", value: overview.total_customers, icon: Users },
    { label: "Total Invoices", value: overview.total_invoices, icon: FileText },
    { label: "Total Staff", value: overview.total_staff, icon: UserCheck },
    { label: "Total Sales", value: overview.total_sales, icon: Receipt },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-400" /> System Overview
        </h2>
        <p className="text-sm text-zinc-500 mt-0.5">Real-time system health and operational metrics</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statusCards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className={cn("rounded-xl border p-4 flex items-center gap-4", c.bg)}>
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", c.bg)}>
                <Icon className={cn("h-5 w-5", c.color)} />
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-medium">{c.label}</p>
                <p className={cn("text-sm font-bold capitalize", c.color)}>{c.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Version & Runtime */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/30 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-500 font-medium">Application Version</p>
            <p className="text-sm font-semibold text-zinc-200 mt-0.5">v{overview.app_version}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 font-medium">Runtime</p>
            <p className="text-sm font-semibold text-zinc-200 mt-0.5">{overview.uptime_info || "—"}</p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.label} className="rounded-xl border border-white/[0.08] bg-zinc-900/30 p-4 text-center">
              <Icon className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-zinc-100">{m.value.toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{m.label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ======================================================================
// CONFIG SECTION (reusable for business, gst, invoice, inventory, payment, system)
// ======================================================================

interface ConfigSectionProps {
  category: string
  title: string
  icon: React.ElementType
  description: string
  critical?: boolean
}

const ConfigSection: React.FC<ConfigSectionProps> = ({ category, title, icon: Icon, description, critical }) => {
  const queryClient = useQueryClient()
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editReasons, setEditReasons] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-configs", category],
    queryFn: () => adminApi.getConfigs(category),
  })

  const updateMutation = useMutation({
    mutationFn: ({ key, value, reason }: { key: string; value: string; reason?: string }) =>
      adminApi.updateConfig(key, value, reason),
    onSuccess: (_, vars) => {
      toast.success(`Configuration '${vars.key}' updated successfully.`)
      queryClient.invalidateQueries({ queryKey: ["admin-configs"] })
      setEditValues((p) => { const n = { ...p }; delete n[vars.key]; return n })
      setEditReasons((p) => { const n = { ...p }; delete n[vars.key]; return n })
      setSaving(null)
      setConfirmKey(null)
    },
    onError: () => { setSaving(null); setConfirmKey(null) },
  })

  const configs = data?.configs || []

  const handleSave = (key: string) => {
    const newValue = editValues[key]
    if (newValue === undefined) return

    if (critical) {
      setConfirmKey(key)
      return
    }

    setSaving(key)
    updateMutation.mutate({ key, value: newValue, reason: editReasons[key] })
  }

  const confirmSave = () => {
    if (!confirmKey) return
    setSaving(confirmKey)
    updateMutation.mutate({
      key: confirmKey,
      value: editValues[confirmKey],
      reason: editReasons[confirmKey],
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-900/50 animate-pulse border border-white/[0.06]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Icon className="h-5 w-5 text-indigo-400" /> {title}
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/10 text-zinc-300 hover:bg-white/5">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {critical && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-300/80">
            <strong className="text-amber-300">Critical Configuration.</strong> Changes here affect financial calculations and system behavior. Historical transactions are never retroactively modified. A confirmation dialog and reason are required.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {configs.map((config) => {
          const isEditing = editValues[config.key] !== undefined
          const currentVal = isEditing ? editValues[config.key] : config.value
          const isBool = config.value_type === "boolean"

          return (
            <div
              key={config.key}
              className={cn(
                "rounded-xl border p-4 transition-all",
                isEditing
                  ? "border-indigo-500/30 bg-indigo-500/[0.03]"
                  : "border-white/[0.08] bg-zinc-900/30 hover:border-white/[0.12]"
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-indigo-300/80 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {config.key}
                    </code>
                    {config.is_sensitive && (
                      <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                        <Lock className="h-2.5 w-2.5 mr-1" /> Sensitive
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{config.description || "No description"}</p>
                </div>

                <div className="flex items-center gap-2 sm:w-72 shrink-0">
                  {isBool ? (
                    <button
                      onClick={() => {
                        const newVal = currentVal === "true" ? "false" : "true"
                        setEditValues((p) => ({ ...p, [config.key]: newVal }))
                      }}
                      className="flex items-center gap-2"
                    >
                      {currentVal === "true" ? (
                        <ToggleRight className="h-6 w-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-500" />
                      )}
                      <span className={cn("text-sm font-medium", currentVal === "true" ? "text-emerald-400" : "text-zinc-500")}>
                        {currentVal === "true" ? "Enabled" : "Disabled"}
                      </span>
                    </button>
                  ) : (
                    <Input
                      value={currentVal}
                      onChange={(e) =>
                        setEditValues((p) => ({ ...p, [config.key]: e.target.value }))
                      }
                      className="bg-zinc-900/50 border-white/10 text-sm h-9"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditing && (
                    <>
                      {critical && (
                        <Input
                          placeholder="Reason..."
                          value={editReasons[config.key] || ""}
                          onChange={(e) => setEditReasons((p) => ({ ...p, [config.key]: e.target.value }))}
                          className="bg-zinc-900/50 border-white/10 text-xs h-8 w-28"
                        />
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleSave(config.key)}
                        disabled={saving === config.key}
                        className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        {saving === config.key ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditValues((p) => { const n = { ...p }; delete n[config.key]; return n })
                          setEditReasons((p) => { const n = { ...p }; delete n[config.key]; return n })
                        }}
                        className="h-8 text-zinc-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {configs.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">No configuration entries found.</div>
        )}
      </div>

      {/* Confirmation Dialog for critical changes */}
      <Dialog open={!!confirmKey} onOpenChange={(open) => { if (!open) setConfirmKey(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" /> Confirm Critical Change
            </DialogTitle>
            <DialogDescription>
              You are about to change a critical system configuration. This may affect financial calculations for future transactions. Historical data will NOT be modified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-zinc-900/80 border border-white/10 p-3 text-sm">
              <span className="text-zinc-400">Key:</span>{" "}
              <code className="text-indigo-300 font-mono">{confirmKey}</code>
            </div>
            <div className="rounded-lg bg-zinc-900/80 border border-white/10 p-3 text-sm">
              <span className="text-zinc-400">New Value:</span>{" "}
              <span className="text-zinc-100 font-semibold">{confirmKey ? editValues[confirmKey] : ""}</span>
            </div>
            {confirmKey && editReasons[confirmKey] && (
              <div className="rounded-lg bg-zinc-900/80 border border-white/10 p-3 text-sm">
                <span className="text-zinc-400">Reason:</span>{" "}
                <span className="text-zinc-200">{editReasons[confirmKey]}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmKey(null)} className="border-white/10">
              Cancel
            </Button>
            <Button onClick={confirmSave} className="bg-amber-600 hover:bg-amber-500 text-white">
              <Check className="h-4 w-4 mr-1.5" /> Confirm Change
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ======================================================================
// STAFF SECTION
// ======================================================================

const StaffSection: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: "", password: "", role: "Staff", full_name: "", phone: "", employee_code: "" })
  const [showResetPw, setShowResetPw] = useState<StaffAdmin | null>(null)
  const [resetPw, setResetPw] = useState("")
  const [resetReason, setResetReason] = useState("")
  const [roleChange, setRoleChange] = useState<{ staff: StaffAdmin; role: string; reason: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-staff", search],
    queryFn: () => adminApi.getStaff({ search: search.trim() || undefined }),
  })

  const createMutation = useMutation({
    mutationFn: adminApi.createStaff,
    onSuccess: () => {
      toast.success("Staff account created successfully.")
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] })
      setShowCreate(false)
      setCreateForm({ email: "", password: "", role: "Staff", full_name: "", phone: "", employee_code: "" })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => adminApi.toggleStaff(id, is_active),
    onSuccess: (data) => {
      toast.success(`Staff account ${data.is_active ? "activated" : "deactivated"}.`)
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] })
    },
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role, reason }: { id: string; role: string; reason?: string }) =>
      adminApi.updateStaffRole(id, role, reason),
    onSuccess: () => {
      toast.success("Staff role updated successfully.")
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] })
      setRoleChange(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, pw, reason }: { id: string; pw: string; reason?: string }) =>
      adminApi.resetStaffPassword(id, pw, reason),
    onSuccess: () => {
      toast.success("Password reset successfully.")
      setShowResetPw(null)
      setResetPw("")
      setResetReason("")
    },
  })

  const staff = data?.items || []

  const ROLES = ["Super Admin", "Admin", "Manager", "Staff", "Accountant"]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" /> Staff & Permissions
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">Manage staff accounts, roles, and credentials</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500">
          <UserPlus className="h-4 w-4 mr-1.5" /> New Staff
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Input
          placeholder="Search by name, email, or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-900/50 border-white/10 pl-9 h-10"
        />
        <Users className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
      </div>

      {/* Staff List */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-900/50 animate-pulse border border-white/[0.06]" />
            ))
          : staff.map((s) => (
              <div key={s.id} className="rounded-xl border border-white/[0.08] bg-zinc-900/30 p-4 hover:border-white/[0.12] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg font-bold text-xs shrink-0",
                      s.is_active ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                    )}>
                      {(s.full_name || s.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-100 truncate">{s.full_name || s.email.split("@")[0]}</span>
                        <Badge variant="outline" className={cn(
                          "text-[10px]",
                          s.role === "Super Admin" ? "border-purple-500/30 text-purple-400" :
                          s.role === "Admin" ? "border-indigo-500/30 text-indigo-400" :
                          "border-zinc-600/30 text-zinc-400"
                        )}>{s.role}</Badge>
                        {!s.is_active && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">Disabled</Badge>}
                        {s.is_totp_enabled && <span title="2FA Enabled"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /></span>}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{s.email}{s.employee_code ? ` • ${s.employee_code}` : ""}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {/* Toggle Active */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleMutation.mutate({ id: s.id, is_active: !s.is_active })}
                      className={cn("h-7 text-xs", s.is_active ? "text-emerald-400 hover:text-emerald-300" : "text-red-400 hover:text-red-300")}
                      title={s.is_active ? "Deactivate" : "Activate"}
                    >
                      {s.is_active ? <ToggleRight className="h-3.5 w-3.5 mr-1" /> : <ToggleLeft className="h-3.5 w-3.5 mr-1" />}
                      {s.is_active ? "Active" : "Inactive"}
                    </Button>

                    {/* Change Role */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRoleChange({ staff: s, role: s.role, reason: "" })}
                      className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      <Shield className="h-3.5 w-3.5 mr-1" /> Role
                    </Button>

                    {/* Reset Password */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowResetPw(s)}
                      className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset PW
                    </Button>
                  </div>
                </div>
              </div>
            ))}

        {!isLoading && staff.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">No staff accounts found.</div>
        )}
      </div>

      {/* Create Staff Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-indigo-400" /> Create Staff Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Email *" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} className="bg-zinc-900/50 border-white/10" />
            <Input placeholder="Password * (min 8 chars)" type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} className="bg-zinc-900/50 border-white/10" />
            <select value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))} className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Input placeholder="Full Name" value={createForm.full_name} onChange={(e) => setCreateForm((p) => ({ ...p, full_name: e.target.value }))} className="bg-zinc-900/50 border-white/10" />
            <Input placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} className="bg-zinc-900/50 border-white/10" />
            <Input placeholder="Employee Code" value={createForm.employee_code} onChange={(e) => setCreateForm((p) => ({ ...p, employee_code: e.target.value }))} className="bg-zinc-900/50 border-white/10" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-white/10">Cancel</Button>
            <Button
              disabled={!createForm.email || createForm.password.length < 8 || createMutation.isPending}
              onClick={() => createMutation.mutate(createForm)}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {createMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleChange} onOpenChange={(open) => { if (!open) setRoleChange(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-indigo-400" /> Change Role</DialogTitle>
            <DialogDescription>
              Changing role for <strong>{roleChange?.staff.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <select
              value={roleChange?.role || ""}
              onChange={(e) => setRoleChange((p) => p ? { ...p, role: e.target.value } : null)}
              className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Input
              placeholder="Reason for change..."
              value={roleChange?.reason || ""}
              onChange={(e) => setRoleChange((p) => p ? { ...p, reason: e.target.value } : null)}
              className="bg-zinc-900/50 border-white/10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRoleChange(null)} className="border-white/10">Cancel</Button>
            <Button
              onClick={() => {
                if (roleChange) roleMutation.mutate({ id: roleChange.staff.id, role: roleChange.role, reason: roleChange.reason })
              }}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              <Check className="h-4 w-4 mr-1" /> Update Role
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetPw} onOpenChange={(open) => { if (!open) { setShowResetPw(null); setResetPw(""); setResetReason("") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-amber-400" /> Reset Password</DialogTitle>
            <DialogDescription>
              Reset password for <strong>{showResetPw?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="New password (min 8 chars)"
              type="password"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              className="bg-zinc-900/50 border-white/10"
            />
            <Input
              placeholder="Reason..."
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              className="bg-zinc-900/50 border-white/10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowResetPw(null); setResetPw(""); setResetReason("") }} className="border-white/10">Cancel</Button>
            <Button
              disabled={resetPw.length < 8 || resetMutation.isPending}
              onClick={() => {
                if (showResetPw) resetMutation.mutate({ id: showResetPw.id, pw: resetPw, reason: resetReason })
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {resetMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />}
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ======================================================================
// AUDIT SECTION (config change history)
// ======================================================================

const AuditSection: React.FC = () => {
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-audit", page],
    queryFn: () =>
      auditApi.getLogs({
        page,
        limit: 30,
        event_type: "admin",
      }),
  })

  const logs = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 30)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-400" /> Audit Log
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">Immutable trail of all admin configuration changes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/10 text-zinc-300 hover:bg-white/5">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-900/50 animate-pulse border border-white/[0.06]" />
            ))
          : logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/[0.08] bg-zinc-900/30 p-3 hover:border-white/[0.12] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 shrink-0 mt-0.5">
                    <Settings className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">{log.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                      <span>{log.actor_email || "system"}</span>
                      <span>•</span>
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      {Boolean(log.details?.reason) && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400/80">Reason: {String(log.details?.reason)}</span>
                        </>
                      )}
                    </div>
                    {log.details?.old_value !== undefined && (
                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        <span className="bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5 font-mono">
                          {String(log.details.old_value)}
                        </span>
                        <span className="text-zinc-600">→</span>
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono">
                          {String(log.details.new_value)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

        {!isLoading && logs.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">No admin audit log entries yet.</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border-white/10 text-zinc-300"
          >
            Previous
          </Button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-white/10 text-zinc-300"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

export default SystemAdminPage
