import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Eye,
  FileSpreadsheet,
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
import { CsvImportModal } from "@/components/common/CsvImportModal"

export function CustomersPage() {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const q = searchParams.get("search")
    if (q !== null) {
      setSearch(q)
    }
    if (searchParams.get("action") === "new") {
      setSelectedCustomer(null)
      setDialogOpen(true)
    }
  }, [searchParams])

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)

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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Customer Directory</h1>
          <p className="text-sm text-zinc-400">
            Client records, purchase history aggregation, and customer contact management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-2 border-white/[0.14] text-zinc-300 hover:text-white"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Import CSV
          </Button>
          <Button
            onClick={() => {
              setSelectedCustomer(null)
              setDialogOpen(true)
            }}
            className="flex items-center gap-2 bg-primary hover:bg-blue-500 text-white font-medium shadow-none"
          >
            <Plus className="h-4 w-4" />
            Register Customer
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Registered Clients</div>
            <div className="text-xl font-bold text-zinc-100">{customers.length}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-emerald-950/40 text-emerald-400 rounded-lg border border-emerald-500/30">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Active Accounts</div>
            <div className="text-xl font-bold text-emerald-400">
              {customers.filter((c) => c.is_active).length}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-white/[0.04] text-zinc-400 rounded-lg border border-white/[0.10]">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Inactive Accounts</div>
            <div className="text-xl font-bold text-zinc-300">
              {customers.filter((c) => !c.is_active).length}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-9 bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant={activeFilter === undefined ? "default" : "outline"}
            onClick={() => setActiveFilter(undefined)}
            className={`text-xs ${activeFilter === undefined ? "bg-primary text-white" : "border-white/[0.16] text-zinc-300 hover:bg-[#18181C]"}`}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={activeFilter === true ? "default" : "outline"}
            onClick={() => setActiveFilter(true)}
            className={`text-xs ${activeFilter === true ? "bg-primary text-white" : "border-white/[0.16] text-zinc-300 hover:bg-[#18181C]"}`}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={activeFilter === false ? "default" : "outline"}
            onClick={() => setActiveFilter(false)}
            className={`text-xs ${activeFilter === false ? "bg-primary text-white" : "border-white/[0.16] text-zinc-300 hover:bg-[#18181C]"}`}
          >
            Inactive
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            className="h-8 w-8 ml-1 text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.10] bg-white/[0.02]">
              <TableHead className="text-zinc-400">Customer</TableHead>
              <TableHead className="text-zinc-400">Contact</TableHead>
              <TableHead className="text-zinc-400">Address</TableHead>
              <TableHead className="text-center text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id} className="hover:bg-white/[0.04] border-white/[0.08] transition">
                  <TableCell>
                    <div className="font-semibold text-zinc-100">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      ID: <span className="font-mono">{c.id.slice(0, 8)}...</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5 text-zinc-200">
                        <Mail className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{c.email}</span>
                      </div>
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Phone className="h-3.5 w-3.5 text-zinc-500" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-zinc-300 max-w-xs truncate">
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
                        className="h-8 text-xs gap-1 border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
                      >
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        View History
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(c)}
                        className="h-8 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08]"
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

      <CsvImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        title="Import Customers"
        description="Upload a CSV file containing customer contacts and tax details. Rows are pre-validated before committing."
        sampleHeaders={["name", "email", "phone", "address", "gstin", "state"]}
        sampleRows={[
          ["John Doe", "john.doe@example.com", "9876543210", "123 MG Road, Bangalore", "29ABCDE1234F1Z5", "Karnataka"],
        ]}
        onPreview={customersApi.previewImport}
        onConfirm={customersApi.confirmImport}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
export default CustomersPage
