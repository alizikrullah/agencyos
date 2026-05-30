export type ClientStatus = 'active' | 'inactive' | 'prospect'
export type AdStatus = 'draft' | 'active' | 'paused' | 'completed'
export type AdObjective = 'awareness' | 'traffic' | 'engagement' | 'leads' | 'conversions' | 'sales'
export type ContentStatus = 'draft' | 'scheduled' | 'posted' | 'approved'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type TransactionType = 'income' | 'expense'

export interface Client {
  id: string
  agency_id: string
  name: string
  brand_name: string | null
  industry: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: ClientStatus
  notes: string | null
  package: string | null
  platforms: string[]
  contract_start: string | null
  contract_end: string | null
  quota_per_month: number
  created_at: string
}

export interface ContentItem {
  id: string
  client_id: string | null
  agency_id: string
  title: string
  platform: string
  content_type: string | null
  content_pillar: string | null
  schedule_date: string | null
  status: ContentStatus
  caption: string | null
  ai_generated: boolean
  mirror_source_id: string | null
  views: number
  likes: number
  comments: number
  created_at: string
}

export interface AdCampaign {
  id: string
  agency_id: string
  client_id: string
  name: string
  platform: string
  objective: AdObjective
  status: AdStatus
  budget: number
  spent: number
  start_date: string | null
  end_date: string | null
  impressions: number
  reach: number
  clicks: number
  conversions: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  rate: number
  amount: number
}

export interface Invoice {
  id: string
  client_id: string | null
  agency_id: string
  invoice_number: string
  amount: number
  status: InvoiceStatus
  issued_date: string
  due_date: string | null
  items: InvoiceItem[] | null
  notes: string | null
  recipient_name: string | null
  recipient_title: string | null
  payment_name: string | null
  bank_name: string | null
  bank_account: string | null
  tax_percent: number
  signature_name: string | null
  created_at: string
}

export interface Transaction {
  id: string
  agency_id: string
  client_id: string | null
  type: TransactionType
  category: string | null
  amount: number
  description: string | null
  date: string
  reference_id: string | null
  created_at: string
}

export interface ChatMessageRow {
  id: string
  agency_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface SalarySlip {
  id: string
  agency_id: string
  employee_name: string
  employee_id: string | null
  month: number
  year: number
  base_salary: number
  allowances: Record<string, number> | null
  deductions: Record<string, number> | null
  net_salary: number
  slip_number: string | null
  items: InvoiceItem[] | null
  payment_name: string | null
  bank_name: string | null
  bank_account: string | null
  signature_name: string | null
  created_at: string
}
