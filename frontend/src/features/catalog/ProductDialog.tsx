import React, { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { NumericInput } from "@/components/ui/numeric-input"
import { Badge } from "@/components/ui/badge"
import { Boxes, Calculator, Check, Loader2, Plus, Tag, X } from "lucide-react"
import { catalogApi, Product } from "./api"

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSuccess: () => void
}

export const ProductDialog: React.FC<ProductDialogProps> = ({
  open,
  onOpenChange,
  product,
  onSuccess,
}) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [hsnCode, setHsnCode] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [unit, setUnit] = useState("pcs")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [gstRate, setGstRate] = useState("18.00")
  const [minStock, setMinStock] = useState("5.000")
  const [isPinned, setIsPinned] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Inline Quick-add category state
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDesc, setNewCategoryDesc] = useState("")
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  // Inline Quick-add brand state
  const [isAddingBrand, setIsAddingBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState("")
  const [isCreatingBrand, setIsCreatingBrand] = useState(false)

  const hasInitializedRef = useRef(false)

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: catalogApi.getCategories,
    enabled: open,
  })

  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: catalogApi.getBrands,
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      hasInitializedRef.current = false
      setIsAddingCategory(false)
      setIsAddingBrand(false)
      return
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      if (product) {
        setName(product.name)
        setSku(product.sku)
        setBarcode(product.barcode || "")
        setHsnCode(product.hsn_code || "")
        setCategoryId(product.category_id)
        setBrandId(product.brand_id)
        setUnit(product.unit)
        setPurchasePrice(product.purchase_price)
        setSellingPrice(product.selling_price)
        setGstRate(product.gst_rate)
        setMinStock(product.min_stock)
        setIsPinned(!!product.is_pinned)
      } else {
        setName("")
        setSku("")
        setBarcode("")
        setHsnCode("")
        setCategoryId(categories[0]?.id || "")
        setBrandId(brands[0]?.id || "")
        setUnit("pcs")
        setPurchasePrice("")
        setSellingPrice("")
        setGstRate("18.00")
        setMinStock("5.000")
        setIsPinned(false)
      }
    } else {
      // Auto-select first item if previously none was available and now loaded
      if (!categoryId && categories.length > 0) {
        setCategoryId(categories[0].id)
      }
      if (!brandId && brands.length > 0) {
        setBrandId(brands[0].id)
      }
    }
  }, [open, product, categories, brands, categoryId, brandId])

  const handleCreateCategoryInline = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!newCategoryName.trim()) return toast.error("Category name is required.")

    setIsCreatingCategory(true)
    try {
      const created = await catalogApi.createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim() || undefined,
      })
      toast.success(`Category "${created.name}" created!`)
      await queryClient.invalidateQueries({ queryKey: ["categories"] })
      setCategoryId(created.id)
      setNewCategoryName("")
      setNewCategoryDesc("")
      setIsAddingCategory(false)
    } catch {
      // Error handled by apiClient
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleCreateBrandInline = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!newBrandName.trim()) return toast.error("Brand name is required.")

    setIsCreatingBrand(true)
    try {
      const created = await catalogApi.createBrand({
        name: newBrandName.trim(),
      })
      toast.success(`Brand "${created.name}" created!`)
      await queryClient.invalidateQueries({ queryKey: ["brands"] })
      setBrandId(created.id)
      setNewBrandName("")
      setIsAddingBrand(false)
    } catch {
      // Error handled by apiClient
    } finally {
      setIsCreatingBrand(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return toast.error("Product name is required.")
    if (!sku.trim()) return toast.error("SKU is required.")
    if (!categoryId) return toast.error("Please select a category.")
    if (!brandId) return toast.error("Please select a brand.")
    if (!purchasePrice.trim()) return toast.error("Purchase price is required.")
    if (!sellingPrice.trim()) return toast.error("Selling price is required.")

    setIsSubmitting(true)
    try {
      if (product) {
        await catalogApi.updateProduct(product.id, {
          name: name.trim(),
          sku: sku.trim(),
          barcode: barcode.trim() || null,
          hsn_code: hsnCode.trim() || null,
          category_id: categoryId,
          brand_id: brandId,
          unit: unit.trim(),
          purchase_price: purchasePrice,
          selling_price: sellingPrice,
          gst_rate: gstRate,
          min_stock: minStock,
          is_pinned: isPinned,
        })
        toast.success("Product updated successfully")
      } else {
        await catalogApi.createProduct({
          name: name.trim(),
          sku: sku.trim(),
          barcode: barcode.trim() || null,
          hsn_code: hsnCode.trim() || null,
          category_id: categoryId,
          brand_id: brandId,
          unit: unit.trim(),
          purchase_price: purchasePrice,
          selling_price: sellingPrice,
          gst_rate: gstRate,
          min_stock: minStock,
          is_pinned: isPinned,
        })
        toast.success("Product created successfully")
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      // Error toasted by apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  const pPrice = parseFloat(purchasePrice) || 0
  const sPrice = parseFloat(sellingPrice) || 0
  const gRate = parseFloat(gstRate) || 0

  // Selling Price is GST-Inclusive Retail MRP
  const taxableBase = gRate > 0 ? sPrice / (1 + gRate / 100) : sPrice
  const gstAmount = Math.max(0, sPrice - taxableBase)
  const halfGst = gstAmount / 2

  // Gross profit is taxable base minus purchase cost
  const netProfit = taxableBase - pPrice
  const profitMargin = taxableBase > 0 ? (netProfit / taxableBase) * 100 : 0
  const markupPct = pPrice > 0 ? (netProfit / pPrice) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-2xl max-h-[90vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Create New Product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Update product pricing, classification, and stock threshold."
              : "Register a new product in the central catalog with strict pricing precision."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="col-span-1 sm:col-span-2 space-y-1">
            <label className="font-medium text-foreground">Product Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ergonomic Office Chair"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-foreground">SKU Code *</label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. CHAIR-BLK-01"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-foreground">Barcode</label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Optional EAN/UPC"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-foreground">HSN / SAC Code</label>
            <Input
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              placeholder="e.g. 9403, 998311"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">Category *</label>
              <button
                type="button"
                onClick={() => setIsAddingCategory((prev) => !prev)}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                {isAddingCategory ? (
                  <>
                    <X className="h-3 w-3" /> Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" /> + Add Category
                  </>
                )}
              </button>
            </div>

            {isAddingCategory ? (
              <div className="p-3 bg-surface-elevated border border-primary/30 rounded-lg space-y-2 mt-1">
                <div className="text-xs font-semibold text-primary flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" /> Quick Add Category
                </div>
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category Name (e.g. Peripherals)"
                  autoFocus
                  className="bg-surface border-white/[0.14] h-8 text-xs"
                />
                <Input
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  placeholder="Optional description"
                  className="bg-surface border-white/[0.14] h-8 text-xs"
                />
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => {
                      setIsAddingCategory(false)
                      setNewCategoryName("")
                      setNewCategoryDesc("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    disabled={isCreatingCategory}
                    onClick={handleCreateCategoryInline}
                  >
                    {isCreatingCategory ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {categories.length === 0 ? "No categories available" : "Select Category"}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {categories.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    No categories found. Click{" "}
                    <button
                      type="button"
                      className="font-semibold underline text-primary"
                      onClick={() => setIsAddingCategory(true)}
                    >
                      + Add Category
                    </button>{" "}
                    to create one.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">Brand *</label>
              <button
                type="button"
                onClick={() => setIsAddingBrand((prev) => !prev)}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                {isAddingBrand ? (
                  <>
                    <X className="h-3 w-3" /> Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" /> + Add Brand
                  </>
                )}
              </button>
            </div>

            {isAddingBrand ? (
              <div className="p-3 bg-surface-elevated border border-primary/30 rounded-lg space-y-2 mt-1">
                <div className="text-xs font-semibold text-primary flex items-center gap-1">
                  <Boxes className="h-3.5 w-3.5" /> Quick Add Brand
                </div>
                <Input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Brand Name (e.g. Logitech)"
                  autoFocus
                  className="bg-surface border-white/[0.14] h-8 text-xs"
                />
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => {
                      setIsAddingBrand(false)
                      setNewBrandName("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    disabled={isCreatingBrand}
                    onClick={handleCreateBrandInline}
                  >
                    {isCreatingBrand ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {brands.length === 0 ? "No brands available" : "Select Brand"}
                  </option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
                {brands.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    No brands found. Click{" "}
                    <button
                      type="button"
                      className="font-semibold underline text-primary"
                      onClick={() => setIsAddingBrand(true)}
                    >
                      + Add Brand
                    </button>{" "}
                    to create one.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">
                Purchase Cost (₹) *
              </label>
            </div>
            <NumericInput
              value={purchasePrice}
              onChange={setPurchasePrice}
              precisionType="money"
              prefix="₹"
              placeholder="0.00"
              required
            />
            <p className="text-[11px] text-muted-foreground">Supplier acquisition price</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">
                Selling Price (₹) *
              </label>
              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                (Includes GST)
              </span>
            </div>
            <NumericInput
              value={sellingPrice}
              onChange={setSellingPrice}
              precisionType="money"
              prefix="₹"
              placeholder="0.00"
              required
            />
            <p className="text-[11px] text-muted-foreground">Retail MRP charged at POS</p>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-foreground">GST Rate (%)</label>
            <NumericInput
              value={gstRate}
              onChange={setGstRate}
              precisionType="money"
              suffix="%"
              placeholder="18.00"
            />
            <p className="text-[11px] text-muted-foreground">Statutory GST slab</p>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-foreground">Unit of Measurement</label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="pcs">Pieces (pcs)</option>
              <option value="box">Box (box)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="m">Meter (m)</option>
              <option value="set">Set (set)</option>
            </Select>
            <p className="text-[11px] text-muted-foreground">Stock inventory unit</p>
          </div>

          {/* Real-time Detailed Pricing, GST & Profit Breakdown */}
          {(sPrice > 0 || pPrice > 0) && (
            <div className="col-span-1 sm:col-span-2 rounded-xl border border-white/[0.14] bg-[#141418] p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-zinc-100">
                    Pricing, GST & Profit Breakdown
                  </span>
                </div>
                {pPrice > 0 && sPrice > 0 && (
                  <Badge
                    variant="outline"
                    className={
                      netProfit > 0
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]"
                        : netProfit === 0
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]"
                        : "bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]"
                    }
                  >
                    {netProfit > 0
                      ? `Profitable (+${profitMargin.toFixed(1)}% margin)`
                      : netProfit === 0
                      ? "Breakeven (0% margin)"
                      : `Selling at Loss (${profitMargin.toFixed(1)}% margin)`}
                  </Badge>
                )}
              </div>

              {/* 4 Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <div className="text-[10px] text-zinc-400 font-medium">Selling Price (MRP)</div>
                  <div className="text-sm font-bold text-zinc-100 font-mono mt-0.5">
                    ₹{sPrice.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-emerald-400 font-mono">Includes {gRate}% GST</div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <div className="text-[10px] text-zinc-400 font-medium">Taxable Base Price</div>
                  <div className="text-sm font-bold text-zinc-200 font-mono mt-0.5">
                    ₹{taxableBase.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400">Excluding GST</div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <div className="text-[10px] text-zinc-400 font-medium">GST Component ({gRate}%)</div>
                  <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                    ₹{gstAmount.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 font-mono">
                    C: ₹{halfGst.toFixed(2)} | S: ₹{halfGst.toFixed(2)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <div className="text-[10px] text-zinc-400 font-medium">Net Profit / Unit</div>
                  <div
                    className={`text-sm font-bold font-mono mt-0.5 ${
                      netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {netProfit >= 0 ? "+" : ""}₹{netProfit.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 font-mono">
                    {pPrice > 0 ? `${markupPct.toFixed(1)}% markup on cost` : "Awaiting cost"}
                  </div>
                </div>
              </div>

              {/* Equation */}
              {pPrice > 0 && sPrice > 0 && (
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-zinc-300 flex flex-wrap items-center justify-between gap-1.5 font-mono">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-zinc-400">Cost:</span>
                    <span className="font-semibold text-zinc-200">₹{pPrice.toFixed(2)}</span>
                    <span className="text-zinc-500">+</span>
                    <span className="text-zinc-400">Net Profit:</span>
                    <span
                      className={`font-semibold ${
                        netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      ₹{netProfit.toFixed(2)}
                    </span>
                    <span className="text-zinc-500">+</span>
                    <span className="text-zinc-400">GST ({gRate}%):</span>
                    <span className="font-semibold text-amber-400">₹{gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1 font-semibold text-zinc-100">
                    <span className="text-zinc-500">=</span>
                    <span className="text-primary font-bold">₹{sPrice.toFixed(2)}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">(POS Price)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="col-span-1 sm:col-span-2 space-y-1">
            <label className="font-medium text-foreground">Minimum Stock Alert Threshold</label>
            <NumericInput
              value={minStock}
              onChange={setMinStock}
              precisionType="quantity"
              suffix={unit}
              placeholder="0.000"
            />
            <p className="text-xs text-muted-foreground">
              Flags low-stock badge when current inventory falls to or below this quantity.
            </p>
          </div>

          <div className="col-span-1 sm:col-span-2 flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isPinnedProduct"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="isPinnedProduct" className="text-sm font-medium text-foreground cursor-pointer">
              Pin to POS Quick-Picks (shows at the top of POS terminal)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : product ? "Save Changes" : "Create Product"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
