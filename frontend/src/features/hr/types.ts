export type StaffRole = "Super Admin" | "Admin" | "Manager" | "Staff" | "Accountant"

export interface DeductionConfigItem {
  name: string
  type: "fixed" | "percentage"
  value: string | number
}

export interface StaffUser {
  id: string
  email: string
  role: StaffRole
  is_active: boolean
  full_name?: string | null
  phone?: string | null
  employee_code?: string | null
  joining_date?: string | null
  base_salary: string
  deductions_config?: DeductionConfigItem[] | null
  deactivated_at?: string | null
  created_at: string
}

export interface StaffListResponse {
  items: StaffUser[]
  total: number
  page: number
  limit: number
}

export interface StaffCreatePayload {
  email: string
  password: string
  role: StaffRole
  full_name?: string
  phone?: string
  employee_code?: string
  joining_date?: string
  base_salary: string
  deductions_config?: DeductionConfigItem[]
}

export interface StaffUpdatePayload {
  full_name?: string
  phone?: string
  employee_code?: string
  joining_date?: string
  role?: StaffRole
  base_salary?: string
  deductions_config?: DeductionConfigItem[]
}

export interface ItemizedDeductionSnapshot {
  name: string
  type: "fixed" | "percentage"
  value: string
  amount: string
}

export interface SalaryCalculationPreview {
  staff_id: string
  staff_name: string
  staff_email: string
  employee_code?: string | null
  is_active: boolean
  is_prorated: boolean
  proration_reason?: string | null
  active_days: number
  total_days: number
  original_base_salary: string
  prorated_base_salary: string
  deductions: ItemizedDeductionSnapshot[]
  total_deductions: string
  net_salary: string
  already_generated: boolean
}

export interface SalaryPreviewResponse {
  period: string
  eligible_count: number
  total_net_payout: string
  items: SalaryCalculationPreview[]
}

export interface SalaryRecord {
  id: string
  staff_id: string
  staff_name?: string | null
  staff_email?: string | null
  employee_code?: string | null
  period: string
  base_salary: string
  deductions: ItemizedDeductionSnapshot[]
  total_deductions: string
  net_salary: string
  status: "generated" | "paid"
  generated_at: string
  generated_by: string
  paid_at?: string | null
  paid_by?: string | null
  payment_id?: string | null
  expense_id?: string | null
  notes?: string | null
}

export interface SalaryRecordListResponse {
  items: SalaryRecord[]
  total: number
  page: number
  limit: number
}

export interface SalaryPayPayload {
  method: "bank_transfer" | "cash" | "upi"
  reference_id?: string
  notes?: string
}
