import React, { useState } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CreditNote, Invoice, invoicingApi } from "./api"

interface CreditNoteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
  onSuccess: (creditNote: CreditNote) => void
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}) => {
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reversalType, setReversalType] = useState<"full" | "partial">("full")
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    invoice.items.forEach((item) => {
      initial[item.id] = item.quantity
    })
    return initial
  })

  const handleQtyChange = (itemId: string, maxQty: string, val: string) => {
    const parsed = parseFloat(val)
    const max = parseFloat(maxQty)
    if (val === "" || (parsed >= 0 && parsed <= max)) {
      setItemQuantities((prev) => ({ ...prev, [itemId]: val }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error("Please provide a valid reversal reason (at least 3 characters).")
      return
    }

    setIsSubmitting(true)
    try {
      const payload: { reason: string; items?: { invoice_item_id: string; quantity: string }[] } = {
        reason: reason.trim(),
      }

      if (reversalType === "partial") {
        const itemsToReverse = Object.entries(itemQuantities)
          .filter(([_, qty]) => parseFloat(qty) > 0)
          .map(([itemId, qty]) => ({
            invoice_item_id: itemId,
            quantity: qty,
          }))

        if (itemsToReverse.length === 0) {
          toast.error("Please specify at least one item quantity to reverse.")
          setIsSubmitting(false)
          return
        }
        payload.items = itemsToReverse
      }

      const creditNote = await invoicingApi.createCreditNote(invoice.id, payload)
      toast.success(`Credit Note ${creditNote.credit_note_number} generated successfully!`)
      onSuccess(creditNote)
      onOpenChange(false)
    } catch {
      // Handled by global api toast
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-600">
            <RotateCcw className="h-5 w-5" />
            <DialogTitle>Issue Statutory Credit Note</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Invoices are immutable pursuant to Indian GST Law. Adjustments and reversals happen
            exclusively via numbered Credit Notes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Invoice Summary Banner */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Original Invoice:</span>
              <span className="font-semibold text-slate-800">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Recipient / Billed To:</span>
              <span className="font-medium text-slate-800">{invoice.buyer_name}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-500 font-sans">Grand Total:</span>
              <span className="font-bold text-rose-600">₹{parseFloat(invoice.grand_total).toFixed(2)}</span>
            </div>
          </div>

          {/* Reversal Scope Toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Reversal Scope</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReversalType("full")}
                className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition ${
                  reversalType === "full"
                    ? "bg-rose-50 border-rose-400 text-rose-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Full Invoice Reversal
              </button>
              <button
                type="button"
                onClick={() => setReversalType("partial")}
                className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition ${
                  reversalType === "partial"
                    ? "bg-rose-50 border-rose-400 text-rose-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Itemized Partial Reversal
              </button>
            </div>
          </div>

          {/* Itemized Quantities if Partial */}
          {reversalType === "partial" && (
            <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50 max-h-48 overflow-y-auto">
              <div className="text-[11px] font-semibold text-slate-600">Specify Quantities to Reverse:</div>
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-100 last:border-0">
                  <div className="truncate max-w-[200px]">
                    <div className="font-medium text-slate-800 truncate">{item.product_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Max: {item.quantity} | ₹{item.unit_price} ea</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max={item.quantity}
                      value={itemQuantities[item.id] || "0"}
                      onChange={(e) => handleQtyChange(item.id, item.quantity, e.target.value)}
                      className="h-8 w-20 text-right text-xs font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reversal Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Reason for Credit Note <span className="text-rose-500">*</span>
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer return, defective product, billing discrepancy..."
              className="text-xs h-9"
              required
            />
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Once issued, this Credit Note will be generated with a gapless sequence number and reverse the corresponding CGST/SGST/IGST liability.
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
            >
              {isSubmitting ? "Generating..." : "Confirm & Issue Credit Note"}
            </Button>
          </DialogFooter>
        </form>
      </div>
    </Dialog>
  )
}
