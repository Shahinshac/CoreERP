import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ShieldCheck,
  Search,
  Plus,
  Calendar,
  User,
  Package,
} from "lucide-react"
import { toast } from "sonner"
import { staffSupportApi, WarrantyCreatePayload } from "@/features/support/api"
import { catalogApi, Product } from "@/features/catalog/api"
import { customersApi, Customer } from "@/features/customers/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const WarrantiesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [claimWarrantyId, setClaimWarrantyId] = useState<string | null>(null)
  const [claimNotes, setClaimNotes] = useState("")

  // Form state for registration
  const [newWarranty, setNewWarranty] = useState<WarrantyCreatePayload>({
    product_id: "",
    customer_id: "",
    serial_number: "",
    purchase_date: new Date().toISOString().split("T")[0],
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0],
  })

  // Queries
  const { data: warranties = [], isLoading } = useQuery({
    queryKey: ["staff", "warranties", statusFilter],
    queryFn: () =>
      staffSupportApi.getWarranties({
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  })

  const { data: productsData = [] } = useQuery<Product[]>({
    queryKey: ["catalog", "products"],
    queryFn: () => catalogApi.getProducts(),
    enabled: isRegisterOpen,
  })

  const { data: customersData = [] } = useQuery<Customer[]>({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.getCustomers(),
    enabled: isRegisterOpen,
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: staffSupportApi.createWarranty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "warranties"] })
      toast.success("Warranty coverage registered successfully.")
      setIsRegisterOpen(false)
      setNewWarranty({
        product_id: "",
        customer_id: "",
        serial_number: "",
        purchase_date: new Date().toISOString().split("T")[0],
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0],
      })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to register warranty.")
    },
  })

  const claimMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      staffSupportApi.claimWarranty(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "warranties"] })
      toast.success("Warranty claim recorded successfully.")
      setClaimWarrantyId(null)
      setClaimNotes("")
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to process warranty claim.")
    },
  })

  const filteredWarranties = warranties.filter((w) => {
    const s = search.toLowerCase()
    return (
      (w.serial_number && w.serial_number.toLowerCase().includes(s)) ||
      (w.product_name && w.product_name.toLowerCase().includes(s)) ||
      (w.customer_name && w.customer_name.toLowerCase().includes(s))
    )
  })

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
      case "expired":
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Expired</Badge>
      case "claimed":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Claimed</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-500" />
            Warranty Registry & Lookup
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track customer product warranties, validity dates, serial numbers, and claims.
          </p>
        </div>
        <Button onClick={() => setIsRegisterOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Register Warranty
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 justify-between bg-card border border-white/[0.14] rounded-xl p-4 shadow-none">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial no, product, customer..."
            className="pl-9 bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {["all", "active", "expired", "claimed"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className={`capitalize text-xs ${
                statusFilter === status
                  ? "bg-primary text-white"
                  : "border-white/[0.16] text-zinc-300 hover:bg-[#18181C]"
              }`}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Warranties Table */}
      <div className="bg-card border border-white/[0.14] rounded-xl shadow-none overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-zinc-400 text-sm flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            Loading warranties...
          </div>
        ) : filteredWarranties.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-zinc-500" />
            No warranty records found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.08] text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Serial No</th>
                  <th className="py-3 px-4">Validity Period</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {filteredWarranties.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.04] transition">
                    <td className="py-3.5 px-4 font-medium text-zinc-100">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span>{w.product_name || "Product"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span>{w.customer_name || "Customer"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-zinc-200">
                      {w.serial_number || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {w.start_date} to {w.end_date}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">{getStatusBadge(w.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      {!w.is_claimed && w.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setClaimWarrantyId(w.id)}
                          className="text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
                        >
                          Claim
                        </Button>
                      )}
                      {w.is_claimed && (
                        <span className="text-xs text-zinc-500 italic">
                          Claimed {w.claimed_at ? new Date(w.claimed_at).toLocaleDateString() : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Warranty Modal */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-lg border-white/[0.14] bg-[#0C0C0E]">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Register New Product Warranty</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Assign warranty coverage to a customer for an eligible product.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newWarranty.product_id || !newWarranty.customer_id) {
                toast.error("Please select both product and customer.")
                return
              }
              createMutation.mutate(newWarranty)
            }}
            className="space-y-4 py-2"
          >
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Select Product *
              </label>
              <select
                className="w-full bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60 [&>option]:bg-[#0C0C0E]"
                value={newWarranty.product_id}
                onChange={(e) => setNewWarranty({ ...newWarranty, product_id: e.target.value })}
                required
              >
                <option value="">-- Choose Product --</option>
                {productsData.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Select Customer *
              </label>
              <select
                className="w-full bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60 [&>option]:bg-[#0C0C0E]"
                value={newWarranty.customer_id}
                onChange={(e) => setNewWarranty({ ...newWarranty, customer_id: e.target.value })}
                required
              >
                <option value="">-- Choose Customer --</option>
                {customersData.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone || c.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Device Serial Number
              </label>
              <Input
                placeholder="e.g. SN-8921-X9"
                value={newWarranty.serial_number || ""}
                onChange={(e) => setNewWarranty({ ...newWarranty, serial_number: e.target.value })}
                className="bg-[#0A0A0C] border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={newWarranty.start_date}
                  onChange={(e) => setNewWarranty({ ...newWarranty, start_date: e.target.value })}
                  required
                  className="bg-[#0A0A0C] border-white/[0.16] text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  End Date *
                </label>
                <Input
                  type="date"
                  value={newWarranty.end_date}
                  onChange={(e) => setNewWarranty({ ...newWarranty, end_date: e.target.value })}
                  required
                  className="bg-[#0A0A0C] border-white/[0.16] text-zinc-100"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsRegisterOpen(false)} className="border-white/[0.16] text-zinc-200 hover:bg-[#18181C]">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-primary hover:bg-blue-500 text-white font-medium">
                {createMutation.isPending ? "Registering..." : "Save Warranty"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Claim Warranty Modal */}
      <Dialog open={!!claimWarrantyId} onOpenChange={() => setClaimWarrantyId(null)}>
        <DialogContent className="sm:max-w-md border-white/[0.14] bg-[#0C0C0E]">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Process Warranty Claim</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Mark this warranty coverage as claimed. This permanently transitions the warranty status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-medium text-zinc-300 block">
              Claim Notes / Resolution Summary
            </label>
            <textarea
              className="w-full bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 rounded-lg p-3 text-sm focus:outline-none focus:border-primary/60 min-h-[90px] placeholder:text-zinc-500"
              placeholder="e.g. Authorized free parts replacement for defective component."
              value={claimNotes}
              onChange={(e) => setClaimNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimWarrantyId(null)} className="border-white/[0.16] text-zinc-200 hover:bg-[#18181C]">
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={claimMutation.isPending}
              onClick={() => {
                if (claimWarrantyId) {
                  claimMutation.mutate({ id: claimWarrantyId, notes: claimNotes })
                }
              }}
              className="bg-primary hover:bg-blue-500 text-white font-medium"
            >
              {claimMutation.isPending ? "Recording Claim..." : "Confirm Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WarrantiesPage
