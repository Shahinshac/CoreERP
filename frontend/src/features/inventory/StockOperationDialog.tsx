import React, { useState } from "react"
import { toast } from "sonner"
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, RefreshCw, ShieldAlert } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Product } from "@/features/catalog/api"
import { inventoryApi } from "./api"
import { useAuth } from "@/features/auth/AuthContext"

export type StockOperationType = "in" | "out" | "adjustment"

interface StockOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  initialType?: StockOperationType
  onSuccess: () => void
}

export const StockOperationDialog: React.FC<StockOperationDialogProps> = ({
  open,
  onOpenChange,
  product,
  initialType = "in",
  onSuccess,
}) => {
  const { user } = useAuth()
  const staffUser = user as { email: string; role: string } | null
  const isAdmin = staffUser?.role === "Super Admin" || staffUser?.role === "Admin"

  const [operationType, setOperationType] = useState<StockOperationType>(initialType)
  const [quantity, setQuantity] = useState("")
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [isOverride, setIsOverride] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog re-opens or type changes
  React.useEffect(() => {
    setOperationType(initialType)
    setQuantity("")
    setReference("")
    setReason("")
    setIsOverride(false)
  }, [open, initialType])

  if (!product) return null

  const currentStockNum = parseFloat(product.current_stock) || 0
  const qtyNum = parseFloat(quantity) || 0

  let projectedStock = currentStockNum
  if (operationType === "in") {
    projectedStock = currentStockNum + qtyNum
  } else if (operationType === "out") {
    projectedStock = currentStockNum - qtyNum
  } else if (operationType === "adjustment") {
    projectedStock = currentStockNum + qtyNum
  }

  const wouldBeNegative = projectedStock < 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!quantity.trim() || qtyNum === 0) {
      return toast.error("Please enter a non-zero quantity.")
    }

    if (operationType === "out" && wouldBeNegative) {
      return toast.error(
        `Insufficient stock. Available: ${product.current_stock}, attempted deduction: ${quantity}.`
      )
    }

    if (operationType === "adjustment" && wouldBeNegative && !isOverride) {
      return toast.error(
        "Adjustment results in negative stock. Check the Admin Override option if authorized."
      )
    }

    setIsSubmitting(true)
    try {
      if (operationType === "in") {
        await inventoryApi.stockIn({
          product_id: product.id,
          quantity,
          reference: reference.trim() || undefined,
          reason: reason.trim() || undefined,
        })
        toast.success(`Successfully added ${quantity} ${product.unit} to stock`)
      } else if (operationType === "out") {
        await inventoryApi.stockOut({
          product_id: product.id,
          quantity,
          reference: reference.trim() || undefined,
          reason: reason.trim() || undefined,
        })
        toast.success(`Successfully removed ${quantity} ${product.unit} from stock`)
      } else if (operationType === "adjustment") {
        await inventoryApi.stockAdjustment({
          product_id: product.id,
          quantity,
          is_override: isOverride,
          reference: reference.trim() || undefined,
          reason: reason.trim() || undefined,
        })
        toast.success(`Stock adjusted by ${quantity} ${product.unit}`)
      }

      onSuccess()
      onOpenChange(false)
    } catch {
      // Handled by api error toaster
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-lg max-h-[90vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="text-[#F5F5F7]">Stock Operation: {product.name}</DialogTitle>
          <DialogDescription className="text-[#94949C]">
            SKU: <span className="font-mono font-medium text-[#C4C4C8]">{product.sku}</span> • Current Stock:{" "}
            <span className="font-semibold text-[#F5F5F7]">
              {product.current_stock} {product.unit}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Operation Type Switcher */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#0A0A0C] border border-white/[0.14] rounded-lg">
          <button
            type="button"
            onClick={() => {
              setOperationType("in")
              setQuantity("")
              setIsOverride(false)
            }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition ${
              operationType === "in"
                ? "bg-[#18181C] text-emerald-400 border border-emerald-500/30 shadow-sm"
                : "text-[#94949C] hover:text-[#F5F5F7]"
            }`}
          >
            <ArrowUpCircle className="h-4 w-4 text-emerald-400" />
            Stock In
          </button>
          <button
            type="button"
            onClick={() => {
              setOperationType("out")
              setQuantity("")
              setIsOverride(false)
            }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition ${
              operationType === "out"
                ? "bg-[#18181C] text-rose-400 border border-rose-500/30 shadow-sm"
                : "text-[#94949C] hover:text-[#F5F5F7]"
            }`}
          >
            <ArrowDownCircle className="h-4 w-4 text-rose-400" />
            Stock Out
          </button>
          <button
            type="button"
            onClick={() => {
              setOperationType("adjustment")
              setQuantity("")
              setIsOverride(false)
            }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition ${
              operationType === "adjustment"
                ? "bg-[#18181C] text-amber-400 border border-amber-500/30 shadow-sm"
                : "text-[#94949C] hover:text-[#F5F5F7]"
            }`}
          >
            <RefreshCw className="h-4 w-4 text-amber-400" />
            Adjustment
          </button>
        </div>

        {/* Quantity Field */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs font-medium text-[#C4C4C8]">
            <span>
              {operationType === "in"
                ? "Quantity to Receive *"
                : operationType === "out"
                ? "Quantity to Deduct *"
                : "Quantity Delta (+ / -) *"}
            </span>
            <span
              className={`font-mono ${
                wouldBeNegative ? "text-rose-400 font-bold" : "text-[#94949C]"
              }`}
            >
              Resulting: {projectedStock.toFixed(3)} {product.unit}
            </span>
          </div>
          <NumericInput
            value={quantity}
            onChange={setQuantity}
            precisionType="quantity"
            allowNegative={operationType === "adjustment"}
            suffix={product.unit}
            placeholder={operationType === "adjustment" ? "e.g. -5.000 or +10.000" : "0.000"}
            required
            autoFocus
          />
          {operationType === "adjustment" && (
            <p className="text-[11px] text-[#94949C]">
              Enter a positive number to increase stock or negative (e.g. -10) to reduce.
            </p>
          )}
        </div>

        {/* Negative Stock Warning and Admin Override Checkbox */}
        {wouldBeNegative && operationType === "adjustment" && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
            <div className="flex items-start gap-2 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Warning: Resulting stock will be negative (
                <strong className="font-mono text-amber-200">{projectedStock.toFixed(3)}</strong>). This is prohibited
                unless authorized under an Administrator adjustment override.
              </span>
            </div>
            {isAdmin ? (
              <label className="flex items-center gap-2 text-xs font-medium text-amber-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isOverride}
                  onChange={(e) => setIsOverride(e.target.checked)}
                  className="rounded border-amber-500/40 bg-[#0C0C0E] text-primary focus:ring-primary h-4 w-4"
                />
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                <span>Authorize Admin negative stock override</span>
              </label>
            ) : (
              <p className="text-xs text-rose-400 font-medium">
                Admin role required to authorize negative stock override.
              </p>
            )}
          </div>
        )}

        {/* Reference & Reason */}
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-medium text-[#C4C4C8]">Reference / Doc No.</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. PO-9812, Delivery Note, or Physical Count Ref"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-[#C4C4C8]">Reason / Notes</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged during handling, audit variance, supplier delivery"
            />
          </div>
        </div>

        <DialogFooter>
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
            disabled={
              isSubmitting ||
              (operationType === "out" && wouldBeNegative) ||
              (operationType === "adjustment" && wouldBeNegative && !isOverride)
            }
            className={
              operationType === "in"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                : operationType === "out"
                ? "bg-rose-600 hover:bg-rose-500 text-white font-medium"
                : "bg-amber-600 hover:bg-amber-500 text-white font-medium"
            }
          >
            {isSubmitting
              ? "Recording..."
              : operationType === "in"
              ? "Confirm Stock In"
              : operationType === "out"
              ? "Confirm Stock Out"
              : "Confirm Adjustment"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
