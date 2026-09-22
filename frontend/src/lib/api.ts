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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null
    try {
      errorData = await response.json()
    } catch {
      // Body is not JSON
    }

    const code = errorData?.error?.code || `HTTP_${response.status}`
    const message = errorData?.error?.message || response.statusText || "Request failed"
    const details = errorData?.error?.details

    throw new ApiError(response.status, code, message, details)
  }

  return response.json() as Promise<T>
}

export const apiClient = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
    const response = await fetch(url, {
      ...init,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const url = `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
    const response = await fetch(url, {
      ...init,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },
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
