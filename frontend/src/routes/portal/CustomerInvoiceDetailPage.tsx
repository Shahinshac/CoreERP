import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowLeft,
  Download,
  Building2,
  UserCheck,
  Calendar,
  AlertCircle,
  ShieldCheck,
} from "lucide-react"
import { portalApi } from "@/features/portal/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const CustomerInvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [downloading, setDownloading] = useState(false)

  const {
    data: invoice,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["portal", "invoice", id],
    queryFn: () => portalApi.getInvoice(id!),
    enabled: Boolean(id),
  })

  const handleDownload = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      await portalApi.downloadInvoicePdf(invoice.id, invoice.invoice_number)
      toast.success("Invoice PDF downloaded successfully")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed"
      toast.error(`Download failed: ${msg}`)
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="h-10 w-32 bg-white/[0.06] rounded animate-pulse" />
        <div className="h-96 bg-[#0C0C0E] border border-white/[0.14] rounded-xl animate-pulse" />
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="max-w-xl mx-auto my-12">
        <Card className="border-rose-500/30 bg-rose-500/10">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <h2 className="text-lg font-bold text-[#F5F5F7]">Invoice Unavailable</h2>
            <p className="text-sm text-[#94949C]">
              {error instanceof Error
                ? error.message
                : "The requested tax invoice could not be loaded or you do not have permission to view it."}
            </p>
            <Link to="/portal/invoices">
              <Button variant="outline" size="sm" className="mt-2">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Invoices
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isInterstate = invoice.is_inter_state

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/portal/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#94949C] hover:text-[#F5F5F7]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="bg-primary hover:bg-primary/90 text-white font-medium"
        >
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Generating PDF..." : "Download Official PDF"}
        </Button>
      </div>

      {/* Main Invoice Card */}
      <div className="bg-[#0C0C0E] border border-white/[0.14] rounded-xl p-6 sm:p-8 shadow-none space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                Tax Invoice (Form GST INV-1)
              </span>
              <Badge
                variant={
                  invoice.payment_status === "paid"
                    ? "success"
                    : invoice.payment_status === "partial"
                    ? "warning"
                    : "destructive"
                }
              >
                {invoice.payment_status.toUpperCase()}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-100 mt-2 font-mono">
              {invoice.invoice_number}
            </h1>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Date: {invoice.invoice_date}
              </span>
              <span>Financial Year: {invoice.financial_year}</span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-muted-foreground block uppercase tracking-wider font-medium">
              Place of Supply
            </span>
            <span className="font-semibold text-zinc-200 text-sm">{invoice.place_of_supply}</span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              {isInterstate ? "Inter-State (IGST 100%)" : "Intra-State (CGST 50% + SGST 50%)"}
            </span>
          </div>
        </div>

        {/* Parties (Seller & Buyer) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-elevated/40 p-5 rounded-xl border border-white/[0.08]">
          {/* Seller */}
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-bold text-zinc-100 text-sm pb-1">
              <Building2 className="h-4 w-4 text-primary" />
              Seller (Supplier)
            </div>
            <p className="font-semibold text-zinc-200">{invoice.seller_name}</p>
            <p>
              <span className="font-medium text-zinc-300">GSTIN:</span> {invoice.seller_gstin}
            </p>
            <p>
              <span className="font-medium text-zinc-300">State:</span> {invoice.seller_state}
            </p>
            {invoice.seller_address && <p>{invoice.seller_address}</p>}
            {invoice.seller_phone && <p>Tel: {invoice.seller_phone}</p>}
          </div>

          {/* Buyer */}
          <div className="space-y-1.5 text-xs text-muted-foreground border-t sm:border-t-0 sm:border-l border-white/[0.08] sm:pl-6 pt-4 sm:pt-0">
            <div className="flex items-center gap-1.5 font-bold text-zinc-100 text-sm pb-1">
              <UserCheck className="h-4 w-4 text-primary" />
              Buyer (Recipient)
            </div>
            <p className="font-semibold text-zinc-200">{invoice.buyer_name}</p>
            {invoice.buyer_gstin ? (
              <p>
                <span className="font-medium text-zinc-300">GSTIN:</span> {invoice.buyer_gstin}
              </p>
            ) : (
              <p className="text-muted-foreground italic">Unregistered Consumer (B2C)</p>
            )}
            <p>
              <span className="font-medium text-zinc-300">State:</span> {invoice.buyer_state}
            </p>
            {invoice.buyer_address && <p>{invoice.buyer_address}</p>}
            {invoice.buyer_phone && <p>Tel: {invoice.buyer_phone}</p>}
          </div>
        </div>

        {/* Items Table */}
        <div className="border border-white/[0.08] rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.02] border-b border-white/[0.08] text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5">#</th>
                <th className="py-3 px-3.5">Description</th>
                <th className="py-3 px-3.5">HSN</th>
                <th className="py-3 px-3.5 text-right">Qty</th>
                <th className="py-3 px-3.5 text-right">Unit Rate</th>
                <th className="py-3 px-3.5 text-right">Taxable</th>
                <th className="py-3 px-3.5 text-right">GST %</th>
                <th className="py-3 px-3.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3.5 text-muted-foreground font-mono">{idx + 1}</td>
                  <td className="py-3 px-3.5">
                    <span className="font-medium text-zinc-200 block">{item.product_name}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{item.product_sku}</span>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-muted-foreground">{item.hsn_code || "—"}</td>
                  <td className="py-3 px-3.5 text-right font-mono text-zinc-300">
                    {Number(item.quantity).toFixed(0)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-zinc-300">
                    ₹{Number(item.unit_price).toFixed(2)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-zinc-300">
                    ₹{Number(item.taxable_value).toFixed(2)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-muted-foreground">
                    {Number(item.gst_rate).toFixed(0)}%
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-semibold text-zinc-100">
                    ₹{Number(item.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculation Totals */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-white/[0.08] pt-6">
          <div className="text-xs text-muted-foreground max-w-sm space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Statutory GST Compliance
            </div>
            <p>
              This is a legally compliant Indian GST tax invoice generated in accordance with Rule 46 of
              CGST Rules, 2017.
            </p>
          </div>

          <div className="w-full sm:w-72 space-y-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable Value:</span>
              <span className="font-mono text-zinc-200">
                ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {isInterstate ? (
              <div className="flex justify-between text-muted-foreground">
                <span>IGST:</span>
                <span className="font-mono text-zinc-200">₹{Number(invoice.igst_amount).toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>CGST:</span>
                  <span className="font-mono text-zinc-200">₹{Number(invoice.cgst_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>SGST:</span>
                  <span className="font-mono text-zinc-200">₹{Number(invoice.sgst_amount).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-muted-foreground border-t border-white/[0.08] pt-1.5">
              <span>Total Tax:</span>
              <span className="font-mono text-zinc-200">₹{Number(invoice.total_tax).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-100 border-t border-white/[0.08] pt-2">
              <span>Grand Total:</span>
              <span className="font-mono text-primary font-bold">
                ₹{Number(invoice.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* EMI Financing Callout */}
        {invoice.emi_plan && (
          <div className="border border-sky-500/30 bg-sky-500/10 rounded-xl p-4 space-y-3 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Calendar className="h-4 w-4" />
                Financed via Consumer Installments (EMI)
              </div>
              <Link to="/portal/emi">
                <Button size="sm" variant="outline" className="h-8 text-xs border-sky-500/30 text-sky-300 hover:bg-sky-500/20">
                  View EMI & Pay Installments →
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Financed Amount</span>
                <span className="font-mono font-bold text-zinc-100 text-sm">₹{Number(invoice.emi_plan.total_financed).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Down Payment</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">₹{Number(invoice.emi_plan.down_payment).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Monthly EMI</span>
                <span className="font-mono font-bold text-sky-300 text-sm">₹{Number(invoice.emi_plan.installment_amount).toFixed(2)}/mo</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Tenure & Status</span>
                <span className="font-medium text-zinc-200">{invoice.emi_plan.number_of_installments} Months • <Badge variant="outline" className="text-[10px] uppercase text-sky-400 border-sky-400/40">{invoice.emi_plan.status}</Badge></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CustomerInvoiceDetailPage
