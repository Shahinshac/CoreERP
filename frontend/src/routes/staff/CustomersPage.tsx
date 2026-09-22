import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Eye,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Customer, customersApi } from "@/features/customers/api"
import { CustomerDialog } from "@/features/customers/CustomerDialog"
import { CustomerDetailModal } from "@/features/customers/CustomerDetailModal"

export function CustomersPage() {
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)

  const {
    data: customers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["staff-customers", search, activeFilter],
    queryFn: () =>
      customersApi.getCustomers({
        search: search.trim() || undefined,
        is_active: activeFilter,
      }),
  })

  const handleEdit = (cust: Customer) => {
    setSelectedCustomer(cust)
    setDialogOpen(true)
  }

  const handleViewDetail = (cust: Customer) => {
    setDetailCustomerId(cust.id)
    setDetailModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customer Directory</h1>
          <p className="text-sm text-slate-500">
            Client records, purchase history aggregation, and customer contact management.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedCustomer(null)
            setDialogOpen(true)
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Register Customer
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Registered Clients</div>
            <div className="text-xl font-bold text-slate-900">{customers.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Active Accounts</div>
            <div className="text-xl font-bold text-emerald-600">
              {customers.filter((c) => c.is_active).length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Inactive Accounts</div>
            <div className="text-xl font-bold text-slate-700">
              {customers.filter((c) => !c.is_active).length}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant={activeFilter === undefined ? "default" : "outline"}
            onClick={() => setActiveFilter(undefined)}
            className="text-xs"
          >
            All
          </Button>
          <Button
            size="sm"
            variant={activeFilter === true ? "default" : "outline"}
            onClick={() => setActiveFilter(true)}
            className="text-xs"
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={activeFilter === false ? "default" : "outline"}
            onClick={() => setActiveFilter(false)}
            className="text-xs"
          >
            Inactive
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            className="h-8 w-8 ml-1"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id} className="hover:bg-slate-50/70 transition">
                  <TableCell>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-400">
                      ID: <span className="font-mono">{c.id.slice(0, 8)}...</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{c.email}</span>
                      </div>
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                    {c.address || "—"}
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge variant={c.is_active ? "default" : "destructive"} className="text-xs">
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetail(c)}
                        className="h-8 text-xs gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View History
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(c)}
                        className="h-8 text-xs"
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modals */}
      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={selectedCustomer}
        onSuccess={() => refetch()}
      />

      <CustomerDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        customerId={detailCustomerId}
      />
    </div>
  )
}
export default CustomersPage
