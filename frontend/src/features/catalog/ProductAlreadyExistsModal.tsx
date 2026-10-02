import React from "react"
import {
  AlertCircle,
  Edit,
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
import { Product } from "./api"

export interface ProductAlreadyExistsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  scannedBarcode: string
  onEdit: (product: Product) => void
  onAddToPos: (product: Product) => void
}

export const ProductAlreadyExistsModal: React.FC<ProductAlreadyExistsModalProps> = ({
  open,
  onOpenChange,
  product,
  scannedBarcode,
  onEdit,
  onAddToPos,
}) => {
  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0E0E12] border-amber-500/30 text-white p-0 overflow-hidden">
        {/* Warning Banner */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-amber-300">
              Product Already Exists
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-400/80 mt-0.5">
              The scanned barcode <span className="font-mono font-bold text-white">{scannedBarcode}</span> is already assigned to a registered product.
            </DialogDescription>
          </div>
        </div>

        {/* Existing Product Card */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-white">{product.name}</h4>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 flex-wrap">
                  <span className="font-mono">SKU: {product.sku}</span>
                  <span>•</span>
                  <span className="font-mono text-zinc-300">Barcode: {product.barcode}</span>
                </div>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                {product.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06] text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 block">Retail Price</span>
                <span className="font-mono font-bold text-emerald-400">₹{parseFloat(product.selling_price).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">GST Rate</span>
                <span className="font-mono font-semibold text-zinc-200">{product.gst_rate}%</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Current Stock</span>
                <span className="font-mono font-semibold text-white">{product.current_stock} {product.unit}</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Duplicate products cannot be created with identical barcodes. You can view or update this item, or sell it directly in the POS.
          </p>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onEdit(product)
                }}
                className="flex-1 border-white/[0.14] text-zinc-200 hover:text-white text-xs gap-1.5 h-10"
              >
                <Edit className="h-3.5 w-3.5 text-primary" />
                View / Edit Product
              </Button>

              <Button
                onClick={() => {
                  onOpenChange(false)
                  onAddToPos(product)
                }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5 h-10"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Add to POS
              </Button>
            </div>

            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 h-8"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default ProductAlreadyExistsModal
