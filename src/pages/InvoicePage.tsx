import { useState, useEffect } from 'react'
import { Plus, Trash2, Printer, Save, FileText, Sparkles, Loader2, Copy, Check, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients, useInvoices, addInvoice, addTransaction } from '../lib/queries'
import { aiSuggestInvoiceItems, aiEmailDraft, aiErrorMessage } from '../lib/gemini'
import type { InvoiceItem } from '../lib/types'

const fmtIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID')
const fmtDate = (s: string) => {
  const d = new Date(s)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

type DocItem = { id: string; description: string; quantity: number; rate: number }
const newItem = (): DocItem => ({ id: Math.random().toString(36).slice(2), description: '', quantity: 1, rate: 0 })

export default function InvoicePage() {
  const { user, isDemo } = useAuth()
  const { data: clients } = useClients(isDemo)
  const { data: invoices, loading: li, refetch } = useInvoices(isDemo)

  const [docTab, setDocTab] = useState<'form' | 'riwayat'>('form')

  // Form state
  const [invoiceNum, setInvoiceNum] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [clientId, setClientId] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientTitle, setRecipientTitle] = useState('')
  const [items, setItems] = useState<DocItem[]>([newItem()])
  const [taxPercent, setTaxPercent] = useState(0)
  const [paymentName, setPaymentName] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [notes, setNotes] = useState('Terima kasih atas kepercayaan Anda.')
  const [financeName, setFinanceName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [demoNotice, setDemoNotice] = useState(false)
  const [aiItemsLoading, setAiItemsLoading] = useState(false)
  const [aiItemsError, setAiItemsError]     = useState<string | null>(null)
  const [emailLoading, setEmailLoading]     = useState(false)
  const [emailError, setEmailError]         = useState<string | null>(null)
  const [emailDraft, setEmailDraft]         = useState<string | null>(null)
  const [emailCopied, setEmailCopied]       = useState(false)

  // Auto-generate invoice number
  useEffect(() => {
    const d = new Date()
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const seq = String(invoices.length + 1).padStart(3, '0')
    setInvoiceNum(`INV/${yr}/${mo}/${seq}`)
  }, [invoices.length])

  // Auto-fill from client
  useEffect(() => {
    const c = clients.find(x => x.id === clientId)
    if (c) {
      setRecipientName(c.contact_name ?? c.name)
      setRecipientTitle(c.brand_name ?? c.name)
    }
  }, [clientId, clients])

  const subtotal = items.reduce((s, i) => s + i.quantity * i.rate, 0)
  const tax = Math.round(subtotal * taxPercent / 100)
  const total = subtotal + tax

  const updateItem = (id: string, field: keyof DocItem, value: string | number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setSignature(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (isDemo) { setDemoNotice(true); return }
    setSaving(true); setSaveOk(false)
    const invItems: InvoiceItem[] = items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      rate: i.rate,
      amount: i.quantity * i.rate,
    }))
    const { data: inv } = await addInvoice({
      agency_id: user!.agency_id,
      client_id: clientId || null,
      invoice_number: invoiceNum,
      amount: total,
      status: 'draft',
      issued_date: date,
      due_date: null,
      items: invItems,
      notes: notes || null,
      recipient_name: recipientName || null,
      recipient_title: recipientTitle || null,
      payment_name: paymentName || null,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      tax_percent: taxPercent,
      signature_name: financeName || null,
    })
    if (inv) {
      await addTransaction({
        type: 'income',
        category: 'Invoice Klien',
        amount: total,
        description: `${invoiceNum} — ${recipientName || '—'}`,
        date,
        agency_id: user!.agency_id,
        client_id: clientId || null,
        reference_id: inv.id,
      })
    }
    setSaving(false); setSaveOk(true)
    refetch()
    setTimeout(() => setSaveOk(false), 3000)
  }

  const handlePrint = () => window.print()

  const handleAiSuggestItems = async () => {
    if (!clientId) { setAiItemsError('Pilih klien dulu untuk lihat history.'); return }
    const history = invoices
      .filter(i => i.client_id === clientId)
      .sort((a, b) => new Date(b.issued_date).getTime() - new Date(a.issued_date).getTime())
      .slice(0, 3)
    if (history.length === 0) { setAiItemsError('Klien ini belum punya history invoice.'); return }
    setAiItemsLoading(true); setAiItemsError(null)
    try {
      const c = clients.find(x => x.id === clientId)
      const suggested = await aiSuggestInvoiceItems({
        clientName: c?.name ?? recipientName,
        recentInvoices: history.map(h => ({
          date: typeof h.issued_date === 'string' ? h.issued_date : new Date(h.issued_date).toISOString().slice(0, 10),
          items: (h.items ?? []).map(it => ({ description: it.description, quantity: it.quantity, rate: it.rate })),
        })),
      })
      if (suggested.length > 0) {
        setItems(suggested.map(s => ({ id: Math.random().toString(36).slice(2), ...s })))
      } else {
        setAiItemsError('AI tidak menemukan pola recurring di history.')
      }
    } catch (e) {
      setAiItemsError(aiErrorMessage(e))
    } finally { setAiItemsLoading(false) }
  }

  const handleDraftEmail = async () => {
    setEmailLoading(true); setEmailError(null); setEmailDraft(null); setEmailCopied(false)
    try {
      const text = await aiEmailDraft({
        type: 'invoice',
        recipientName: recipientName || 'klien',
        docNumber: invoiceNum,
        amount: total,
        date,
        bankName: bankName || null,
        bankAccount: bankAccount || null,
        paymentName: paymentName || null,
      })
      setEmailDraft(text)
    } catch (e) {
      setEmailError(aiErrorMessage(e))
    } finally { setEmailLoading(false) }
  }

  const handleCopyEmail = async () => {
    if (!emailDraft) return
    try { await navigator.clipboard.writeText(emailDraft); setEmailCopied(true); setTimeout(() => setEmailCopied(false), 1500) } catch { /* ignore */ }
  }

  const resetForm = () => {
    setClientId(''); setRecipientName(''); setRecipientTitle('')
    setItems([newItem()]); setTaxPercent(0)
    setPaymentName(''); setBankName(''); setBankAccount('')
    setNotes('Terima kasih atas kepercayaan Anda.'); setFinanceName(''); setSignature(null)
    setSaveOk(false); setDemoNotice(false)
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #doc-print, #doc-print * { visibility: visible !important; }
          #doc-print { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; box-shadow: none !important; }
          @page { margin: 0; size: A4; }
        }
        @keyframes ai-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        .ai-spin { animation: ai-spin 1s linear infinite; }
      `}</style>
      <div className="no-print" style={{ display: 'flex', gap: 6, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button className={`btn btn-sm ${docTab === 'form' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDocTab('form')}>Form</button>
        <button className={`btn btn-sm ${docTab === 'riwayat' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDocTab('riwayat')}>Riwayat</button>
      </div>

      {docTab === 'form' ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* ── Left: Form Panel ── */}
          <div className="doc-form-panel" style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '16px 14px', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Info Dokumen</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={resetForm}>+ Invoice Baru</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="label">Nomor Invoice</label>
                <input className="input" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} />
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Kepada</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="label">Pilih Klien (opsional)</label>
                  <select className="input" value={clientId} onChange={e => setClientId(e.target.value)}>
                    <option value="">— Pilih klien (opsional) —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Nama Klien</label>
                  <input className="input" placeholder="Nama klien" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Jabatan / Perusahaan</label>
                  <input className="input" placeholder="Jabatan / Perusahaan" value={recipientTitle} onChange={e => setRecipientTitle(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Items</span>
                <button type="button" onClick={handleAiSuggestItems} disabled={aiItemsLoading || !clientId}
                  title={clientId ? 'AI suggest items dari history klien' : 'Pilih klien dulu'}
                  style={{
                    background: 'none', border: 'none', cursor: clientId ? 'pointer' : 'not-allowed',
                    padding: 0, color: 'var(--accent)', fontSize: 10, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 4, opacity: !clientId ? 0.35 : 1, fontFamily: 'var(--font-sans)',
                  }}>
                  {aiItemsLoading ? <Loader2 size={11} className="ai-spin" /> : <Sparkles size={11} />}
                  AI Suggest
                </button>
              </div>
              {aiItemsError && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 8 }}>{aiItemsError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, idx) => (
                  <div key={item.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Item {idx + 1}</span>
                      {items.length > 1 && (
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => removeItem(item.id)}>
                          <Trash2 size={11} color="var(--danger)" />
                        </button>
                      )}
                    </div>
                    <input className="input" placeholder="Keterangan layanan" style={{ fontSize: 12 }} value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
                      <div>
                        <label className="label" style={{ fontSize: 10 }}>Harga (Rp)</label>
                        <input className="input" type="number" style={{ fontSize: 12 }} value={item.rate || ''} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} min={0} />
                      </div>
                      <div>
                        <label className="label" style={{ fontSize: 10 }}>Jumlah</label>
                        <input className="input" type="number" style={{ fontSize: 12 }} value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} min={1} />
                      </div>
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setItems(p => [...p, newItem()])}>
                  <Plus size={12} /> Tambah item
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  <span>Subtotal</span><span>{fmtIDR(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pajak (%)</span>
                  <input className="input" type="number" style={{ width: 70, fontSize: 12, textAlign: 'right' }} value={taxPercent} onChange={e => setTaxPercent(Number(e.target.value))} min={0} max={100} />
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Info Pembayaran</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="label">Nama Penerima</label>
                  <input className="input" placeholder="Nama penerima transfer" value={paymentName} onChange={e => setPaymentName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="label">Bank</label>
                    <input className="input" placeholder="BCA" value={bankName} onChange={e => setBankName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">No. Rekening</label>
                    <input className="input" placeholder="1234567890" value={bankAccount} onChange={e => setBankAccount(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <label className="label">Catatan</label>
              <textarea className="input" style={{ minHeight: 60, fontSize: 12 }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Tanda Tangan Finance</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="label">Nama Finance</label>
                  <input className="input" placeholder="Nama penanda tangan" value={financeName} onChange={e => setFinanceName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Tanda Tangan (PNG transparan)</label>
                  {signature ? (
                    <div style={{ position: 'relative' }}>
                      <img src={signature} alt="signature" style={{ maxHeight: 60, maxWidth: '100%', background: 'var(--bg-elevated)', borderRadius: 4, padding: 4, border: '1px solid var(--border)' }} />
                      <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', top: 2, right: 2, padding: '2px 4px' }} onClick={() => setSignature(null)}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 8px', border: '1px dashed var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>
                      <FileText size={16} />
                      Upload tanda tangan
                      <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleSignatureUpload} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {demoNotice && <div className="alert alert-warning" style={{ fontSize: 12 }}>Demo mode — data tidak tersimpan.</div>}
              {saveOk && <div className="alert alert-success" style={{ fontSize: 12 }}>Invoice berhasil disimpan!</div>}
              <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Invoice'}
              </button>
              <button className="btn btn-secondary btn-full" onClick={handlePrint}>
                <Printer size={14} /> Cetak PDF
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={handleDraftEmail} disabled={emailLoading}>
                {emailLoading ? <Loader2 size={14} className="ai-spin" /> : <Mail size={14} />}
                {emailLoading ? 'Drafting...' : 'Draft Email AI'}
              </button>
            </div>
          </div>

          {/* ── Right: Preview Panel ── */}
          <div className="doc-preview-wrap" style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-base)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div id="doc-print" className="invoice-paper" style={{ width: 595, background: '#fff', color: '#111', padding: '40px 48px', boxShadow: '0 4px 32px rgba(0,0,0,0.4)', minHeight: 842, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #111' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#111' }}>AgencyOS</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>AI-Powered Agency Dashboard</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#111', letterSpacing: '-1px' }}>INVOICE</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{invoiceNum}</div>
                </div>
              </div>

              {/* Kepada & Tanggal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 6 }}>Kepada</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{recipientName || '—'}</div>
                  {recipientTitle && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{recipientTitle}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 6 }}>Tanggal</div>
                  <div style={{ fontSize: 13, color: '#111' }}>{fmtDate(date)}</div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Keterangan</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Harga</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Jml</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{ padding: '10px 10px', color: '#222', borderBottom: '1px solid #f0f0f0' }}>{item.description || '—'}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: '#555', borderBottom: '1px solid #f0f0f0' }}>{item.rate > 0 ? fmtIDR(item.rate) : '—'}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: '#555', borderBottom: '1px solid #f0f0f0' }}>{item.quantity}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#111', borderBottom: '1px solid #f0f0f0' }}>{item.rate > 0 ? fmtIDR(item.quantity * item.rate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, color: '#555', borderBottom: '1px solid #f0f0f0' }}>
                    <span>Sub Total</span><span>{fmtIDR(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, color: '#555', borderBottom: '1px solid #f0f0f0' }}>
                    <span>Pajak ({taxPercent}%)</span><span>{fmtIDR(tax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 800, color: '#111', borderTop: '2px solid #111', marginTop: 2 }}>
                    <span>Total</span><span>{fmtIDR(total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              {(paymentName || bankName || bankAccount) && (
                <div style={{ background: '#f9f9f9', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', marginBottom: 8 }}>Pembayaran</div>
                  {paymentName && <div style={{ color: '#333' }}>Nama&nbsp;&nbsp;: {paymentName}</div>}
                  {(bankName || bankAccount) && <div style={{ color: '#333', marginTop: 2 }}>No Rek : {bankName} {bankAccount}</div>}
                </div>
              )}

              {/* Notes */}
              {notes && (
                <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 40 }}>{notes}</div>
              )}

              {/* Signature */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ textAlign: 'center', minWidth: 140 }}>
                  <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                    {signature
                      ? <img src={signature} alt="ttd" style={{ maxHeight: 60, maxWidth: 160 }} />
                      : <div style={{ height: 1, width: 140, background: '#ccc' }} />
                    }
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{financeName || 'Finance'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Riwayat Tab ── */
        <div className="page-body">
          <div className="card" style={{ padding: 0 }}>
            {li ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : invoices.length === 0 ? (
              <div className="empty-state">
                <h3>Belum ada invoice</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setDocTab('form')}>Buat Invoice</button>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Nomor Invoice</th>
                      <th>Kepada</th>
                      <th>Tanggal</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{inv.invoice_number}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{inv.recipient_name ?? '—'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(inv.issued_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{'Rp ' + inv.amount.toLocaleString('id-ID')}</td>
                        <td>
                          <span className={`badge ${inv.status === 'paid' ? 'badge-green' : inv.status === 'overdue' ? 'badge-red' : inv.status === 'sent' ? 'badge-blue' : 'badge-gray'}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Email Draft Modal */}
      {(emailDraft || emailError) && (
        <div className="modal-backdrop" onClick={() => { setEmailDraft(null); setEmailError(null) }}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={15} color="var(--accent)" />Draft Email Invoice
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEmailDraft(null); setEmailError(null) }}>✕</button>
            </div>
            <div className="modal-body">
              {emailError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{emailError}</div>}
              {emailDraft && (
                <textarea readOnly value={emailDraft}
                  style={{
                    width: '100%', minHeight: 280, padding: 12, fontSize: 13, lineHeight: 1.6,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', resize: 'vertical',
                  }}
                />
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={handleDraftEmail} disabled={emailLoading}>
                {emailLoading ? <Loader2 size={13} className="ai-spin" /> : <Sparkles size={13} />}
                Re-generate
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCopyEmail} disabled={!emailDraft}>
                {emailCopied ? <><Check size={13} />Copied!</> : <><Copy size={13} />Copy to Clipboard</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
