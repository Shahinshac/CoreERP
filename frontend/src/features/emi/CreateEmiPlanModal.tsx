import React, { useEffect, useState } from "react"
import { Calendar, Clock, Layers, Percent, User } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select } from "@/components/ui/select"
import { apiClient } from "@/lib/api"
import { EmiPlanDetail, EmiPlanPreviewResponse, emiApi } from "./api"

interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  email: string
}

interface CreateEmiPlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (plan: EmiPlanDetail) => void
  initialCustomerId?: string
  initialInvoiceId?: string
  initialPrincipal?: string
}

export const CreateEmiPlanModal: React.FC<CreateEmiPlanModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
  initialCustomerId,
  initialInvoiceId,
  initialPrincipal,
}) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || "")
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || "")
  const [principal, setPrincipal] = useState(initialPrincipal || "10000.00")
  const [downPayment, setDownPayment] = useState("0.00")
  const [tenure, setTenure] = useState("6")
  const [interestRate, setInterestRate] = useState("0.00")
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")

  const [preview, setPreview] = useState<EmiPlanPreviewResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch customers for selector
  useEffect(() => {
    if (open) {
      apiClient
        .get<{ items: CustomerOption[] }>("/api/staff/customers?limit=100")
        .then((res) => {
          setCustomers(res.items || [])
          if (!selectedCustomerId && res.items?.length > 0) {
            setSelectedCustomerId(res.items[0].id)
          }
        })
        .catch(() => {})
    }
  }, [open])

  // Live preview schedule
  useEffect(() => {
    if (!open) return
    const p = parseFloat(principal) || 0
    const dp = parseFloat(downPayment) || 0
    const n = parseInt(tenure, 10) || 3
    const ir = parseFloat(interestRate) || 0

    if (p <= 0 || dp >= p || n <= 0) {
      setPreview(null)
      return
    }

    emiApi
      .preview({
        principal: p.toFixed(2),
        down_payment: dp.toFixed(2),
        number_of_installments: n,
        interest_rate: ir > 0 ? ir.toFixed(2) : undefined,
        start_date: startDate || undefined,
      })
      .then((data) => setPreview(data))
      .catch(() => setPreview(null))
  }, [open, principal, downPayment, tenure, interestRate, startDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomerId) {
      toast.error("Please select a customer for this EMI plan.")
      return
    }

    const p = parseFloat(principal) || 0
    const dp = parseFloat(downPayment) || 0
    if (p <= 0) {
      toast.error("Principal must be greater than zero.")
      return
    }
    if (dp >= p) {
      toast.error("Down payment must be less than principal.")
      return
    }

    setSubmitting(true)
    try {
      const plan = await emiApi.create({
        customer_id: selectedCustomerId,
        invoice_id: invoiceId.trim() || undefined,
        principal: p.toFixed(2),
        down_payment: dp.toFixed(2),
        number_of_installments: parseInt(tenure, 10),
        interest_rate: parseFloat(interestRate) > 0 ? parseFloat(interestRate).toFixed(2) : undefined,
        start_date: startDate || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success("EMI financing plan created successfully!")
      onSuccess(plan)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to create EMI plan.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-[#F5F5F7]">
                Create Installment (EMI) Plan
              </DialogTitle>
              <DialogDescription className="text-xs text-[#94949C]">
                Configure retail customer installment financing with live remainder calculation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Customer Selection */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8] flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-[#94949C]" />
              Customer *
            </label>
            <Select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="h-9 text-xs bg-[#0A0A0C] border-white/[0.16] text-[#F5F5F7]"
              required
            >
              <option value="" className="bg-[#0C0C0E] text-[#94949C]">Select a Customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0C0C0E] text-[#F5F5F7]">
                  {c.name} {c.phone ? `(${c.phone})` : ""}
                </option>
              ))}
            </Select>
          </div>

          {/* Optional Linked Invoice */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8]">
              Linked Invoice UUID (Optional)
            </label>
            <Input
              placeholder="e.g. 550e8400-e29b-41d4..."
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>

          {/* Principal */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8]">
              Principal Amount (₹) *
            </label>
            <NumericInput
              value={principal}
              onChange={(val) => setPrincipal(val)}
              min={1}
              className="h-9 font-mono"
              placeholder="10000.00"
              required
            />
          </div>

          {/* Down Payment */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8]">
              Down Payment (₹)
            </label>
            <NumericInput
              value={downPayment}
              onChange={(val) => setDownPayment(val)}
              min={0}
              className="h-9 font-mono"
              placeholder="0.00"
            />
          </div>

          {/* Tenure (Months) */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8] flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[#94949C]" />
              Tenure (Installments) *
            </label>
            <Select
              value={tenure}
              onChange={(e) => setTenure(e.target.value)}
              className="h-9 text-xs bg-[#0A0A0C] border-white/[0.16] text-[#F5F5F7]"
            >
              <option value="3" className="bg-[#0C0C0E] text-[#F5F5F7]">3 Months (Quarterly Plan)</option>
              <option value="6" className="bg-[#0C0C0E] text-[#F5F5F7]">6 Months (Half-Yearly)</option>
              <option value="9" className="bg-[#0C0C0E] text-[#F5F5F7]">9 Months</option>
              <option value="12" className="bg-[#0C0C0E] text-[#F5F5F7]">12 Months (Annual Plan)</option>
              <option value="18" className="bg-[#0C0C0E] text-[#F5F5F7]">18 Months</option>
              <option value="24" className="bg-[#0C0C0E] text-[#F5F5F7]">24 Months (2-Year Plan)</option>
            </Select>
          </div>

          {/* Interest Rate */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8] flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5 text-[#94949C]" />
                Annual Interest Rate (% p.a.)
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">0% = No-Cost EMI</span>
            </label>
            <NumericInput
              value={interestRate}
              onChange={(val) => setInterestRate(val)}
              min={0}
              max={100}
              className="h-9 font-mono"
              placeholder="0.00"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8] flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#94949C]" />
              Financing Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-[#C4C4C8]">Internal Audit Notes</label>
            <Input
              placeholder="e.g. In-store electronics promotional financing"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Live Calculation Summary Banner */}
        {preview && (
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-[#94949C] font-sans">Financed Principal: </span>
                <span className="font-bold text-[#F5F5F7] font-mono">₹{parseFloat(preview.financed_principal).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[#94949C] font-sans">Total Interest: </span>
                <span className="font-bold text-[#F5F5F7] font-mono">₹{parseFloat(preview.interest_amount).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[#94949C] font-sans">Total Financed: </span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  ₹{parseFloat(preview.total_financed).toFixed(2)}
                </span>
              </div>
              <div className="w-full pt-2 border-t border-emerald-500/20 flex justify-between items-center text-xs">
                <span className="text-emerald-300 font-semibold">Monthly Installment:</span>
                <span className="text-base font-extrabold text-emerald-400 font-mono">
                  ₹{parseFloat(preview.installment_amount).toFixed(2)} / mo
                </span>
              </div>
            </div>

            {/* Micro Installment Schedule Preview */}
            <div className="space-y-1">
              <div className="text-[11px] font-bold text-[#C4C4C8] uppercase tracking-wider">
                Installment Schedule Preview (Exact Remainder Adjusted):
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-white/[0.14] bg-[#0A0A0C]">
                <table className="w-full text-[11px] font-mono">
                  <thead className="bg-[#121214] border-b border-white/[0.1] text-[#94949C] font-sans">
                    <tr>
                      <th className="py-1 px-2.5 text-left">#</th>
                      <th className="py-1 px-2.5 text-left">Due Date</th>
                      <th className="py-1 px-2.5 text-right">Amount Due</th>
                      <th className="py-1 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {preview.installments.map((inst, idx) => (
                      <tr
                        key={inst.installment_number}
                        className={idx === preview.installments.length - 1 ? "bg-amber-500/10 text-amber-300" : "text-[#F5F5F7]"}
                      >
                        <td className="py-1 px-2.5 text-[#C4C4C8]">
                          {inst.installment_number}
                          {idx === preview.installments.length - 1 && (
                            <span className="ml-1 text-[9px] text-amber-400 font-sans font-bold">(Final)</span>
                          )}
                        </td>
                        <td className="py-1 px-2.5 font-sans text-[#C4C4C8]">
                          {new Date(inst.due_date).toLocaleDateString()}
                        </td>
                        <td className="py-1 px-2.5 text-right font-bold text-[#F5F5F7]">
                          ₹{parseFloat(inst.amount_due).toFixed(2)}
                        </td>
                        <td className="py-1 px-2.5 text-center font-sans">
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/[0.08] text-[#94949C] font-semibold border border-white/[0.1]">
                            Pending
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !preview}
            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            {submitting ? "Generating Plan..." : "Confirm & Activate Plan"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
