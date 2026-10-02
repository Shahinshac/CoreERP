import React, { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import QRCode from "qrcode"
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
import {
  Barcode as BarcodeIcon,
  Boxes,
  Calculator,
  Check,
  Download,
  Eye,
  Loader2,
  Plus,
  Printer,
  QrCode,
  ScanBarcode,
  Tag,
  X,
} from "lucide-react"
import { downloadBarcodePng, sanitizeFilename } from "@/lib/barcode"
import { searchHsnCodes, validateHsnCode } from "@/lib/hsnCodes"
import { catalogApi, Product } from "./api"
import { BarcodeModal } from "./BarcodeModal"
import { QrModal } from "./QrModal"
import { ProductLabelModal } from "./ProductLabelModal"
import { BarcodeScannerModal } from "@/components/common/BarcodeScannerModal"
import { ProductAlreadyExistsModal } from "./ProductAlreadyExistsModal"

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  initialBarcode?: string | null
  onSuccess: () => void
}

export const ProductDialog: React.FC<ProductDialogProps> = ({
  open,
  onOpenChange,
  product,
  initialBarcode,
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
  const [hasWarranty, setHasWarranty] = useState(false)
  const [warrantyMonths, setWarrantyMonths] = useState(12)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Codes & Identification sub-modals
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [conflictProduct, setConflictProduct] = useState<Product | null>(null)
  const [scannedForConflict, setScannedForConflict] = useState("")
  const [hsnSearchQuery, setHsnSearchQuery] = useState("")
  const [showHsnDropdown, setShowHsnDropdown] = useState(false)
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState("")

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
        setHasWarranty(!!product.has_warranty)
        setWarrantyMonths(product.warranty_months || 12)
      } else {
        setName("")
        setSku("")
        setBarcode(initialBarcode || "")
        setHsnCode("")
        setCategoryId(categories[0]?.id || "")
        setBrandId(brands[0]?.id || "")
        setUnit("pcs")
        setPurchasePrice("")
        setSellingPrice("")
        setGstRate("18.00")
        setMinStock("5.000")
        setIsPinned(false)
        setHasWarranty(false)
        setWarrantyMonths(12)
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

  useEffect(() => {
    if (!open || !product) {
      setPreviewQrDataUrl("")
      return
    }

    const payload = JSON.stringify({
      app: "CoreERP",
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      price: product.selling_price,
    })

    QRCode.toDataURL(payload, {
      width: 140,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setPreviewQrDataUrl)
      .catch((err) => console.error("ProductDialog QR error:", err))
  }, [open, product])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return toast.error("Product name is required.")
    if (product && !sku.trim()) return toast.error("SKU cannot be empty.")
    if (!categoryId) return toast.error("Please select a category.")
    if (!brandId) return toast.error("Please select a brand.")
    if (!purchasePrice.trim()) return toast.error("Purchase price is required.")
    if (!sellingPrice.trim()) return toast.error("Selling price is required.")
    if (hsnCode.trim() && !validateHsnCode(hsnCode.trim())) {
      return toast.error("HSN/SAC code must be between 2 and 8 numeric digits (e.g. 8471, 8517).")
    }

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
          has_warranty: hasWarranty,
          warranty_months: hasWarranty ? warrantyMonths : null,
        })
        toast.success("Product updated successfully")
      } else {
        await catalogApi.createProduct({
          name: name.trim(),
          sku: sku.trim() || undefined,
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
          has_warranty: hasWarranty,
          warranty_months: hasWarranty ? warrantyMonths : undefined,
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
    <>
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

          {/* Product Codes & Identification Section */}
          <div className="col-span-1 sm:col-span-2 p-3.5 bg-surface-elevated/70 border border-white/[0.1] rounded-xl space-y-3 my-1">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <div className="flex items-center gap-2">
                <BarcodeIcon className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Product Codes & Identification
                </span>
              </div>
              {product && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLabelModalOpen(true)}
                  className="h-6 text-[11px] px-2 text-primary hover:text-primary/80 gap-1 font-medium"
                >
                  <Printer className="h-3 w-3" /> Print Label
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* SKU */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-foreground text-xs flex items-center gap-1.5">
                    <span>SKU Code</span>
                    {!sku.trim() && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1 py-0 font-mono">
                        AUTO-GENERATED
                      </Badge>
                    )}
                  </label>
                  {sku.trim() && (
                    <span className="text-[10px] text-zinc-400 font-mono">Custom SKU</span>
                  )}
                </div>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Auto-generated (e.g. SKU-000001) if blank"
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Unique sequential SKU. Automatically generated if left blank.
                </p>
              </div>

              {/* HSN/SAC */}
              <div className="space-y-1 relative">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-foreground text-xs">
                    HSN / SAC Code (Tax Classification)
                  </label>
                  {hsnCode && (
                    <span className={`text-[10px] font-mono ${validateHsnCode(hsnCode) ? "text-emerald-400" : "text-rose-400"}`}>
                      {validateHsnCode(hsnCode) ? "✓ Valid" : "✗ 2-8 digits"}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    value={hsnCode}
                    onChange={(e) => {
                      setHsnCode(e.target.value)
                      setHsnSearchQuery(e.target.value)
                      setShowHsnDropdown(true)
                    }}
                    onFocus={() => setShowHsnDropdown(true)}
                    placeholder="Search or enter HSN (e.g. 8471, 8517, 9403)"
                    className="font-mono text-xs pr-7"
                  />
                  {hsnCode && (
                    <button
                      type="button"
                      onClick={() => {
                        setHsnCode("")
                        setHsnSearchQuery("")
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {showHsnDropdown && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-elevated border border-white/[0.14] rounded-lg shadow-2xl max-h-48 overflow-y-auto p-1 text-xs">
                    <div className="px-2 py-1 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between border-b border-white/[0.08] mb-1">
                      <span>Popular GST Codes</span>
                      <button
                        type="button"
                        onClick={() => setShowHsnDropdown(false)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        ✕
                      </button>
                    </div>
                    {searchHsnCodes(hsnSearchQuery).slice(0, 8).map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setHsnCode(item.code)
                          setShowHsnDropdown(false)
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.08] flex items-center justify-between gap-2 group transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-primary group-hover:text-primary-foreground">
                            {item.code}
                          </span>
                          <span className="text-[11px] text-zinc-300 ml-2 truncate">
                            {item.description}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] border-white/[0.1] text-zinc-400 flex-shrink-0">
                          {item.category}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Select standard tax code or enter custom 2-8 digit code.
                </p>
              </div>

              {/* Barcode */}
              <div className="space-y-1 sm:col-span-2 pt-1 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-foreground text-xs flex items-center gap-1.5">
                    <span>Barcode (EAN-13)</span>
                    {!barcode.trim() && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 font-mono">
                        AUTO-GENERATED
                      </Badge>
                    )}
                  </label>
                  {product?.barcode && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBarcodeModalOpen(true)}
                        className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                      >
                        <Eye className="h-3 w-3" /> View Barcode
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!product.barcode) return
                          const fn = `${sanitizeFilename(product.name)}-${product.sku}-barcode.png`
                          await downloadBarcodePng(product.barcode, fn, {
                            productName: product.name,
                            sku: product.sku,
                            price: product.selling_price,
                          })
                          toast.success("Barcode downloaded")
                        }}
                        className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                      >
                        <Download className="h-3 w-3" /> Download
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLabelModalOpen(true)}
                        className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                      >
                        <Printer className="h-3 w-3" /> Print
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Auto-generated retail EAN-13 if blank (e.g. 2000000000015)"
                    className="font-mono text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScannerOpen(true)}
                    className="h-9 px-3 border-white/[0.14] text-xs font-medium text-zinc-200 hover:text-white gap-1.5 shrink-0 bg-white/[0.03]"
                    title="Scan barcode with phone/desktop camera"
                  >
                    <ScanBarcode className="h-3.5 w-3.5 text-primary" />
                    <span>Scan</span>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Retail numeric barcode (EAN-13 format). Auto-generated if left blank.
                </p>
              </div>

              {/* QR Code preview */}
              {product && (
                <div className="sm:col-span-2 p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded p-1 flex items-center justify-center flex-shrink-0 shadow-sm">
                      {previewQrDataUrl ? (
                        <img src={previewQrDataUrl} alt="QR" className="w-full h-full object-contain" />
                      ) : (
                        <QrCode className="h-6 w-6 text-zinc-600" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                        <span>QR Code</span>
                        <Badge variant="outline" className="text-[9px] border-white/[0.1] text-zinc-400">
                          Public Safe
                        </Badge>
                      </div>
                      <p className="text-[10px] text-zinc-400">
                        Stable product reference for mobile & POS scanning.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQrModalOpen(true)}
                      className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                    >
                      <Eye className="h-3 w-3" /> View QR
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!previewQrDataUrl) return
                        const fn = `${sanitizeFilename(product.name)}-${product.sku}-qr.png`
                        const a = document.createElement("a")
                        a.href = previewQrDataUrl
                        a.download = fn
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        toast.success("QR Code downloaded")
                      }}
                      className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                    >
                      <Download className="h-3 w-3" /> Download
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLabelModalOpen(true)}
                      className="h-6 text-[11px] px-2 text-zinc-300 border-white/[0.14] hover:bg-white/[0.08] gap-1"
                    >
                      <Printer className="h-3 w-3" /> Print
                    </Button>
                  </div>
                </div>
              )}
            </div>
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

          {/* ── Warranty Policy Section ────────────────────────────── */}
          <div className="col-span-1 sm:col-span-2">
            <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛡️</span>
                  <span className="text-sm font-semibold text-foreground">Product Warranty</span>
                </div>
                {/* ON/OFF Toggle */}
                <button
                  type="button"
                  onClick={() => setHasWarranty(!hasWarranty)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    hasWarranty ? "bg-primary" : "bg-muted"
                  }`}
                  aria-pressed={hasWarranty}
                  id="warrantyToggle"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      hasWarranty ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {!hasWarranty && (
                <p className="text-xs text-muted-foreground">
                  OFF — No automatic warranty will be created when this product is sold.
                </p>
              )}

              {hasWarranty && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-emerald-400">
                    ✓ ON — A customer warranty record will be created automatically on each sale.
                  </p>
                  <div className="flex items-center gap-3">
                    <label htmlFor="warrantyMonthsSelect" className="text-sm text-muted-foreground whitespace-nowrap">
                      Warranty Duration:
                    </label>
                    <select
                      id="warrantyMonthsSelect"
                      value={warrantyMonths}
                      onChange={(e) => setWarrantyMonths(parseInt(e.target.value))}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>1 Year (12 Months)</option>
                      <option value={18}>18 Months</option>
                      <option value={24}>2 Years (24 Months)</option>
                      <option value={36}>3 Years (36 Months)</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Warranty starts from the purchase date and expires after{" "}
                    <strong className="text-foreground">{warrantyMonths} month{warrantyMonths !== 1 ? "s" : ""}</strong>.
                  </p>
                </div>
              )}
            </div>
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

    <BarcodeModal
      open={barcodeModalOpen}
      onOpenChange={setBarcodeModalOpen}
      product={product || null}
    />

    <QrModal
      open={qrModalOpen}
      onOpenChange={setQrModalOpen}
      product={product || null}
    />

    <ProductLabelModal
      open={labelModalOpen}
      onOpenChange={setLabelModalOpen}
      product={product || null}
    />

    <BarcodeScannerModal
      open={scannerOpen}
      onOpenChange={setScannerOpen}
      title="Scan Product Barcode"
      description="Point camera at product label barcode"
      onScan={async (scanned) => {
        try {
          const existing = await catalogApi.lookupBarcode(scanned)
          if (existing && existing.id !== product?.id) {
            setScannedForConflict(scanned)
            setConflictProduct(existing)
            return
          }
        } catch {
          // 404 means unique barcode, ready for form
        }
        setBarcode(scanned)
        toast.success(`Barcode applied: ${scanned}`)
      }}
    />

    <ProductAlreadyExistsModal
      open={Boolean(conflictProduct)}
      onOpenChange={(open) => !open && setConflictProduct(null)}
      product={conflictProduct}
      scannedBarcode={scannedForConflict}
      onEdit={(existingProd) => {
        setConflictProduct(null)
        // Populate existing product into the form
        setName(existingProd.name)
        setSku(existingProd.sku)
        setBarcode(existingProd.barcode || "")
        setHsnCode(existingProd.hsn_code || "")
        setCategoryId(existingProd.category_id)
        setBrandId(existingProd.brand_id)
        setUnit(existingProd.unit)
        setPurchasePrice(existingProd.purchase_price)
        setSellingPrice(existingProd.selling_price)
        setGstRate(existingProd.gst_rate)
        setMinStock(existingProd.min_stock)
        setIsPinned(!!existingProd.is_pinned)
        toast.info(`Loaded existing product: ${existingProd.name}`)
      }}
      onAddToPos={(existingProd) => {
        setConflictProduct(null)
        onOpenChange(false)
        window.location.href = `/staff/sales?add_barcode=${encodeURIComponent(existingProd.barcode || existingProd.sku)}`
      }}
    />
    </>
  )
}
