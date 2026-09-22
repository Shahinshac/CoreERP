import { toast } from "sonner"

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

// In-memory access token storage (never localStorage)
let inMemoryAccessToken: string | null = null
let currentAudience: "staff" | "customer" = "staff"

export const setAccessToken = (token: string | null, audience: "staff" | "customer" = "staff") => {
  inMemoryAccessToken = token
  currentAudience = audience
}

export const getAccessToken = () => inMemoryAccessToken

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const endpoint = currentAudience === "staff" ? "/api/staff/auth/refresh" : "/api/customers/auth/refresh"
      const url = `${BASE_URL.replace(/\/$/, "")}${endpoint}`
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })

      if (!response.ok) {
        setAccessToken(null)
        return null
      }

      const data = await response.json()
      const token = data.access_token
      setAccessToken(token, currentAudience)
      return token
    } catch {
      setAccessToken(null)
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function requestWithRetry<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const url = `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`

  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  }

  if (inMemoryAccessToken) {
    headers["Authorization"] = `Bearer ${inMemoryAccessToken}`
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    })

    // On 401 Unauthorized: retry once if not already retried and refresh works
    if (response.status === 401 && !isRetry && !path.includes("/auth/")) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        return requestWithRetry<T>(path, options, true)
      }
    }

    if (!response.ok) {
      let errorData: ApiErrorResponse | null = null
      try {
        errorData = await response.json()
      } catch {
        // Response is not JSON
      }

      const code = errorData?.error?.code || `HTTP_${response.status}`
      const message = errorData?.error?.message || response.statusText || "Request failed"
      const details = errorData?.error?.details

      // Show notification on client errors
      if (response.status >= 400 && !path.includes("/auth/refresh")) {
        toast.error(message)
      }

      throw new ApiError(response.status, code, message, details)
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  } catch (err) {
    if (err instanceof ApiError) {
      throw err
    }
    const message = err instanceof Error ? err.message : "Network error"
    toast.error("Network connection error: " + message)
    throw new ApiError(0, "NETWORK_ERROR", message)
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    requestWithRetry<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    requestWithRetry<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    }),
  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    requestWithRetry<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    }),
  delete: <T>(path: string, options?: RequestInit) =>
    requestWithRetry<T>(path, { ...options, method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, options?: RequestInit) =>
    requestWithRetry<T>(path, {
      ...options,
      method: "POST",
      body: formData,
    }),
}

export interface PingResponse {
  status: string
}

export interface HealthResponse {
  status: string
  database: string
}

export const api = {
  ping: () => apiClient.get<PingResponse>("/api/ping"),
  health: () => apiClient.get<HealthResponse>("/api/health"),
}
