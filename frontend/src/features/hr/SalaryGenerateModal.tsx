import React, { useState } from "react"
import { toast } from "sonner"
import { Calendar, CheckCircle2, AlertTriangle, Users, DollarSign, ArrowRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { hrApi } from "./api"
import { SalaryPreviewResponse } from "./types"

interface SalaryGenerateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export const SalaryGenerateModal: React.FC<SalaryGenerateModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = String(today.getMonth() + 1).padStart(2, "0")

  const [period, setPeriod] = useState(`${currentYear}-${currentMonth}`)
  const [notes, setNotes] = useState("")
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<SalaryPreviewResponse | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handlePreview = async () => {
    if (!period) return
    setIsPreviewing(true)
    try {
      const data = await hrApi.previewSalary(period)
      setPreviewData(data)
    } catch (err: unknown) {
      // Handled by toast in apiClient
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleGenerate = async () => {
    if (!period) return
    setIsGenerating(true)
    try {
      const records = await hrApi.generateSalary(period, notes.trim() || undefined)
      toast.success(`Successfully generated ${records.length} salary records for ${period}!`)
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      // Toast already shown
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-white/[0.14] bg-[#0C0C0E]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <Calendar className="w-5 h-5 text-primary" />
            Generate Monthly Salary Run
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Period Selector & Action */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#0A0A0C] border border-white/[0.14] rounded-xl items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="periodInput" className="text-zinc-300">Payroll Period (YYYY-MM)</Label>
              <Input
                id="periodInput"
                type="month"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value)
                  setPreviewData(null)
                }}
                className="bg-black/40 border-white/[0.16] text-zinc-100 font-medium"
              />
            </div>
            <Button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing || !period}
              className="w-full bg-primary hover:bg-blue-500 text-white gap-1.5 font-medium shadow-none"
            >
              {isPreviewing ? "Calculating..." : "Preview Run"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-zinc-300">Run Description / Notes (Optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. September 2026 standard payroll processing"
              className="bg-[#0A0A0C] border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {/* Preview Results Table */}
          {previewData && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-primary uppercase tracking-wider">
                      Eligible Staff Members
                    </p>
                    <p className="text-2xl font-bold text-zinc-100">
                      {previewData.eligible_count}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <Users className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                      Total Net Payout
                    </p>
                    <p className="text-2xl font-bold text-zinc-100">
                      ₹{parseFloat(previewData.total_net_payout).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-emerald-950 flex items-center justify-center text-emerald-400">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Staff Table */}
              <div className="border border-white/[0.14] rounded-xl overflow-hidden bg-card">
                <div className="bg-white/[0.02] px-4 py-2 border-b border-white/[0.08] font-semibold text-xs text-zinc-400 uppercase tracking-wider">
                  Staff Calculation Breakdown
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.08] text-sm">
                  {previewData.items.map((item) => (
                    <div key={item.staff_id} className="p-3 hover:bg-white/[0.04] flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-zinc-100 flex items-center gap-2">
                          <span>{item.staff_name}</span>
                          {item.employee_code && (
                            <span className="text-xs text-zinc-400 font-mono bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded">
                              {item.employee_code}
                            </span>
                          )}
                          {item.already_generated && (
                            <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30 bg-amber-950/30">
                              Already Run
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                          <span>{item.staff_email}</span>
                          {item.is_prorated && (
                            <span className="text-amber-400 font-medium">
                              • {item.proration_reason || `Prorated: ${item.active_days}/${item.total_days} days`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-emerald-400">
                          ₹{parseFloat(item.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Base: ₹{parseFloat(item.prorated_base_salary).toLocaleString("en-IN")} | Ded: -₹{parseFloat(item.total_deductions).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning if already generated */}
              {previewData.items.some((i) => i.already_generated) && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-semibold text-amber-200">Duplicate Records Detected: </span>
                    One or more staff members already have generated records for {period}. Duplicate generation is rejected by constraint.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 border-t border-white/[0.08]">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
            className="border-white/[0.16] text-zinc-300 hover:bg-[#18181C]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              !previewData ||
              previewData.items.length === 0 ||
              previewData.items.some((i) => i.already_generated)
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isGenerating ? "Processing..." : "Confirm & Run Payroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
