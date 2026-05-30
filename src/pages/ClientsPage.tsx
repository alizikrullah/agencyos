import { useState, useMemo } from 'react'
import { Users, Trash2, Search, ChevronRight, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients, addClient, deleteClient, useInvoices, useContentItems } from '../lib/queries'
import { slugify } from '../lib/slug'
import IndustrySelect from '../components/IndustrySelect'
import type { ClientStatus, Client, Invoice, ContentItem } from '../lib/types'

// Heuristic churn risk score (0-100). No AI call — runs client-side per row.
function computeChurnScore(
  client: Client,
  invoices: Invoice[],
  content: ContentItem[],
): { score: number; level: 'low' | 'medium' | 'high'; reasons: string[] } {
  if (client.status !== 'active') return { score: 0, level: 'low', reasons: [] }

  const reasons: string[] = []
  let score = 0
  const now = new Date()
  const toDateStr = (d: unknown): string => d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' ? d.slice(0, 10) : ''

  const clientInvs = invoices.filter(i => i.client_id === client.id)
  const overdue = clientInvs.filter(i => i.status === 'overdue').length
  const unpaidAmount = clientInvs.filter(i => i.status === 'overdue' || i.status === 'sent').reduce((s, i) => s + (Number(i.amount) || 0), 0)

  if (overdue > 0) { score += 30 + Math.min(overdue * 5, 15); reasons.push(`${overdue} invoice overdue`) }
  else if (unpaidAmount > 0) { score += 10; reasons.push('ada invoice pending') }

  if (client.contract_end) {
    const daysLeft = Math.ceil((new Date(client.contract_end).getTime() - now.getTime()) / 86400000)
    if (daysLeft >= 0 && daysLeft <= 30) { score += 25; reasons.push(`kontrak berakhir ${daysLeft} hari lagi`) }
    else if (daysLeft < 0) { score += 15; reasons.push('kontrak sudah lewat') }
  }

  const last30 = new Date(now.getTime() - 30 * 86400000)
  const prev30Start = new Date(now.getTime() - 60 * 86400000)
  const clientContent = content.filter(c => c.client_id === client.id && c.status === 'posted')
  const postedLast30 = clientContent.filter(c => { const d = toDateStr(c.schedule_date); return d && new Date(d) >= last30 }).length
  const postedPrev30 = clientContent.filter(c => { const d = toDateStr(c.schedule_date); const dt = d ? new Date(d) : null; return dt && dt >= prev30Start && dt < last30 }).length

  if (postedPrev30 > 0 && postedLast30 < postedPrev30 * 0.5) {
    score += 20; reasons.push(`posting turun ${Math.round((1 - postedLast30 / postedPrev30) * 100)}% vs bulan lalu`)
  }

  if (client.quota_per_month > 0) {
    const curMonth = now.toISOString().slice(0, 7)
    const usedThisMonth = clientContent.filter(c => toDateStr(c.schedule_date).startsWith(curMonth)).length
    const pct = usedThisMonth / client.quota_per_month
    if (pct < 0.3 && now.getDate() > 15) { score += 15; reasons.push(`quota baru ${Math.round(pct * 100)}% padahal pertengahan bulan`) }
  }

  const level: 'low' | 'medium' | 'high' = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'
  return { score: Math.min(100, score), level, reasons }
}

const STATUS_MAP: Record<ClientStatus, string> = {
  active:   'badge badge-green',
  inactive: 'badge badge-gray',
  prospect: 'badge badge-yellow',
}
const STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
}

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Facebook', 'X (Twitter)', 'Threads']

const EMPTY_FORM = {
  name: '', brand_name: '', industry: '', contact_name: '', contact_email: '',
  contact_phone: '', status: 'active' as ClientStatus, notes: '',
  package: '', platforms: [] as string[], contract_start: '', contract_end: '', quota_per_month: 0,
}

export default function ClientsPage() {
  const { user, isDemo } = useAuth()
  const navigate = useNavigate()
  const { data: clients, loading, refetch } = useClients(isDemo)
  const { data: invoices } = useInvoices(isDemo)
  const { data: content } = useContentItems(isDemo)

  const churnByClient = useMemo(() => {
    const map = new Map<string, { score: number; level: 'low' | 'medium' | 'high'; reasons: string[] }>()
    for (const c of clients) map.set(c.id, computeChurnScore(c, invoices, content))
    return map
  }, [clients, invoices, content])
  const atRiskCount = useMemo(() => Array.from(churnByClient.values()).filter(r => r.level !== 'low').length, [churnByClient])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [demoNotice, setDemoNotice] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.brand_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const openAdd = () => { setForm(EMPTY_FORM); setSaveError(null); setDemoNotice(false); setShowAdd(true) }
  const closeAdd = () => setShowAdd(false)

  const togglePlatform = (p: string) =>
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }))

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (isDemo) { setDemoNotice(true); return }
    if (!form.name.trim()) { setSaveError('Nama client wajib diisi.'); return }
    setSaving(true); setSaveError(null)
    const { error } = await addClient({
      name: form.name.trim(),
      brand_name: form.brand_name.trim() || null,
      industry: form.industry || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      package: form.package.trim() || null,
      platforms: form.platforms,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      quota_per_month: form.quota_per_month,
      agency_id: user!.agency_id,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    closeAdd(); refetch()
  }

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`Hapus client "${name}"?`)) return
    if (isDemo) { setDemoNotice(true); return }
    await deleteClient(id)
    refetch()
  }

  const f = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <>
      <div className="page-body">
        <div className="search-row">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 32, maxWidth: 260 }} placeholder="Cari client atau brand..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as ClientStatus | 'all')}>
            <option value="all">Semua Status</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={openAdd}>+ Tambah Client</button>
        </div>

        {atRiskCount > 0 && (
          <div style={{
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <AlertTriangle size={15} color="var(--warning)" />
            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
              <strong>{atRiskCount}</strong> klien aktif terdeteksi at-risk (medium/high churn). Klik klien untuk lihat detail analisis AI.
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Users size={24} color="var(--text-muted)" /></div>
              <h3>{clients.length === 0 ? 'Belum ada client' : 'Tidak ada hasil'}</h3>
              <p style={{ fontSize: 13, maxWidth: 300 }}>
                {clients.length === 0 ? 'Tambahkan client pertama Anda.' : 'Coba ubah kata kunci atau filter.'}
              </p>
              {clients.length === 0 && <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Tambah Client Pertama</button>}
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Client / Brand</th>
                    <th>Paket</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Kontak</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${slugify(c.name)}`)}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{c.name}</div>
                        {c.brand_name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.brand_name}</div>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {c.package ? <span style={{ maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.package}</span> : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.platforms.slice(0, 2).map(p => (
                            <span key={p} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p}</span>
                          ))}
                          {c.platforms.length > 2 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{c.platforms.length - 2}</span>}
                          {c.platforms.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                      <td><span className={STATUS_MAP[c.status]}>{STATUS_LABEL[c.status]}</span></td>
                      <td>
                        {(() => {
                          const r = churnByClient.get(c.id)
                          if (!r || r.level === 'low') return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                          const color = r.level === 'high' ? 'var(--danger)' : 'var(--warning)'
                          return (
                            <span title={r.reasons.join('; ')} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                              padding: '2px 8px', borderRadius: 4,
                              background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
                            }}>
                              <AlertTriangle size={10} />
                              {r.level === 'high' ? 'High' : 'Medium'}
                            </span>
                          )
                        })()}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.contact_name ?? '—'}</td>
                      <td>
                        <div className="row-actions" onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/clients/${slugify(c.name)}`)}>
                            <ChevronRight size={14} color="var(--text-muted)" />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Hapus" onClick={e => handleDelete(e, c.id, c.name)}>
                            <Trash2 size={14} color="var(--danger)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          {filtered.length} dari {clients.length} client ditampilkan
        </p>
      </div>

      {/* Add Client Modal */}
      {showAdd && (
        <div className="modal-backdrop" onClick={closeAdd}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Tambah Client Baru</h3>
              <button className="btn btn-ghost btn-sm" onClick={closeAdd}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {demoNotice && <div className="alert alert-warning" style={{ marginBottom: 16 }}>Demo mode — data tidak tersimpan.</div>}
                {saveError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{saveError}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Nama Perusahaan *</label>
                    <input className="input" placeholder="PT Contoh Maju" value={form.name} onChange={f('name')} required />
                  </div>
                  <div className="form-group">
                    <label className="label">Brand Name</label>
                    <input className="input" placeholder="BrandKu" value={form.brand_name} onChange={f('brand_name')} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Industry</label>
                    <IndustrySelect value={form.industry} onChange={v => setForm(p => ({ ...p, industry: v }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={f('status')}>
                      <option value="active">Active</option>
                      <option value="prospect">Prospect</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Paket Layanan</label>
                  <input className="input" placeholder="cth: Paket Premium — 20 Konten/Bulan" value={form.package} onChange={f('package')} />
                </div>

                <div className="form-group">
                  <label className="label">Platform</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {PLATFORMS.map(p => (
                      <button
                        key={p} type="button"
                        onClick={() => togglePlatform(p)}
                        style={{
                          padding: '4px 12px', fontSize: 12, borderRadius: 100, cursor: 'pointer', border: '1px solid',
                          fontFamily: 'var(--font-sans)', fontWeight: 500,
                          background: form.platforms.includes(p) ? 'var(--accent)' : 'var(--bg-elevated)',
                          borderColor: form.platforms.includes(p) ? 'var(--accent)' : 'var(--border)',
                          color: form.platforms.includes(p) ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Kontrak Mulai</label>
                    <input className="input" type="date" value={form.contract_start} onChange={f('contract_start')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Kontrak Selesai</label>
                    <input className="input" type="date" value={form.contract_end} onChange={f('contract_end')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Quota/Bulan</label>
                    <input className="input" type="number" placeholder="20" value={form.quota_per_month || ''} onChange={e => setForm(p => ({ ...p, quota_per_month: Number(e.target.value) }))} min={0} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Nama Kontak</label>
                  <input className="input" placeholder="Budi Santoso" value={form.contact_name} onChange={f('contact_name')} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Email</label>
                    <input className="input" type="email" placeholder="budi@brand.com" value={form.contact_email} onChange={f('contact_email')} />
                  </div>
                  <div className="form-group">
                    <label className="label">No. Telepon</label>
                    <input className="input" placeholder="08xxxxxxxxxx" value={form.contact_phone} onChange={f('contact_phone')} />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label">Catatan</label>
                  <textarea className="input" placeholder="Catatan tambahan..." value={form.notes} onChange={f('notes')} style={{ minHeight: 60 }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeAdd}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
