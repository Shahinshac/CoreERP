import React, { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Calendar,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/features/auth/AuthContext"
import { hrApi } from "@/features/hr/api"
import { StaffUser } from "@/features/hr/types"
import { StaffModal } from "@/features/hr/StaffModal"

export const StaffManagementPage: React.FC = () => {
  const { user } = useAuth()
  const callerRole = (user as { role?: string })?.role || "Staff"
  const isAdmin = callerRole === "Super Admin" || callerRole === "Admin"

  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const limit = 20

  // Modals
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null)

  const fetchStaff = useCallback(async () => {
    setIsLoading(true)
    try {
      const is_active_param =
        activeFilter === "all" ? undefined : activeFilter === "active"
      const data = await hrApi.listStaff({
        search: searchTerm.trim() || undefined,
        role: roleFilter || undefined,
        is_active: is_active_param,
        page,
        limit,
      })
      setStaffList(data.items)
      setTotalCount(data.total)
    } catch (err: unknown) {
      // Handled by toast
    } finally {
      setIsLoading(false)
    }
  }, [searchTerm, roleFilter, activeFilter, page])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  const handleToggleActive = async (staff: StaffUser) => {
    const action = staff.is_active ? "deactivate" : "reactivate"
    if (
      !window.confirm(
        `Are you sure you want to ${action} ${staff.full_name || staff.email}? ` +
          (staff.is_active
            ? "This will block login and exclude from future salary runs without deleting history."
            : "This will restore system login access.")
      )
    ) {
      return
    }

    try {
      await hrApi.toggleStaffActive(staff.id)
      toast.success(`Staff member successfully ${action}d`)
      fetchStaff()
    } catch (err: unknown) {
      // Toast shown by apiClient
    }
  }

  const roleColors: Record<string, string> = {
    "Super Admin": "bg-purple-950/60 text-purple-300 border-purple-800/80",
    "Admin": "bg-indigo-950/60 text-indigo-300 border-indigo-800/80",
    "Manager": "bg-blue-950/60 text-blue-300 border-blue-800/80",
    "Accountant": "bg-emerald-950/60 text-emerald-300 border-emerald-800/80",
    "Staff": "bg-zinc-900 text-zinc-300 border-zinc-700/80",
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Staff & Team Management
            </h1>
            <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/40 bg-primary/10">
              {totalCount} Members
            </Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Manage employee profiles, role-based access permissions, and salary configurations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/staff/salary">
            <Button variant="outline" className="gap-1.5 text-zinc-200 border-white/[0.16] hover:bg-[#18181C] hover:text-white">
              <Calendar className="w-4 h-4 text-primary" />
              Payroll & Salaries
            </Button>
          </Link>

          {isAdmin && (
            <Button
              onClick={() => {
                setSelectedStaff(null)
                setIsStaffModalOpen(true)
              }}
              className="bg-primary hover:bg-blue-500 text-white gap-1.5 shadow-none font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Add Staff Member
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-card border border-white/[0.14] rounded-xl shadow-none flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search name, email, employee code..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="pl-9 bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </div>

          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-2.5 text-xs bg-black/40 border border-white/[0.16] rounded-lg text-zinc-200 [&>option]:bg-[#0C0C0E] focus:outline-none focus:border-primary/60"
          >
            <option value="">All Roles</option>
            <option value="Super Admin">Super Admin</option>
            <option value="Admin">Admin</option>
            <option value="Manager">Manager</option>
            <option value="Accountant">Accountant</option>
            <option value="Staff">Staff</option>
          </select>

          <select
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-2.5 text-xs bg-black/40 border border-white/[0.16] rounded-lg text-zinc-200 [&>option]:bg-[#0C0C0E] focus:outline-none focus:border-primary/60"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Staff Members Table */}
      <div className="bg-card border border-white/[0.14] rounded-xl shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.08] text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Emp Code</th>
                <th className="py-3 px-4">Joining Date</th>
                {isAdmin && <th className="py-3 px-4">Base Salary</th>}
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-zinc-400">
                    Loading staff members...
                  </td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-zinc-400">
                    No staff members match the selected criteria.
                  </td>
                </tr>
              ) : (
                staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-white/[0.04] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-100">
                        {staff.full_name || staff.email.split("@")[0]}
                      </div>
                      <div className="text-xs text-zinc-400">{staff.email}</div>
                      {staff.phone && <div className="text-xs text-zinc-500">{staff.phone}</div>}
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0.5 font-medium ${roleColors[staff.role] || ""}`}
                      >
                        {staff.role}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 font-mono text-xs text-zinc-300">
                      {staff.employee_code || "—"}
                    </td>

                    <td className="py-3 px-4 text-xs text-zinc-300">
                      {staff.joining_date || "—"}
                    </td>

                    {isAdmin && (
                      <td className="py-3 px-4 font-mono font-medium text-zinc-100">
                        ₹{parseFloat(staff.base_salary || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                    )}

                    <td className="py-3 px-4">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Deactivated
                          </span>
                          {staff.deactivated_at && (
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Since {new Date(staff.deactivated_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedStaff(staff)
                            setIsStaffModalOpen(true)
                          }}
                          className="h-8 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </Button>

                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(staff)}
                            className={`h-8 text-xs ${
                              staff.is_active
                                ? "text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                            }`}
                          >
                            {staff.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > limit && (
          <div className="p-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-zinc-400">
            <div>
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, totalCount)} of {totalCount} members
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
              >
                Previous
              </Button>
              <span className="px-2 text-zinc-300">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * limit >= totalCount}
                onClick={() => setPage(page + 1)}
                className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Staff Create/Edit Modal */}
      <StaffModal
        open={isStaffModalOpen}
        onOpenChange={setIsStaffModalOpen}
        staffMember={selectedStaff}
        onSuccess={fetchStaff}
      />
    </div>
  )
}

export default StaffManagementPage
