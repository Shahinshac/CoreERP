import React, { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [unit, setUnit] = useState("pcs")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [gstRate, setGstRate] = useState("18.00")
  const [minStock, setMinStock] = useState("5.000")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    if (product) {
      setName(product.name)
      setSku(product.sku)
      setBarcode(product.barcode || "")
      setCategoryId(product.category_id)
      setBrandId(product.brand_id)
      setUnit(product.unit)
      setPurchasePrice(product.purchase_price)
      setSellingPrice(product.selling_price)
      setGstRate(product.gst_rate)
      setMinStock(product.min_stock)
    } else {
      setName("")
      setSku("")
      setBarcode("")
      setCategoryId(categories[0]?.id || "")
      setBrandId(brands[0]?.id || "")
      setUnit("pcs")
      setPurchasePrice("")
      setSellingPrice("")
      setGstRate("18.00")
      setMinStock("5.000")
    }
  }, [product, open, categories, brands])

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
          category_id: categoryId,
          brand_id: brandId,
          unit: unit.trim(),
          purchase_price: purchasePrice,
          selling_price: sellingPrice,
          gst_rate: gstRate,
          min_stock: minStock,
        })
        toast.success("Product updated successfully")
      } else {
        await catalogApi.createProduct({
          name: name.trim(),
          sku: sku.trim(),
          barcode: barcode.trim() || null,
          category_id: categoryId,
          brand_id: brandId,
          unit: unit.trim(),
          purchase_price: purchasePrice,
          selling_price: sellingPrice,
          gst_rate: gstRate,
          min_stock: minStock,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Create New Product"}</DialogTitle>
          <DialogDescription>
            {product
              ? "Update product pricing, classification, and stock threshold."
              : "Register a new product in the central catalog with strict pricing precision."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 space-y-1">
            <label className="font-medium text-slate-700">Product Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ergonomic Office Chair"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">SKU Code *</label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. CHAIR-BLK-01"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Barcode</label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Optional EAN/UPC"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Category *</label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select Category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Brand *</label>
            <Select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select Brand
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Purchase Price (₹) *</label>
            <NumericInput
              value={purchasePrice}
              onChange={setPurchasePrice}
              precisionType="money"
              prefix="₹"
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Selling Price (₹) *</label>
            <NumericInput
              value={sellingPrice}
              onChange={setSellingPrice}
              precisionType="money"
              prefix="₹"
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">GST Rate (%)</label>
            <NumericInput
              value={gstRate}
              onChange={setGstRate}
              precisionType="money"
              suffix="%"
              placeholder="18.00"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Unit of Measurement</label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="pcs">Pieces (pcs)</option>
              <option value="box">Box (box)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="m">Meter (m)</option>
              <option value="set">Set (set)</option>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="font-medium text-slate-700">Minimum Stock Alert Threshold</label>
            <NumericInput
              value={minStock}
              onChange={setMinStock}
              precisionType="quantity"
              suffix={unit}
              placeholder="0.000"
            />
            <p className="text-xs text-slate-500">
              Flags low-stock badge when current inventory falls to or below this quantity.
            </p>
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
