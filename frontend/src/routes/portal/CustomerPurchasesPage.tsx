import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  ShoppingBag,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  CreditCard,
  Package,
} from "lucide-react"
import { portalApi } from "@/features/portal/api"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export const CustomerPurchasesPage: React.FC = () => {
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["portal", "purchases"],
    queryFn: portalApi.getPurchases,
  })

  const filtered = purchases.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.invoice_number.toLowerCase().includes(q) ||
      p.items.some((item) =>
        item.product_name.toLowerCase().includes(q) || item.product_sku.toLowerCase().includes(q)
      )
    )
  })

  const toggleExpand = (id: string) => {
    setExpandedId((curr) => (curr === id ? null : id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-6 shadow-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Purchase History</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Review all your past orders, line items, and transaction receipts.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-card border border-white/[0.08] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-zinc-200">No purchases found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No purchases match your search term." : "You have not made any purchases yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const isExpanded = expandedId === order.id
            const orderDate = new Date(order.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })

            return (
              <div
                key={order.id}
                className="bg-card border border-white/[0.08] rounded-xl overflow-hidden shadow-none transition hover:border-white/20"
              >
                <div
                  onClick={() => toggleExpand(order.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">{order.invoice_number}</span>
                        <Badge
                          variant={order.status === "completed" ? "success" : "secondary"}
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {orderDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3.5 w-3.5" />
                          {order.payment_method.toUpperCase()}
                        </span>
                        <span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-white/[0.08] sm:border-0 pt-3 sm:pt-0">
                    <div className="text-right">
                      <div className="text-lg font-bold text-zinc-100 font-mono">
                        ₹{Number(order.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Tax: ₹{Number(order.tax_amount).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-muted-foreground">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Line Items */}
                {isExpanded && (
                  <div className="border-t border-white/[0.08] bg-white/[0.02] p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Purchased Items
                      </h4>
                      <Link
                        to="/portal/invoices"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Invoices
                      </Link>
                    </div>

                    <div className="border border-white/[0.08] rounded-lg bg-[#0A0A0B] overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/[0.02] border-b border-white/[0.08] text-muted-foreground font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Item</th>
                            <th className="py-2.5 px-3">SKU</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3 text-right">Rate</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {order.items.map((item) => (
                            <tr key={item.id} className="hover:bg-white/[0.02]">
                              <td className="py-2.5 px-3 font-medium text-zinc-200">
                                {item.product_name}
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground font-mono">
                                {item.product_sku}
                              </td>
                              <td className="py-2.5 px-3 text-right text-zinc-300">
                                {Number(item.quantity).toFixed(0)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-zinc-300">
                                ₹{Number(item.unit_price).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-zinc-100">
                                ₹{Number(item.total_amount).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CustomerPurchasesPage
