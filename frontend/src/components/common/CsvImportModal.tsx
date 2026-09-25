import React, { useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ImportConfirmResponse, ImportPreviewResponse } from "@/features/catalog/api"

interface CsvImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  sampleHeaders: string[]
  sampleRows: string[][]
  onPreview: (file: File) => Promise<ImportPreviewResponse>
  onConfirm: (file: File) => Promise<ImportConfirmResponse>
  onSuccess: () => void
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  sampleHeaders,
  sampleRows,
  onPreview,
  onConfirm,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const handleReset = () => {
    setSelectedFile(null)
    setPreviewData(null)
    setIsPreviewing(false)
    setIsConfirming(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a valid .csv file")
      return
    }

    setSelectedFile(file)
    setIsPreviewing(true)
    try {
      const res = await onPreview(file)
      setPreviewData(res)
    } catch {
      handleReset()
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleDownloadSample = () => {
    const csvContent = [
      sampleHeaders.join(","),
      ...sampleRows.map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `sample_${title.toLowerCase().replace(/\s+/g, "_")}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleConfirm = async () => {
    if (!selectedFile || !previewData || previewData.valid_count === 0) return

    setIsConfirming(true)
    try {
      const res = await onConfirm(selectedFile)
      toast.success(
        `Imported ${res.imported_count} rows successfully! (${res.skipped_count} invalid rows skipped)`
      )
      onSuccess()
      onOpenChange(false)
      handleReset()
    } catch {
      // Api toasted error
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleReset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-3xl bg-surface border border-white/[0.12] text-white max-h-[88vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadSample}
              className="h-8 text-xs font-semibold gap-1.5 border-white/[0.14] text-zinc-300 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV Template
            </Button>
          </div>
          <DialogDescription className="text-xs text-zinc-400">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          {/* File Upload Box */}
          {!previewData && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/[0.16] hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition bg-surface-elevated/40 hover:bg-surface-elevated flex flex-col items-center justify-center gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  {isPreviewing ? "Analyzing CSV format & validating rows..." : "Click to select CSV file"}
                </p>
                <p className="text-xs text-zinc-400">
                  Preview validates every row against business rules without committing changes.
                </p>
              </div>
            </div>
          )}

          {/* Preview Results Table */}
          {previewData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated border border-white/[0.12] text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-zinc-400">File: </span>
                    <span className="font-mono font-medium text-zinc-200">{selectedFile?.name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Total: </span>
                    <span className="font-mono font-bold text-zinc-200">{previewData.total_rows}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Valid: </span>
                    <span className="font-mono font-bold text-emerald-400">{previewData.valid_count}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Invalid: </span>
                    <span className="font-mono font-bold text-rose-400">{previewData.invalid_count}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-7 text-xs text-zinc-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Choose another file
                </Button>
              </div>

              <div className="rounded-xl border border-white/[0.12] overflow-hidden max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.12] bg-surface-elevated">
                      <TableHead className="w-16 text-center text-zinc-300">Row</TableHead>
                      <TableHead className="text-zinc-300">Record Preview</TableHead>
                      <TableHead className="w-28 text-center text-zinc-300">Status</TableHead>
                      <TableHead className="text-zinc-300">Validation Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.rows.map((row) => (
                      <TableRow
                        key={row.row_number}
                        className={`border-b border-white/[0.08] ${
                          row.is_valid ? "hover:bg-white/[0.02]" : "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
                        }`}
                      >
                        <TableCell className="font-mono text-center text-xs text-zinc-400">
                          #{row.row_number}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-zinc-200">
                            {row.data.name || row.data.product_name || "—"}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {row.data.sku && `SKU: ${row.data.sku}`}
                            {row.data.email && `Email: ${row.data.email}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {row.is_valid ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Valid
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertCircle className="h-3 w-3" /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.is_valid ? (
                            <span className="text-emerald-400/80 font-mono text-[11px]">Ready for import</span>
                          ) : (
                            <ul className="list-disc list-inside space-y-0.5 text-rose-300 text-[11px]">
                              {row.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-white/[0.12] flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleReset()
              onOpenChange(false)
            }}
            disabled={isConfirming}
            className="border-white/[0.14] text-zinc-300 hover:text-white"
          >
            Cancel
          </Button>

          {previewData && (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming || previewData.valid_count === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5"
            >
              {isConfirming
                ? "Importing Valid Records..."
                : `Confirm Import (${previewData.valid_count} Valid ${previewData.valid_count === 1 ? "Row" : "Rows"})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
