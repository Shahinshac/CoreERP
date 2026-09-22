import React, { useEffect, useState } from "react"
import { Check, Copy, QrCode } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { UPIIntentResponse, paymentsApi } from "./api"
import { Invoice } from "@/features/invoicing/api"

interface UPIQRModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice | null
  onRecordPayment: () => void
}

export const UPIQRModal: React.FC<UPIQRModalProps> = ({
  open,
  onOpenChange,
  invoice,
  onRecordPayment,
}) => {
  const [upiData, setUpiData] = useState<UPIIntentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && invoice) {
      setLoading(true)
      paymentsApi
        .getUpiIntent(invoice.id)
        .then((data) => setUpiData(data))
        .catch(() => toast.error("Failed to generate UPI parameters."))
        .finally(() => setLoading(false))
    }
  }, [open, invoice])

  const handleCopyUpi = () => {
    if (!upiData) return
    navigator.clipboard.writeText(upiData.upi_uri)
    setCopied(true)
    toast.success("UPI Intent link copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  // QR Code generated via free public QR server API from the exact UPI URI
  const qrCodeUrl = upiData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        upiData.upi_uri
      )}&margin=10`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4 max-w-sm mx-auto text-center">
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 text-purple-600">
            <QrCode className="h-6 w-6" />
            <DialogTitle className="text-xl">Scan to Pay via UPI</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Zero-cost static UPI QR. Customer can scan with GPay, PhonePe, Paytm, or BHIM.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Generating UPI Intent QR...
          </div>
        ) : upiData && qrCodeUrl ? (
          <div className="space-y-4">
            {/* QR Card */}
            <div className="p-4 bg-white rounded-2xl border-2 border-purple-200 shadow-sm inline-block">
              <img
                src={qrCodeUrl}
                alt="UPI Payment QR Code"
                className="w-48 h-48 mx-auto rounded-lg"
              />
            </div>

            {/* Payment Details */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Payee UPI ID:</span>
                <span className="font-semibold text-slate-800">{upiData.seller_upi_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Payee Name:</span>
                <span className="text-slate-700">{upiData.seller_name}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-sm">
                <span className="text-slate-600 font-sans font-medium">Payable Amount:</span>
                <span className="font-black text-purple-700">₹{parseFloat(upiData.amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyUpi}
                className="flex-1 h-8 text-xs gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied Link" : "Copy UPI Link"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-rose-500">
            Unable to load UPI payment details.
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onRecordPayment()
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
          >
            Mark as Received & Record
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}
