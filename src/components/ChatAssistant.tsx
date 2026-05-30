import { useState, useMemo, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, X, Send, Loader2, Trash2, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients, useInvoices, useTransactions, useContentItems, getChatMessages, addChatMessage, clearChatMessages } from '../lib/queries'
import { aiChatStream, aiErrorMessage } from '../lib/gemini'
import MiniMarkdown from './MiniMarkdown'

interface Msg { role: 'user' | 'assistant'; content: string }

const pageNameFromPath = (path: string): string => {
  if (path.startsWith('/dashboard')) return 'Dashboard'
  if (path.startsWith('/clients/')) return 'Detail Klien'
  if (path.startsWith('/clients'))  return 'Daftar Klien'
  if (path.startsWith('/finance'))  return 'Finance'
  if (path.startsWith('/doc-studio/invoice')) return 'Doc Studio — Invoice'
  if (path.startsWith('/doc-studio/salary'))  return 'Doc Studio — Slip Gaji'
  return 'AgencyOS'
}

export default function ChatAssistant() {
  const { isDemo, user } = useAuth()
  const location = useLocation()
  const { data: clients }      = useClients(isDemo)
  const { data: invoices }     = useInvoices(isDemo)
  const { data: transactions } = useTransactions(isDemo)
  const { data: content }      = useContentItems(isDemo)

  const [isOpen, setIsOpen]   = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Compute summary same as Dashboard's smart search
  const summary = useMemo(() => {
    const paidInvs = invoices.filter(i => i.status === 'paid')
    const totalRevenue = paidInvs.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)

    const revByClient = new Map<string, number>()
    paidInvs.forEach(i => { if (i.client_id) revByClient.set(i.client_id, (revByClient.get(i.client_id) || 0) + (Number(i.amount) || 0)) })
    const topClients = Array.from(revByClient.entries()).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([cid, rev]) => ({ name: clients.find(c => c.id === cid)?.name ?? '—', revenue: rev }))

    const expByCat = new Map<string, number>()
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const c = t.category || 'Lainnya'
      expByCat.set(c, (expByCat.get(c) || 0) + (Number(t.amount) || 0))
    })
    const topExpenseCategories = Array.from(expByCat.entries()).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([cat, amount]) => ({ cat, amount }))

    const contentByPlat = new Map<string, number>()
    content.forEach(c => contentByPlat.set(c.platform, (contentByPlat.get(c.platform) || 0) + 1))
    const contentByPlatform = Array.from(contentByPlat.entries()).sort(([, a], [, b]) => b - a)
      .map(([platform, count]) => ({ platform, count }))

    const recentInvs = invoices.slice(0, 5).map(i => ({
      number: i.invoice_number,
      client: clients.find(c => c.id === i.client_id)?.name ?? i.recipient_name ?? '—',
      amount: Number(i.amount) || 0,
      status: i.status,
      date: typeof i.issued_date === 'string' ? i.issued_date.slice(0, 10) : new Date(i.issued_date as unknown as Date).toISOString().slice(0, 10),
    }))

    return {
      totalClients: clients.length,
      activeClients: clients.filter(c => c.status === 'active').length,
      totalInvoices: invoices.length,
      paidInvoices: paidInvs.length,
      pendingInvoices: invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length,
      totalRevenue, totalExpense,
      topClients, topExpenseCategories, contentByPlatform,
      recentInvoices: recentInvs,
    }
  }, [clients, invoices, transactions, content])

  // Load chat history dari DB (sekali, untuk non-demo). Demo mode tetap in-memory.
  useEffect(() => {
    if (isDemo || !user) return
    let cancelled = false
    getChatMessages(user.agency_id).then(rows => {
      if (!cancelled) setMessages(rows.map(r => ({ role: r.role, content: r.content })))
    })
    return () => { cancelled = true }
  }, [isDemo, user])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages([...next, { role: 'assistant', content: '' }]) // placeholder utk streaming
    setInput(''); setError(null); setLoading(true)
    if (!isDemo && user) addChatMessage(user.agency_id, 'user', text)
    try {
      let acc = ''
      const full = await aiChatStream(
        next,
        { currentPage: pageNameFromPath(location.pathname), summary },
        chunk => {
          acc += chunk
          setMessages(cur => {
            const copy = [...cur]
            copy[copy.length - 1] = { role: 'assistant', content: acc }
            return copy
          })
        },
      )
      // pastikan final text ter-set walau onToken belum sempat update terakhir
      setMessages(cur => {
        const copy = [...cur]
        copy[copy.length - 1] = { role: 'assistant', content: full || acc }
        return copy
      })
      if (!isDemo && user) addChatMessage(user.agency_id, 'assistant', full || acc)
    } catch (e) {
      setError(aiErrorMessage(e))
      // buang placeholder assistant yang masih kosong
      setMessages(cur => cur[cur.length - 1]?.role === 'assistant' && cur[cur.length - 1].content === '' ? cur.slice(0, -1) : cur)
    } finally { setLoading(false) }
  }

  const handleClear = () => {
    setMessages([]); setError(null)
    if (!isDemo && user) clearChatMessages(user.agency_id)
  }

  return (
    <>
      <style>{`@keyframes chat-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} .chat-spin{animation:chat-spin 1s linear infinite}`}</style>

      {/* Floating button */}
      {!isOpen && (
        <button onClick={() => setIsOpen(true)}
          aria-label="Buka AI Assistant"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 100,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25), 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
          <Sparkles size={20} />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          width: 400, maxWidth: 'calc(100vw - 48px)', height: 560, maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 6, padding: 5, display: 'flex' }}>
                <Sparkles size={14} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Assistant</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pageNameFromPath(location.pathname)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {messages.length > 0 && (
                <button onClick={handleClear} title="Clear conversation"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 4, display: 'flex' }}>
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} title="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 4, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: '14px',
            display: 'flex', flexDirection: 'column', gap: 10,
            background: 'var(--bg-base)',
          }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                <MessageCircle size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Tanya apa saja</div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>AI bisa bantu jelaskan data agensi, kasih saran strategi, atau navigasi ke halaman tertentu.</div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 280 }}>
                  {[
                    'Berapa total revenue bulan ini?',
                    'Klien mana yang paling profitable?',
                    'Apa yang perlu saya prioritasin hari ini?',
                  ].map(q => (
                    <button key={q} onClick={() => setInput(q)}
                      style={{
                        textAlign: 'left', padding: '8px 12px', fontSize: 12,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isEmptyAssistant = m.role === 'assistant' && m.content === ''
              return (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 12px', borderRadius: 10,
                    fontSize: 13, lineHeight: 1.5,
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  }}>
                    {m.role === 'user'
                      ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                      : isEmptyAssistant
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}><Loader2 size={12} className="chat-spin" /> Thinking...</span>
                        : <MiniMarkdown text={m.content} />}
                  </div>
                </div>
              )
            })}
            {error && (
              <div style={{ fontSize: 11, color: 'var(--danger)', padding: 6 }}>{error}</div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} style={{
            display: 'flex', gap: 6, padding: 10,
            borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0,
          }}>
            <input
              type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder="Ketik pertanyaan..."
              disabled={loading}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid var(--border)',
                borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                outline: 'none', fontFamily: 'var(--font-sans)',
              }}
            />
            <button type="submit" disabled={loading || !input.trim()}
              style={{
                padding: '8px 12px', border: 'none', borderRadius: 6, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                background: loading || !input.trim() ? 'var(--bg-elevated)' : 'var(--accent)',
                color: loading || !input.trim() ? 'var(--text-muted)' : '#fff',
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              }}>
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
