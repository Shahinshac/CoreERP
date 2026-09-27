import React, { useEffect, useState } from "react"
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
import { Download, FileCode, Printer, QrCode } from "lucide-react"
import { toast } from "sonner"
import { sanitizeFilename } from "@/lib/barcode"
import { Product } from "./api"

interface QrModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

export const QrModal: React.FC<QrModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  const [dataUrl, setDataUrl] = useState<string>("")
  const [svgString, setSvgString] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)

  // Pure public-safe product payload without credentials or secrets
  const qrPayload = product
    ? JSON.stringify({
        app: "CoreERP",
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        price: product.selling_price,
      })
    : ""

  useEffect(() => {
    if (!open || !product || !qrPayload) {
      setDataUrl("")
      setSvgString("")
      return
    }

    let isMounted = true
    setIsGenerating(true)

    Promise.all([
      QRCode.toDataURL(qrPayload, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      }),
      QRCode.toString(qrPayload, {
        type: "svg",
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      }),
    ])
      .then(([pngUrl, svg]) => {
        if (isMounted) {
          setDataUrl(pngUrl)
          setSvgString(svg)
          setIsGenerating(false)
        }
      })
      .catch((err) => {
        console.error("QR Generation Error:", err)
        if (isMounted) {
          setIsGenerating(false)
          toast.error("Failed to generate QR code")
        }
      })

    return () => {
      isMounted = false
    }
  }, [open, product, qrPayload])

  if (!product) return null

  const handleDownloadPng = () => {
    if (!dataUrl) return
    const filename = `${sanitizeFilename(product.name)}-${product.sku}-qr.png`
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success("QR Code PNG downloaded")
  }

  const handleDownloadSvg = () => {
    if (!svgString) return
    const filename = `${sanitizeFilename(product.name)}-${product.sku}-qr.svg`
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("QR Code SVG downloaded")
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-surface border-white/[0.14] text-zinc-100">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-100">
                Product QR Code
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Safe public product reference for mobile and 2D barcode scanners
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Printable QR Container */}
        <div className="p-6 my-2 bg-white rounded-xl shadow-inner border border-zinc-200 flex flex-col items-center justify-center text-center qr-print-target">
          <div className="text-zinc-900 font-bold text-base tracking-tight mb-1 max-w-xs truncate">
            {product.name}
          </div>
          <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500 font-mono">
            <span>SKU: {product.sku}</span>
            {product.barcode && <span>• Barcode: {product.barcode}</span>}
          </div>

          {/* QR Code image */}
          {dataUrl ? (
            <div className="p-2 bg-white border border-zinc-200 rounded-lg shadow-sm">
              <img
                src={dataUrl}
                alt={`QR code for ${product.name}`}
                className="w-48 h-48 object-contain"
              />
            </div>
          ) : (
            <div className="w-48 h-48 bg-zinc-100 rounded-lg flex items-center justify-center text-xs text-zinc-400">
              {isGenerating ? "Generating QR..." : "QR Unavailable"}
            </div>
          )}

          <div className="mt-3 text-xs font-mono font-bold text-zinc-700">
            ₹{parseFloat(product.selling_price).toFixed(2)}
          </div>
        </div>

        {/* Product Details Card */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-surface-elevated p-3 rounded-lg border border-white/[0.08]">
          <div>
            <span className="text-zinc-400 block mb-0.5">SKU</span>
            <span className="font-mono font-semibold text-zinc-200">{product.sku}</span>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">Barcode</span>
            <span className="font-mono text-zinc-200">{product.barcode || "—"}</span>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">HSN/SAC</span>
            <span className="font-mono text-zinc-300">{product.hsn_code || "—"}</span>
          </div>

          <div>
            <span className="text-zinc-400 block mb-0.5">Selling Price</span>
            <span className="font-semibold text-emerald-400">
              ₹{parseFloat(product.selling_price).toFixed(2)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPng}
              disabled={!dataUrl}
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
              disabled={!svgString}
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
              Print QR
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
