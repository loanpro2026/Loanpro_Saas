// ============================================================
// LoanPro SaaS — Domain Types
// ============================================================

export type CategoryType = 'Gold' | 'Silver'
export type LoanStatus   = 'active' | 'closed'
export type UserRole     = 'owner' | 'staff'
export type PlanType     = 'trial' | 'basic' | 'pro'
export type PlanStatus   = 'active' | 'expired' | 'cancelled'
export type SubStatus    = 'pending' | 'active' | 'expired' | 'cancelled' | 'failed'
export type CashTxType   = 'add' | 'remove'

export interface Tenant {
  id: string
  shop_name: string
  owner_id: string
  plan: PlanType
  plan_status: PlanStatus
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface AppUser {
  id: string
  auth_id: string
  tenant_id: string
  full_name: string
  email: string
  role: UserRole
  created_at: string
}

export interface Loan {
  id: number
  tenant_id: string
  name: string
  father_name: string | null
  location: string | null
  address: string | null
  additional_information: string | null
  category_type: CategoryType
  detailed_type: string | null
  weight: number | null
  amount: number
  interest: number | null
  face_verified_by: string | null
  face_verification_log: Record<string, unknown> | null
  remarks: string | null
  issue_date: string
  active_timestamp: string | null
  status: LoanStatus
  closed_date: string | null
  closed_timestamp: string | null
  created_at: string
  updated_at: string
  // joined
  has_photo?: boolean
  total_deposits?: number
}

export interface LoanPhoto {
  loan_id: number
  tenant_id: string
  /** Cloudflare R2 object key. Never a URL — the bucket is private.
   *  Render with `photoUrl(loanId)` from lib/storage. */
  r2_key: string
  byte_size: number | null
  mime_type: string | null
  checksum: string | null
  /** Set when the loan closed and the photo moved to long-term retention. */
  archived: boolean
  archived_at: string | null
  captured_at: string | null
  created_at: string
}

export interface Deposit {
  id: number
  tenant_id: string
  loan_id: number
  amount: number
  deposit_date: string
  created_at: string
}

export interface DailyCashSummary {
  tenant_id: string
  date: string
  investments: number
  returns: number
  total_cash: number
  added_cash: number
  removed_cash: number
  deposit_credit: number
  deposit_debit: number
  left_cash: number
}

export interface CashTransaction {
  id: number
  tenant_id: string
  transaction_date: string
  type: CashTxType
  amount: number
  reason: string
  created_at: string
}

export interface ActivityLog {
  id: number
  tenant_id: string
  type: string
  description: string
  amount: number | null
  color: string | null
  icon: string | null
  time: string
}

export interface CameraSession {
  id: string
  tenant_id: string
  loan_id: number | null
  session_key: string
  status: 'pending' | 'captured' | 'expired'
  /** R2 object key once the phone has uploaded. Fetch a signed URL from
   *  GET /api/camera?key=<session_key> rather than constructing one. */
  r2_key: string | null
  expires_at: string
  created_at: string
}

export interface Subscription {
  id: string
  tenant_id: string
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  plan: PlanType
  amount: number
  currency: string
  status: SubStatus
  starts_at: string | null
  expires_at: string | null
  created_at: string
}

// Form types
export interface LoanFormData {
  name: string
  father_name?: string
  location?: string
  address?: string
  additional_information?: string
  category_type: CategoryType
  detailed_type?: string
  weight?: number
  amount: number
  interest?: number
  remarks?: string
  issue_date: string
}

export interface DepositFormData {
  loan_id: number
  amount: number
  deposit_date: string
}

export interface CashTransactionFormData {
  type: CashTxType
  amount: number
  reason: string
  transaction_date: string
}

// Dashboard stats
export interface DashboardStats {
  activeLoans: number
  totalOutstanding: number
  todayDeposits: number
  todayNewLoans: number
  cashInHand: number
  goldLoans: number
  silverLoans: number
  closedToday: number
}
