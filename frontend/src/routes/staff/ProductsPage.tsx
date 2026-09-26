import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Boxes,
  Camera,
  Edit,
  FileSpreadsheet,
  Package,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { catalogApi, Product } from "@/features/catalog/api"
import { ProductDialog } from "@/features/catalog/ProductDialog"
import { ProductImageUpload } from "@/features/catalog/ProductImageUpload"
import { CsvImportModal } from "@/components/common/CsvImportModal"
import {
  StockOperationDialog,
  StockOperationType,
} from "@/features/inventory/StockOperationDialog"
import { useAuth } from "@/features/auth/AuthContext"

export function ProductsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const staffUser = user as { email: string; role: string } | null
  const canEdit =
    staffUser?.role === "Super Admin" ||
    staffUser?.role === "Admin" ||
    staffUser?.role === "Manager"

  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("")
  const [lowStockFilter, setLowStockFilter] = useState(false)

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)

  useEffect(() => {
    const q = searchParams.get("search")
    if (q !== null) {
      setSearch(q)
    }
    if (searchParams.get("action") === "new" && canEdit) {
      setSelectedProduct(null)
      setProductDialogOpen(true)
    }
  }, [searchParams, canEdit])

  const [imageUploadOpen, setImageUploadOpen] = useState(false)
  const [productForImage, setProductForImage] = useState<Product | null>(null)

  const [stockOpOpen, setStockOpOpen] = useState(false)
  const [productForStock, setProductForStock] = useState<Product | null>(null)
  const [stockOpType, setStockOpType] = useState<StockOperationType>("in")

  // Queries
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: catalogApi.getCategories,
  })

  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: catalogApi.getBrands,
  })

  const {
    data: products = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["products", selectedCategory, selectedBrand, search, lowStockFilter],
    queryFn: () =>
      catalogApi.getProducts({
        category_id: selectedCategory || undefined,
        brand_id: selectedBrand || undefined,
        search: search.trim() || undefined,
        low_stock_only: lowStockFilter || undefined,
      }),
  })

  const lowStockCount = products.filter(
    (p) => parseFloat(p.current_stock) <= parseFloat(p.min_stock)
  ).length

  const handleEditProduct = (prod: Product) => {
    setSelectedProduct(prod)
    setProductDialogOpen(true)
  }

  const handleOpenStockOp = (prod: Product, type: StockOperationType) => {
    setProductForStock(prod)
    setStockOpType(type)
    setStockOpOpen(true)
  }

  const handleOpenImageUpload = (prod: Product) => {
    setProductForImage(prod)
    setImageUploadOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products & Catalog</h1>
          <p className="text-sm text-slate-500">
            Manage product pricing, SKU registry, and inventory levels with financial precision.
          </p>
        </div>
        {canEdit && (
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
                setSelectedProduct(null)
                setProductDialogOpen(true)
              }}
              className="flex items-center gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-lg">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Total Products</div>
            <div className="text-xl font-bold text-zinc-100">{products.length}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Low Stock SKUs</div>
            <div className="text-xl font-bold text-amber-400">{lowStockCount}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Categories</div>
            <div className="text-xl font-bold text-zinc-100">{categories.length}</div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-white/[0.14] shadow-none flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">Brands</div>
            <div className="text-xl font-bold text-zinc-100">{brands.length}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, barcode..."
              className="pl-9"
            />
          </div>

          <div>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)}>
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={lowStockFilter ? "destructive" : "outline"}
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className="w-full text-xs font-semibold gap-1.5"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowStockFilter ? "Showing Low Stock" : "Filter Low Stock"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              title="Refresh list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead className="text-right">Purchase (₹)</TableHead>
              <TableHead className="text-right">Selling (₹)</TableHead>
              <TableHead className="text-center">Current Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-zinc-400">
                  Loading catalog inventory...
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-zinc-400">
                  No products found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => {
                const isLowStock = parseFloat(p.current_stock) <= parseFloat(p.min_stock)
                const pPrice = parseFloat(p.purchase_price) || 0
                const sPrice = parseFloat(p.selling_price) || 0
                const gRate = parseFloat(p.gst_rate) || 0
                const taxableBase = gRate > 0 ? sPrice / (1 + gRate / 100) : sPrice
                const gstAmt = Math.max(0, sPrice - taxableBase)
                const profit = taxableBase - pPrice
                const marginPct = taxableBase > 0 ? (profit / taxableBase) * 100 : 0

                return (
                  <TableRow key={p.id} className="hover:bg-white/[0.04] transition-colors">
                    <TableCell>
                      <div className="h-10 w-10 rounded-lg bg-surface-elevated border border-white/[0.14] flex items-center justify-center overflow-hidden">
                        {p.image_path ? (
                          <img
                            src={p.image_path}
                            alt={p.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // Fallback on broken URL
                              (e.target as HTMLImageElement).style.display = "none"
                            }}
                          />
                        ) : (
                          <Package className="h-5 w-5 text-zinc-500" />
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-zinc-100">{p.name}</div>
                        {p.is_pinned && (
                          <Badge className="bg-primary/20 text-primary border border-primary/30 text-[10px] px-1 py-0 flex items-center gap-1 font-mono">
                            <Pin className="h-2.5 w-2.5 fill-primary" />
                            Pinned
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 font-mono mt-0.5">
                        <span>SKU: {p.sku}</span>
                        {p.barcode && <span>• Barcode: {p.barcode}</span>}
                        {p.hsn_code && <span className="text-zinc-500">• HSN: {p.hsn_code}</span>}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-medium text-zinc-200">
                          {p.category?.name || "Uncategorized"}
                        </span>
                        <span className="text-zinc-400">{p.brand?.name || "Generic"}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-zinc-300">
                      ₹{pPrice.toFixed(2)}
                    </TableCell>

                    <TableCell className="text-right font-mono">
                      <div className="font-semibold text-zinc-100">
                        ₹{sPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        Base: ₹{taxableBase.toFixed(2)} • GST: ₹{gstAmt.toFixed(2)} ({gRate}%)
                      </div>
                      <div className="mt-1">
                        <span
                          className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            profit >= 0
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          }`}
                        >
                          Profit: {profit >= 0 ? "+" : ""}₹{profit.toFixed(2)} ({marginPct.toFixed(0)}%)
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="inline-flex flex-col items-center">
                        <span
                          className={`font-mono text-sm font-bold ${
                            parseFloat(p.current_stock) < 0
                              ? "text-rose-400"
                              : isLowStock
                              ? "text-amber-400"
                              : "text-zinc-200"
                          }`}
                        >
                          {p.current_stock} {p.unit}
                        </span>
                        {isLowStock && (
                          <Badge variant="destructive" className="text-[10px] py-0 px-1.5 mt-0.5">
                            Low Stock (≤{p.min_stock})
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenStockOp(p, "in")}
                          className="h-8 px-2 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          Stock In
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenStockOp(p, "out")}
                          className="h-8 px-2 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                        >
                          Stock Out
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await catalogApi.toggleProductPin(p.id, !p.is_pinned)
                                  refetch()
                                } catch {
                                  // Error handled
                                }
                              }}
                              className={`h-8 w-8 ${
                                p.is_pinned
                                  ? "text-primary hover:text-primary/80 bg-primary/10"
                                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08]"
                              }`}
                              title={p.is_pinned ? "Unpin from POS quick-picks" : "Pin to POS quick-picks"}
                            >
                              <Pin className={`h-4 w-4 ${p.is_pinned ? "fill-primary" : ""}`} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenImageUpload(p)}
                              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                              title="Upload Photo"
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditProduct(p)}
                              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                              title="Edit Product"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <ProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        product={selectedProduct}
        onSuccess={() => refetch()}
      />

      <ProductImageUpload
        open={imageUploadOpen}
        onOpenChange={setImageUploadOpen}
        product={productForImage}
        onSuccess={() => refetch()}
      />

      <StockOperationDialog
        open={stockOpOpen}
        onOpenChange={setStockOpOpen}
        product={productForStock}
        initialType={stockOpType}
        onSuccess={() => refetch()}
      />

      <CsvImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        title="Import Products"
        description="Upload a CSV file containing products. Rows are pre-validated before committing. No partial/invalid data is ever silently imported."
        sampleHeaders={[
          "name",
          "sku",
          "barcode",
          "hsn_code",
          "category",
          "brand",
          "unit",
          "purchase_price",
          "selling_price",
          "gst_rate",
          "min_stock",
          "is_pinned",
        ]}
        sampleRows={[
          [
            "Ergonomic Chair",
            "CHAIR-ERG-01",
            "8901234567890",
            "9403",
            "Furniture",
            "Generic",
            "pcs",
            "2500.00",
            "3999.00",
            "18.00",
            "5.000",
            "true",
          ],
        ]}
        onPreview={catalogApi.previewImport}
        onConfirm={catalogApi.confirmImport}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
export default ProductsPage
