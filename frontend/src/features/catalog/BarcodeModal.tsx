import React, { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, Copy, Download, FileCode, Printer, Tag } from "lucide-react"
import { toast } from "sonner"
import {
  generateBarcodeSvg,
  downloadBarcodePng,
  downloadSvg,
  sanitizeFilename,
} from "@/lib/barcode"
import { Product } from "./api"

interface BarcodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

export const BarcodeModal: React.FC<BarcodeModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  const [copied, setCopied] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const barcodeValue = product?.barcode || product?.sku || ""

  const svgContent = useMemo(() => {
    if (!barcodeValue) return ""
    return generateBarcodeSvg(barcodeValue, {
      height: 95,
      moduleWidth: 2.8,
      includeText: true,
      barColor: "#0f172a",
      textColor: "#0f172a",
      backgroundColor: "#ffffff",
    })
  }, [barcodeValue])

  if (!product) return null

  const handleCopyBarcode = () => {
    if (!product.barcode) return
    navigator.clipboard.writeText(product.barcode)
    setCopied(true)
    toast.success("Barcode copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadPng = async () => {
    try {
      setIsExporting(true)
      const filename = `${sanitizeFilename(product.name)}-${product.sku}-barcode.png`
      await downloadBarcodePng(barcodeValue, filename, {
        productName: product.name,
        sku: product.sku,
        hsn: product.hsn_code || undefined,
        price: product.selling_price,
      })
      toast.success("High-res barcode PNG downloaded")
    } catch (err) {
      console.error(err)
      toast.error("Failed to download barcode image")
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadSvg = () => {
    if (!svgContent) return
    const filename = `${sanitizeFilename(product.name)}-${product.sku}-barcode.svg`
    downloadSvg(svgContent, filename)
    toast.success("Barcode SVG downloaded")
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-surface border-white/[0.14] text-zinc-100">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-100">
                Product Barcode
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Standard retail-compliant barcode for scanning & inventory
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Printable Barcode Container */}
        <div className="p-6 my-2 bg-white rounded-xl shadow-inner border border-zinc-200 flex flex-col items-center justify-center text-center barcode-print-target">
          <div className="text-zinc-900 font-bold text-base tracking-tight mb-1 max-w-sm truncate">
            {product.name}
          </div>
          <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500 font-mono">
            <span>SKU: {product.sku}</span>
            {product.hsn_code && <span>• HSN: {product.hsn_code}</span>}
          </div>

          {/* Barcode SVG */}
          {svgContent ? (
            <div
              className="py-1 px-3 max-w-full overflow-x-auto flex justify-center"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="text-zinc-400 text-sm py-8">No barcode available</div>
          )}

          <div className="mt-2 text-xs font-mono font-bold text-zinc-700">
            ₹{parseFloat(product.selling_price).toFixed(2)}
          </div>
        </div>

        {/* Barcode Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-surface-elevated p-3 rounded-lg border border-white/[0.08]">
          <div>
            <span className="text-zinc-400 block mb-0.5">Barcode (EAN-13)</span>
            <div className="flex items-center gap-1.5 font-mono font-semibold text-zinc-200">
              <span>{product.barcode || "Not generated"}</span>
              {product.barcode && (
                <button
                  type="button"
                  onClick={handleCopyBarcode}
                  className="text-zinc-400 hover:text-zinc-200 p-0.5"
                  title="Copy Barcode"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">SKU Code</span>
            <span className="font-mono font-semibold text-zinc-200">{product.sku}</span>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">HSN/SAC Code</span>
            <span className="font-mono text-zinc-300">{product.hsn_code || "—"}</span>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">Selling Price</span>
            <span className="font-semibold text-emerald-400">₹{parseFloat(product.selling_price).toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPng}
              disabled={isExporting || !barcodeValue}
              className="text-xs h-8 gap-1.5 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
            >
              <Download className="h-3.5 w-3.5" />
              Download PNG
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSvg}
              disabled={!svgContent}
              className="text-xs h-8 gap-1.5 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
            >
              <FileCode className="h-3.5 w-3.5" />
              Download SVG
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              className="text-xs h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Barcode
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
