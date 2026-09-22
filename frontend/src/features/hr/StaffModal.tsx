import React, { useState, useEffect } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Shield, DollarSign, UserCheck, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DeductionConfigItem, StaffRole, StaffUser } from "./types"
import { hrApi } from "./api"
import { useAuth } from "@/features/auth/AuthContext"

interface StaffModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffMember?: StaffUser | null
  onSuccess: () => void
}

export const StaffModal: React.FC<StaffModalProps> = ({
  open,
  onOpenChange,
  staffMember,
  onSuccess,
}) => {
  const { user } = useAuth()
  const callerRole = (user as { role?: string })?.role || "Staff"
  const isAdmin = callerRole === "Super Admin" || callerRole === "Admin"

  const isEdit = Boolean(staffMember)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [employeeCode, setEmployeeCode] = useState("")
  const [joiningDate, setJoiningDate] = useState("")
  const [role, setRole] = useState<StaffRole>("Staff")
  const [baseSalary, setBaseSalary] = useState("0.00")
  const [deductions, setDeductions] = useState<DeductionConfigItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (staffMember) {
      setEmail(staffMember.email || "")
      setPassword("")
      setFullName(staffMember.full_name || "")
      setPhone(staffMember.phone || "")
      setEmployeeCode(staffMember.employee_code || "")
      setJoiningDate(staffMember.joining_date || "")
      setRole(staffMember.role || "Staff")
      setBaseSalary(staffMember.base_salary || "0.00")
      setDeductions(staffMember.deductions_config ? [...staffMember.deductions_config] : [])
    } else {
      setEmail("")
      setPassword("")
      setFullName("")
      setPhone("")
      setEmployeeCode("")
      setJoiningDate(new Date().toISOString().split("T")[0])
      setRole("Staff")
      setBaseSalary("30000.00")
      setDeductions([
        { name: "Provident Fund", type: "percentage", value: "12" },
        { name: "Professional Tax", type: "fixed", value: "200" },
      ])
    }
  }, [staffMember, open])

  const handleAddDeduction = () => {
    setDeductions([...deductions, { name: "", type: "fixed", value: "0" }])
  }

  const handleRemoveDeduction = (index: number) => {
    setDeductions(deductions.filter((_, i) => i !== index))
  }

  const handleDeductionChange = (
    index: number,
    field: keyof DeductionConfigItem,
    val: string
  ) => {
    const next = [...deductions]
    next[index] = { ...next[index], [field]: val }
    setDeductions(next)
  }

  // Calculate estimated monthly deduction
  const baseNum = parseFloat(baseSalary) || 0
  let estimatedTotalDeductions = 0
  deductions.forEach((d) => {
    const v = parseFloat(String(d.value)) || 0
    if (d.type === "percentage") {
      estimatedTotalDeductions += (baseNum * v) / 100
    } else {
      estimatedTotalDeductions += v
    }
  })
  if (estimatedTotalDeductions > baseNum) {
    estimatedTotalDeductions = baseNum
  }
  const estimatedNet = Math.max(0, baseNum - estimatedTotalDeductions)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error("Email address is required")
      return
    }
    if (!isEdit && !password.trim()) {
      toast.error("Password is required for new accounts")
      return
    }

    // Clean deductions config
    const cleanDeductions: DeductionConfigItem[] = deductions
      .filter((d) => d.name.trim().length > 0)
      .map((d) => ({
        name: d.name.trim(),
        type: d.type,
        value: String(d.value),
      }))

    setIsSubmitting(true)
    try {
      if (isEdit && staffMember) {
        await hrApi.updateStaff(staffMember.id, {
          full_name: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          employee_code: employeeCode.trim() || undefined,
          joining_date: joiningDate || undefined,
          role: isAdmin ? role : undefined,
          base_salary: isAdmin ? baseSalary : undefined,
          deductions_config: isAdmin ? cleanDeductions : undefined,
        })
        toast.success("Staff member updated successfully")
      } else {
        await hrApi.createStaff({
          email: email.trim(),
          password: password.trim(),
          role,
          full_name: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          employee_code: employeeCode.trim() || undefined,
          joining_date: joiningDate || undefined,
          base_salary: baseSalary,
          deductions_config: cleanDeductions,
        })
        toast.success("Staff member created successfully")
      }
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      // Toast already shown by apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            {isEdit ? `Edit Staff: ${staffMember?.full_name || staffMember?.email}` : "Add New Staff Member"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Identity and Contact Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                disabled={isEdit}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
                required
              />
            </div>

            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Initial Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jane Doe"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="employeeCode">Employee Code</Label>
              <Input
                id="employeeCode"
                disabled={!isAdmin && isEdit}
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="e.g. EMP-101"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="joiningDate">Joining Date</Label>
              <Input
                id="joiningDate"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
              />
            </div>

            {isAdmin && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="role">System Role (RBAC)</Label>
                <select
                  id="role"
                  className="w-full h-10 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                >
                  <option value="Staff">Staff (Standard POS & Inventory viewing)</option>
                  <option value="Manager">Manager (Catalog, Stock Adjustments)</option>
                  <option value="Accountant">Accountant (Invoicing, Payments, Payouts)</option>
                  <option value="Admin">Admin (Full Operational Control)</option>
                  <option value="Super Admin">Super Admin (All Privileges)</option>
                </select>
              </div>
            )}
          </div>

          {/* Salary Configuration (Admin Only) */}
          {isAdmin ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    Salary & Payroll Configuration
                  </h3>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Admin Restricted
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="baseSalary">Monthly Base Salary (₹) *</Label>
                <Input
                  id="baseSalary"
                  type="number"
                  step="0.01"
                  min="0"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder="50000.00"
                  required
                />
              </div>

              {/* Deductions Configurator */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Applicable Deductions (Itemized)
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddDeduction}
                    className="h-8 text-xs gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Deduction
                  </Button>
                </div>

                {deductions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No deductions configured. Staff will receive full base salary as net pay.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {deductions.map((d, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                      >
                        <Input
                          placeholder="Deduction Name (e.g. PF)"
                          value={d.name}
                          onChange={(e) => handleDeductionChange(index, "name", e.target.value)}
                          className="flex-1 h-8 text-xs"
                          required
                        />
                        <select
                          value={d.type}
                          onChange={(e) => handleDeductionChange(index, "type", e.target.value)}
                          className="h-8 px-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        >
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed">Fixed Amount (₹)</option>
                        </select>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Value"
                          value={d.value}
                          onChange={(e) => handleDeductionChange(index, "value", e.target.value)}
                          className="w-24 h-8 text-xs"
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDeduction(index)}
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Estimated Net Salary Summary */}
                <div className="mt-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-lg flex items-center justify-between text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Est. Total Deductions: </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      -₹{estimatedTotalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Est. Net Take-Home: </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">
                      ₹{estimatedNet.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Salary and deduction configurations are strictly restricted to Administrators.</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Update Staff" : "Create Staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
