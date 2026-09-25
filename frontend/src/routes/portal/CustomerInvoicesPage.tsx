import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  FileText,
  Search,
  Download,
  Eye,
  Calendar,
  AlertCircle,
  FileCheck,
} from "lucide-react"
import { portalApi, PortalInvoiceDetail } from "@/features/portal/api"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const CustomerInvoicesPage: React.FC = () => {
  const [search, setSearch] = useState("")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["portal", "invoices"],
    queryFn: portalApi.getInvoices,
  })

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase()
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.seller_name.toLowerCase().includes(q) ||
      inv.financial_year.toLowerCase().includes(q)
    )
  })

  const handleDownload = async (inv: PortalInvoiceDetail) => {
    setDownloadingId(inv.id)
    try {
      await portalApi.downloadInvoicePdf(inv.id, inv.invoice_number)
      toast.success(`Invoice ${inv.invoice_number} downloaded`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed"
      toast.error(`Download failed: ${msg}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-6 shadow-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Tax Invoices</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Official statutory Indian GST invoices and credit note statements.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Invoices Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card border border-white/[0.08] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-zinc-200">No invoices found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No invoices match your search term." : "No tax invoices generated yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.08] text-muted-foreground font-medium text-xs">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Taxable</th>
                  <th className="py-3 px-4">GST (CGST+SGST / IGST)</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-center">Payment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((inv) => {
                  const isDownloading = downloadingId === inv.id
                  const isInterstate = inv.is_inter_state

                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/portal/invoices/${inv.id}`}
                          className="font-semibold text-primary hover:underline flex items-center gap-1.5"
                        >
                          <FileCheck className="h-4 w-4 text-muted-foreground" />
                          {inv.invoice_number}
                        </Link>
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          FY {inv.financial_year}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-muted-foreground text-xs">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {inv.invoice_date}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-zinc-300">
                        ₹{Number(inv.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                        {isInterstate ? (
                          <span>IGST: ₹{Number(inv.igst_amount).toFixed(2)}</span>
                        ) : (
                          <span>
                            C: ₹{Number(inv.cgst_amount).toFixed(2)} | S: ₹
                            {Number(inv.sgst_amount).toFixed(2)}
                          </span>
                        )}
                        <span className="text-zinc-500 block text-[11px]">
                          Total Tax: ₹{Number(inv.total_tax).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-zinc-100 font-mono">
                        ₹{Number(inv.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={
                            inv.payment_status === "paid"
                              ? "success"
                              : inv.payment_status === "partial"
                              ? "warning"
                              : "destructive"
                          }
                        >
                          {inv.payment_status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/portal/invoices/${inv.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isDownloading}
                            onClick={() => handleDownload(inv)}
                            className="h-8 px-2.5"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            {isDownloading ? "..." : "PDF"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerInvoicesPage
