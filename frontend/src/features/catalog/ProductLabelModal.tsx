import React, { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { NumericInput } from "@/components/ui/numeric-input"
import { Printer } from "lucide-react"
import { generateBarcodeSvg } from "@/lib/barcode"
import { Product } from "./api"

interface ProductLabelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

export const ProductLabelModal: React.FC<ProductLabelModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  const [labelSize, setLabelSize] = useState<"standard" | "compact" | "dual">("standard")
  const [copies, setCopies] = useState("1")
  const [qrDataUrl, setQrDataUrl] = useState("")

  const barcodeValue = product?.barcode || product?.sku || ""

  // Generate safe public QR code data URL
  useEffect(() => {
    if (!open || !product) {
      setQrDataUrl("")
      return
    }

    const payload = JSON.stringify({
      app: "CoreERP",
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      price: product.selling_price,
    })

    QRCode.toDataURL(payload, {
      width: 140,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("Label QR generation error:", err))
  }, [open, product])

  // Barcode SVG
  const barcodeSvg = useMemo(() => {
    if (!barcodeValue) return ""
    return generateBarcodeSvg(barcodeValue, {
      height: labelSize === "compact" ? 42 : 55,
      moduleWidth: labelSize === "compact" ? 1.6 : 2.0,
      includeText: true,
      barColor: "#000000",
      textColor: "#000000",
      backgroundColor: "#ffffff",
    })
  }, [barcodeValue, labelSize])

  if (!product) return null

  const copiesCount = Math.max(1, Math.min(100, parseInt(copies, 10) || 1))

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-surface border-white/[0.14] text-zinc-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-100">
                Print Product Labels
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Thermal & standard printer-ready product barcode labels
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Configuration Controls */}
        <div className="grid grid-cols-2 gap-4 py-2 border-b border-white/[0.08]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300">Label Format</label>
            <Select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as any)}
              className="h-8 text-xs bg-surface-elevated border-white/[0.14]"
            >
              <option value="standard">Standard Shelf Label (Barcode + QR + Price)</option>
              <option value="compact">Compact 50mm x 25mm (Thermal Barcode)</option>
              <option value="dual">Dual Barcode & QR Sticker</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300">Number of Copies</label>
            <NumericInput
              value={copies}
              onChange={(val) => setCopies(val)}
              maxDecimals={0}
              allowNegative={false}
              max="100"
              className="h-8 text-xs bg-surface-elevated border-white/[0.14]"
              placeholder="e.g. 1"
            />
          </div>
        </div>

        {/* Live Preview Container (Also Target of Clean Print) */}
        <div className="py-2">
          <div className="text-xs font-semibold text-zinc-400 mb-2 flex items-center justify-between">
            <span>Print Preview ({copiesCount} {copiesCount === 1 ? "label" : "labels"})</span>
            <span className="text-[11px] text-zinc-500 font-mono">Isolated print layout</span>
          </div>

          <div
            id="printable-product-label"
            className="p-4 bg-zinc-950/40 rounded-xl border border-white/[0.08] flex flex-wrap gap-4 justify-center max-h-[380px] overflow-y-auto"
          >
            {Array.from({ length: copiesCount }).map((_, index) => (
              <div
                key={index}
                className={`bg-white text-zinc-900 rounded-md border border-zinc-300 shadow-sm print:shadow-none print:border-zinc-400 flex flex-col justify-between overflow-hidden page-break-inside-avoid ${
                  labelSize === "compact"
                    ? "w-[240px] p-2.5 min-h-[110px]"
                    : labelSize === "dual"
                    ? "w-[320px] p-3 min-h-[150px]"
                    : "w-[300px] p-3.5 min-h-[160px]"
                }`}
              >
                {/* Header: Product Name & Category */}
                <div>
                  <div className="font-bold text-xs tracking-tight leading-snug line-clamp-2 text-zinc-950">
                    {product.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono mt-0.5">
                    <span>SKU: {product.sku}</span>
                    {product.hsn_code && <span>HSN: {product.hsn_code}</span>}
                  </div>
                </div>

                {/* Middle: Barcode & QR Layout */}
                <div className="my-1.5 flex items-center justify-between gap-2">
                  <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                    {barcodeSvg && (
                      <div
                        className="scale-90 origin-center max-w-full"
                        dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                      />
                    )}
                  </div>

                  {labelSize !== "compact" && qrDataUrl && (
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <img
                        src={qrDataUrl}
                        alt="QR"
                        className="w-16 h-16 object-contain border border-zinc-200 rounded p-0.5"
                      />
                      <span className="text-[8px] font-mono text-zinc-500 uppercase mt-0.5">SCAN</span>
                    </div>
                  )}
                </div>

                {/* Footer: Price */}
                <div className="border-t border-zinc-200 pt-1 flex items-center justify-between">
                  <span className="text-[9px] font-medium text-zinc-500 uppercase">CoreERP Retail</span>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-600 font-medium mr-1">MRP / Price:</span>
                    <span className="font-bold text-xs font-mono text-zinc-950">
                      ₹{parseFloat(product.selling_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Print Stylesheet Injection */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-product-label, #printable-product-label * {
                visibility: visible !important;
              }
              #printable-product-label {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
                border: none !important;
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 12px !important;
                justify-content: flex-start !important;
              }
              .page-break-inside-avoid {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          `
        }} />

        <DialogFooter className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 border-white/[0.14] text-zinc-300 hover:bg-white/[0.06]"
          >
            Close
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="text-xs h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
          >
            <Printer className="h-3.5 w-3.5" />
            Print {copiesCount} {copiesCount === 1 ? "Label" : "Labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
