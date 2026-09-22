import React from "react"
import { CheckCircle2, Printer, X } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Sale } from "./api"

interface ReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  open,
  onOpenChange,
  sale,
}) => {
  if (!sale) return null

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-600 justify-center">
            <CheckCircle2 className="h-6 w-6" />
            <DialogTitle className="text-xl">Checkout Complete</DialogTitle>
          </div>
          <DialogDescription className="text-center text-xs text-slate-500">
            Sale recorded atomically with stock deductions.
          </DialogDescription>
        </DialogHeader>

        {/* Printable Receipt Paper */}
        <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50 space-y-3 font-mono text-xs text-slate-800">
          <div className="text-center pb-2 border-b border-dashed border-slate-300">
            <div className="font-bold text-sm text-slate-900">ERP RETAIL POS</div>
            <div className="text-[11px] text-slate-500">Official Store Receipt</div>
            <div className="mt-1 font-semibold text-slate-700">{sale.invoice_number}</div>
            <div className="text-[10px] text-slate-400">
              {new Date(sale.sale_date).toLocaleString()}
            </div>
          </div>

          <div className="flex justify-between text-[11px] text-slate-600">
            <span>Customer: {sale.customer_name || "Walk-in"}</span>
            <span>Cashier: {sale.staff_email.split("@")[0]}</span>
          </div>

          {/* Line Items */}
          <div className="py-2 border-t border-b border-dashed border-slate-300 space-y-1.5">
            {sale.items.map((item) => (
              <div key={item.id} className="flex justify-between items-start">
                <div className="max-w-[180px]">
                  <div className="font-medium truncate text-slate-900">{item.product_name}</div>
                  <div className="text-[10px] text-slate-400">
                    {item.quantity} x ₹{parseFloat(item.unit_price).toFixed(2)}
                    {parseFloat(item.discount_amount) > 0 && (
                      <span className="text-rose-600 ml-1">
                        (-₹{parseFloat(item.discount_amount).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-right">
                  ₹{parseFloat(item.total_price).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Calculation Breakdown */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span>₹{parseFloat(sale.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(sale.discount_amount) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Order Discount:</span>
                <span>-₹{parseFloat(sale.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400 text-[10px]">
              <span>Tax (GST placeholder):</span>
              <span>₹{parseFloat(sale.tax_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
              <span>Grand Total:</span>
              <span>₹{parseFloat(sale.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-2 text-center text-[10px] text-slate-400 border-t border-dashed border-slate-300">
            Payment Method: <span className="uppercase font-semibold">{sale.payment_method}</span>
            <br />
            * Phase 6 Pre-GST Subtotal *
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1.5" />
            Close
          </Button>
          <Button size="sm" onClick={handlePrint} className="bg-slate-900 text-white">
            <Printer className="h-4 w-4 mr-1.5" />
            Print Receipt
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}
