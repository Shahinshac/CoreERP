import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  History,
  Layers,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { inventoryApi } from "@/features/inventory/api"
import { catalogApi, Product } from "@/features/catalog/api"
import {
  StockOperationDialog,
  StockOperationType,
} from "@/features/inventory/StockOperationDialog"

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState("movements")

  // Movement history filters
  const [selectedProductId, setSelectedProductId] = useState("")
  const [movementType, setMovementType] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [page, setPage] = useState(1)

  // Quick Stock Operation dialog state
  const [stockOpOpen, setStockOpOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [stockOpType, setStockOpType] = useState<StockOperationType>("in")

  // Products for dropdown filter
  const { data: products = [] } = useQuery({
    queryKey: ["all-products-inventory"],
    queryFn: () => catalogApi.getProducts(),
  })

  // Movements query
  const {
    data: movementsData,
    isLoading: movementsLoading,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: [
      "stock-movements",
      selectedProductId,
      movementType,
      startDate,
      endDate,
      page,
    ],
    queryFn: () =>
      inventoryApi.getMovements({
        product_id: selectedProductId || undefined,
        movement_type: movementType || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: 15,
      }),
  })

  // Low stock query
  const {
    data: lowStockProducts = [],
    isLoading: lowStockLoading,
    refetch: refetchLowStock,
  } = useQuery({
    queryKey: ["low-stock-products"],
    queryFn: inventoryApi.getLowStock,
  })

  // Valuation query
  const {
    data: valuationData,
    isLoading: valuationLoading,
    refetch: refetchValuation,
  } = useQuery({
    queryKey: ["inventory-valuation"],
    queryFn: inventoryApi.getValuation,
  })

  const handleOpenStockOp = (prod: Product, type: StockOperationType) => {
    setSelectedProduct(prod)
    setStockOpType(type)
    setStockOpOpen(true)
  }

  const handleRefreshAll = () => {
    refetchMovements()
    refetchLowStock()
    refetchValuation()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventory Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Append-only stock movements, low-stock alerts, and real-time inventory valuation.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Ledger
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-5 border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Total Inventory Valuation
            </div>
            <div className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
              ₹{valuationData ? parseFloat(valuationData.total_valuation).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Across {valuationData?.total_items_count || 0} active catalog items
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Low Stock Warnings
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">
              {lowStockProducts.length}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Items at or below safety threshold
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Audit Trail Entries
            </div>
            <div className="text-2xl font-bold text-primary mt-1 font-mono">
              {movementsData?.total || 0}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">Immutable stock movement logs</div>
          </div>
          <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-xl">
            <History className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-surface-elevated border border-white/[0.14] p-1 rounded-xl">
          <TabsTrigger value="movements" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            Movement History
          </TabsTrigger>
          <TabsTrigger value="lowstock" className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Low Stock Alerts ({lowStockProducts.length})
          </TabsTrigger>
          <TabsTrigger value="valuation" className="flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            Valuation Breakdown
          </TabsTrigger>
        </TabsList>

        {/* ==========================================
            TAB 1: MOVEMENT HISTORY
        ========================================== */}
        <TabsContent value="movements" className="space-y-4">
          {/* Filters */}
          <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Select
                value={movementType}
                onChange={(e) => {
                  setMovementType(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Movement Types</option>
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
                <option value="adjustment">Stock Adjustment</option>
                <option value="transfer">Transfer</option>
              </Select>
            </div>

            <div className="relative">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(1)
                }}
                className="w-full"
                placeholder="From Date"
              />
            </div>

            <div className="relative">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(1)
                }}
                className="w-full"
                placeholder="To Date"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Movement Type</TableHead>
                  <TableHead className="text-right">Quantity Delta</TableHead>
                  <TableHead>Reference / Reason</TableHead>
                  <TableHead>Operator</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                      Loading audit ledger...
                    </TableCell>
                  </TableRow>
                ) : !movementsData?.items || movementsData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                      No stock movements recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  movementsData.items.map((m) => {
                    const isPositive = parseFloat(m.quantity) > 0
                    return (
                      <TableRow key={m.id} className="hover:bg-white/[0.04] transition-colors">
                        <TableCell className="text-xs text-zinc-400 font-mono">
                          {new Date(m.created_at).toLocaleString()}
                        </TableCell>

                        <TableCell>
                          <div className="font-semibold text-zinc-100">
                            {m.product_name || "Unknown Product"}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono">
                            SKU: {m.product_sku || "—"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              m.movement_type === "in"
                                ? "default"
                                : m.movement_type === "out"
                                ? "destructive"
                                : "outline"
                            }
                            className="capitalize text-xs"
                          >
                            {m.movement_type}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold">
                          <span
                            className={
                              isPositive
                                ? "text-emerald-400"
                                : parseFloat(m.quantity) < 0
                                ? "text-rose-400"
                                : "text-zinc-300"
                            }
                          >
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="text-xs font-medium text-zinc-200">
                            {m.reference_type}
                          </div>
                          {m.notes && (
                            <div className="text-xs text-zinc-400 italic mt-0.5">{m.notes}</div>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-zinc-400 font-mono">
                          {m.author_email || "System"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {movementsData && movementsData.total_pages > 1 && (
              <div className="p-4 border-t border-white/[0.14] flex items-center justify-between text-xs text-zinc-400">
                <div>
                  Page <span className="font-bold text-zinc-100">{movementsData.page}</span> of{" "}
                  <span className="font-bold text-zinc-100">{movementsData.total_pages}</span> (
                  {movementsData.total} total records)
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={movementsData.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(movementsData.total_pages, p + 1))}
                    disabled={movementsData.page >= movementsData.total_pages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ==========================================
            TAB 2: LOW STOCK ALERTS
        ========================================== */}
        <TabsContent value="lowstock" className="space-y-4">
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Current Stock</TableHead>
                  <TableHead className="text-center">Min Threshold</TableHead>
                  <TableHead className="text-right">Unit Purchase Price</TableHead>
                  <TableHead className="text-right">Quick Replenish</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                      Checking stock levels...
                    </TableCell>
                  </TableRow>
                ) : lowStockProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-emerald-400 font-medium">
                      All products currently meet or exceed minimum stock safety thresholds.
                    </TableCell>
                  </TableRow>
                ) : (
                  lowStockProducts.map((p) => (
                    <TableRow key={p.id} className="hover:bg-white/[0.04] transition-colors">
                      <TableCell>
                        <div className="font-semibold text-zinc-100">{p.name}</div>
                        <div className="text-xs text-zinc-400 font-mono">SKU: {p.sku}</div>
                      </TableCell>

                      <TableCell className="text-xs text-zinc-300">
                        {p.category?.name || "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 text-xs">
                          {p.current_stock} {p.unit}
                        </span>
                      </TableCell>

                      <TableCell className="text-center font-mono text-xs text-zinc-400">
                        {p.min_stock} {p.unit}
                      </TableCell>

                      <TableCell className="text-right font-mono text-zinc-300 text-sm">
                        ₹{parseFloat(p.purchase_price).toFixed(2)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleOpenStockOp(p, "in")}
                          className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
                          Stock In
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ==========================================
            TAB 3: VALUATION BREAKDOWN
        ========================================== */}
        <TabsContent value="valuation" className="space-y-6">
          {/* By Category */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none p-5 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-100">Valuation by Category</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {valuationData?.by_category.map((cat) => (
                <div
                  key={cat.category_id}
                  className="p-4 rounded-xl bg-surface-elevated border border-white/[0.10] flex flex-col justify-between"
                >
                  <div>
                    <div className="text-sm font-bold text-zinc-100">{cat.category_name}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Total Units: <span className="font-mono font-medium text-zinc-300">{cat.total_quantity}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/[0.08]">
                    <div className="text-xs text-zinc-400">Stock Valuation</div>
                    <div className="text-lg font-bold text-zinc-100 font-mono">
                      ₹{parseFloat(cat.total_valuation).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product Valuation Table */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            <div className="p-4 border-b border-white/[0.14]">
              <h3 className="text-base font-semibold text-zinc-100">Valuation by SKU</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Unit Cost (₹)</TableHead>
                  <TableHead className="text-center">Stock on Hand</TableHead>
                  <TableHead className="text-right">Total Valuation (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuationLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                      Computing valuation metrics...
                    </TableCell>
                  </TableRow>
                ) : !valuationData?.by_product || valuationData.by_product.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                      No products available for valuation.
                    </TableCell>
                  </TableRow>
                ) : (
                  valuationData.by_product.map((item) => (
                    <TableRow key={item.product_id} className="hover:bg-white/[0.04] transition-colors">
                      <TableCell className="font-semibold text-zinc-100">
                        {item.product_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">
                        {item.sku}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-300">
                        ₹{parseFloat(item.purchase_price).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-zinc-200">
                        {item.current_stock}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-400">
                        ₹{parseFloat(item.valuation).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Stock Operation Dialog */}
      <StockOperationDialog
        open={stockOpOpen}
        onOpenChange={setStockOpOpen}
        product={selectedProduct}
        initialType={stockOpType}
        onSuccess={handleRefreshAll}
      />
    </div>
  )
}
export default InventoryPage
