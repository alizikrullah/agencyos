import { useState, useEffect } from 'react'
import { Plus, Trash2, Printer, Save, FileText, Sparkles, Loader2, Mail, Copy, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSalarySlips, addSalarySlip, addTransaction } from '../lib/queries'
import { aiEmailDraft, aiErrorMessage } from '../lib/gemini'
import type { InvoiceItem } from '../lib/types'

const fmtIDR = (n: number) => 'Rp ' + Math.abs(n).toLocaleString('id-ID')
const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

type DocItem = { id: string; description: string; quantity: number; rate: number }
const newItem = (): DocItem => ({ id: Math.random().toString(36).slice(2), description: '', quantity: 1, rate: 0 })

export default function SalaryPage() {
  const { user, isDemo } = useAuth()
  const { data: slips, loading: ls, refetch } = useSalarySlips(isDemo)

  const [docTab, setDocTab] = useState<'form' | 'riwayat'>('form')

  const today = new Date()
  const [slipNum, setSlipNum] = useState('')
  const [date, setDate] = useState(today.toISOString().split('T')[0])
  const [period, setPeriod] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [employeeName, setEmployeeName] = useState('')
  const [items, setItems] = useState<DocItem[]>([newItem()])
  const [paymentName, setPaymentName] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [financeName, setFinanceName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [demoNotice, setDemoNotice] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError]     = useState<string | null>(null)
  const [emailDraft, setEmailDraft]     = useState<string | null>(null)
  const [emailCopied, setEmailCopied]   = useState(false)

  useEffect(() => {
    const d = new Date()
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const seq = String(slips.length + 1).padStart(3, '0')
    setSlipNum(`SGJ/${yr}/${mo}/${seq}`)
  }, [slips.length])

  const total = items.reduce((s, i) => s + i.quantity * i.rate, 0)

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
    if (!employeeName.trim()) { alert('Nama karyawan wajib diisi.'); return }
    setSaving(true); setSaveOk(false)
    const [yr, mo] = period.split('-').map(Number)
    const slipItems: InvoiceItem[] = items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      rate: i.rate,
      amount: i.quantity * i.rate,
    }))
    const { data: slip } = await addSalarySlip({
      agency_id: user!.agency_id,
      employee_name: employeeName,
      employee_id: null,
      month: mo,
      year: yr,
      base_salary: total,
      allowances: null,
      deductions: null,
      net_salary: total,
      slip_number: slipNum,
      items: slipItems,
      payment_name: paymentName || null,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      signature_name: financeName || null,
    })
    if (slip) {
      await addTransaction({
        type: 'expense',
        category: 'Gaji Karyawan',
        amount: total,
        description: `Slip Gaji ${employeeName} — ${slipNum}`,
        date,
        agency_id: user!.agency_id,
        client_id: null,
        reference_id: slip.id,
      })
    }
    setSaving(false); setSaveOk(true)
    refetch()
    setTimeout(() => setSaveOk(false), 3000)
  }

  const resetForm = () => {
    setEmployeeName(''); setItems([newItem()])
    setPaymentName(''); setBankName(''); setBankAccount('')
    setFinanceName(''); setSignature(null)
    setSaveOk(false); setDemoNotice(false)
  }

  const periodLabel = () => {
    const [yr, mo] = period.split('-').map(Number)
    return `${MONTHS_ID[mo - 1]} ${yr}`
  }

  const handleDraftEmail = async () => {
    if (!employeeName.trim()) { setEmailError('Isi nama karyawan dulu.'); return }
    setEmailLoading(true); setEmailError(null); setEmailDraft(null); setEmailCopied(false)
    try {
      const text = await aiEmailDraft({
        type: 'salary',
        recipientName: employeeName,
        docNumber: slipNum,
        amount: total,
        date: periodLabel(),
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
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={resetForm}>+ Slip Baru</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="label">Nomor Slip</label>
                <input className="input" value={slipNum} onChange={e => setSlipNum(e.target.value)} />
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Periode Gaji</span>
              <input className="input" type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Penerima Gaji</span>
              <input className="input" placeholder="Nama karyawan" value={employeeName} onChange={e => setEmployeeName(e.target.value)} />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>Komponen Gaji</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, idx) => (
                  <div key={item.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Komponen {idx + 1}</span>
                      {items.length > 1 && (
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => removeItem(item.id)}>
                          <Trash2 size={11} color="var(--danger)" />
                        </button>
                      )}
                    </div>
                    <input className="input" placeholder="Keterangan (cth: Gaji Pokok)" style={{ fontSize: 12 }} value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                    <div>
                      <label className="label" style={{ fontSize: 10 }}>Jumlah (Rp)</label>
                      <input className="input" type="number" style={{ fontSize: 12 }} value={item.rate || ''} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} />
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setItems(p => [...p, newItem()])}>
                  <Plus size={12} /> Tambah komponen
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <span>Total</span><span>{'Rp ' + total.toLocaleString('id-ID')}</span>
                </div>
              </div>
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
                      <img src={signature} alt="ttd" style={{ maxHeight: 60, maxWidth: '100%', background: 'var(--bg-elevated)', borderRadius: 4, padding: 4, border: '1px solid var(--border)' }} />
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

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {demoNotice && <div className="alert alert-warning" style={{ fontSize: 12 }}>Demo mode — data tidak tersimpan.</div>}
              {saveOk && <div className="alert alert-success" style={{ fontSize: 12 }}>Slip gaji berhasil disimpan!</div>}
              <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Slip Gaji'}
              </button>
              <button className="btn btn-secondary btn-full" onClick={() => window.print()}>
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
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: '-0.5px' }}>SLIP GAJI</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{slipNum}</div>
                </div>
              </div>

              {/* Info Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 6 }}>Penerima</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{employeeName || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 6 }}>Periode</div>
                  <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{periodLabel()}</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>Tanggal: {fmtDate(date)}</div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Keterangan</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', borderBottom: '1px solid #e0e0e0' }}>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{ padding: '10px 10px', color: item.rate < 0 ? '#c00' : '#222', borderBottom: '1px solid #f0f0f0' }}>{item.description || '—'}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500, color: item.rate < 0 ? '#c00' : '#111', borderBottom: '1px solid #f0f0f0' }}>
                        {item.rate !== 0 ? (item.rate < 0 ? '(' + fmtIDR(Math.abs(item.rate)) + ')' : fmtIDR(item.rate)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 800, color: '#111', borderTop: '2px solid #111' }}>
                    <span>Total Diterima</span><span>{fmtIDR(total)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
                <div style={{ textAlign: 'center', minWidth: 140 }}>
                  <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 4 }}>
                    <div style={{ height: 1, width: 120, background: '#ccc' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>Penerima</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{employeeName || '—'}</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 140 }}>
                  <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                    {signature
                      ? <img src={signature} alt="ttd" style={{ maxHeight: 60, maxWidth: 150 }} />
                      : <div style={{ height: 1, width: 120, background: '#ccc' }} />
                    }
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>Finance</div>
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
            {ls ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : slips.length === 0 ? (
              <div className="empty-state">
                <h3>Belum ada slip gaji</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setDocTab('form')}>Buat Slip Gaji</button>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Nomor Slip</th>
                      <th>Karyawan</th>
                      <th>Periode</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slips.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{s.slip_number ?? '—'}</td>
                        <td style={{ fontWeight: 500 }}>{s.employee_name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{MONTHS_ID[s.month - 1]} {s.year}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{'Rp ' + s.net_salary.toLocaleString('id-ID')}</td>
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
                <Sparkles size={15} color="var(--accent)" />Draft Email Slip Gaji
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
