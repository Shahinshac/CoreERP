import React, { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Boxes,
  Check,
  Edit2,
  FolderPlus,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { catalogApi, Category, Brand } from "./api"
import { useAuth } from "@/features/auth/AuthContext"

interface CategoryBrandModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: "categories" | "brands"
  onSuccess?: () => void
}

export const CategoryBrandModal: React.FC<CategoryBrandModalProps> = ({
  open,
  onOpenChange,
  defaultTab = "categories",
  onSuccess,
}) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const staffUser = user as { email: string; role: string } | null
  const canManage =
    staffUser?.role === "Super Admin" ||
    staffUser?.role === "Admin" ||
    staffUser?.role === "Manager"

  const [activeTab, setActiveTab] = useState<"categories" | "brands">(defaultTab)

  // Search states
  const [catSearch, setCatSearch] = useState("")
  const [brandSearch, setBrandSearch] = useState("")

  // Category create/edit states
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [newCatDesc, setNewCatDesc] = useState("")
  const [isSavingCat, setIsSavingCat] = useState(false)

  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState("")
  const [editCatDesc, setEditCatDesc] = useState("")
  const [isUpdatingCat, setIsUpdatingCat] = useState(false)

  // Brand create/edit states
  const [isAddingBrand, setIsAddingBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState("")
  const [isSavingBrand, setIsSavingBrand] = useState(false)

  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [editBrandName, setEditBrandName] = useState("")
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false)

  // Deletion in progress
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
      setIsAddingCat(false)
      setIsAddingBrand(false)
      setEditingCatId(null)
      setEditingBrandId(null)
      setCatSearch("")
      setBrandSearch("")
    }
  }, [open, defaultTab])

  // Queries
  const { data: categories = [], isLoading: isLoadingCats } = useQuery({
    queryKey: ["categories"],
    queryFn: catalogApi.getCategories,
    enabled: open,
  })

  const { data: brands = [], isLoading: isLoadingBrands } = useQuery({
    queryKey: ["brands"],
    queryFn: catalogApi.getBrands,
    enabled: open,
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ["products-count-helper"],
    queryFn: () => catalogApi.getProducts({}),
    enabled: open,
  })

  // Linked product counts
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of allProducts) {
      if (p.category_id) {
        counts[p.category_id] = (counts[p.category_id] || 0) + 1
      }
    }
    return counts
  }, [allProducts])

  const brandCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of allProducts) {
      if (p.brand_id) {
        counts[p.brand_id] = (counts[p.brand_id] || 0) + 1
      }
    }
    return counts
  }, [allProducts])

  // Filtered lists
  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(catSearch.toLowerCase().trim()) ||
    (c.description && c.description.toLowerCase().includes(catSearch.toLowerCase().trim()))
  )

  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase().trim())
  )

  // Category Actions
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return toast.error("Category name is required.")

    setIsSavingCat(true)
    try {
      await catalogApi.createCategory({
        name: newCatName.trim(),
        description: newCatDesc.trim() || undefined,
      })
      toast.success(`Category "${newCatName.trim()}" created successfully.`)
      setNewCatName("")
      setNewCatDesc("")
      setIsAddingCat(false)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSavingCat(false)
    }
  }

  const handleStartEditCat = (cat: Category) => {
    setEditingCatId(cat.id)
    setEditCatName(cat.name)
    setEditCatDesc(cat.description || "")
  }

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCatId) return
    if (!editCatName.trim()) return toast.error("Category name is required.")

    setIsUpdatingCat(true)
    try {
      await catalogApi.updateCategory(editingCatId, {
        name: editCatName.trim(),
        description: editCatDesc.trim() || undefined,
      })
      toast.success("Category updated successfully.")
      setEditingCatId(null)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setIsUpdatingCat(false)
    }
  }

  const handleDeleteCategory = async (cat: Category) => {
    const linked = categoryCounts[cat.id] || 0
    if (linked > 0) {
      return toast.error(
        `Cannot delete "${cat.name}": ${linked} product${linked === 1 ? "" : "s"} linked to this category.`
      )
    }

    if (!window.confirm(`Are you sure you want to permanently delete category "${cat.name}"?`)) {
      return
    }

    setDeletingId(cat.id)
    try {
      await catalogApi.deleteCategory(cat.id)
      toast.success(`Category "${cat.name}" deleted.`)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setDeletingId(null)
    }
  }

  // Brand Actions
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBrandName.trim()) return toast.error("Brand name is required.")

    setIsSavingBrand(true)
    try {
      await catalogApi.createBrand({
        name: newBrandName.trim(),
      })
      toast.success(`Brand "${newBrandName.trim()}" created successfully.`)
      setNewBrandName("")
      setIsAddingBrand(false)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSavingBrand(false)
    }
  }

  const handleStartEditBrand = (brand: Brand) => {
    setEditingBrandId(brand.id)
    setEditBrandName(brand.name)
  }

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBrandId) return
    if (!editBrandName.trim()) return toast.error("Brand name is required.")

    setIsUpdatingBrand(true)
    try {
      await catalogApi.updateBrand(editingBrandId, {
        name: editBrandName.trim(),
      })
      toast.success("Brand updated successfully.")
      setEditingBrandId(null)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setIsUpdatingBrand(false)
    }
  }

  const handleDeleteBrand = async (brand: Brand) => {
    const linked = brandCounts[brand.id] || 0
    if (linked > 0) {
      return toast.error(
        `Cannot delete "${brand.name}": ${linked} product${linked === 1 ? "" : "s"} linked to this brand.`
      )
    }

    if (!window.confirm(`Are you sure you want to permanently delete brand "${brand.name}"?`)) {
      return
    }

    setDeletingId(brand.id)
    try {
      await catalogApi.deleteBrand(brand.id)
      toast.success(`Brand "${brand.name}" deleted.`)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
      onSuccess?.()
    } catch {
      // Error handled by apiClient
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-3xl max-h-[85vh] flex flex-col">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 border border-primary/20 text-primary rounded-xl">
            {activeTab === "categories" ? (
              <Tag className="h-5 w-5" />
            ) : (
              <Boxes className="h-5 w-5" />
            )}
          </div>
          <div>
            <DialogTitle>Manage Categories & Brands</DialogTitle>
            <DialogDescription>
              Configure classifications and brand labels used across inventory, sales, and catalog.
            </DialogDescription>
          </div>
        </div>

        {/* Tab selection buttons */}
        <div className="flex gap-2 pt-3 border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => {
              setActiveTab("categories")
              setIsAddingCat(false)
              setIsAddingBrand(false)
            }}
            className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "categories"
                ? "border-primary text-primary"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Tag className="h-4 w-4" />
            Categories ({categories.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("brands")
              setIsAddingCat(false)
              setIsAddingBrand(false)
            }}
            className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "brands"
                ? "border-primary text-primary"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Boxes className="h-4 w-4" />
            Brands ({brands.length})
          </button>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* ==================================================== */}
        {/* CATEGORIES TAB                                      */}
        {/* ==================================================== */}
        {activeTab === "categories" && (
          <div className="space-y-4">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Search categories by name or description..."
                  className="pl-9 bg-surface-elevated border-white/[0.12]"
                />
              </div>
              {canManage && (
                <Button
                  onClick={() => setIsAddingCat(!isAddingCat)}
                  className="flex items-center gap-2"
                >
                  {isAddingCat ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isAddingCat ? "Cancel" : "Add Category"}
                </Button>
              )}
            </div>

            {/* Inline Add Category Form */}
            {isAddingCat && canManage && (
              <form
                onSubmit={handleCreateCategory}
                className="p-4 bg-surface-elevated/70 border border-primary/30 rounded-xl space-y-3"
              >
                <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <FolderPlus className="h-4 w-4" /> New Category
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-300">Category Name *</label>
                    <Input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="e.g. Smart Home"
                      autoFocus
                      required
                      className="mt-1 bg-surface border-white/[0.14]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300">Description (Optional)</label>
                    <Input
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="e.g. Connected home automation devices"
                      className="mt-1 bg-surface border-white/[0.14]"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsAddingCat(false)
                      setNewCatName("")
                      setNewCatDesc("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isSavingCat}>
                    {isSavingCat ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Save Category
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Categories Table */}
            <div className="rounded-lg border border-white/[0.1] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-elevated/40">
                    <TableHead className="w-[30%]">Category Name</TableHead>
                    <TableHead className="w-[45%]">Description</TableHead>
                    <TableHead className="text-center w-[12%]">Products</TableHead>
                    {canManage && <TableHead className="text-right w-[13%]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingCats ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 4 : 3} className="text-center py-8 text-zinc-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                        Loading categories...
                      </TableCell>
                    </TableRow>
                  ) : filteredCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 4 : 3} className="text-center py-8 text-zinc-400">
                        {catSearch ? "No categories matching search." : "No categories defined yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCategories.map((cat) => {
                      const linked = categoryCounts[cat.id] || 0
                      const isEditing = editingCatId === cat.id

                      if (isEditing) {
                        return (
                          <TableRow key={cat.id} className="bg-primary/5">
                            <TableCell colSpan={canManage ? 4 : 3} className="p-3">
                              <form onSubmit={handleUpdateCategory} className="space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Input
                                    value={editCatName}
                                    onChange={(e) => setEditCatName(e.target.value)}
                                    placeholder="Category Name"
                                    autoFocus
                                    required
                                    className="bg-surface border-white/[0.14]"
                                  />
                                  <Input
                                    value={editCatDesc}
                                    onChange={(e) => setEditCatDesc(e.target.value)}
                                    placeholder="Description (Optional)"
                                    className="bg-surface border-white/[0.14]"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingCatId(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button type="submit" size="sm" disabled={isUpdatingCat}>
                                    {isUpdatingCat ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    Update
                                  </Button>
                                </div>
                              </form>
                            </TableCell>
                          </TableRow>
                        )
                      }

                      return (
                        <TableRow key={cat.id} className="hover:bg-white/[0.02]">
                          <TableCell className="font-medium text-zinc-100 flex items-center gap-2">
                            <Tag className="h-3.5 w-3.5 text-zinc-400" />
                            {cat.name}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-400">
                            {cat.description || <span className="text-zinc-600 italic">No description</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={
                                linked > 0
                                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                  : "border-zinc-700 text-zinc-400 bg-zinc-800/50"
                              }
                            >
                              <Package className="h-3 w-3 mr-1" />
                              {linked}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100"
                                  onClick={() => handleStartEditCat(cat)}
                                  title="Edit category"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${
                                    linked > 0
                                      ? "text-zinc-600 cursor-not-allowed hover:bg-transparent"
                                      : "text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                  }`}
                                  disabled={linked > 0 || deletingId === cat.id}
                                  onClick={() => handleDeleteCategory(cat)}
                                  title={
                                    linked > 0
                                      ? `Cannot delete: ${linked} product(s) linked`
                                      : "Delete category"
                                  }
                                >
                                  {deletingId === cat.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* BRANDS TAB                                           */}
        {/* ==================================================== */}
        {activeTab === "brands" && (
          <div className="space-y-4">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Search brands by name..."
                  className="pl-9 bg-surface-elevated border-white/[0.12]"
                />
              </div>
              {canManage && (
                <Button
                  onClick={() => setIsAddingBrand(!isAddingBrand)}
                  className="flex items-center gap-2"
                >
                  {isAddingBrand ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isAddingBrand ? "Cancel" : "Add Brand"}
                </Button>
              )}
            </div>

            {/* Inline Add Brand Form */}
            {isAddingBrand && canManage && (
              <form
                onSubmit={handleCreateBrand}
                className="p-4 bg-surface-elevated/70 border border-primary/30 rounded-xl space-y-3"
              >
                <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Boxes className="h-4 w-4" /> New Brand
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-300">Brand Name *</label>
                  <Input
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="e.g. Logitech"
                    autoFocus
                    required
                    className="mt-1 bg-surface border-white/[0.14]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsAddingBrand(false)
                      setNewBrandName("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isSavingBrand}>
                    {isSavingBrand ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Save Brand
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Brands Table */}
            <div className="rounded-lg border border-white/[0.1] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-elevated/40">
                    <TableHead className="w-[60%]">Brand Name</TableHead>
                    <TableHead className="text-center w-[20%]">Products</TableHead>
                    {canManage && <TableHead className="text-right w-[20%]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingBrands ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 3 : 2} className="text-center py-8 text-zinc-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                        Loading brands...
                      </TableCell>
                    </TableRow>
                  ) : filteredBrands.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 3 : 2} className="text-center py-8 text-zinc-400">
                        {brandSearch ? "No brands matching search." : "No brands defined yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBrands.map((brand) => {
                      const linked = brandCounts[brand.id] || 0
                      const isEditing = editingBrandId === brand.id

                      if (isEditing) {
                        return (
                          <TableRow key={brand.id} className="bg-primary/5">
                            <TableCell colSpan={canManage ? 3 : 2} className="p-3">
                              <form onSubmit={handleUpdateBrand} className="flex items-center gap-2">
                                <Input
                                  value={editBrandName}
                                  onChange={(e) => setEditBrandName(e.target.value)}
                                  placeholder="Brand Name"
                                  autoFocus
                                  required
                                  className="bg-surface border-white/[0.14] flex-1"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingBrandId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button type="submit" size="sm" disabled={isUpdatingBrand}>
                                  {isUpdatingBrand ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  Update
                                </Button>
                              </form>
                            </TableCell>
                          </TableRow>
                        )
                      }

                      return (
                        <TableRow key={brand.id} className="hover:bg-white/[0.02]">
                          <TableCell className="font-medium text-zinc-100 flex items-center gap-2">
                            <Boxes className="h-3.5 w-3.5 text-zinc-400" />
                            {brand.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={
                                linked > 0
                                  ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                                  : "border-zinc-700 text-zinc-400 bg-zinc-800/50"
                              }
                            >
                              <Package className="h-3 w-3 mr-1" />
                              {linked}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100"
                                  onClick={() => handleStartEditBrand(brand)}
                                  title="Edit brand"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${
                                    linked > 0
                                      ? "text-zinc-600 cursor-not-allowed hover:bg-transparent"
                                      : "text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                  }`}
                                  disabled={linked > 0 || deletingId === brand.id}
                                  onClick={() => handleDeleteBrand(brand)}
                                  title={
                                    linked > 0
                                      ? `Cannot delete: ${linked} product(s) linked`
                                      : "Delete brand"
                                  }
                                >
                                  {deletingId === brand.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="border-t border-white/[0.08] pt-3">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
