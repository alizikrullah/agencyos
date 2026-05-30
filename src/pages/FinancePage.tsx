import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, ArrowUpDown, Trash2, Plus, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients, useTransactions, addTransaction, deleteTransaction } from '../lib/queries'
import { aiSuggestCategory, aiFinanceInsight, aiErrorMessage } from '../lib/gemini'
import { useAiCache, timeAgo } from '../lib/useAiCache'
import MiniMarkdown from '../components/MiniMarkdown'
import type { TransactionType } from '../lib/types'

const fmtIDR = (n: number) => 'Rp ' + Math.abs(n).toLocaleString('id-ID')
const toDateStr = (d: unknown): string | null =>
  d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' ? d : null

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const INCOME_CATS  = ['Invoice Klien', 'Project Fee', 'Retainer', 'Lainnya']
const EXPENSE_CATS = ['Gaji Karyawan', 'Software & Tools', 'Iklan & Promosi', 'Operasional', 'Peralatan', 'Lainnya']
const EMPTY_TX = {
  type: 'income' as TransactionType,
  category: '', amount: '', description: '',
  date: new Date().toISOString().split('T')[0],
  client_id: '',
}

function BarChart({ transactions }: { transactions: { type: string; amount: unknown; date: unknown }[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; label: string; inc: number; exp: number } | null>(null)
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const inc = transactions.filter(t => t.type === 'income'  && toDateStr(t.date)?.startsWith(key)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const exp = transactions.filter(t => t.type === 'expense' && toDateStr(t.date)?.startsWith(key)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    return { label: ID_MONTHS[d.getMonth()], key, inc, exp }
  })
  const maxVal = Math.max(...months.flatMap(m => [m.inc, m.exp]), 1)
  const CH = 150 // chart height px

  const fmtY = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}jt`
    : v >= 1_000 ? `${(v / 1_000).toFixed(0)}rb` : '0'

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Y-axis labels */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 8, height: CH, flexShrink: 0, width: 44 }}>
          {[1, 0.75, 0.5, 0.25, 0].map(f => (
            <span key={f} style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>{fmtY(maxVal * f)}</span>
          ))}
        </div>
        {/* Bars area */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <div key={f} style={{
              position: 'absolute', left: 0, right: 0, height: 1,
              top: `${(1 - f) * 100}%`, background: 'var(--border)', opacity: 0.5,
            }} />
          ))}
          {/* Bars row */}
          <div style={{ display: 'flex', height: CH, alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
            {months.map(m => {
              const incH = m.inc > 0 ? Math.max((m.inc / maxVal) * CH, 3) : 0
              const expH = m.exp > 0 ? Math.max((m.exp / maxVal) * CH, 3) : 0
              return (
                <div key={m.key} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3, cursor: 'pointer' }}
                  onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, label: m.label, inc: m.inc, exp: m.exp })}
                  onMouseLeave={() => setTip(null)}
                >
                  <div style={{ width: 14, height: incH, background: 'var(--accent)', borderRadius: '2px 2px 0 0', transition: 'opacity .15s' }} />
                  <div style={{ width: 14, height: expH, background: 'var(--text-muted)', borderRadius: '2px 2px 0 0', opacity: 0.55, transition: 'opacity .15s' }} />
                </div>
              )
            })}
          </div>
          {/* X-axis labels */}
          <div style={{ display: 'flex', marginTop: 6 }}>
            {months.map(m => (
              <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{m.label}</div>
            ))}
          </div>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, display: 'inline-block' }} /> Pemasukan
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: 'var(--text-muted)', borderRadius: 2, display: 'inline-block', opacity: 0.55 }} /> Pengeluaran
        </span>
      </div>
      {/* Tooltip */}
      {tip && (
        <div style={{
          position: 'fixed', left: tip.x + 12, top: tip.y - 40,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px', fontSize: 12, zIndex: 999, pointerEvents: 'none',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{tip.label}</div>
          <div style={{ color: 'var(--success)' }}>Pemasukan &nbsp;: {fmtIDR(tip.inc)}</div>
          <div style={{ color: 'var(--danger)'  }}>Pengeluaran : {fmtIDR(tip.exp)}</div>
        </div>
      )}
    </div>
  )
}

export default function FinancePage() {
  const { user, isDemo } = useAuth()
  const { data: clients } = useClients(isDemo)
  const { data: transactions, loading, refetch } = useTransactions(isDemo)

  const [typeFilter, setTypeFilter]   = useState<TransactionType | 'all'>('all')
  const [monthFilter, setMonthFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState(EMPTY_TX)
  const [saving, setSaving]             = useState(false)
  const [demoNotice, setDemoNotice]     = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [aiCatLoading, setAiCatLoading]       = useState(false)
  const [insightLoading, setInsightLoading]   = useState(false)
  const [insightError, setInsightError]       = useState<string | null>(null)

  const clientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? '—'

  const curMonth   = new Date().toISOString().slice(0, 7)
  const { cached: insightText, cachedAt: insightAt, save: saveInsight } = useAiCache<string>(`finance-insight:${curMonth}`)
  const curIncome  = transactions.filter(t => t.type === 'income'  && toDateStr(t.date)?.startsWith(curMonth)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const curExpense = transactions.filter(t => t.type === 'expense' && toDateStr(t.date)?.startsWith(curMonth)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const netMonth   = curIncome - curExpense

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (monthFilter && !toDateStr(t.date)?.startsWith(monthFilter)) return false
    if (clientFilter && t.client_id !== clientFilter) return false
    return true
  })
  const filteredNet = filtered.reduce((s, t) => t.type === 'income' ? s + (Number(t.amount) || 0) : s - (Number(t.amount) || 0), 0)

  const openForm = () => { setForm(EMPTY_TX); setSaveError(null); setDemoNotice(false); setShowForm(true) }

  const f = (k: keyof typeof EMPTY_TX) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDemo) { setDemoNotice(true); return }
    if (!form.amount || !form.category.trim()) { setSaveError('Kategori dan jumlah wajib diisi.'); return }
    setSaving(true); setSaveError(null)
    const { error } = await addTransaction({
      type: form.type,
      category: form.category.trim(),
      amount: Number(form.amount),
      description: form.description.trim() || null,
      date: form.date,
      agency_id: user!.agency_id,
      client_id: form.client_id || null,
      reference_id: null,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowForm(false); refetch()
  }

  const handleDelete = async (id: string) => {
    if (isDemo) return
    await deleteTransaction(id)
    setDeleteConfirmId(null)
    refetch()
  }

  const cats = form.type === 'income' ? INCOME_CATS : EXPENSE_CATS

  // ── AI: Auto-categorize transaction ────────────────────────────────────────
  const handleAiCategorize = async () => {
    if (!form.description.trim()) { setSaveError('Isi deskripsi dulu untuk AI suggest kategori.'); return }
    setAiCatLoading(true); setSaveError(null)
    try {
      const cat = await aiSuggestCategory(form.description, form.type)
      setForm(p => ({ ...p, category: cat }))
    } catch (e) {
      setSaveError(aiErrorMessage(e))
    } finally { setAiCatLoading(false) }
  }

  // ── AI: Financial Insight snapshot + handler ───────────────────────────────
  const insightSnapshot = useMemo(() => {
    const now = new Date()
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    const prevIncome  = transactions.filter(t => t.type === 'income'  && toDateStr(t.date)?.startsWith(prevKey)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const prevExpense = transactions.filter(t => t.type === 'expense' && toDateStr(t.date)?.startsWith(prevKey)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const expByCat = new Map<string, number>()
    transactions.filter(t => t.type === 'expense' && toDateStr(t.date)?.startsWith(curMonth)).forEach(t => {
      const c = t.category || 'Lainnya'
      expByCat.set(c, (expByCat.get(c) || 0) + (Number(t.amount) || 0))
    })
    const topExpenseCategories = Array.from(expByCat.entries())
      .sort(([, a], [, b]) => b - a).slice(0, 3)
      .map(([cat, amount]) => ({ cat, amount }))
    return {
      monthLabel: `${ID_MONTHS[now.getMonth()]} ${now.getFullYear()}`,
      curIncome, curExpense, prevIncome, prevExpense,
      topExpenseCategories, pendingInvoices: 0,
    }
  }, [transactions, curMonth, curIncome, curExpense])

  const handleGenerateInsight = async () => {
    setInsightLoading(true); setInsightError(null)
    try {
      const text = await aiFinanceInsight(insightSnapshot)
      saveInsight(text)
    } catch (e) {
      setInsightError(aiErrorMessage(e))
    } finally { setInsightLoading(false) }
  }

  return (
    <>
      <style>{`@keyframes ai-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .ai-spin{animation:ai-spin 1s linear infinite}`}</style>

      <div className="page-body">
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={openForm} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} />Tambah Transaksi
          </button>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {([
            { label: 'Pemasukan Bulan Ini',  value: fmtIDR(curIncome),  icon: TrendingUp,  color: 'var(--success)' },
            { label: 'Pengeluaran Bulan Ini', value: fmtIDR(curExpense), icon: TrendingDown, color: 'var(--danger)'  },
            { label: 'Net Bulan Ini',          value: fmtIDR(netMonth),   icon: Minus,       color: netMonth >= 0 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Total Transaksi',        value: String(transactions.length), icon: ArrowUpDown, color: 'var(--info)' },
          ] as const).map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: label === 'Net Bulan Ini' ? color : 'var(--text-primary)' }}>{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
                <div className="stat-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                  <Icon size={15} color={color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Financial Insight */}
        <div className="card" style={{ marginBottom: 20, padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (insightText || insightError) ? '1px solid var(--border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
                <Sparkles size={14} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Financial Insight</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  AI-generated analysis untuk {insightSnapshot.monthLabel}
                  {insightText && insightAt && <span> · diperbarui {timeAgo(insightAt)}</span>}
                </div>
              </div>
            </div>
            <button onClick={handleGenerateInsight} disabled={insightLoading}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
                background: insightLoading ? 'var(--bg-elevated)' : 'var(--accent)', color: insightLoading ? 'var(--text-muted)' : '#fff',
                cursor: insightLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
              }}>
              {insightLoading ? <><Loader2 size={11} className="ai-spin" />Generating...</> : insightText ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Generate</>}
            </button>
          </div>
          {insightError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{insightError}</div>}
          {insightText && <div style={{ padding: '8px 16px 14px' }}><MiniMarkdown text={insightText} /></div>}
        </div>

        {/* Chart */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Pemasukan vs Pengeluaran (6 Bulan Terakhir)</h3></div>
          <BarChart transactions={transactions} />
        </div>

        {/* Inline Add Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Transaksi Baru</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ padding: '16px 20px' }}>
                {demoNotice && <div className="alert alert-warning" style={{ marginBottom: 12 }}>Demo mode — data tidak tersimpan.</div>}
                {saveError  && <div className="alert alert-error"   style={{ marginBottom: 12 }}>{saveError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label">Tipe</label>
                    <select className="input" value={form.type} onChange={f('type')}>
                      <option value="income">Pemasukan</option>
                      <option value="expense">Pengeluaran</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="label" style={{ margin: 0 }}>Kategori *</label>
                      <button type="button" onClick={handleAiCategorize} disabled={aiCatLoading || !form.description.trim()}
                        title={form.description.trim() ? 'AI suggest dari deskripsi' : 'Isi deskripsi dulu'}
                        style={{
                          background: 'none', border: 'none', cursor: form.description.trim() ? 'pointer' : 'not-allowed',
                          padding: 0, color: 'var(--accent)', fontSize: 10, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 3,
                          opacity: !form.description.trim() ? 0.35 : 1, fontFamily: 'var(--font-sans)',
                        }}>
                        {aiCatLoading ? <Loader2 size={11} className="ai-spin" /> : <Sparkles size={11} />}
                        AI
                      </button>
                    </div>
                    <select className="input" value={form.category} onChange={f('category')} required>
                      <option value="">Pilih...</option>
                      {cats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label">Jumlah (IDR) *</label>
                    <input className="input" type="number" placeholder="1000000" value={form.amount} onChange={f('amount')} required min={1} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label">Tanggal</label>
                    <input className="input" type="date" value={form.date} onChange={f('date')} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label">Klien (opsional)</label>
                    <select className="input" value={form.client_id} onChange={f('client_id')}>
                      <option value="">— Tidak ada —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label">Keterangan</label>
                    <input className="input" placeholder="Deskripsi transaksi..." value={form.description} onChange={f('description')} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['all', 'income', 'expense'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: typeFilter === t ? 'var(--accent)' : 'transparent',
                color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
              }}>
                {t === 'all' ? 'Semua' : t === 'income' ? 'Pemasukan' : 'Pengeluaran'}
              </button>
            ))}
          </div>
          <input type="month" className="input" style={{ width: 160 }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
          <select className="input" style={{ width: 200 }} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">Semua Klien</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(typeFilter !== 'all' || monthFilter || clientFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setTypeFilter('all'); setMonthFilter(''); setClientFilter('') }}>
              Reset Filter
            </button>
          )}
        </div>

        {/* Transaction Table */}
        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>Belum ada transaksi</h3>
              {transactions.length === 0 && <button className="btn btn-primary btn-sm" onClick={openForm}>+ Tambah Transaksi</button>}
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th><th>Tipe</th><th>Kategori</th><th>Pihak</th>
                    <th>Keterangan</th><th style={{ textAlign: 'right' }}>Jumlah</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => {
                    const ds = toDateStr(tx.date)
                    const label = ds
                      ? new Date(ds + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'
                    return (
                      <tr key={tx.id}>
                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</td>
                        <td>
                          <span className={tx.type === 'income' ? 'badge badge-green' : 'badge badge-red'}>
                            {tx.type === 'income' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{tx.category ?? '—'}</td>
                        <td style={{ color: tx.client_id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12 }}>
                          {clientName(tx.client_id)}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                            {tx.description ?? '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                          {tx.type === 'income' ? '+' : '−'}&nbsp;{fmtIDR(Number(tx.amount))}
                        </td>
                        <td>
                          {deleteConfirmId === tx.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                                onClick={() => handleDelete(tx.id)}>Yakin</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)}>Batal</button>
                            </div>
                          ) : (
                            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(tx.id)} title="Hapus">
                              <Trash2 size={13} color="var(--danger)" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-elevated)' }}>
                    <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {filtered.length} transaksi
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13,
                      color: filteredNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {filteredNet >= 0 ? '+' : '−'}&nbsp;{fmtIDR(Math.abs(filteredNet))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
