import React, { useState, useEffect } from "react"
import { toast } from "sonner"
import { Receipt, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Expense, ExpenseCategory } from "./types"
import { financeApi } from "./api"

interface ExpenseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: Expense | null
  onSuccess: () => void
}

const CATEGORY_OPTIONS: { label: string; value: ExpenseCategory }[] = [
  { label: "Salary (Manual / Ad-hoc)", value: "salary" },
  { label: "Office & Store Rent", value: "rent" },
  { label: "Utilities (Electricity, Water, Internet)", value: "utilities" },
  { label: "Logistics & Transport", value: "transport" },
  { label: "Marketing & Advertising", value: "marketing" },
  { label: "Maintenance & Repairs", value: "maintenance" },
  { label: "Other Operating Expenses", value: "other" },
]

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  open,
  onOpenChange,
  expense,
  onSuccess,
}) => {
  const isEdit = Boolean(expense)
  const isSystemSalary = expense?.source === "system_salary"

  const [category, setCategory] = useState<ExpenseCategory>("utilities")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (expense) {
      setCategory(expense.category)
      setAmount(expense.amount)
      setDate(expense.date)
      setDescription(expense.description || "")
    } else {
      setCategory("utilities")
      setAmount("")
      setDate(new Date().toISOString().split("T")[0])
      setDescription("")
    }
  }, [expense, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid expense amount greater than 0")
      return
    }

    if (!date) {
      toast.error("Please specify the expense date")
      return
    }

    setIsSubmitting(true)
    try {
      if (isEdit && expense) {
        await financeApi.updateExpense(expense.id, {
          category,
          amount,
          date,
          description: description.trim() || undefined,
        })
        toast.success("Expense updated successfully")
      } else {
        await financeApi.createExpense({
          category,
          amount,
          date,
          description: description.trim() || undefined,
        })
        toast.success("Expense recorded successfully")
      }
      onOpenChange(false)
      onSuccess()
    } catch {
      // Toast already handled by apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#0C0C0E] border-white/[0.14] text-[#F5F5F7]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#F5F5F7]">
            <Receipt className="w-5 h-5 text-primary" />
            {isEdit ? "Edit Manual Expense" : "Record New Expense"}
          </DialogTitle>
        </DialogHeader>

        {isSystemSalary ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-200">System-Sourced Salary Expense</p>
              <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                This expense was automatically recorded during payroll execution in Phase 10.
                System-generated salary expenses are strictly immutable and cannot be manually modified.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-[#C4C4C8]">Expense Category *</Label>
              <select
                id="category"
                className="w-full h-10 px-3 py-2 text-sm bg-[#0A0A0C] border border-white/[0.16] text-[#F5F5F7] rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                required
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#0C0C0E] text-[#F5F5F7]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-[#C4C4C8]">Amount (₹) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 4500.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[#C4C4C8]">Expense Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-[#C4C4C8]">Description / Notes</Label>
              <textarea
                id="description"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-[#0A0A0C] border border-white/[0.16] text-[#F5F5F7] placeholder-[#94949C] rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g. Monthly electricity bill for retail shop floor"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

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
                className="bg-primary hover:bg-primary/90 text-white font-medium"
              >
                {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Record Expense"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
