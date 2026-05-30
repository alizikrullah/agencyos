import { useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Users, CalendarDays, TrendingUp, FileText, Plus, TrendingDown, Pencil, BarChart2, Sparkles, Loader2, RefreshCw, Copy, Check, Wand2, Lightbulb, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients, useContentItems, deleteClient, updateClient, addContentItem, updateContentItem, deleteContentItem, useAdCampaigns, addAdCampaign, updateAdCampaign, deleteAdCampaign, useInvoices } from '../lib/queries'
import { aiAdCopy, aiAdRecommendation, aiCaptionFromTitle, aiContentVariation, aiBulkBrainstorm, aiBestPostingTime, aiIndustryInsight, aiChurnRisk, aiClientReport, aiErrorMessage } from '../lib/gemini'
import { useAiCache, timeAgo } from '../lib/useAiCache'
import { slugify } from '../lib/slug'
import MiniMarkdown from '../components/MiniMarkdown'
import IndustrySelect from '../components/IndustrySelect'
import type { Client, ClientStatus, ContentItem, ContentStatus, AdCampaign, AdStatus, AdObjective } from '../lib/types'

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATUS_LABEL: Record<ClientStatus, string> = { active: 'Aktif', inactive: 'Tidak Aktif', prospect: 'Prospek' }
const STATUS_CLS: Record<ClientStatus, string>   = { active: 'badge badge-green', inactive: 'badge badge-gray', prospect: 'badge badge-yellow' }
const PLATFORM_COLORS: Record<string, string> = {
  Instagram: '#e1306c', TikTok: '#010101', YouTube: '#ff0000',
  LinkedIn: '#0077b5', Facebook: '#1877f2', 'X (Twitter)': '#14171a', Threads: '#000',
}
const PLATFORMS  = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Facebook', 'X (Twitter)', 'Threads']

// ── Simple SVG Charts ─────────────────────────────────────────────────────────

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>Belum ada data</div>
  let angle = -90
  const r = 50; const cx = 64; const cy = 64; const sw = 20
  const slices = data.filter(d => d.value > 0).map(d => {
    const pct = d.value / total
    const a = pct * 360
    const start = angle; angle += a
    const startRad = (start * Math.PI) / 180
    const endRad   = ((start + a) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad); const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad);   const y2 = cy + r * Math.sin(endRad)
    const large = a > 180 ? 1 : 0
    return { ...d, path: `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`, pct }
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <svg viewBox="0 0 128 128" style={{ width: '40%', maxWidth: 160, minWidth: 100 }}>
        {slices.map(s => (
          <path key={s.label} d={s.path} fill="none" stroke={s.color} strokeWidth={sw} />
        ))}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={22} fontWeight={700} fill="var(--text-primary)">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">konten</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {data.filter(d => d.value > 0).map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{d.label}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WeeklyBarChart({ data }: { data: { week: string; ig: number; tt: number; other: number }[] }) {
  const rawMax = Math.max(...data.flatMap(d => [d.ig, d.tt, d.other]), 1)
  const steps = [2, 4, 5, 6, 8, 10, 12, 15, 20]
  const niceMax = steps.find(s => s >= rawMax) ?? Math.ceil(rawMax / 5) * 5
  const H = 200; const PL = 24; const PT = 10; const PB = 22; const bw = 14; const gap = 4; const gw = 100
  const W = data.length * gw + PL + 10
  return (
    <svg viewBox={`0 0 ${W} ${H + PT + PB}`} style={{ width: '100%' }}>
      {(() => {
        const tickStep = niceMax <= 4 ? 1 : niceMax <= 10 ? 2 : 5
        const ticks = Array.from({ length: Math.floor(niceMax / tickStep) + 1 }, (_, i) => i * tickStep)
        return ticks.map(v => {
          const y = PT + H - (v / niceMax) * H
          return (
            <g key={v}>
              <line x1={PL} x2={W} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={PL - 3} y={y + 4} textAnchor="end" fontSize={8} fill="var(--text-muted)">{v}</text>
            </g>
          )
        })
      })()}
      <line x1={PL} x2={W} y1={PT + H} y2={PT + H} stroke="var(--border)" strokeWidth={0.5} />
      {data.map((d, i) => {
        const gx = PL + i * gw + 8
        const igH = d.ig > 0 ? Math.max((d.ig / niceMax) * H, 2) : 0
        const ttH = d.tt > 0 ? Math.max((d.tt / niceMax) * H, 2) : 0
        const otH = d.other > 0 ? Math.max((d.other / niceMax) * H, 2) : 0
        return (
          <g key={d.week}>
            {igH > 0 && <rect x={gx} y={PT + H - igH} width={bw} height={igH} fill="var(--text-primary)" rx={2} opacity={0.85} />}
            {ttH > 0 && <rect x={gx + bw + gap} y={PT + H - ttH} width={bw} height={ttH} fill="var(--text-primary)" rx={2} opacity={0.35} />}
            {otH > 0 && <rect x={gx + (bw + gap) * 2} y={PT + H - otH} width={bw} height={otH} fill="var(--accent)" rx={2} opacity={0.7} />}
            <text x={gx + (bw * 1.5 + gap)} y={PT + H + PB - 5} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{d.week}</text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ dates, views, likes }: { dates: string[]; views: number[]; likes: number[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (dates.length < 2) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Belum cukup data</div>
  const maxV = Math.max(...views, 1)
  const niceMax = Math.ceil(maxV / 1000) * 1000 || 1000
  const W = 1100; const H = 100; const PL = 44; const PR = 8; const PT = 10; const PB = 20
  const pw = W - PL - PR; const n = dates.length
  const cx = (i: number) => PL + (i / (n - 1)) * pw
  const cy = (v: number) => PT + H - (v / niceMax) * H
  const pathV = views.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')
  const pathL = likes.map((l, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(l).toFixed(1)}`).join(' ')
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000 % 1 === 0 ? v / 1000 : (v / 1000).toFixed(1))}k` : String(v)
  const xTickIdxs = n <= 10
    ? Array.from({ length: n }, (_, i) => i)
    : [0, ...Array.from({ length: 6 }, (_, k) => Math.round((k + 1) * (n - 1) / 7)), n - 1]
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    if (relX < PL - 8) { setHovered(null); return }
    setHovered(Math.min(n - 1, Math.max(0, Math.round(((relX - PL) / pw) * (n - 1)))))
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + PT + PB}`} style={{ width: '100%', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = PT + H - f * H
          return (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={PL - 4} y={y + 4} textAnchor="end" fontSize={8} fill="var(--text-muted)">{fmtK(Math.round(niceMax * f))}</text>
            </g>
          )
        })}
        <line x1={PL} x2={W - PR} y1={PT + H} y2={PT + H} stroke="var(--border)" strokeWidth={0.5} />
        <path d={pathV} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <path d={pathL} fill="none" stroke="var(--success)" strokeWidth={1.5} strokeDasharray="5 3" strokeLinejoin="round" />
        {views.map((v, i) => <circle key={i} cx={cx(i)} cy={cy(v)} r={3} fill="var(--accent)" />)}
        {likes.map((l, i) => <circle key={i} cx={cx(i)} cy={cy(l)} r={2.5} fill="var(--success)" />)}
        {xTickIdxs.map(i => (
          <text key={i} x={cx(i)} y={PT + H + PB - 3} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={8} fill="var(--text-muted)">{dates[i]}</text>
        ))}
        {hovered !== null && (() => {
          const tx = cx(hovered)
          const tipW = 92; const tipH = 46; const tipX = tx + 8 > W - PR - tipW ? tx - tipW - 4 : tx + 8; const tipY = PT + 2
          return (
            <>
              <line x1={tx} x2={tx} y1={PT} y2={PT + H} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 2" />
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1} />
              <text x={tipX + 8} y={tipY + 13} fontSize={9} fontWeight={600} fill="var(--text-primary)">{dates[hovered]}</text>
              <text x={tipX + 8} y={tipY + 27} fontSize={8} fill="var(--accent)">Views: {views[hovered].toLocaleString('id-ID')}</text>
              <text x={tipX + 8} y={tipY + 39} fontSize={8} fill="var(--success)">Likes: {likes[hovered].toLocaleString('id-ID')}</text>
            </>
          )
        })()}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, background: 'var(--accent)', display: 'inline-block' }} /> Views</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--success)', display: 'inline-block' }} /> Likes</span>
      </div>
    </div>
  )
}

function HBarChart({ items }: { items: { title: string; views: number }[] }) {
  const max = Math.max(...items.map(i => i.views), 1)
  const niceMax = Math.ceil(max / 500) * 500 || 500
  const ticks = 4
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 130, flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
            <div style={{ flex: 1, height: 14, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(item.views / niceMax) * 100}%`, background: 'var(--accent)', borderRadius: 3, opacity: 0.85 }} />
            </div>
            <div style={{ width: 54, flexShrink: 0, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
              {item.views.toLocaleString('id-ID')}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', paddingLeft: 140, paddingRight: 64, marginTop: 6 }}>
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <div key={i} style={{ flex: i < ticks ? 1 : 0, fontSize: 10, color: 'var(--text-muted)', textAlign: i === 0 ? 'left' : i === ticks ? 'right' : 'center', minWidth: i === ticks ? 40 : 0 }}>
            {Math.round(niceMax * (i / ticks)).toLocaleString('id-ID')}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function DetailTab({ client, invoices, content }: { client: Client; invoices: Invoice[]; content: ContentItem[] }) {
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError]     = useState<string | null>(null)
  const { cached: insight, cachedAt: insightAt, save: saveInsight } = useAiCache<{
    recommendedPlatforms: string[]
    recommendedFrequency: string
    topPillars: string[]
    benchmark: string
  }>(`industry:${client.id}`)

  const [churnLoading, setChurnLoading] = useState(false)
  const [churnError, setChurnError]     = useState<string | null>(null)
  const { cached: churn, cachedAt: churnAt, save: saveChurn } = useAiCache<{
    level: 'low' | 'medium' | 'high'; score: number; reasons: string[]; recommendations: string[]
  }>(`churn:${client.id}`)

  const handleGenerateChurn = async () => {
    setChurnLoading(true); setChurnError(null)
    try {
      const now = new Date()
      const toDateStr = (d: unknown): string => d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' ? d.slice(0, 10) : ''
      const overdue = invoices.filter(i => i.status === 'overdue').length
      const unpaidAmount = invoices.filter(i => i.status === 'overdue' || i.status === 'sent').reduce((s, i) => s + (Number(i.amount) || 0), 0)
      const paidInvs = invoices.filter(i => i.status === 'paid')
        .sort((a, b) => toDateStr(b.issued_date).localeCompare(toDateStr(a.issued_date)))
      const lastPaidDate = paidInvs[0] ? toDateStr(paidInvs[0].issued_date) : null
      const daysSincePaid = lastPaidDate ? Math.floor((now.getTime() - new Date(lastPaidDate).getTime()) / 86400000) : null
      const last30 = new Date(now.getTime() - 30 * 86400000)
      const prev30Start = new Date(now.getTime() - 60 * 86400000)
      const posted = content.filter(c => c.status === 'posted')
      const postedLast30 = posted.filter(c => { const d = toDateStr(c.schedule_date); return d && new Date(d) >= last30 }).length
      const postedPrev30 = posted.filter(c => { const d = toDateStr(c.schedule_date); const dt = d ? new Date(d) : null; return dt && dt >= prev30Start && dt < last30 }).length
      const curMonth = now.toISOString().slice(0, 7)
      const usedThisMonth = posted.filter(c => toDateStr(c.schedule_date).startsWith(curMonth)).length

      const res = await aiChurnRisk({
        clientName: client.name,
        contractEndDate: client.contract_end,
        quotaTotal: client.quota_per_month ?? 0,
        quotaUsedThisMonth: usedThisMonth,
        postedLast30Days: postedLast30,
        postedPrevious30Days: postedPrev30,
        overdueInvoices: overdue,
        unpaidAmount,
        daysSinceLastInvoicePaid: daysSincePaid,
      })
      saveChurn(res)
    } catch (e) {
      setChurnError(aiErrorMessage(e))
    } finally { setChurnLoading(false) }
  }

  const handleGenerateInsight = async () => {
    if (!client.industry) { setInsightError('Klien belum punya data industry. Edit klien dan isi field Industry dulu.'); return }
    setInsightLoading(true); setInsightError(null)
    try {
      const res = await aiIndustryInsight({
        industry: client.industry,
        clientName: client.name,
        brandName: client.brand_name,
        currentPlatforms: client.platforms,
      })
      saveInsight(res)
    } catch (e) {
      setInsightError(aiErrorMessage(e))
    } finally { setInsightLoading(false) }
  }

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card">
        <h4 style={{ marginBottom: 14, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Informasi Umum</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Nama Klien', value: client.name },
            { label: 'Brand', value: client.brand_name ?? '—' },
            { label: 'Industry', value: client.industry ?? '—' },
            { label: 'Paket', value: client.package ?? '—' },
            { label: 'Status', value: null, badge: <span className={STATUS_CLS[client.status]}>{STATUS_LABEL[client.status]}</span> },
            { label: 'Platform', value: null, badge: (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {client.platforms.length > 0 ? client.platforms.map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)' }}>{p}</span>
                )) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
              </div>
            )},
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{row.label}</span>
              {row.badge ?? <span style={{ fontSize: 13, color: 'var(--text-primary)', textAlign: 'right' }}>{row.value}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 14, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Kontrak & Kontak</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Mulai', value: fmtDate(client.contract_start) },
            { label: 'Selesai', value: fmtDate(client.contract_end) },
            { label: 'Quota / Bulan', value: client.quota_per_month > 0 ? `${client.quota_per_month} post` : '—' },
            { label: 'Nama Kontak', value: client.contact_name ?? '—' },
            { label: 'Email', value: client.contact_email ?? '—' },
            { label: 'Telepon', value: client.contact_phone ?? '—' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{row.label}</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', textAlign: 'right' }}>{row.value}</span>
            </div>
          ))}
        </div>
        {client.notes && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Catatan</div>
            <p style={{ fontSize: 12 }}>{client.notes}</p>
          </div>
        )}
      </div>
    </div>

    {/* AI Industry Insight */}
    <div className="card" style={{ marginTop: 16, padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (insight || insightError) ? '1px solid var(--border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
            <Sparkles size={14} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Industry Benchmark & Insight</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {client.industry ? `Rekomendasi untuk industri "${client.industry}"` : 'Klien belum punya data industry'}
              {insight && insightAt && <span> · diperbarui {timeAgo(insightAt)}</span>}
            </div>
          </div>
        </div>
        <button onClick={handleGenerateInsight} disabled={insightLoading || !client.industry}
          style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
            background: insightLoading || !client.industry ? 'var(--bg-elevated)' : 'var(--accent)',
            color: insightLoading || !client.industry ? 'var(--text-muted)' : '#fff',
            cursor: insightLoading || !client.industry ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
          }}>
          {insightLoading ? <><Loader2 size={11} className="ai-spin" />Analyzing...</> : insight ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Generate</>}
        </button>
      </div>
      {insightError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{insightError}</div>}
      {insight && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Recommended Platforms</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {insight.recommendedPlatforms.map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '2px 8px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderRadius: 4, fontWeight: 500 }}>{p}</span>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Frekuensi Posting</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{insight.recommendedFrequency}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Top Content Pillars</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {insight.topPillars.map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)' }}>{p}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <MiniMarkdown text={insight.benchmark} />
          </div>
        </div>
      )}
    </div>

    {/* AI Churn Risk Analysis */}
    <div className="card" style={{ marginTop: 16, padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (churn || churnError) ? '1px solid var(--border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
            <Sparkles size={14} color="var(--warning)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Churn Risk Analysis</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              AI analisa risiko klien lepas berdasarkan engagement, invoice, kontrak
              {churn && churnAt && <span> · diperbarui {timeAgo(churnAt)}</span>}
            </div>
          </div>
        </div>
        <button onClick={handleGenerateChurn} disabled={churnLoading}
          style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
            background: churnLoading ? 'var(--bg-elevated)' : 'var(--accent)', color: churnLoading ? 'var(--text-muted)' : '#fff',
            cursor: churnLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
          }}>
          {churnLoading ? <><Loader2 size={11} className="ai-spin" />Analyzing...</> : churn ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Analyze</>}
        </button>
      </div>
      {churnError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{churnError}</div>}
      {churn && (() => {
        const color = churn.level === 'high' ? 'var(--danger)' : churn.level === 'medium' ? 'var(--warning)' : 'var(--success)'
        const label = churn.level === 'high' ? 'High Risk' : churn.level === 'medium' ? 'Medium Risk' : 'Low Risk'
        return (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 70, height: 70, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="16" fill="none" stroke="var(--bg-elevated)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(churn.score / 100) * 100.53} 100.53`} strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color }}>{churn.score}</div>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: `color-mix(in srgb, ${color} 15%, transparent)`, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Score 0-100, makin tinggi makin berisiko</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Reasons</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {churn.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Recommendations</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {churn.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
    </>
  )
}

const CONTENT_TYPES = ['Reels / Video', 'Carousel', 'Static Post', 'Article', 'Story', 'Live']

function ContentModal({ client, item, prefill, isDemo, onClose, onSaved }: {
  client: Client; item?: ContentItem
  prefill?: { title?: string; caption?: string; content_pillar?: string }
  isDemo: boolean
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const isEdit = !!item
  const [tab, setTab] = useState<'info' | 'metrik'>('info')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AI Caption + Variations state
  const [capGenLoading, setCapGenLoading]   = useState(false)
  const [capGenError, setCapGenError]       = useState<string | null>(null)
  const [varLoading, setVarLoading]         = useState(false)
  const [varError, setVarError]             = useState<string | null>(null)
  const [varResult, setVarResult]           = useState<{ platform: string; caption: string }[] | null>(null)
  const [copiedVarIdx, setCopiedVarIdx]     = useState<number | null>(null)

  const toStr = (d: string | Date | null | undefined) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    title:         item?.title ?? prefill?.title ?? '',
    platform:      item?.platform ?? client.platforms[0] ?? 'Instagram',
    content_type:  item?.content_type ?? 'Reels / Video',
    content_pillar: item?.content_pillar ?? prefill?.content_pillar ?? '',
    schedule_date: item ? toStr(item.schedule_date) : today,
    status:        item?.status ?? 'draft' as ContentStatus,
    caption:       item?.caption ?? prefill?.caption ?? '',
    views:         item?.views ?? 0,
    likes:         item?.likes ?? 0,
    comments:      item?.comments ?? 0,
  })
  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Judul konten wajib diisi.'); return }
    if (isDemo) { alert('Demo mode — data tidak tersimpan.'); return }
    setSaving(true); setError(null)
    const payload = {
      title: form.title.trim(), platform: form.platform,
      content_type: form.content_type || null, content_pillar: form.content_pillar.trim() || null,
      schedule_date: form.schedule_date || null, status: form.status,
      caption: form.caption.trim() || null,
      views: form.views, likes: form.likes, comments: form.comments,
    }
    const { error: err } = isEdit
      ? await updateContentItem(item!.id, payload)
      : await addContentItem({ ...payload, client_id: client.id, agency_id: user!.agency_id, ai_generated: false, mirror_source_id: null })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  const handleGenCaption = async () => {
    if (!form.title.trim()) { setCapGenError('Isi judul dulu untuk generate caption.'); return }
    setCapGenLoading(true); setCapGenError(null)
    try {
      const { caption, hashtags } = await aiCaptionFromTitle(form.title, form.platform, form.content_pillar || null)
      const tagStr = hashtags.map(h => `#${h}`).join(' ')
      setForm(p => ({ ...p, caption: tagStr ? `${caption}\n\n${tagStr}` : caption }))
    } catch (e) {
      setCapGenError(aiErrorMessage(e))
    } finally { setCapGenLoading(false) }
  }

  const handleGenVariations = async () => {
    if (!form.caption.trim()) { setVarError('Tulis caption dulu untuk dibuat variasinya.'); return }
    const allPlats = ['Instagram', 'TikTok', 'LinkedIn', 'YouTube', 'Twitter/X', 'Facebook']
    const targets = allPlats.filter(p => p !== form.platform).slice(0, 3)
    setVarLoading(true); setVarError(null); setVarResult(null)
    try {
      const vars = await aiContentVariation(form.caption, form.platform, targets)
      setVarResult(vars)
    } catch (e) {
      setVarError(aiErrorMessage(e))
    } finally { setVarLoading(false) }
  }

  const handleCopyVariation = async (idx: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedVarIdx(idx); setTimeout(() => setCopiedVarIdx(null), 1500) } catch { /* */ }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent)' : 'var(--text-muted)', background: 'none',
    border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer', fontFamily: 'var(--font-sans)',
  })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Konten' : 'Tambah Konten'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
          <button style={tabStyle(tab === 'info')} onClick={() => setTab('info')}>Informasi Konten</button>
          <button style={tabStyle(tab === 'metrik')} onClick={() => setTab('metrik')}>
            Metrik Performa
            {form.status !== 'posted' && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(hanya saat posted)</span>}
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
            {tab === 'info' && (
              <>
                <div className="form-group">
                  <label className="label">Judul Konten *</label>
                  <input className="input" placeholder="Contoh: Reels tutorial behind the scene" value={form.title} onChange={f('title')} />
                </div>
                <div className="form-group">
                  <label className="label">Platform</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {client.platforms.map(p => (
                      <button key={p} type="button" onClick={() => setForm(prev => ({ ...prev, platform: p }))}
                        style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font-sans)', fontWeight: 600,
                          background: form.platform === p ? 'var(--accent)' : 'var(--bg-elevated)',
                          borderColor: form.platform === p ? 'var(--accent)' : 'var(--border)',
                          color: form.platform === p ? '#fff' : 'var(--text-secondary)' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Jenis Konten</label>
                    <select className="input" value={form.content_type} onChange={f('content_type')}>
                      {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={f('status')}>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="approved">Approved</option>
                      <option value="posted">Posted</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Tanggal Posting</label>
                    <input className="input" type="date" value={form.schedule_date} onChange={f('schedule_date')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Content Pillar</label>
                    <input className="input" placeholder="Edukasi, Promosi, BTS..." value={form.content_pillar} onChange={f('content_pillar')} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="label" style={{ margin: 0 }}>Caption</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={handleGenCaption} disabled={capGenLoading || !form.title.trim()}
                        title={form.title.trim() ? 'Generate caption + hashtag dari judul' : 'Isi judul dulu'}
                        style={{ background: 'none', border: 'none', cursor: form.title.trim() ? 'pointer' : 'not-allowed',
                          padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 4, opacity: !form.title.trim() ? 0.35 : 1, fontFamily: 'var(--font-sans)' }}>
                        {capGenLoading ? <Loader2 size={12} className="ai-spin" /> : <Sparkles size={12} />}
                        Caption + Hashtag
                      </button>
                      <button type="button" onClick={handleGenVariations} disabled={varLoading || !form.caption.trim()}
                        title={form.caption.trim() ? 'Adapt caption ke platform lain' : 'Tulis caption dulu'}
                        style={{ background: 'none', border: 'none', cursor: form.caption.trim() ? 'pointer' : 'not-allowed',
                          padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 4, opacity: !form.caption.trim() ? 0.35 : 1, fontFamily: 'var(--font-sans)' }}>
                        {varLoading ? <Loader2 size={12} className="ai-spin" /> : <Wand2 size={12} />}
                        Variations
                      </button>
                    </div>
                  </div>
                  <textarea className="input" placeholder="Tulis caption konten di sini..." value={form.caption} onChange={f('caption')} style={{ minHeight: 80 }} />
                  {capGenError && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 6 }}>{capGenError}</div>}
                  {varError && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 6 }}>{varError}</div>}
                  {varResult && (
                    <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)', padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variasi per Platform</div>
                        <button type="button" onClick={() => setVarResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      {varResult.map((v, i) => (
                        <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 4, padding: '8px 10px', marginBottom: i < varResult.length - 1 ? 6 : 0, borderLeft: '3px solid var(--accent)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{v.platform}</span>
                            <button type="button" onClick={() => handleCopyVariation(i, v.caption)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedVarIdx === i ? 'var(--success)' : 'var(--text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                              {copiedVarIdx === i ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
                            </button>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v.caption}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {tab === 'metrik' && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Input metrik dari platform <strong>{form.platform}</strong>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Views / Reach</label>
                    <input className="input" type="number" min={0} value={form.views || ''} placeholder="0"
                      onChange={e => setForm(p => ({ ...p, views: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Likes</label>
                    <input className="input" type="number" min={0} value={form.likes || ''} placeholder="0"
                      onChange={e => setForm(p => ({ ...p, likes: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Komentar</label>
                    <input className="input" type="number" min={0} value={form.comments || ''} placeholder="0"
                      onChange={e => setForm(p => ({ ...p, comments: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Engagement Rate</label>
                    <input className="input" disabled
                      value={form.views > 0 ? `${(((form.likes + form.comments) / form.views) * 100).toFixed(2)}%` : '—'}
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            {tab === 'info'
              ? <button type="button" className="btn btn-secondary" onClick={() => setTab('metrik')}>Metrik →</button>
              : <button type="button" className="btn btn-secondary" onClick={() => setTab('info')}>← Info</button>
            }
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Konten'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CalendarTab({ client, content, month, setMonth, refetch, isDemo }: {
  client: Client; content: ContentItem[];
  month: Date; setMonth: (d: Date) => void
  refetch: () => void; isDemo: boolean
}) {
  const [platformFilter, setPlatformFilter] = useState('Semua')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<ContentItem | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [prefillData, setPrefillData] = useState<{ title?: string; caption?: string; content_pillar?: string } | undefined>()

  // Brainstorm + Best Posting Time AI state. Hasil di-cache per klien (localStorage)
  // supaya tidak hilang saat modal ditutup/buka lagi — hemat request ke API.
  const [showBrainstorm, setShowBrainstorm] = useState(false)
  const [brainTopic, setBrainTopic]       = useState('')
  const [brainPillar, setBrainPillar]     = useState('')
  const [brainPlatform, setBrainPlatform] = useState('')
  const [brainLoading, setBrainLoading]   = useState(false)
  const [brainError, setBrainError]       = useState<string | null>(null)
  const { cached: brainIdeas, save: saveBrainIdeas } = useAiCache<{ title: string; hook: string; pillar: string }[]>(`brainstorm:${client.id}`)
  const [showPostTime, setShowPostTime]   = useState(false)
  const [postTimeLoading, setPostTimeLoading] = useState(false)
  const [postTimeError, setPostTimeError] = useState<string | null>(null)
  const { cached: postTimeResult, save: savePostTime } = useAiCache<string>(`posttime:${client.id}`)

  const PILLARS = ['Promotion', 'Education', 'Product', 'Branding', 'Social Proof', 'Entertainment', 'Behind the Scene']

  // Buka modal tanpa hapus hasil sebelumnya (tetap tampil dari cache).
  const openBrainstorm = () => {
    setBrainTopic(client.brand_name ?? client.name); setBrainPillar(''); setBrainPlatform(''); setBrainError(null)
    setShowBrainstorm(true)
  }

  const handleBrainstorm = async () => {
    if (!brainTopic.trim()) { setBrainError('Isi topic dulu.'); return }
    setBrainLoading(true); setBrainError(null)
    try {
      const ideas = await aiBulkBrainstorm(brainTopic, client.industry || null, brainPillar || null, brainPlatform || null, 10)
      saveBrainIdeas(ideas)
    } catch (e) {
      setBrainError(aiErrorMessage(e))
    } finally { setBrainLoading(false) }
  }

  const useIdea = (idea: { title: string; hook: string; pillar: string }) => {
    setPrefillData({ title: idea.title, caption: idea.hook, content_pillar: PILLARS.includes(idea.pillar) ? idea.pillar : '' })
    setShowBrainstorm(false)
    setShowAdd(true)
  }

  // Buka modal Best Time: tampilkan cache; auto-analisa HANYA kalau belum ada hasil.
  const openPostTime = () => {
    setShowPostTime(true); setPostTimeError(null)
    if (!postTimeResult) handleAnalyzePostTime()
  }

  const handleAnalyzePostTime = async () => {
    setShowPostTime(true)
    setPostTimeLoading(true); setPostTimeError(null)
    try {
      const postedHistory = content.filter(c => c.status === 'posted' && c.schedule_date)
        .map(c => ({
          platform: c.platform,
          scheduleDate: toDateStr(c.schedule_date),
          views: Number(c.views ?? 0), likes: Number(c.likes ?? 0), comments: Number(c.comments ?? 0),
        }))
      const plats = client.platforms.length > 0 ? client.platforms : ['Instagram']
      const text = await aiBestPostingTime(postedHistory, plats)
      savePostTime(text)
    } catch (e) {
      setPostTimeError(aiErrorMessage(e))
    } finally { setPostTimeLoading(false) }
  }

  const handleDeleteItem = async (c: ContentItem) => {
    if (!confirm(`Hapus konten "${c.title}"?`)) return
    if (isDemo) return
    await deleteContentItem(c.id)
    refetch()
  }

  const yr = month.getFullYear(); const mo = month.getMonth()
  const firstDay = new Date(yr, mo, 1).getDay()
  const daysInMonth = new Date(yr, mo + 1, 0).getDate()
  const monthKey = `${yr}-${String(mo + 1).padStart(2, '0')}`

  const toDateStr = (d: string | Date | null | undefined) => {
    if (!d) return ''
    if (d instanceof Date) return d.toISOString().slice(0, 10)
    return String(d).slice(0, 10)
  }
  const monthContent = content.filter(c => toDateStr(c.schedule_date).startsWith(monthKey))
  const filtered = platformFilter === 'Semua' ? monthContent : monthContent.filter(c => c.platform === platformFilter)

  const platforms = ['Semua', ...Array.from(new Set(content.map(c => c.platform)))]

  const contentByDay: Record<number, ContentItem[]> = {}
  filtered.forEach(c => {
    if (!c.schedule_date) return
    const dateStr = toDateStr(c.schedule_date)
    const day = parseInt(dateStr.slice(8, 10), 10)
    if (!contentByDay[day]) contentByDay[day] = []
    contentByDay[day].push(c)
  })

  const prevMonth = () => setMonth(new Date(yr, mo - 1, 1))
  const nextMonth = () => setMonth(new Date(yr, mo + 1, 1))

  const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  const monthLabel = month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <>
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {platforms.map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 100, border: '1px solid', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, background: platformFilter === p ? 'var(--accent)' : 'transparent', borderColor: platformFilter === p ? 'var(--accent)' : 'var(--border)', color: platformFilter === p ? '#fff' : 'var(--text-secondary)' }}>
              {p}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={openPostTime} title="Analisa waktu posting terbaik">
            <Clock size={12} /> Best Time
          </button>
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={openBrainstorm} title="Generate 10 ide konten">
            <Lightbulb size={12} /> Brainstorm
          </button>
          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAdd(true)}>
            <Plus size={12} /> Tambah Konten
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
        {client.platforms.map(p => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS[p] ?? 'var(--accent)', display: 'inline-block' }} />
            {p}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', opacity: 0.5 }} /> Draft
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} /> Posted
        </span>
      </div>

      {/* Grid header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {DAYS.map(d => (
          <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((day, idx) => {
          const items = day ? (contentByDay[day] ?? []) : []
          const isToday = day === new Date().getDate() && mo === new Date().getMonth() && yr === new Date().getFullYear()
          return (
            <div key={idx} style={{ minHeight: 80, padding: '6px 6px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border-subtle)' : 'none', borderBottom: idx < cells.length - 7 ? '1px solid var(--border-subtle)' : 'none', background: day ? 'transparent' : 'var(--bg-elevated)', opacity: day ? 1 : 0.3 }}>
              {day && (
                <>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 4, width: 22, height: 22, borderRadius: '50%', background: isToday ? 'var(--accent-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {items.slice(0, 3).map(c => {
                      const color = PLATFORM_COLORS[c.platform] ?? 'var(--accent)'
                      const isDraft = c.status === 'draft' || c.status === 'scheduled'
                      const isHovered = hoveredId === c.id
                      return (
                        <div key={c.id}
                          style={{ position: 'relative', fontSize: 10, padding: '2px 5px', paddingRight: isHovered ? 32 : 5, borderRadius: 3, background: isDraft ? 'transparent' : color, border: isDraft ? `1px solid ${color}` : 'none', color: isDraft ? color : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isDraft ? 0.8 : 1, cursor: 'default' }}
                          title={c.title}
                          onMouseEnter={() => setHoveredId(c.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          {c.title}
                          {isHovered && (
                            <div style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 1 }}>
                              <button
                                onClick={e => { e.stopPropagation(); setEditItem(c) }}
                                style={{ background: 'rgba(0,0,0,0.25)', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: 2, display: 'flex', alignItems: 'center', color: 'inherit' }}
                                title="Edit"
                              >
                                <Pencil size={8} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteItem(c) }}
                                style={{ background: 'rgba(0,0,0,0.25)', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: 2, display: 'flex', alignItems: 'center', color: 'inherit' }}
                                title="Hapus"
                              >
                                <Trash2 size={8} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {items.length > 3 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{items.length - 3} lagi</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>

    {(showAdd || editItem) && (
      <ContentModal
        client={client}
        item={editItem ?? undefined}
        prefill={editItem ? undefined : prefillData}
        isDemo={isDemo}
        onClose={() => { setShowAdd(false); setEditItem(null); setPrefillData(undefined) }}
        onSaved={() => { setShowAdd(false); setEditItem(null); setPrefillData(undefined); refetch() }}
      />
    )}

    {/* Brainstorm Modal */}
    {showBrainstorm && (
      <div className="modal-backdrop" onClick={() => setShowBrainstorm(false)}>
        <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={16} color="var(--accent)" />Bulk Brainstorm — {client.name}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBrainstorm(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="label">Topic / Brand *</label>
                <input className="input" placeholder="Brand atau topik" value={brainTopic} onChange={e => setBrainTopic(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="label">Pillar (opsional)</label>
                <select className="input" value={brainPillar} onChange={e => setBrainPillar(e.target.value)}>
                  <option value="">Mix semua</option>
                  {PILLARS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="label">Platform</label>
                <select className="input" value={brainPlatform} onChange={e => setBrainPlatform(e.target.value)}>
                  <option value="">Semua</option>
                  {client.platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleBrainstorm} disabled={brainLoading || !brainTopic.trim()}>
                {brainLoading ? <><Loader2 size={12} className="ai-spin" /> Generating 10 ideas...</> : <><Sparkles size={12} /> Generate 10 Ideas</>}
              </button>
              {brainIdeas && !brainLoading && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleBrainstorm} style={{ marginLeft: 6 }}>
                  <RefreshCw size={11} /> Re-generate
                </button>
              )}
            </div>
            {brainError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{brainError}</div>}
            {brainIdeas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
                {brainIdeas.map((idea, i) => (
                  <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>#{i + 1}</span>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontWeight: 600 }}>{idea.pillar}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{idea.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{idea.hook}</div>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => useIdea(idea)} style={{ flexShrink: 0 }}>
                        <Plus size={11} /> Pakai
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Best Posting Time Modal */}
    {showPostTime && (
      <div className="modal-backdrop" onClick={() => setShowPostTime(false)}>
        <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color="var(--accent)" />Best Posting Time — {client.name}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPostTime(false)}>✕</button>
          </div>
          <div className="modal-body">
            {postTimeLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <Loader2 size={14} className="ai-spin" /> Menganalisis engagement history...
              </div>
            )}
            {postTimeError && <div className="alert alert-error">{postTimeError}</div>}
            {postTimeResult && <MiniMarkdown text={postTimeResult} />}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleAnalyzePostTime} disabled={postTimeLoading}>
              {postTimeLoading ? <Loader2 size={13} className="ai-spin" /> : <RefreshCw size={13} />}
              Re-analyze
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ── Ads Management ────────────────────────────────────────────────────────────

const AD_STATUS_LABEL: Record<AdStatus, string> = {
  draft: 'Draft', active: 'Aktif', paused: 'Dijeda', completed: 'Selesai',
}
const AD_STATUS_COLOR: Record<AdStatus, string> = {
  draft: 'var(--text-muted)',
  active: 'var(--success)',
  paused: '#f59e0b',
  completed: 'var(--accent)',
}
const AD_OBJECTIVES: AdObjective[] = ['awareness', 'traffic', 'engagement', 'leads', 'conversions', 'sales']
const OBJECTIVE_LABEL: Record<AdObjective, string> = {
  awareness: 'Brand Awareness', traffic: 'Traffic', engagement: 'Engagement',
  leads: 'Lead Generation', conversions: 'Konversi', sales: 'Penjualan',
}

const fmtIDR = (n: number) => n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const fmtNum = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

function AdModal({ client, item, isDemo, onClose, onSaved }: {
  client: Client; item?: AdCampaign; isDemo: boolean
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const isEdit = !!item
  const [tab, setTab] = useState<'info' | 'metrik'>('info')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AI Ad Copy state
  const [adCopyLoading, setAdCopyLoading] = useState(false)
  const [adCopyError, setAdCopyError]     = useState<string | null>(null)
  const [adCopyVariations, setAdCopyVariations] = useState<string[] | null>(null)
  const [copiedIdx, setCopiedIdx]         = useState<number | null>(null)

  const [form, setForm] = useState({
    name:        item?.name ?? '',
    platform:    item?.platform ?? client.platforms[0] ?? 'Instagram',
    objective:   item?.objective ?? 'awareness' as AdObjective,
    status:      item?.status ?? 'draft' as AdStatus,
    budget:      item?.budget ?? 0,
    spent:       item?.spent ?? 0,
    start_date:  item?.start_date ?? '',
    end_date:    item?.end_date ?? '',
    impressions: item?.impressions ?? 0,
    reach:       item?.reach ?? 0,
    clicks:      item?.clicks ?? 0,
    conversions: item?.conversions ?? 0,
    notes:       item?.notes ?? '',
  })

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  const fNum = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(p => ({ ...p, [k]: Number(e.target.value) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nama campaign wajib diisi.'); return }
    if (isDemo) { alert('Demo mode — data tidak tersimpan.'); return }
    setSaving(true); setError(null)
    const payload = {
      name: form.name.trim(), platform: form.platform,
      objective: form.objective, status: form.status,
      budget: form.budget, spent: form.spent,
      start_date: form.start_date || null, end_date: form.end_date || null,
      impressions: form.impressions, reach: form.reach,
      clicks: form.clicks, conversions: form.conversions,
      notes: form.notes.trim() || null,
    }
    const { error: err } = isEdit
      ? await updateAdCampaign(item!.id, payload)
      : await addAdCampaign({ ...payload, client_id: client.id, agency_id: user!.agency_id })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  const handleGenerateAdCopy = async () => {
    if (!form.name.trim()) { setAdCopyError('Isi nama campaign dulu (akan dipakai sebagai produk).'); return }
    setAdCopyLoading(true); setAdCopyError(null)
    try {
      const vars = await aiAdCopy({
        clientName: client.name,
        brandName: client.brand_name,
        industry: client.industry,
        product: form.name,
        platform: form.platform,
        objective: form.objective,
      })
      setAdCopyVariations(vars)
    } catch (e) {
      setAdCopyError(aiErrorMessage(e))
    } finally { setAdCopyLoading(false) }
  }

  const handleCopyVariation = async (idx: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500) } catch { /* ignore */ }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent)' : 'var(--text-muted)', background: 'none',
    border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer', fontFamily: 'var(--font-sans)',
  })

  const ctr = form.impressions > 0 ? ((form.clicks / form.impressions) * 100).toFixed(2) : '—'
  const cpc = form.clicks > 0 ? fmtIDR(form.spent / form.clicks) : '—'
  const cpm = form.impressions > 0 ? fmtIDR((form.spent / form.impressions) * 1000) : '—'
  const budgetPct = form.budget > 0 ? Math.min(Math.round((form.spent / form.budget) * 100), 100) : 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Campaign' : 'Tambah Campaign'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
          <button style={tabStyle(tab === 'info')} onClick={() => setTab('info')}>Info Campaign</button>
          <button style={tabStyle(tab === 'metrik')} onClick={() => setTab('metrik')}>Metrik &amp; Budget</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
            {tab === 'info' && (
              <>
                <div className="form-group">
                  <label className="label">Nama Campaign *</label>
                  <input className="input" placeholder="Contoh: Ramadan Awareness 2025" value={form.name} onChange={f('name')} />
                </div>
                <div className="form-group">
                  <label className="label">Platform</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {client.platforms.map(p => (
                      <button key={p} type="button" onClick={() => setForm(prev => ({ ...prev, platform: p }))}
                        style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font-sans)', fontWeight: 600,
                          background: form.platform === p ? 'var(--accent)' : 'var(--bg-elevated)',
                          borderColor: form.platform === p ? 'var(--accent)' : 'var(--border)',
                          color: form.platform === p ? '#fff' : 'var(--text-secondary)' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Objective</label>
                    <select className="input" value={form.objective} onChange={f('objective')}>
                      {AD_OBJECTIVES.map(o => <option key={o} value={o}>{OBJECTIVE_LABEL[o]}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={f('status')}>
                      {(Object.keys(AD_STATUS_LABEL) as AdStatus[]).map(s => (
                        <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Tanggal Mulai</label>
                    <input className="input" type="date" value={form.start_date} onChange={f('start_date')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Tanggal Selesai</label>
                    <input className="input" type="date" value={form.end_date} onChange={f('end_date')} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="label" style={{ margin: 0 }}>Catatan</label>
                    <button type="button" onClick={handleGenerateAdCopy} disabled={adCopyLoading || !form.name.trim()}
                      title={form.name.trim() ? 'AI generate 3 variasi ad copy' : 'Isi nama campaign dulu'}
                      style={{
                        background: 'none', border: 'none', cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                        padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 4, opacity: !form.name.trim() ? 0.35 : 1, fontFamily: 'var(--font-sans)',
                      }}>
                      {adCopyLoading ? <Loader2 size={12} className="ai-spin" /> : <Sparkles size={12} />}
                      Generate Ad Copy
                    </button>
                  </div>
                  <textarea className="input" placeholder="Target audience, brief, dll..." value={form.notes} onChange={f('notes')} style={{ minHeight: 72 }} />
                  {adCopyError && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 6 }}>{adCopyError}</div>}
                  {adCopyVariations && (
                    <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)', padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>3 Variasi Ad Copy</div>
                        <button type="button" onClick={handleGenerateAdCopy} disabled={adCopyLoading}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <RefreshCw size={10} />Re-generate
                        </button>
                      </div>
                      {adCopyVariations.map((v, i) => {
                        const label = ['Direct', 'Storytelling', 'Curiosity'][i] ?? `Variasi ${i + 1}`
                        return (
                          <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 4, padding: '8px 10px', marginBottom: i < 2 ? 6 : 0, borderLeft: '3px solid var(--accent)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                              <button type="button" onClick={() => handleCopyVariation(i, v)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedIdx === i ? 'var(--success)' : 'var(--text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                                {copiedIdx === i ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
                              </button>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
            {tab === 'metrik' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Total Budget (Rp)</label>
                    <input className="input" type="number" min={0} value={form.budget || ''} placeholder="0" onChange={fNum('budget')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Budget Terpakai (Rp)</label>
                    <input className="input" type="number" min={0} value={form.spent || ''} placeholder="0" onChange={fNum('spent')} />
                  </div>
                </div>
                {form.budget > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Penggunaan Budget</span><span>{budgetPct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="label">Impressions</label>
                    <input className="input" type="number" min={0} value={form.impressions || ''} placeholder="0" onChange={fNum('impressions')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Reach</label>
                    <input className="input" type="number" min={0} value={form.reach || ''} placeholder="0" onChange={fNum('reach')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Clicks</label>
                    <input className="input" type="number" min={0} value={form.clicks || ''} placeholder="0" onChange={fNum('clicks')} />
                  </div>
                  <div className="form-group">
                    <label className="label">Konversi</label>
                    <input className="input" type="number" min={0} value={form.conversions || ''} placeholder="0" onChange={fNum('conversions')} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', marginBottom: 0 }}>
                  {[{ label: 'CTR', value: ctr === '—' ? '—' : `${ctr}%` }, { label: 'CPC', value: cpc }, { label: 'CPM', value: cpm }].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            {tab === 'info'
              ? <button type="button" className="btn btn-secondary" onClick={() => setTab('metrik')}>Metrik →</button>
              : <button type="button" className="btn btn-secondary" onClick={() => setTab('info')}>← Info</button>
            }
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Tambah Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdsTab({ client, isDemo }: { client: Client; isDemo: boolean }) {
  const { data: campaigns, loading, refetch } = useAdCampaigns(client.id)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<AdCampaign | null>(null)
  const { cached: recText, cachedAt: recAt, save: saveRec } = useAiCache<string>(`ad-rec:${client.id}`)
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError]     = useState<string | null>(null)

  const handleDelete = async (c: AdCampaign) => {
    if (!confirm(`Hapus campaign "${c.name}"?`)) return
    if (isDemo) return
    await deleteAdCampaign(c.id)
    refetch()
  }

  const handleGenerateRecommendation = async () => {
    if (campaigns.length === 0) return
    setRecLoading(true); setRecError(null)
    try {
      const text = await aiAdRecommendation(campaigns.map(c => ({
        name: c.name, platform: c.platform, objective: c.objective, status: c.status,
        budget: c.budget, spent: c.spent, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions,
      })))
      saveRec(text)
    } catch (e) {
      setRecError(aiErrorMessage(e))
    } finally { setRecLoading(false) }
  }

  const totalBudget  = campaigns.reduce((s, c) => s + c.budget, 0)
  const totalSpent   = campaigns.reduce((s, c) => s + c.spent, 0)
  const activeCount  = campaigns.filter(c => c.status === 'active').length

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Memuat...</div>

  return (
    <>
      {/* Summary bar */}
      {campaigns.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total Campaign', value: String(campaigns.length) },
            { label: 'Campaign Aktif', value: String(activeCount) },
            { label: 'Total Budget', value: fmtIDR(totalBudget) },
          ].map(({ label, value }) => (
            <div key={label} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Performance Recommendation */}
      {campaigns.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (recText || recError) ? '1px solid var(--border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
                <Sparkles size={14} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Performance Recommendation</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  AI analyzes {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} dan kasih action items
                  {recText && recAt && <span> · diperbarui {timeAgo(recAt)}</span>}
                </div>
              </div>
            </div>
            <button onClick={handleGenerateRecommendation} disabled={recLoading}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
                background: recLoading ? 'var(--bg-elevated)' : 'var(--accent)', color: recLoading ? 'var(--text-muted)' : '#fff',
                cursor: recLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
              }}>
              {recLoading ? <><Loader2 size={11} className="ai-spin" />Analyzing...</> : recText ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Generate</>}
            </button>
          </div>
          {recError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{recError}</div>}
          {recText && <div style={{ padding: '8px 16px 14px' }}><MiniMarkdown text={recText} /></div>}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: campaigns.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Campaign Iklan</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={13} /> Tambah Campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 0' }}>
            <div className="empty-icon"><BarChart2 size={24} color="var(--text-muted)" /></div>
            <h3>Belum ada campaign</h3>
            <p style={{ fontSize: 13 }}>Tambahkan campaign iklan pertama untuk client ini.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Nama Campaign', 'Platform', 'Objective', 'Status', 'Budget', 'Terpakai', 'Impresi', 'Klik', 'CTR', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textAlign: h === '' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const ctr = c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : '—'
                  const budgetPct = c.budget > 0 ? Math.min(Math.round((c.spent / c.budget) * 100), 100) : 0
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                        {c.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.notes}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{c.platform}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{OBJECTIVE_LABEL[c.objective]}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: `${AD_STATUS_COLOR[c.status]}18`, color: AD_STATUS_COLOR[c.status], fontWeight: 600, border: `1px solid ${AD_STATUS_COLOR[c.status]}40` }}>
                          {AD_STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtIDR(c.budget)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ whiteSpace: 'nowrap', marginBottom: 3 }}>{fmtIDR(c.spent)}</div>
                        {c.budget > 0 && (
                          <div style={{ width: 60, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{fmtNum(c.impressions)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{fmtNum(c.clicks)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{ctr}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', marginRight: 4 }} onClick={() => setEditItem(c)}>
                          <Pencil size={11} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', color: 'var(--danger)' }} onClick={() => handleDelete(c)}>
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* Budget summary footer */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Total budget: <strong style={{ color: 'var(--text-primary)' }}>{fmtIDR(totalBudget)}</strong></span>
              <span>Total terpakai: <strong style={{ color: totalSpent / totalBudget > 0.9 ? 'var(--danger)' : 'var(--text-primary)' }}>{fmtIDR(totalSpent)}</strong></span>
              <span>Sisa: <strong style={{ color: 'var(--success)' }}>{fmtIDR(totalBudget - totalSpent)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {(showAdd || editItem) && (
        <AdModal
          client={client}
          item={editItem ?? undefined}
          isDemo={isDemo}
          onClose={() => { setShowAdd(false); setEditItem(null) }}
          onSaved={() => { setShowAdd(false); setEditItem(null); refetch() }}
        />
      )}
    </>
  )
}

function ReportTab({ client, content }: { client: Client; content: ContentItem[] }) {
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const { data: allCampaigns } = useAdCampaigns(client.id)

  const toRptDateStr = (d: string | Date | null | undefined) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10)
  const monthContent = content.filter(c => toRptDateStr(c.schedule_date).slice(0, 7) === reportMonth && c.status === 'posted')

  // Filter campaigns active during the report month
  const [rYear, rMonth] = reportMonth.split('-').map(Number)
  const monthStart = new Date(rYear, rMonth - 1, 1)
  const monthEnd   = new Date(rYear, rMonth, 0)
  const monthCampaigns = allCampaigns.filter(c => {
    const start = c.start_date ? new Date(c.start_date) : null
    const end   = c.end_date   ? new Date(c.end_date)   : null
    if (!start && !end) return true
    if (start && start > monthEnd) return false
    if (end   && end   < monthStart) return false
    return true
  })
  const posted = monthContent.length
  const totalViews    = monthContent.reduce((s, c) => s + (c.views ?? 0), 0)
  const totalLikes    = monthContent.reduce((s, c) => s + (c.likes ?? 0), 0)
  const totalComments = monthContent.reduce((s, c) => s + (c.comments ?? 0), 0)
  const quotaTotal = client.quota_per_month ?? 0

  // Platform donut data
  const platformCounts: Record<string, number> = {}
  monthContent.forEach(c => { platformCounts[c.platform] = (platformCounts[c.platform] ?? 0) + 1 })
  const donutData = Object.entries(platformCounts).map(([label, value]) => ({
    label, value, color: PLATFORM_COLORS[label] ?? 'var(--accent)',
  }))

  // Weekly bar data
  const weeks = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5']
  const weeklyData = weeks.map((week, wi) => {
    const startDay = wi * 7 + 1; const endDay = startDay + 6
    const wItems = monthContent.filter(c => {
      const day = parseInt(toRptDateStr(c.schedule_date).slice(8, 10), 10)
      return day >= startDay && day <= endDay
    })
    return {
      week,
      ig:    wItems.filter(c => c.platform === 'Instagram').length,
      tt:    wItems.filter(c => c.platform === 'TikTok').length,
      other: wItems.filter(c => c.platform !== 'Instagram' && c.platform !== 'TikTok').length,
    }
  })

  // Line chart: views & likes by date
  const dateMap: Record<string, { views: number; likes: number }> = {}
  monthContent.forEach(c => {
    const d = toRptDateStr(c.schedule_date)
    if (!dateMap[d]) dateMap[d] = { views: 0, likes: 0 }
    dateMap[d].views += c.views ?? 0
    dateMap[d].likes += c.likes ?? 0
  })
  const sortedDates = Object.keys(dateMap).sort()
  const lineViews = sortedDates.map(d => dateMap[d].views)
  const lineLikes = sortedDates.map(d => dateMap[d].likes)
  const lineLabels = sortedDates.map(d => String(parseInt(d.slice(8, 10), 10)))

  // Top 5 by views
  const top5 = [...monthContent].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5).map(c => ({ title: c.title, views: c.views ?? 0 }))

  // ── AI Executive Summary (cache per klien + bulan) ──────────────────────────
  const monthLabel = new Date(reportMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const { cached: aiReport, cachedAt: aiReportAt, save: saveReport } = useAiCache<string>(`report:${client.id}:${reportMonth}`)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const handleGenerateReport = async () => {
    if (posted === 0) { setReportError('Belum ada konten tayang di bulan ini untuk dianalisa.'); return }
    setReportLoading(true); setReportError(null)
    try {
      const text = await aiClientReport({
        clientName: client.name,
        monthLabel,
        posted, quotaTotal,
        totalViews, totalLikes, totalComments,
        platformBreakdown: Object.entries(platformCounts).map(([platform, count]) => ({ platform, count })),
        topContent: top5,
        campaigns: monthCampaigns.map(c => ({ name: c.name, platform: c.platform, budget: c.budget, spent: c.spent, clicks: c.clicks, conversions: c.conversions })),
      })
      saveReport(text)
    } catch (e) {
      setReportError(aiErrorMessage(e))
    } finally { setReportLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes ai-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .ai-spin{animation:ai-spin 1s linear infinite}`}</style>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="month" className="input" style={{ width: 180 }} value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{posted} konten diposting</span>
        </div>
      </div>

      {/* AI Executive Summary */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: (aiReport || reportError) ? '1px solid var(--border)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 6, display: 'flex' }}>
              <Sparkles size={14} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Performance Summary</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Kesimpulan analitis dari angka report — {monthLabel}
                {aiReport && aiReportAt && <span> · diperbarui {timeAgo(aiReportAt)}</span>}
              </div>
            </div>
          </div>
          <button onClick={handleGenerateReport} disabled={reportLoading}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)',
              background: reportLoading ? 'var(--bg-elevated)' : 'var(--accent)', color: reportLoading ? 'var(--text-muted)' : '#fff',
              cursor: reportLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)',
            }}>
            {reportLoading ? <><Loader2 size={11} className="ai-spin" />Generating...</> : aiReport ? <><RefreshCw size={11} />Refresh</> : <><Sparkles size={11} />Generate</>}
          </button>
        </div>
        {reportError && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--danger)' }}>{reportError}</div>}
        {aiReport && <div style={{ padding: '8px 16px 14px' }}><MiniMarkdown text={aiReport} /></div>}
      </div>

      {/* Report card */}
      <div className="card">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</div>
            {client.package && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{client.package}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Laporan Bulanan</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
              {new Date(reportMonth + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Quota Tercapai', value: quotaTotal > 0 ? `${posted} / ${quotaTotal}` : `${posted}`, sub: quotaTotal > 0 ? `${Math.round((posted / quotaTotal) * 100)}%` : '—' },
            { label: 'Total Views', value: totalViews.toLocaleString('id-ID'), sub: 'dari konten organik' },
            { label: 'Total Likes', value: totalLikes.toLocaleString('id-ID'), sub: '' },
            { label: 'Total Komentar', value: totalComments.toLocaleString('id-ID'), sub: '' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
              {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Charts Row: Platform + Weekly */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>Platform</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DonutChart data={donutData} />
            </div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Posting per Minggu</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: 'var(--text-primary)', display: 'inline-block', borderRadius: 2, opacity: 0.85 }} /> Instagram</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: 'var(--text-primary)', display: 'inline-block', borderRadius: 2, opacity: 0.35 }} /> TikTok</span>
              </div>
            </div>
            <WeeklyBarChart data={weeklyData} />
          </div>
        </div>

        {/* Trend chart — full width */}
        {sortedDates.length >= 2 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Trend Performa (Views &amp; Likes per Tanggal)</div>
            <LineChart dates={lineLabels} views={lineViews} likes={lineLikes} />
          </div>
        )}

        {/* Top 5 — full width */}
        {top5.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Top 5 Konten by Views</div>
            <HBarChart items={top5} />
          </div>
        )}

        {/* Table */}
        {monthContent.length > 0 ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Daftar Konten Diposting</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Judul', 'Platform', 'Tgl', 'Views', 'Likes', 'Komentar', 'Engagement'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Views' || h === 'Likes' || h === 'Komentar' || h === 'Engagement' ? 'right' : 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthContent.map(c => {
                    const eng = c.views > 0 ? (((c.likes + c.comments) / c.views) * 100).toFixed(2) + '%' : '—'
                    return (
                      <tr key={c.id}>
                        <td style={{ padding: '9px 10px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{c.title}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{c.platform}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                          {new Date(c.schedule_date!).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{(c.views ?? 0).toLocaleString('id-ID')}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)' }}>{(c.likes ?? 0).toLocaleString('id-ID')}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                          {c.comments > 0 ? c.comments.toLocaleString('id-ID') : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: eng !== '—' && parseFloat(eng) >= 3 ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>{eng}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p style={{ fontSize: 13 }}>Belum ada konten diposting bulan ini.</p>
          </div>
        )}

        {/* ── Paid Media Section ───────────────────────────────────────────── */}
        {monthCampaigns.length > 0 && (() => {
          const adBudget      = monthCampaigns.reduce((s, c) => s + c.budget, 0)
          const adSpent       = monthCampaigns.reduce((s, c) => s + c.spent, 0)
          const adImpressions = monthCampaigns.reduce((s, c) => s + c.impressions, 0)
          const adReach       = monthCampaigns.reduce((s, c) => s + c.reach, 0)
          const adClicks      = monthCampaigns.reduce((s, c) => s + c.clicks, 0)
          const adConversions = monthCampaigns.reduce((s, c) => s + c.conversions, 0)
          const adCTR         = adImpressions > 0 ? ((adClicks / adImpressions) * 100).toFixed(2) : '—'
          const adCPC         = adClicks > 0 ? fmtIDR(adSpent / adClicks) : '—'
          const budgetPct     = adBudget > 0 ? Math.min(Math.round((adSpent / adBudget) * 100), 100) : 0

          return (
            <>
              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-card)', padding: '0 10px', marginLeft: -10 }}>
                  Paid Media
                </span>
              </div>

              {/* Ads summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Total Budget', value: fmtIDR(adBudget), sub: `${budgetPct}% terpakai` },
                  { label: 'Total Spent', value: fmtIDR(adSpent), sub: `Sisa ${fmtIDR(adBudget - adSpent)}` },
                  { label: 'Total Impresi', value: fmtNum(adImpressions), sub: `Reach ${fmtNum(adReach)}` },
                  { label: 'Total Klik', value: fmtNum(adClicks), sub: `CTR ${adCTR}${adCTR !== '—' ? '%' : ''}` },
                  { label: 'Konversi', value: String(adConversions), sub: adClicks > 0 ? `CVR ${((adConversions / adClicks) * 100).toFixed(1)}%` : '' },
                  { label: 'CPC Rata-rata', value: adCPC, sub: `${monthCampaigns.length} campaign aktif` },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
                    {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Budget progress bar */}
              {adBudget > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
                    <span>Penggunaan Budget Keseluruhan</span>
                    <span style={{ fontWeight: 600, color: budgetPct >= 90 ? 'var(--danger)' : 'var(--text-primary)' }}>{budgetPct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}

              {/* Campaigns table */}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Detail Campaign</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Nama Campaign', 'Platform', 'Objective', 'Status', 'Budget', 'Spent', 'Impresi', 'Klik', 'CTR', 'Konversi'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                          color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                          textAlign: ['Budget', 'Spent', 'Impresi', 'Klik', 'CTR', 'Konversi'].includes(h) ? 'right' : 'left',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthCampaigns.map(c => {
                      const ctr  = c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : '—'
                      const bPct = c.budget > 0 ? Math.min(Math.round((c.spent / c.budget) * 100), 100) : 0
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{c.platform}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{OBJECTIVE_LABEL[c.objective]}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, fontWeight: 600, background: `${AD_STATUS_COLOR[c.status]}18`, color: AD_STATUS_COLOR[c.status], border: `1px solid ${AD_STATUS_COLOR[c.status]}40` }}>
                              {AD_STATUS_LABEL[c.status]}
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div>{fmtIDR(c.budget)}</div>
                            {c.budget > 0 && (
                              <div style={{ marginTop: 3, width: 60, height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden', marginLeft: 'auto' }}>
                                <div style={{ height: '100%', width: `${bPct}%`, background: bPct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 2 }} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtIDR(c.spent)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtNum(c.impressions)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtNum(c.clicks)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600 }}>{ctr}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: c.conversions > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: c.conversions > 0 ? 600 : 400 }}>{c.conversions > 0 ? c.conversions.toLocaleString('id-ID') : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={4} style={{ padding: '9px 10px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtIDR(adBudget)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtIDR(adSpent)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(adImpressions)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(adClicks)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{adCTR}{adCTR !== '—' ? '%' : ''}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: adConversions > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{adConversions > 0 ? adConversions.toLocaleString('id-ID') : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ client, onClose, onSave }: { client: Client; onClose: () => void; onSave: (newName: string) => void }) {
  const { isDemo } = useAuth()
  const [form, setForm] = useState({ ...client, platforms: [...client.platforms] })
  const [saving, setSaving] = useState(false)
  const [demoNotice, setDemoNotice] = useState(false)

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const togglePlatform = (p: string) =>
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p],
    }))

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (isDemo) { setDemoNotice(true); return }
    setSaving(true)
    await updateClient(client.id, {
      name: form.name, brand_name: form.brand_name || null,
      industry: form.industry || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      status: form.status as ClientStatus,
      notes: form.notes || null,
      package: form.package || null,
      platforms: form.platforms,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      quota_per_month: Number(form.quota_per_month),
    })
    setSaving(false); onSave(form.name)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Edit Client</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {demoNotice && <div className="alert alert-warning" style={{ marginBottom: 16 }}>Demo mode — data tidak tersimpan.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="label">Nama *</label><input className="input" value={form.name} onChange={f('name')} required /></div>
              <div className="form-group"><label className="label">Brand</label><input className="input" value={form.brand_name ?? ''} onChange={f('brand_name')} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Industry</label>
                <IndustrySelect value={form.industry ?? ''} onChange={v => setForm(p => ({ ...p, industry: v }))} />
              </div>
              <div className="form-group">
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={f('status')}>
                  <option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label className="label">Paket</label><input className="input" value={form.package ?? ''} onChange={f('package')} /></div>
            <div className="form-group">
              <label className="label">Platform</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {PLATFORMS.map(p => (
                  <button key={p} type="button" onClick={() => togglePlatform(p)} style={{ padding: '3px 10px', fontSize: 12, borderRadius: 100, cursor: 'pointer', border: '1px solid', fontFamily: 'var(--font-sans)', fontWeight: 500, background: form.platforms.includes(p) ? 'var(--accent)' : 'var(--bg-elevated)', borderColor: form.platforms.includes(p) ? 'var(--accent)' : 'var(--border)', color: form.platforms.includes(p) ? '#fff' : 'var(--text-secondary)' }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="label">Kontrak Mulai</label><input className="input" type="date" value={form.contract_start ?? ''} onChange={f('contract_start')} /></div>
              <div className="form-group"><label className="label">Kontrak Selesai</label><input className="input" type="date" value={form.contract_end ?? ''} onChange={f('contract_end')} /></div>
              <div className="form-group"><label className="label">Quota/Bulan</label><input className="input" type="number" value={form.quota_per_month} onChange={e => setForm(p => ({ ...p, quota_per_month: Number(e.target.value) }))} min={0} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="label">Nama Kontak</label><input className="input" value={form.contact_name ?? ''} onChange={f('contact_name')} /></div>
              <div className="form-group"><label className="label">Telepon</label><input className="input" value={form.contact_phone ?? ''} onChange={f('contact_phone')} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="label">Catatan</label><textarea className="input" value={form.notes ?? ''} onChange={f('notes')} style={{ minHeight: 60 }} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = 'detail' | 'calendar' | 'ads' | 'report'
const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'detail',   label: 'Detail',           icon: Users      },
  { key: 'calendar', label: 'Content Calendar',  icon: CalendarDays },
  { key: 'ads',      label: 'Ads Management',    icon: TrendingDown },
  { key: 'report',   label: 'Monthly Report',    icon: FileText   },
]

export default function ClientDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isDemo } = useAuth()
  const { data: clients, refetch } = useClients(isDemo)
  const { data: allContent, refetch: refetchContent } = useContentItems(isDemo)
  const { data: allInvoices } = useInvoices(isDemo)

  const [tab, setTab] = useState<TabKey>('detail')
  const [calMonth, setCalMonth] = useState(new Date())
  const [showEdit, setShowEdit] = useState(false)

  // Cari klien by slug nama; tetap dukung URL UUID lama (backward-compatible).
  const client = clients.find(c => slugify(c.name) === slug || c.id === slug)
  if (clients.length > 0 && !client) return <Navigate to="/clients" replace />
  if (!client) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  const clientContent = allContent.filter(c => c.client_id === client.id)

  // Quota for current month
  const curMonthKey = new Date().toISOString().slice(0, 7)
  const toStr = (d: string | Date | null | undefined) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10)
  const postedThisMonth = clientContent.filter(c => c.status === 'posted' && toStr(c.schedule_date).startsWith(curMonthKey)).length
  const quotaTotal = client.quota_per_month ?? 0
  const quotaPct = quotaTotal > 0 ? Math.min(Math.round((postedThisMonth / quotaTotal) * 100), 100) : 0

  const handleDelete = async () => {
    if (!confirm(`Hapus client "${client.name}"? Semua data terkait akan ikut terhapus.`)) return
    if (isDemo) { alert('Demo mode — tidak bisa hapus data.'); return }
    await deleteClient(client.id)
    navigate('/clients')
  }

  return (
    <>
      <style>{`@keyframes ai-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .ai-spin{animation:ai-spin 1s linear infinite}`}</style>

      <div className="page-body">
        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}>
            <ArrowLeft size={14} /> Kembali
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(true)}>
              <Edit size={13} /> Edit
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,.2)' }} onClick={handleDelete}>
              <Trash2 size={13} /> Hapus
            </button>
          </div>
        </div>

        {/* Client Header */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: quotaTotal > 0 ? 16 : 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--bg-elevated)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)', flexShrink: 0 }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{client.name}</h2>
                <span className={STATUS_CLS[client.status]}>{STATUS_LABEL[client.status]}</span>
              </div>
              {client.package && <p style={{ fontSize: 12, margin: 0, marginBottom: 6 }}>{client.package}</p>}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {client.platforms.map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)' }}>{p}</span>
                ))}
              </div>
            </div>
          </div>

          {quotaTotal > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={12} color="var(--text-muted)" /> Quota Bulan Ini
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{postedThisMonth} / {quotaTotal} post</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${quotaPct}%`, background: quotaPct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{quotaPct}% tercapai</p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tab-nav" style={{ marginBottom: 16 }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`tab-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === 'detail'   && <DetailTab client={client} invoices={allInvoices.filter(i => i.client_id === client.id)} content={clientContent} />}
        {tab === 'calendar' && <CalendarTab client={client} content={clientContent} month={calMonth} setMonth={setCalMonth} refetch={refetchContent} isDemo={isDemo} />}
        {tab === 'ads'      && <AdsTab client={client} isDemo={isDemo} />}
        {tab === 'report'   && <ReportTab client={client} content={clientContent} />}
      </div>

      {showEdit && (
        <EditModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSave={(newName) => { setShowEdit(false); refetch(); navigate(`/clients/${slugify(newName)}`, { replace: true }) }}
        />
      )}
    </>
  )
}
