import React from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Barcode as BarcodeIcon,
  History,
  Scale,
  ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Product } from "@/features/catalog/api"

export interface InventoryProductDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onStockOperation: (product: Product, type: "in" | "out" | "audit") => void
  onViewMovements: (product: Product) => void
}

export const InventoryProductDetailsModal: React.FC<InventoryProductDetailsModalProps> = ({
  open,
  onOpenChange,
  product,
  onStockOperation,
  onViewMovements,
}) => {
  const navigate = useNavigate()

  if (!product) return null

  const stock = parseFloat(product.current_stock) || 0
  const minStock = parseFloat(product.min_stock) || 0
  const isOutOfStock = stock <= 0
  const isLowStock = !isOutOfStock && stock <= minStock
  const purchasePrice = parseFloat(product.purchase_price) || 0
  const sellingPrice = parseFloat(product.selling_price) || 0
  const valuation = stock * purchasePrice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0E0E12] border-white/[0.14] text-white p-0 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] bg-[#141418]/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={
                    isOutOfStock
                      ? "border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]"
                      : isLowStock
                      ? "border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px]"
                      : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]"
                  }
                >
                  {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock Alert" : "In Stock"}
                </Badge>
                {product.is_active ? (
                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 text-[10px]">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px]">
                    Inactive
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg font-bold text-white tracking-tight">
                {product.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 flex items-center gap-2 mt-1">
                <span className="font-mono">SKU: {product.sku}</span>
                {product.barcode && (
                  <>
                    <span>•</span>
                    <span className="font-mono flex items-center gap-1">
                      <BarcodeIcon className="h-3 w-3 text-primary" /> {product.barcode}
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Stock & Financial Metrics Grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Current Stock */}
            <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
              <span className="text-[11px] text-zinc-400 block font-medium">Current Stock</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {stock.toLocaleString()} <span className="text-xs font-normal text-zinc-400">{product.unit}</span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Min threshold: {minStock} {product.unit}
              </span>
            </div>

            {/* Selling Price */}
            <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
              <span className="text-[11px] text-zinc-400 block font-medium">Selling Price (MRP)</span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                ₹{sellingPrice.toFixed(2)}
              </div>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                GST: {product.gst_rate}%
              </span>
            </div>

            {/* Total Valuation */}
            <div className="col-span-2 sm:col-span-1 p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl">
              <span className="text-[11px] text-zinc-400 block font-medium">Inventory Value</span>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                ₹{valuation.toFixed(2)}
              </div>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Cost: ₹{purchasePrice.toFixed(2)} / {product.unit}
              </span>
            </div>
          </div>

          {/* Details Metadata */}
          <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs space-y-2">
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span className="text-zinc-400">Category</span>
              <span className="font-medium text-zinc-200">{product.category?.name || "Uncategorized"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span className="text-zinc-400">Brand</span>
              <span className="font-medium text-zinc-200">{product.brand?.name || "Generic"}</span>
            </div>
            {product.hsn_code && (
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-400">HSN / SAC Code</span>
                <span className="font-mono font-medium text-zinc-200">{product.hsn_code}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Unit of Measure</span>
              <span className="font-medium text-zinc-200">{product.unit}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
              Inventory Actions
            </span>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onStockOperation(product, "in")
                }}
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs gap-1.5 h-9"
              >
                <ArrowUpCircle className="h-3.5 w-3.5" /> Stock In
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onStockOperation(product, "out")
                }}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs gap-1.5 h-9"
              >
                <ArrowDownCircle className="h-3.5 w-3.5" /> Stock Out
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onStockOperation(product, "audit")
                }}
                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-xs gap-1.5 h-9"
              >
                <Scale className="h-3.5 w-3.5" /> Adjust
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onViewMovements(product)
                }}
                className="flex-1 border-white/[0.14] text-zinc-300 hover:text-white text-xs gap-1.5 h-9"
              >
                <History className="h-3.5 w-3.5 text-indigo-400" />
                Movement History
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  navigate(`/staff/sales?add_barcode=${encodeURIComponent(product.barcode || product.sku)}`)
                }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5 h-9"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Open in POS
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default InventoryProductDetailsModal
