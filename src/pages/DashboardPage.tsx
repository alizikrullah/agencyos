import { useState, useMemo } from 'react'
import { Users, CalendarDays, DollarSign, TrendingUp, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients, useContentItems, useInvoices } from '../lib/queries'
import { aiDailyBriefing, aiErrorMessage } from '../lib/gemini'
import MiniMarkdown from '../components/MiniMarkdown'

const fmtIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID')
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge badge-gray',
  scheduled: 'badge badge-blue',
  approved: 'badge badge-yellow',
  posted: 'badge badge-green',
  paid: 'badge badge-green',
  sent: 'badge badge-blue',
  overdue: 'badge badge-red',
}

export default function DashboardPage() {
  const { user, isDemo } = useAuth()
  const navigate = useNavigate()
  const name = user?.email?.split('@')[0] ?? 'there'

  const { data: clients, loading: lc } = useClients(isDemo)
  const { data: content, loading: lct } = useContentItems(isDemo)
  const { data: invoices, loading: li } = useInvoices(isDemo)

  const [briefingText, setBriefingText]       = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError]     = useState<string | null>(null)

  const activeClients = clients.filter(c => c.status === 'active').length
  const totalContent  = content.length
  const totalRevenue  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const pendingCount  = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length

  const STATS = [
    { label: 'Active Clients',  value: lc  ? '…' : String(activeClients), sub: `${clients.length} total client`,          icon: Users,        color: 'var(--accent)'  },
    { label: 'Content Items',   value: lct ? '…' : String(totalContent),  sub: `${content.filter(c=>c.status==='draft').length} masih draft`, icon: CalendarDays, color: 'var(--info)'    },
    { label: 'Revenue (IDR)',   value: li  ? '…' : fmtIDR(totalRevenue),  sub: `${pendingCount} invoice menunggu`,         icon: DollarSign,   color: 'var(--success)' },
    { label: 'Avg. Engagement', value: '0',                                sub: 'Belum ada data snapshot',                  icon: TrendingUp,   color: 'var(--warning)' },
  ]

  const recentContent  = [...content].slice(0, 5)
  const recentInvoices = [...invoices].slice(0, 4)

  // ── Daily Briefing snapshot ────────────────────────────────────────────────
  const briefingSnap = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const toDateStr = (d: unknown): string => {
      if (d instanceof Date) return d.toISOString().slice(0, 10)
      return typeof d === 'string' ? d.slice(0, 10) : ''
    }
    const upcoming = content
      .filter(c => c.status === 'scheduled' && c.schedule_date && toDateStr(c.schedule_date) >= today)
      .sort((a, b) => toDateStr(a.schedule_date).localeCompare(toDateStr(b.schedule_date)))
      .slice(0, 3)
      .map(c => ({ title: c.title, platform: c.platform, date: toDateStr(c.schedule_date) }))
    const pendingInvs = invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .slice(0, 3)
      .map(i => ({ number: i.invoice_number, amount: Number(i.amount) || 0, status: i.status }))
    return {
      userName: name,
      totalClients: activeClients,
      activeCampaigns: 0,
      pendingApprovals: content.filter(c => c.status === 'draft' || c.status === 'approved').length,
      upcomingContent: upcoming,
      pendingInvoices: pendingInvs,
    }
  }, [content, invoices, activeClients, name])

  const handleGenerateBriefing = async () => {
    setBriefingLoading(true); setBriefingError(null)
    try {
      const text = await aiDailyBriefing(briefingSnap)
      setBriefingText(text)
    } catch (e) {
      setBriefingError(aiErrorMessage(e))
    } finally { setBriefingLoading(false) }
  }

  return (
    <>
      <style>{`@keyframes ai-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .ai-spin{animation:ai-spin 1s linear infinite}`}</style>
      <div className="page-body">
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 4 }}>Halo, {name}! 👋</h2>
          <p>Berikut ringkasan operasional agensi hari ini.</p>
        </div>


        {/* AI Daily Briefing */}
        <div className="card" style={{ marginBottom: 20, padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (briefingText || briefingError) ? '1px solid var(--border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
                <Sparkles size={14} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Daily Briefing</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Apa yang perlu diperhatiin hari ini</div>
              </div>
            </div>
            <button onClick={handleGenerateBriefing} disabled={briefingLoading}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
                background: briefingLoading ? 'var(--bg-elevated)' : 'var(--accent)', color: briefingLoading ? 'var(--text-muted)' : '#fff',
                cursor: briefingLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
              }}>
              {briefingLoading ? <><Loader2 size={11} className="ai-spin" />Generating...</> : briefingText ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Generate</>}
            </button>
          </div>
          {briefingError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{briefingError}</div>}
          {briefingText && <div style={{ padding: '8px 16px 14px' }}><MiniMarkdown text={briefingText} /></div>}
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          {STATS.map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
                <div className="stat-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                  <Icon size={18} color={color} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{sub}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent Content */}
          <div className="card">
            <div className="card-header">
              <h3>Konten Terbaru</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}>Lihat semua</button>
            </div>
            {recentContent.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p style={{ fontSize: 13 }}>Belum ada konten.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentContent.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.platform} · {fmtDate(c.schedule_date)}</div>
                    </div>
                    <span className={STATUS_BADGE[c.status] ?? 'badge badge-gray'}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Invoices + Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <h3>Invoice Terbaru</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/finance')}>Lihat semua</button>
              </div>
              {recentInvoices.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Belum ada invoice.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {recentInvoices.map(inv => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.invoice_number}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtIDR(Number(inv.amount))}</div>
                      </div>
                      <span className={STATUS_BADGE[inv.status] ?? 'badge badge-gray'}>{inv.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header"><h3>Quick Actions</h3></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-secondary btn-full" onClick={() => navigate('/clients')}>+ Tambah Content (via Klien)</button>
                <button className="btn btn-secondary btn-full" onClick={() => navigate('/doc-studio/invoice')}>+ Buat Invoice</button>
                <button className="btn btn-secondary btn-full" onClick={() => navigate('/clients')}>+ Tambah Client</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
