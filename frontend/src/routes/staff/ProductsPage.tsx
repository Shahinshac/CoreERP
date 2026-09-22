import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Boxes,
  Camera,
  Edit,
  Package,
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
import {
  StockOperationDialog,
  StockOperationType,
} from "@/features/inventory/StockOperationDialog"
import { useAuth } from "@/features/auth/AuthContext"

export function ProductsPage() {
  const { user } = useAuth()
  const staffUser = user as { email: string; role: string } | null
  const canEdit =
    staffUser?.role === "Super Admin" ||
    staffUser?.role === "Admin" ||
    staffUser?.role === "Manager"

  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("")
  const [lowStockFilter, setLowStockFilter] = useState(false)

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

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
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Total Products</div>
            <div className="text-xl font-bold text-slate-900">{products.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Low Stock SKUs</div>
            <div className="text-xl font-bold text-amber-600">{lowStockCount}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Categories</div>
            <div className="text-xl font-bold text-slate-900">{categories.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Brands</div>
            <div className="text-xl font-bold text-slate-900">{brands.length}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Loading catalog inventory...
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  No products found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => {
                const isLowStock = parseFloat(p.current_stock) <= parseFloat(p.min_stock)
                return (
                  <TableRow key={p.id} className="hover:bg-slate-50/70 transition">
                    <TableCell>
                      <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
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
                          <Package className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span>SKU: {p.sku}</span>
                        {p.barcode && <span>• Barcode: {p.barcode}</span>}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-medium text-slate-700">
                          {p.category?.name || "Uncategorized"}
                        </span>
                        <span className="text-slate-500">{p.brand?.name || "Generic"}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-slate-700">
                      ₹{parseFloat(p.purchase_price).toFixed(2)}
                    </TableCell>

                    <TableCell className="text-right font-mono font-semibold text-slate-900">
                      ₹{parseFloat(p.selling_price).toFixed(2)}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        GST: {p.gst_rate}%
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="inline-flex flex-col items-center">
                        <span
                          className={`font-mono text-sm font-bold ${
                            parseFloat(p.current_stock) < 0
                              ? "text-rose-600"
                              : isLowStock
                              ? "text-amber-600"
                              : "text-slate-800"
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
                          className="h-8 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          Stock In
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenStockOp(p, "out")}
                          className="h-8 px-2 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          Stock Out
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenImageUpload(p)}
                              className="h-8 w-8 text-slate-500 hover:text-slate-900"
                              title="Upload Photo"
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditProduct(p)}
                              className="h-8 w-8 text-slate-500 hover:text-slate-900"
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
    </div>
  )
}
export default ProductsPage
