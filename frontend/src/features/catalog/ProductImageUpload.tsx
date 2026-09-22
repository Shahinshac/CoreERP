import React, { useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, X, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { catalogApi, Product } from "./api"

interface ProductImageUploadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSuccess: () => void
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  open,
  onOpenChange,
  product,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileSelect = (file: File) => {
    // 1. Client-side MIME validation
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      toast.error("Invalid file format. Only JPG, PNG, and WebP images are allowed.")
      return
    }

    // 2. Client-side size validation (<= 2MB)
    if (file.size > MAX_SIZE_BYTES) {
      toast.error("File size exceeds 2MB. Please choose an optimized image.")
      return
    }

    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleClearPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleUpload = async () => {
    if (!product || !selectedFile) return

    setIsUploading(true)
    try {
      await catalogApi.uploadProductImage(product.id, selectedFile)
      toast.success("Product image uploaded and processed successfully")
      handleClearPreview()
      onSuccess()
      onOpenChange(false)
    } catch {
      // Error toasted by apiClient
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) handleClearPreview()
        onOpenChange(val)
      }}
    >
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>Product Image</DialogTitle>
          <DialogDescription>
            Upload a high-resolution photo for {product?.name}. Images are resized and converted to
            WebP server-side.
          </DialogDescription>
        </DialogHeader>

        {/* Existing Image status */}
        {product?.image_path && !previewUrl && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate">Current storage path: {product.image_path}</span>
          </div>
        )}

        {/* Preview or Dropzone */}
        {previewUrl ? (
          <div className="relative border rounded-xl overflow-hidden bg-slate-100 flex flex-col items-center justify-center p-4">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-60 max-w-full rounded-lg object-contain shadow-sm"
            />
            <button
              onClick={handleClearPreview}
              type="button"
              className="absolute top-2 right-2 bg-slate-900/80 text-white rounded-full p-1.5 hover:bg-slate-900 transition"
              title="Remove preview"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-2 text-xs text-slate-500 font-mono">
              {selectedFile?.name} ({(selectedFile!.size / 1024).toFixed(1)} KB)
            </p>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50 hover:bg-blue-50/20 group"
          >
            <div className="h-12 w-12 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-slate-500 group-hover:text-blue-600 transition mb-3">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">
              Click to select or drag and drop image
            </p>
            <p className="text-xs text-slate-500 mt-1">PNG, JPG, or WebP up to 2MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              handleClearPreview()
              onOpenChange(false)
            }}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
            {isUploading ? "Uploading..." : "Save Image"}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}
