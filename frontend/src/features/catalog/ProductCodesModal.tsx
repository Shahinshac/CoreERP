import React, { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Barcode,
  Copy,
  Check,
  Download,
  Eye,
  Printer,
  QrCode,
} from "lucide-react"
import { toast } from "sonner"
import {
  generateBarcodeSvg,
  downloadBarcodePng,
  sanitizeFilename,
} from "@/lib/barcode"
import { Product } from "./api"
import { BarcodeModal } from "./BarcodeModal"
import { QrModal } from "./QrModal"
import { ProductLabelModal } from "./ProductLabelModal"

interface ProductCodesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

export const ProductCodesModal: React.FC<ProductCodesModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  const [copiedSku, setCopiedSku] = useState(false)
  const [copiedBarcode, setCopiedBarcode] = useState(false)
  const [barcodeViewerOpen, setBarcodeViewerOpen] = useState(false)
  const [qrViewerOpen, setQrViewerOpen] = useState(false)
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState("")

  const barcodeValue = product?.barcode || product?.sku || ""

  // Generate safe QR code
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
      width: 220,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error(err))
  }, [open, product])

  // Barcode SVG
  const barcodeSvg = useMemo(() => {
    if (!barcodeValue) return ""
    return generateBarcodeSvg(barcodeValue, {
      height: 60,
      moduleWidth: 2.2,
      includeText: true,
      barColor: "#0f172a",
      textColor: "#0f172a",
      backgroundColor: "#ffffff",
    })
  }, [barcodeValue])

  if (!product) return null

  const handleCopy = (text: string, type: "sku" | "barcode") => {
    navigator.clipboard.writeText(text)
    if (type === "sku") {
      setCopiedSku(true)
      setTimeout(() => setCopiedSku(false), 2000)
    } else {
      setCopiedBarcode(true)
      setTimeout(() => setCopiedBarcode(false), 2000)
    }
    toast.success(`${type.toUpperCase()} copied`)
  }

  const handleDownloadBarcode = async () => {
    try {
      const filename = `${sanitizeFilename(product.name)}-${product.sku}-barcode.png`
      await downloadBarcodePng(barcodeValue, filename, {
        productName: product.name,
        sku: product.sku,
        hsn: product.hsn_code || undefined,
        price: product.selling_price,
      })
      toast.success("Barcode PNG downloaded")
    } catch {
      toast.error("Failed to download barcode")
    }
  }

  const handleDownloadQr = () => {
    if (!qrDataUrl) return
    const filename = `${sanitizeFilename(product.name)}-${product.sku}-qr.png`
    const a = document.createElement("a")
    a.href = qrDataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success("QR Code PNG downloaded")
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-surface border-white/[0.14] text-zinc-100">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Barcode className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                    Product Codes & Identification
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400">
                    {product.name}
                  </DialogDescription>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => setLabelModalOpen(true)}
                className="h-8 gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-medium"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Labels
              </Button>
            </div>
          </DialogHeader>

          {/* Identification Overview Badges */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-surface-elevated rounded-xl border border-white/[0.08] text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px] mb-0.5">SKU Code</span>
              <div className="flex items-center gap-1.5 font-mono font-bold text-zinc-100">
                <span>{product.sku}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(product.sku, "sku")}
                  className="text-zinc-400 hover:text-zinc-200"
                  title="Copy SKU"
                >
                  {copiedSku ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-zinc-400 block text-[11px] mb-0.5">Barcode (EAN-13)</span>
              <div className="flex items-center gap-1.5 font-mono font-bold text-zinc-100">
                <span>{product.barcode || "Auto-generated"}</span>
                {product.barcode && (
                  <button
                    type="button"
                    onClick={() => handleCopy(product.barcode!, "barcode")}
                    className="text-zinc-400 hover:text-zinc-200"
                    title="Copy Barcode"
                  >
                    {copiedBarcode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <span className="text-zinc-400 block text-[11px] mb-0.5">HSN/SAC Code</span>
              <div className="font-mono text-zinc-200 font-semibold">
                {product.hsn_code || "Not specified"}
              </div>
            </div>
          </div>

          {/* Cards for Barcode and QR Code */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
            {/* 1. Barcode Section */}
            <div className="bg-surface-elevated rounded-xl border border-white/[0.08] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Barcode className="h-4 w-4 text-primary" />
                    Barcode Image
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-white/[0.14] text-zinc-400">
                    Retail EAN-13
                  </Badge>
                </div>

                <div className="p-3 bg-white rounded-lg border border-zinc-200 flex items-center justify-center my-2 shadow-inner overflow-hidden min-h-[90px]">
                  {barcodeSvg ? (
                    <div
                      className="max-w-full"
                      dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">No barcode</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.08]">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBarcodeViewerOpen(true)}
                  className="flex-1 text-xs h-7 gap-1 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
                >
                  <Eye className="h-3 w-3" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadBarcode}
                  className="flex-1 text-xs h-7 gap-1 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </div>
            </div>

            {/* 2. QR Code Section */}
            <div className="bg-surface-elevated rounded-xl border border-white/[0.08] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <QrCode className="h-4 w-4 text-emerald-400" />
                    QR Code Image
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-white/[0.14] text-zinc-400">
                    Public Safe
                  </Badge>
                </div>

                <div className="p-2 bg-white rounded-lg border border-zinc-200 flex items-center justify-center my-2 shadow-inner min-h-[90px]">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Product QR"
                      className="w-20 h-20 object-contain"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">Generating...</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.08]">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setQrViewerOpen(true)}
                  className="flex-1 text-xs h-7 gap-1 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
                >
                  <Eye className="h-3 w-3" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadQr}
                  className="flex-1 text-xs h-7 gap-1 border-white/[0.14] text-zinc-200 hover:bg-white/[0.06]"
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Child Modals */}
      <BarcodeModal
        open={barcodeViewerOpen}
        onOpenChange={setBarcodeViewerOpen}
        product={product}
      />

      <QrModal
        open={qrViewerOpen}
        onOpenChange={setQrViewerOpen}
        product={product}
      />

      <ProductLabelModal
        open={labelModalOpen}
        onOpenChange={setLabelModalOpen}
        product={product}
      />
    </>
  )
}
