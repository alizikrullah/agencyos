import { useState, useEffect, useCallback } from 'react'
import { sql } from './neon'
import type { Client, ContentItem, Invoice, Transaction, SalarySlip, AdCampaign, ChatMessageRow } from './types'
import {
  DEMO_CLIENTS, DEMO_CONTENT, DEMO_INVOICES,
  DEMO_TRANSACTIONS, DEMO_SALARY_SLIPS,
} from './demo-data'

export interface QueryResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

function parseClient(row: any): Client {
  return {
    ...row,
    platforms: row.platforms ? String(row.platforms).split(',').filter(Boolean) : [],
    quota_per_month: Number(row.quota_per_month ?? 0),
  }
}

function parseInvoice(row: any): Invoice {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    tax_percent: Number(row.tax_percent ?? 0),
  }
}

function parseTransaction(row: any): Transaction {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  }
}

function parseContentItem(row: any): ContentItem {
  return {
    ...row,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
  }
}

function parseSalarySlip(row: any): SalarySlip {
  return {
    ...row,
    base_salary: Number(row.base_salary ?? 0),
    net_salary: Number(row.net_salary ?? 0),
    month: Number(row.month ?? 0),
    year: Number(row.year ?? 0),
  }
}

// ── Clients ───────────────────────────────────────────────────────────────────
export function useClients(isDemo: boolean): QueryResult<Client> {
  const [data, setData] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    if (isDemo) { setData(DEMO_CLIENTS); setLoading(false); return }
    try {
      const rows = await sql`SELECT * FROM clients ORDER BY created_at DESC`
      setData((rows as any[]).map(parseClient))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [isDemo])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

// ── Content Items ─────────────────────────────────────────────────────────────
export function useContentItems(isDemo: boolean): QueryResult<ContentItem> {
  const [data, setData] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    if (isDemo) { setData(DEMO_CONTENT); setLoading(false); return }
    try {
      const rows = await sql`SELECT * FROM content_items ORDER BY schedule_date ASC NULLS LAST, created_at DESC`
      setData((rows as any[]).map(parseContentItem))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [isDemo])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

// ── Invoices ──────────────────────────────────────────────────────────────────
export function useInvoices(isDemo: boolean): QueryResult<Invoice> {
  const [data, setData] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    if (isDemo) { setData(DEMO_INVOICES); setLoading(false); return }
    try {
      const rows = await sql`SELECT * FROM invoices ORDER BY created_at DESC`
      setData((rows as any[]).map(parseInvoice))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [isDemo])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

// ── Transactions ──────────────────────────────────────────────────────────────
export function useTransactions(isDemo: boolean): QueryResult<Transaction> {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    if (isDemo) { setData(DEMO_TRANSACTIONS); setLoading(false); return }
    try {
      const rows = await sql`SELECT * FROM transactions ORDER BY date DESC`
      setData((rows as any[]).map(parseTransaction))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [isDemo])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

// ── Salary Slips ──────────────────────────────────────────────────────────────
export function useSalarySlips(isDemo: boolean): QueryResult<SalarySlip> {
  const [data, setData] = useState<SalarySlip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    if (isDemo) { setData(DEMO_SALARY_SLIPS); setLoading(false); return }
    try {
      const rows = await sql`SELECT * FROM salary_slips ORDER BY year DESC, month DESC`
      setData((rows as any[]).map(parseSalarySlip))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [isDemo])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

// ── Mutations ─────────────────────────────────────────────────────────────────
type MutResult<T> = Promise<{ data: T | null; error: Error | null }>

export const addClient = async (r: Omit<Client, 'id' | 'created_at'>): MutResult<Client> => {
  try {
    const platformsStr = (r.platforms ?? []).join(',')
    const rows = await sql`
      INSERT INTO clients (agency_id, name, brand_name, industry, contact_name, contact_email, contact_phone, status, notes, package, platforms, contract_start, contract_end, quota_per_month)
      VALUES (${r.agency_id}, ${r.name}, ${r.brand_name}, ${r.industry}, ${r.contact_name}, ${r.contact_email}, ${r.contact_phone}, ${r.status}, ${r.notes}, ${r.package ?? null}, ${platformsStr}, ${r.contract_start ?? null}, ${r.contract_end ?? null}, ${r.quota_per_month ?? 0})
      RETURNING *`
    return { data: parseClient(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const updateClient = async (id: string, r: Partial<Omit<Client, 'id' | 'created_at' | 'agency_id'>>): MutResult<Client> => {
  try {
    const platformsStr = (r.platforms ?? []).join(',')
    const rows = await sql`
      UPDATE clients SET
        name = ${r.name ?? null},
        brand_name = ${r.brand_name ?? null},
        industry = ${r.industry ?? null},
        contact_name = ${r.contact_name ?? null},
        contact_email = ${r.contact_email ?? null},
        contact_phone = ${r.contact_phone ?? null},
        status = ${r.status ?? 'active'},
        notes = ${r.notes ?? null},
        package = ${r.package ?? null},
        platforms = ${platformsStr},
        contract_start = ${r.contract_start ?? null},
        contract_end = ${r.contract_end ?? null},
        quota_per_month = ${r.quota_per_month ?? 0}
      WHERE id = ${id}
      RETURNING *`
    return { data: parseClient(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const deleteClient = async (id: string): MutResult<null> => {
  try {
    await sql`DELETE FROM clients WHERE id = ${id}`
    return { data: null, error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const addContentItem = async (r: Omit<ContentItem, 'id' | 'created_at'>): MutResult<ContentItem> => {
  try {
    const rows = await sql`
      INSERT INTO content_items (agency_id, client_id, title, platform, content_type, content_pillar, schedule_date, status, caption, ai_generated, mirror_source_id, views, likes, comments)
      VALUES (${r.agency_id}, ${r.client_id}, ${r.title}, ${r.platform}, ${r.content_type}, ${r.content_pillar}, ${r.schedule_date}, ${r.status}, ${r.caption}, ${r.ai_generated}, ${r.mirror_source_id}, ${r.views ?? 0}, ${r.likes ?? 0}, ${r.comments ?? 0})
      RETURNING *`
    return { data: parseContentItem(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const updateContentItem = async (id: string, r: Partial<Omit<ContentItem, 'id' | 'created_at' | 'agency_id'>>): MutResult<ContentItem> => {
  try {
    const rows = await sql`
      UPDATE content_items SET
        title = ${r.title ?? null}, platform = ${r.platform ?? null},
        content_type = ${r.content_type ?? null}, content_pillar = ${r.content_pillar ?? null},
        schedule_date = ${r.schedule_date ?? null}, status = ${r.status ?? 'draft'},
        caption = ${r.caption ?? null}, views = ${r.views ?? 0},
        likes = ${r.likes ?? 0}, comments = ${r.comments ?? 0}
      WHERE id = ${id} RETURNING *`
    return { data: parseContentItem(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const deleteContentItem = async (id: string): MutResult<null> => {
  try {
    await sql`DELETE FROM content_items WHERE id = ${id}`
    return { data: null, error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const addInvoice = async (r: Omit<Invoice, 'id' | 'created_at'>): MutResult<Invoice> => {
  try {
    const rows = await sql`
      INSERT INTO invoices (agency_id, client_id, invoice_number, amount, status, issued_date, due_date, items, notes, recipient_name, recipient_title, payment_name, bank_name, bank_account, tax_percent, signature_name)
      VALUES (${r.agency_id}, ${r.client_id}, ${r.invoice_number}, ${r.amount}, ${r.status}, ${r.issued_date}, ${r.due_date}, ${JSON.stringify(r.items)}, ${r.notes}, ${r.recipient_name ?? null}, ${r.recipient_title ?? null}, ${r.payment_name ?? null}, ${r.bank_name ?? null}, ${r.bank_account ?? null}, ${r.tax_percent ?? 0}, ${r.signature_name ?? null})
      RETURNING *`
    return { data: parseInvoice(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const addTransaction = async (r: Omit<Transaction, 'id' | 'created_at'>): MutResult<Transaction> => {
  try {
    const rows = await sql`
      INSERT INTO transactions (agency_id, client_id, type, category, amount, description, date, reference_id)
      VALUES (${r.agency_id}, ${r.client_id ?? null}, ${r.type}, ${r.category}, ${r.amount}, ${r.description}, ${r.date}, ${r.reference_id})
      RETURNING *`
    return { data: parseTransaction(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const deleteTransaction = async (id: string): MutResult<null> => {
  try {
    await sql`DELETE FROM transactions WHERE id = ${id}`
    return { data: null, error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

// ── Ad Campaigns ──────────────────────────────────────────────────────────────
function parseAdCampaign(row: any): AdCampaign {
  return {
    ...row,
    budget: Number(row.budget ?? 0),
    spent: Number(row.spent ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    conversions: Number(row.conversions ?? 0),
  }
}

export function useAdCampaigns(clientId: string): QueryResult<AdCampaign> & { refetch: () => Promise<void> } {
  const [data, setData] = useState<AdCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const rows = await sql`SELECT * FROM ad_campaigns WHERE client_id = ${clientId} ORDER BY created_at DESC`
      setData((rows as any[]).map(parseAdCampaign))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setData([])
    } finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { refetch() }, [refetch])
  return { data, loading, error, refetch }
}

export const addAdCampaign = async (r: Omit<AdCampaign, 'id' | 'created_at' | 'updated_at'>): MutResult<AdCampaign> => {
  try {
    const rows = await sql`
      INSERT INTO ad_campaigns (agency_id, client_id, name, platform, objective, status, budget, spent, start_date, end_date, impressions, reach, clicks, conversions, notes)
      VALUES (${r.agency_id}, ${r.client_id}, ${r.name}, ${r.platform}, ${r.objective}, ${r.status}, ${r.budget}, ${r.spent}, ${r.start_date ?? null}, ${r.end_date ?? null}, ${r.impressions}, ${r.reach}, ${r.clicks}, ${r.conversions}, ${r.notes ?? null})
      RETURNING *`
    return { data: parseAdCampaign(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const updateAdCampaign = async (id: string, r: Partial<Omit<AdCampaign, 'id' | 'created_at' | 'updated_at' | 'agency_id' | 'client_id'>>): MutResult<AdCampaign> => {
  try {
    const rows = await sql`
      UPDATE ad_campaigns SET
        name = ${r.name ?? null}, platform = ${r.platform ?? null},
        objective = ${r.objective ?? 'awareness'}, status = ${r.status ?? 'draft'},
        budget = ${r.budget ?? 0}, spent = ${r.spent ?? 0},
        start_date = ${r.start_date ?? null}, end_date = ${r.end_date ?? null},
        impressions = ${r.impressions ?? 0}, reach = ${r.reach ?? 0},
        clicks = ${r.clicks ?? 0}, conversions = ${r.conversions ?? 0},
        notes = ${r.notes ?? null}, updated_at = now()
      WHERE id = ${id} RETURNING *`
    return { data: parseAdCampaign(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const deleteAdCampaign = async (id: string): MutResult<null> => {
  try {
    await sql`DELETE FROM ad_campaigns WHERE id = ${id}`
    return { data: null, error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

export const addSalarySlip = async (r: Omit<SalarySlip, 'id' | 'created_at'>): MutResult<SalarySlip> => {
  try {
    const rows = await sql`
      INSERT INTO salary_slips (agency_id, employee_name, employee_id, month, year, base_salary, allowances, deductions, net_salary, slip_number, items, payment_name, bank_name, bank_account, signature_name)
      VALUES (${r.agency_id}, ${r.employee_name}, ${r.employee_id ?? null}, ${r.month}, ${r.year}, ${r.base_salary}, ${JSON.stringify(r.allowances ?? {})}, ${JSON.stringify(r.deductions ?? {})}, ${r.net_salary}, ${r.slip_number ?? null}, ${JSON.stringify(r.items)}, ${r.payment_name ?? null}, ${r.bank_name ?? null}, ${r.bank_account ?? null}, ${r.signature_name ?? null})
      RETURNING *`
    return { data: parseSalarySlip(rows[0]), error: null }
  } catch (e) { return { data: null, error: e as Error } }
}

// ── Chat Messages ─────────────────────────────────────────────────────────────
export const getChatMessages = async (agencyId: string): Promise<ChatMessageRow[]> => {
  try {
    const rows = await sql`SELECT * FROM chat_messages WHERE agency_id = ${agencyId} ORDER BY created_at ASC`
    return rows as ChatMessageRow[]
  } catch { return [] }
}

export const addChatMessage = async (agencyId: string, role: 'user' | 'assistant', content: string): Promise<void> => {
  try {
    await sql`INSERT INTO chat_messages (agency_id, role, content) VALUES (${agencyId}, ${role}, ${content})`
  } catch { /* non-blocking: chat tetap jalan walau persist gagal */ }
}

export const clearChatMessages = async (agencyId: string): Promise<void> => {
  try {
    await sql`DELETE FROM chat_messages WHERE agency_id = ${agencyId}`
  } catch { /* ignore */ }
}
