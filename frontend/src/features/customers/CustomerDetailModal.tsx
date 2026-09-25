import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Mail, Phone, MapPin, Calendar, ShoppingBag, Receipt } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { customersApi } from "./api"

interface CustomerDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string | null
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  open,
  onOpenChange,
  customerId,
}) => {
  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: () => (customerId ? customersApi.getCustomer(customerId) : null),
    enabled: !!customerId && open,
  })

  if (!customerId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4 max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-[#F5F5F7]">{customer?.name || "Customer Profile"}</DialogTitle>
            {customer && (
              <Badge variant={customer.is_active ? "default" : "destructive"}>
                {customer.is_active ? "Active Client" : "Deactivated"}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-[#94949C]">
            Client details, contact information, and aggregated POS order history.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !customer ? (
          <div className="py-12 text-center text-sm text-[#94949C]">Loading customer profile...</div>
        ) : (
          <div className="space-y-4">
            {/* Contact details grid */}
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#0A0A0C] border border-white/[0.14] rounded-xl text-xs text-[#C4C4C8]">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#94949C] shrink-0" />
                <span className="truncate font-medium text-[#F5F5F7]">{customer.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#94949C] shrink-0" />
                <span>{customer.phone || "No phone provided"}</span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <MapPin className="h-4 w-4 text-[#94949C] shrink-0" />
                <span>{customer.address || "No address on file"}</span>
              </div>
              <div className="flex items-center gap-2 col-span-2 text-[11px] text-[#94949C]">
                <Calendar className="h-3.5 w-3.5" />
                <span>Customer since {new Date(customer.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Purchase History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#F5F5F7] flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  Purchase History ({customer.purchases?.length || 0})
                </h4>
                <span className="text-xs text-[#94949C]">Phase 6 aggregated sales</span>
              </div>

              <div className="border border-white/[0.14] rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Total (₹)</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!customer.purchases || customer.purchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-xs text-[#94949C]">
                          <Receipt className="h-6 w-6 mx-auto mb-1 text-[#94949C]/60" />
                          No past purchases recorded for this customer yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      customer.purchases.map((sale) => (
                        <TableRow key={sale.sale_id} className="text-xs">
                          <TableCell className="font-mono font-medium text-[#F5F5F7]">
                            {sale.invoice_number}
                          </TableCell>
                          <TableCell className="text-[#94949C]">
                            {new Date(sale.sale_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="uppercase text-[11px] font-medium text-[#C4C4C8]">
                            {sale.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-[#F5F5F7]">
                            ₹{parseFloat(sale.total_amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={sale.status === "completed" ? "outline" : "destructive"}
                              className="text-[10px]"
                            >
                              {sale.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}
