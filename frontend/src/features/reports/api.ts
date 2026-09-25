import { apiClient, getAccessToken } from "@/lib/api"

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export type ReportType =
  | "sales"
  | "purchases"
  | "inventory"
  | "inventory-aging"
  | "customers"
  | "payments"
  | "emi"
  | "expenses"
  | "salary"
  | "gst"
  | "profit-loss"

export interface ReportSummary {
  [key: string]: string | number | boolean | Record<string, any> | undefined
}

export interface ReportData {
  report_type: string
  start_date?: string
  end_date?: string
  total_records?: number
  page?: number
  page_size?: number
  total_pages?: number
  summary: ReportSummary
  rows: Record<string, string | number | boolean | null>[]
  accounting_basis?: string
}

export const reportsApi = {
  fetch: (
    type: ReportType,
    params: {
      start_date?: string
      end_date?: string
      page?: number
      page_size?: number
      low_stock_only?: boolean
      bucket?: string
      category_id?: string
      search?: string
    } = {}
  ): Promise<ReportData> => {
    const q = new URLSearchParams()
    if (params.start_date) q.set("start_date", params.start_date)
    if (params.end_date) q.set("end_date", params.end_date)
    if (params.page !== undefined) q.set("page", params.page.toString())
    if (params.page_size !== undefined) q.set("page_size", params.page_size.toString())
    if (params.low_stock_only !== undefined) q.set("low_stock_only", String(params.low_stock_only))
    if (params.bucket) q.set("bucket", params.bucket)
    if (params.category_id) q.set("category_id", params.category_id)
    if (params.search) q.set("search", params.search)

    const qs = q.toString()
    return apiClient.get<ReportData>(`/api/reports/${type}${qs ? `?${qs}` : ""}`)
  },

  exportUrl: (
    type: ReportType,
    format: "csv" | "excel" | "pdf",
    params: {
      start_date?: string
      end_date?: string
      low_stock_only?: boolean
      bucket?: string
      category_id?: string
    } = {}
  ): string => {
    const qs = new URLSearchParams({
      format,
      ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    })
    return `${BASE_URL.replace(/\/$/, "")}/api/reports/${type}/export?${qs}`
  },

  download: async (
    type: ReportType,
    format: "csv" | "excel" | "pdf",
    params: {
      start_date?: string
      end_date?: string
      low_stock_only?: boolean
      bucket?: string
      category_id?: string
    } = {}
  ): Promise<void> => {
    const token = getAccessToken()
    const qs = new URLSearchParams({
      format,
      ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    })
    const url = `${BASE_URL.replace(/\/$/, "")}/api/reports/${type}/export?${qs}`

    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to export report: ${res.statusText}`)
    }

    const blob = await res.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const ext = format === "excel" ? "xlsx" : format
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = `${type}_report_${params.start_date || "all"}_${params.end_date || "all"}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(downloadUrl)
  },
}
