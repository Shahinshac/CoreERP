export type ExpenseCategory =
  | 'salary'
  | 'rent'
  | 'utilities'
  | 'transport'
  | 'marketing'
  | 'maintenance'
  | 'other';

export type ExpenseSource = 'system_salary' | 'manual';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: string; // Decimal string e.g. "2500.00"
  description: string | null;
  date: string; // YYYY-MM-DD
  created_by: string;
  creator_name: string | null;
  source: ExpenseSource;
  reference_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreatePayload {
  category: ExpenseCategory;
  amount: string;
  description?: string;
  date: string;
}

export interface ExpenseUpdatePayload {
  category?: ExpenseCategory;
  amount?: string;
  description?: string;
  date?: string;
}

export interface ExpenseListResponse {
  items: Expense[];
  total: number;
  page: number;
  limit: number;
}

export interface FinancialSummary {
  period: string; // YYYY-MM
  revenue: string; // Primary Cash Revenue
  returns_refunded?: string; // Total product returns & refunds in period
  net_revenue?: string; // Net Revenue (revenue - returns_refunded)
  invoiced_revenue: string; // Accrual Revenue
  credit_notes_refunded?: string;
  cost_of_goods: string;
  expenses: string;
  expenses_breakdown: Record<string, string>;
  gross_profit: string;
  net_profit: string;
  outstanding_receivables: string;
  emi_receivables: string;
  total_receivables: string;
  accounting_basis: string;
}

export interface ExpenseFilterParams {
  period?: string;
  category?: string;
  source?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}
