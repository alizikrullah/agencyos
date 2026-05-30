import { GoogleGenerativeAI, type Content, type GenerationConfig } from '@google/generative-ai'

const GEMINI_MODEL = 'gemini-2.5-flash'
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

// Gemini 2.5/3.x adalah "thinking model" — thinkingBudget:0 mematikan reasoning internal.
// Untuk task di app ini (kategorisasi, caption, insight) thinking tidak perlu: hasilnya lebih
// cepat, predictable, dan output pendek tidak kepotong oleh token budget yang dipakai mikir.
// thinkingConfig belum ada di type SDK v0.24.1, jadi di-cast.
function genConfig(opts?: { temperature?: number; maxTokens?: number }): GenerationConfig {
  return {
    temperature: opts?.temperature ?? 0.7,
    maxOutputTokens: opts?.maxTokens ?? 1024,
    thinkingConfig: { thinkingBudget: 0 },
  } as GenerationConfig
}

// Retry untuk error transient (503 "high demand"/overloaded). Error lain langsung dilempar.
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
      const transient = msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('500') || msg.includes('internal')
      if (!transient || attempt === retries) throw e
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
    }
  }
  throw lastErr
}

async function geminiComplete(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: genConfig(opts) })
  return withRetry(async () => (await model.generateContent(prompt)).response.text())
}

// Konversi format pesan OpenAI-style → format Gemini (system terpisah, assistant→model).
function toGeminiContents(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const contents: Content[] = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  return { system: system || undefined, contents }
}

// Streaming chat: panggil onToken setiap potongan teks datang. Return full text di akhir.
// Retry hanya kalau gagal SEBELUM token pertama keluar (biar tidak dobel output).
async function geminiChatStream(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onToken: (chunk: string) => void,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const { system, contents } = toGeminiContents(messages)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: system, generationConfig: genConfig(opts) })
  return withRetry(async () => {
    const result = await model.generateContentStream({ contents })
    let full = ''
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) { full += text; onToken(text) }
    }
    return full
  })
}

const stripJson = (raw: string) =>
  raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

// LLM sering output JSON dengan newline/tab literal di dalam string value (tidak di-escape),
// yang bikin JSON.parse melempar "Bad control character". Helper ini escape control char
// HANYA saat berada di dalam string literal, supaya struktur JSON tetap valid.
function sanitizeJsonControlChars(s: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
    }
    out += ch
  }
  return out
}

function parseAiJson<T>(raw: string): T {
  const cleaned = sanitizeJsonControlChars(stripJson(raw))
  return JSON.parse(cleaned) as T
}

// Map error teknis ke pesan ramah untuk user. Detail teknis tetap di-log ke console untuk debugging.
export function aiErrorMessage(e: unknown): string {
  console.error('[AI]', e)
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many') || msg.includes('quota') || msg.includes('resource has been exhausted'))
    return 'AI lagi sibuk sebentar (batas kuota). Tunggu beberapa detik lalu coba lagi ya.'
  if (msg.includes('401') || msg.includes('403') || msg.includes('api key') || msg.includes('api_key') || msg.includes('permission') || msg.includes('unauthorized'))
    return 'Koneksi ke AI bermasalah. Cek API key Gemini di konfigurasi.'
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('candidate'))
    return 'Respons diblokir filter keamanan AI. Coba ubah teks input lalu generate ulang.'
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('networkerror'))
    return 'Gagal terhubung ke AI. Cek koneksi internet kamu lalu coba lagi.'
  if (msg.includes('json') || msg.includes('parse') || msg.includes('unexpected') || msg.includes('control character'))
    return 'Respons AI kurang rapi kali ini. Coba generate ulang.'
  return 'Ada gangguan saat menghubungi AI. Coba lagi sebentar.'
}

const fmtIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

// Konteks waktu untuk prompt: model sering default ke tahun training (2024).
// Inject ini supaya referensi tahun/tren/musim pakai tahun berjalan.
function nowContext(): string {
  const now = new Date()
  return `Konteks waktu: sekarang ${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} (tahun ${now.getFullYear()}). Untuk referensi tahun/tren/musim, pakai tahun ${now.getFullYear()} atau lebih baru — JANGAN pakai tahun lama.`
}

// ── Client Monthly Report — executive summary siap kirim ke klien ────────────
export interface ClientReportInput {
  clientName: string
  monthLabel: string
  posted: number
  quotaTotal: number
  totalViews: number
  totalLikes: number
  totalComments: number
  platformBreakdown: { platform: string; count: number }[]
  topContent: { title: string; views: number }[]
  campaigns: { name: string; platform: string; budget: number; spent: number; clicks: number; conversions: number }[]
}

export async function aiClientReport(input: ClientReportInput): Promise<string> {
  const engagement = input.totalViews > 0
    ? (((input.totalLikes + input.totalComments) / input.totalViews) * 100).toFixed(2) + '%'
    : 'n/a'
  const quotaPct = input.quotaTotal > 0 ? Math.round((input.posted / input.quotaTotal) * 100) + '%' : 'n/a'
  const adsText = input.campaigns.length > 0
    ? input.campaigns.map(c => `  - ${c.name} (${c.platform}): budget ${fmtIDR(c.budget)}, spent ${fmtIDR(c.spent)}, ${c.clicks} klik, ${c.conversions} konversi`).join('\n')
    : '  - Tidak ada campaign iklan bulan ini'

  const prompt = `Kamu adalah data analyst agensi digital. Simpulkan performa bulanan klien dari angka di bawah. Ini untuk bahan slide laporan internal (PPT), BUKAN surat ke klien.

Klien: ${input.clientName}
Periode: ${input.monthLabel}

PERFORMA KONTEN:
- Konten tayang: ${input.posted}${input.quotaTotal > 0 ? ` dari kuota ${input.quotaTotal} (${quotaPct})` : ''}
- Total views: ${input.totalViews.toLocaleString('id-ID')}
- Total likes: ${input.totalLikes.toLocaleString('id-ID')}
- Total komentar: ${input.totalComments.toLocaleString('id-ID')}
- Engagement rate: ${engagement}
- Breakdown platform: ${input.platformBreakdown.length > 0 ? input.platformBreakdown.map(p => `${p.platform} (${p.count})`).join(', ') : 'belum ada'}
- Konten terbaik: ${input.topContent.length > 0 ? input.topContent.map(c => `"${c.title}" (${c.views.toLocaleString('id-ID')} views)`).join('; ') : 'belum ada'}

PERFORMA IKLAN:
${adsText}

Tulis dalam markdown ringkas & poin-poin (max 200 kata), gaya analitis untuk slide:

**Penilaian Performa** — 1-2 kalimat: bulan ini bagus / biasa / kurang? Dasarkan pada angka (engagement rate, pencapaian kuota, hasil iklan). Jujur dan objektif.

**Yang Berjalan Baik**
- poin dengan angka spesifik

**Yang Perlu Ditingkatkan**
- poin dengan angka spesifik

**Rekomendasi**
- langkah konkret bulan depan

ATURAN: Bahasa Indonesia, langsung ke poin. JANGAN pakai format surat (tanpa "Yth", "Dengan hormat", "Hormat kami", tanpa tanda tangan/nama). JANGAN pakai kata "kami/klien yang terhormat". Murni analisa angka.`
  return geminiComplete(prompt, { maxTokens: 1000 })
}

// ── NEW 1: Auto-categorize transaction ───────────────────────────────────────
export async function aiSuggestCategory(
  description: string,
  type: 'income' | 'expense',
): Promise<string> {
  const cats = type === 'income'
    ? ['Invoice Klien', 'Project Fee', 'Retainer', 'Lainnya']
    : ['Gaji Karyawan', 'Software & Tools', 'Iklan & Promosi', 'Operasional', 'Peralatan', 'Lainnya']
  const prompt = `Kamu adalah finance assistant untuk agensi digital Indonesia.

Tipe transaksi: ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
Deskripsi: "${description}"

Pilih TEPAT SATU kategori paling cocok dari list ini:
${cats.join(' | ')}

Balas HANYA dengan nama kategori persis seperti di list, tanpa quotes, tanpa penjelasan.`
  const raw = await geminiComplete(prompt, { temperature: 0.2, maxTokens: 256 })
  const cleaned = raw.trim().replace(/^["']|["']$/g, '')
  return cats.find(c => c.toLowerCase() === cleaned.toLowerCase()) ?? cats[cats.length - 1]
}

// ── NEW 2: Financial insight ─────────────────────────────────────────────────
export interface FinanceSnapshot {
  monthLabel: string
  curIncome: number
  curExpense: number
  prevIncome: number
  prevExpense: number
  topExpenseCategories: { cat: string; amount: number }[]
  pendingInvoices: number
}

export async function aiFinanceInsight(snap: FinanceSnapshot): Promise<string> {
  const net = snap.curIncome - snap.curExpense
  const prevNet = snap.prevIncome - snap.prevExpense
  const prompt = `Kamu adalah financial analyst untuk agensi digital Indonesia. Berikan insight singkat & actionable.

Periode: ${snap.monthLabel}
- Pemasukan bulan ini: ${fmtIDR(snap.curIncome)} (bulan lalu: ${fmtIDR(snap.prevIncome)})
- Pengeluaran bulan ini: ${fmtIDR(snap.curExpense)} (bulan lalu: ${fmtIDR(snap.prevExpense)})
- Net bulan ini: ${fmtIDR(net)} (bulan lalu: ${fmtIDR(prevNet)})
- Top kategori pengeluaran: ${snap.topExpenseCategories.map(c => `${c.cat} (${fmtIDR(c.amount)})`).join(', ') || '—'}
- Invoice menunggu pembayaran: ${snap.pendingInvoices}

Tulis 2-3 paragraf singkat (max 120 kata) dalam markdown.
Format:
**Ringkasan:** [1 kalimat overall]
**Highlight:** [tren naik/turun signifikan + kategori dominan]
**Perhatian:** [1-2 hal yang perlu di-follow up]

Bahasa Indonesia, langsung ke poin, tidak bertele-tele.`
  return geminiComplete(prompt, { temperature: 0.5, maxTokens: 400 })
}

// ── NEW 3: Ad copy generator ─────────────────────────────────────────────────
export interface AdCopyInput {
  clientName: string
  brandName?: string | null
  industry?: string | null
  product: string
  platform: string
  objective: string
}

export async function aiAdCopy(input: AdCopyInput): Promise<string[]> {
  const prompt = `Kamu adalah copywriter senior untuk iklan digital Indonesia.
${nowContext()}

Klien: ${input.clientName}${input.brandName ? ` (${input.brandName})` : ''}
Industri: ${input.industry ?? 'umum'}
Produk/Layanan: ${input.product}
Platform: ${input.platform}
Objective: ${input.objective}

Buat 3 variasi caption iklan dengan gaya berbeda:
1. Direct/Hard-sell — straight to the point dengan CTA jelas
2. Storytelling/Emotional — bangun koneksi emosional
3. Curiosity/Question — pancing rasa ingin tahu

Setiap caption: max 150 karakter body + 3-5 hashtag relevan + 1 emoji.

Balas HANYA dengan JSON valid:
{
  "variations": ["caption 1...", "caption 2...", "caption 3..."]
}`
  const raw = await geminiComplete(prompt, { temperature: 0.85, maxTokens: 600 })
  const parsed = parseAiJson<{ variations: string[] }>(raw)
  return parsed.variations
}

// ── NEW 4: Ad performance recommendation ─────────────────────────────────────
export interface AdMetric {
  name: string
  platform: string
  objective: string
  status: string
  budget: number
  spent: number
  impressions: number
  clicks: number
  conversions: number
}

export async function aiAdRecommendation(campaigns: AdMetric[]): Promise<string> {
  const campaignList = campaigns.map(c => {
    const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) + '%' : '—'
    const cpc = c.clicks > 0 ? fmtIDR(c.spent / c.clicks) : '—'
    return `- ${c.name} (${c.platform}, ${c.objective}, ${c.status}): budget ${fmtIDR(c.budget)} | spent ${fmtIDR(c.spent)} | ${c.impressions} impr | ${c.clicks} clicks (CTR ${ctr}, CPC ${cpc}) | ${c.conversions} conv`
  }).join('\n')

  const prompt = `Kamu adalah ads strategist senior. Analisis performance campaign berikut dan beri rekomendasi konkret.

${campaignList}

Tulis dalam markdown (max 180 kata):
**Yang berjalan baik:** [1-2 poin]
**Yang perlu diperbaiki:** [1-2 poin spesifik dengan angka]
**Action item:** [3 langkah konkret yang bisa langsung dieksekusi minggu ini]

Bahasa Indonesia, data-driven, langsung ke poin. Sebut nama campaign saat relevan.`
  return geminiComplete(prompt, { temperature: 0.5, maxTokens: 500 })
}

// ── NEW 5: Smart line items for invoice ──────────────────────────────────────
export interface InvoiceHistoryItem {
  description: string
  quantity: number
  rate: number
}

export interface SuggestItemsInput {
  clientName: string
  recentInvoices: { date: string; items: InvoiceHistoryItem[] }[]
}

export async function aiSuggestInvoiceItems(input: SuggestItemsInput): Promise<InvoiceHistoryItem[]> {
  if (input.recentInvoices.length === 0) return []

  const historyText = input.recentInvoices.map((inv, i) =>
    `Invoice ${i + 1} (${inv.date}):\n${inv.items.map(it => `  - ${it.description} | Rp ${it.rate.toLocaleString('id-ID')} x ${it.quantity}`).join('\n')}`,
  ).join('\n\n')

  const prompt = `Kamu adalah finance assistant. Suggest line items untuk invoice baru berdasarkan riwayat klien.

Klien: ${input.clientName}

Riwayat ${input.recentInvoices.length} invoice terakhir:
${historyText}

Suggest items untuk invoice baru bulan ini. Fokus pada pattern recurring (retainer, langganan, jasa rutin). Jika ada item yang muncul di 2+ invoice terakhir, sangat mungkin recurring.

Balas HANYA dengan JSON valid:
{
  "items": [
    { "description": "deskripsi item", "rate": 5000000, "quantity": 1 }
  ]
}

Max 5 items. Pakai harga dari riwayat (jangan invent angka baru).`
  const raw = await geminiComplete(prompt, { temperature: 0.3, maxTokens: 600 })
  const parsed = parseAiJson<{ items: InvoiceHistoryItem[] }>(raw)
  return parsed.items.slice(0, 5).map(it => ({
    description: String(it.description ?? ''),
    quantity: Number(it.quantity) || 1,
    rate: Number(it.rate) || 0,
  }))
}

// ── NEW 6: Email draft ───────────────────────────────────────────────────────
export interface EmailDraftInput {
  type: 'invoice' | 'salary'
  recipientName: string
  docNumber: string
  amount: number
  date: string
  dueDate?: string | null
  bankName?: string | null
  bankAccount?: string | null
  paymentName?: string | null
}

export async function aiEmailDraft(input: EmailDraftInput): Promise<string> {
  const ctx = input.type === 'invoice'
    ? `Buat email untuk mengirim INVOICE ke klien.

Penerima: ${input.recipientName}
Nomor Invoice: ${input.docNumber}
Jumlah: ${fmtIDR(input.amount)}
Tanggal Invoice: ${input.date}
${input.dueDate ? `Jatuh Tempo: ${input.dueDate}` : ''}
${input.paymentName ? `Pembayaran ke: ${input.paymentName} (${input.bankName} ${input.bankAccount})` : ''}

Email harus mencakup: salam pembuka, ringkasan invoice, instruksi pembayaran (jika ada info bank), salam penutup.`
    : `Buat email untuk mengirim SLIP GAJI ke karyawan.

Penerima: ${input.recipientName}
Nomor Slip: ${input.docNumber}
Net Gaji: ${fmtIDR(input.amount)}
Periode: ${input.date}

Email harus mencakup: salam pembuka, info slip gaji terlampir, ucapan terima kasih atas kontribusi, salam penutup.`

  const prompt = `Kamu adalah professional assistant agensi Indonesia. Tulis email yang sopan, formal tapi friendly, max 100 kata.

${ctx}

Format:
Subject: [subject email]

[body email]

Pakai Bahasa Indonesia. Jangan pakai markdown bold/italic. Tutup dengan "Salam," tanpa nama (akan diisi user).`
  return geminiComplete(prompt, { temperature: 0.6, maxTokens: 400 })
}

// ═════════════════════════════════════════════════════════════════════════════
// TIER 2 — Productivity Boost
// ═════════════════════════════════════════════════════════════════════════════

// ── 7: Caption + Hashtag from Title ──────────────────────────────────────────
export interface CaptionWithHashtagsResult {
  caption: string
  hashtags: string[]
}

export async function aiCaptionFromTitle(
  title: string,
  platform: string,
  contentPillar?: string | null,
): Promise<CaptionWithHashtagsResult> {
  const prompt = `Kamu adalah social media content writer untuk agensi digital Indonesia.
${nowContext()}

Judul konten: "${title}"
Platform: ${platform}
${contentPillar ? `Content Pillar: ${contentPillar}` : ''}

Buat caption siap posting + hashtag relevan untuk konten ini.

Aturan caption:
- Bahasa Indonesia, casual tapi profesional sesuai platform
- Hook kuat di kalimat pertama
- Max 400 karakter (TANPA hashtag di body)
- Pakai 1-2 emoji yang natural
- Akhiri dengan CTA atau pertanyaan engagement

Aturan hashtag:
- 5-8 hashtag relevan
- Mix branded, niche, trending
- TANPA simbol # (akan ditambahkan otomatis di UI)

Balas HANYA dengan JSON valid:
{
  "caption": "isi caption tanpa hashtag",
  "hashtags": ["hashtag1", "hashtag2"]
}`
  const raw = await geminiComplete(prompt, { temperature: 0.8, maxTokens: 600 })
  const parsed = parseAiJson<{ caption: string; hashtags: string[] }>(raw)
  return {
    caption: String(parsed.caption ?? '').trim(),
    hashtags: (parsed.hashtags ?? []).map(h => String(h).replace(/^#/, '').trim()).filter(Boolean),
  }
}

// ── 8: Content Variation — adapt caption ke platform lain ────────────────────
export interface PlatformVariation {
  platform: string
  caption: string
}

export async function aiContentVariation(
  originalCaption: string,
  fromPlatform: string,
  targetPlatforms: string[],
): Promise<PlatformVariation[]> {
  const prompt = `Kamu adalah social media strategist. Adaptasi caption berikut untuk platform berbeda.

Caption asli (${fromPlatform}):
"${originalCaption}"

Target platforms: ${targetPlatforms.join(', ')}

Untuk setiap target platform:
- Sesuaikan TONE sesuai karakter platform (Instagram: visual+casual, TikTok: Gen-Z+playful, LinkedIn: professional, YouTube: detailed+SEO, Twitter/X: short+punchy, Facebook: conversational)
- Sesuaikan PANJANG dengan best practice platform
- Pertahankan inti pesan & CTA
- Hashtag sesuai gaya platform

Balas HANYA dengan JSON valid:
{
  "variations": [
    { "platform": "nama platform", "caption": "caption adapted" }
  ]
}`
  const raw = await geminiComplete(prompt, { temperature: 0.75, maxTokens: 1000 })
  const parsed = parseAiJson<{ variations: PlatformVariation[] }>(raw)
  return parsed.variations ?? []
}

// ── 9: Bulk Brainstorm — 10 ide konten ───────────────────────────────────────
export interface ContentIdea {
  title: string
  hook: string
  pillar: string
}

export async function aiBulkBrainstorm(
  topic: string,
  industry?: string | null,
  pillar?: string | null,
  platform?: string | null,
  count: number = 10,
): Promise<ContentIdea[]> {
  const prompt = `Kamu adalah content strategist untuk agensi digital Indonesia.
${nowContext()}

Brand/Klien: "${topic}"
${industry ? `Industri/bidang usaha: ${industry} (WAJIB: semua ide harus relevan dengan industri ini, jangan menebak dari nama brand)` : ''}
${pillar ? `Focus pillar: ${pillar}` : 'Mix berbagai pillar'}
${platform ? `Platform utama: ${platform}` : ''}

Generate ${count} ide konten dengan angle BERBEDA-BEDA. Setiap ide harus actionable dan spesifik (jangan generic seperti "Tips X" atau "Cara Y").${industry ? ` Pastikan ide sesuai konteks industri ${industry}.` : ''}

Balas HANYA dengan JSON valid:
{
  "ideas": [
    {
      "title": "judul singkat max 60 karakter",
      "hook": "1 kalimat opening yang grab attention, max 100 karakter",
      "pillar": "pilih TEPAT satu: Promotion | Education | Product | Branding | Social Proof | Entertainment | Behind the Scene"
    }
  ]
}

Bahasa Indonesia. ${count} ide harus benar-benar berbeda angle, jangan repetitif.`
  const raw = await geminiComplete(prompt, { temperature: 0.9, maxTokens: 1500 })
  const parsed = parseAiJson<{ ideas: ContentIdea[] }>(raw)
  return (parsed.ideas ?? []).slice(0, count)
}

// ── 10: Best Posting Time ────────────────────────────────────────────────────
export interface PostingHistoryItem {
  platform: string
  scheduleDate: string
  views: number
  likes: number
  comments: number
}

export async function aiBestPostingTime(
  history: PostingHistoryItem[],
  platforms: string[],
): Promise<string> {
  const hasData = history.length > 0
  const historyText = hasData
    ? `Data ${history.length} posting (tanggal | platform | views | likes | comments):\n` +
      history.slice(0, 40).map(h => `- ${h.scheduleDate} | ${h.platform} | ${h.views} | ${h.likes} | ${h.comments}`).join('\n')
    : 'BELUM ADA DATA HISTORICAL.'

  const prompt = `Kamu adalah social media analyst. Rekomendasikan jadwal posting terbaik untuk platforms: ${platforms.join(', ')}.

${historyText}

${hasData ? 'Analisis pattern engagement dari data di atas dan kasih rekomendasi data-driven.' : 'Karena belum ada data, kasih rekomendasi default berdasarkan best practice umum platform di Indonesia.'}

Tulis dalam markdown (max 200 kata). Untuk setiap platform yang dipakai:

**[Nama Platform]**
- Hari terbaik: [...]
- Jam terbaik: [...]
- Alasan: [1 kalimat]

Bahasa Indonesia, ringkas, langsung ke poin.`
  return geminiComplete(prompt, { temperature: 0.4, maxTokens: 600 })
}

// ── 11: Daily Briefing (Dashboard) ───────────────────────────────────────────
export interface DailyBriefingSnapshot {
  userName: string
  totalClients: number
  activeCampaigns: number
  pendingApprovals: number
  upcomingContent: { title: string; platform: string; date: string }[]
  pendingInvoices: { number: string; amount: number; status: string }[]
}

export async function aiDailyBriefing(snap: DailyBriefingSnapshot): Promise<string> {
  const prompt = `Kamu adalah AI assistant untuk owner agensi digital Indonesia. Buat daily briefing singkat & actionable.

Kondisi hari ini:
- User: ${snap.userName}
- Klien aktif: ${snap.totalClients}
- Campaign aktif: ${snap.activeCampaigns}
- Konten pending approval: ${snap.pendingApprovals}
- Konten upcoming: ${snap.upcomingContent.length > 0 ? snap.upcomingContent.slice(0, 3).map(c => `"${c.title}" (${c.platform}, ${c.date})`).join('; ') : 'Tidak ada'}
- Invoice menunggu: ${snap.pendingInvoices.length > 0 ? snap.pendingInvoices.slice(0, 3).map(i => `${i.number} ${fmtIDR(i.amount)} (${i.status})`).join('; ') : 'Tidak ada'}

Tulis briefing max 100 kata dalam markdown:

**Halo ${snap.userName}!** [1 kalimat greeting + summary kondisi hari ini]

**Prioritas hari ini:**
- [action item 1, spesifik]
- [action item 2, spesifik]
- [action item 3 jika perlu]

Bahasa Indonesia, friendly, to-the-point. Sebut detail spesifik (nomor invoice, judul konten), jangan generic. Kalau tidak ada urgensi, kasih encouragement positif.`
  return geminiComplete(prompt, { temperature: 0.6, maxTokens: 400 })
}

// Ringkasan data agensi yang dipakai sebagai konteks Chat Assistant.
export interface SearchSummary {
  totalClients: number
  activeClients: number
  totalInvoices: number
  paidInvoices: number
  pendingInvoices: number
  totalRevenue: number
  totalExpense: number
  topClients: { name: string; revenue: number }[]
  topExpenseCategories: { cat: string; amount: number }[]
  contentByPlatform: { platform: string; count: number }[]
  recentInvoices: { number: string; client: string; amount: number; status: string; date: string }[]
}

// ═════════════════════════════════════════════════════════════════════════════
// TIER 3 — Nice to Have
// ═════════════════════════════════════════════════════════════════════════════

// ── 13: Industry Insight (Client Detail) ─────────────────────────────────────
export interface IndustryInsightInput {
  industry: string
  clientName: string
  brandName?: string | null
  currentPlatforms: string[]
}

export interface IndustryInsightResult {
  recommendedPlatforms: string[]
  recommendedFrequency: string
  topPillars: string[]
  benchmark: string
}

export async function aiIndustryInsight(input: IndustryInsightInput): Promise<IndustryInsightResult> {
  const prompt = `Kamu adalah social media strategist senior untuk agensi digital Indonesia.

Klien: ${input.clientName}${input.brandName ? ` (${input.brandName})` : ''}
Industri: ${input.industry}
Platform yang sedang dipakai: ${input.currentPlatforms.length > 0 ? input.currentPlatforms.join(', ') : 'belum ada'}

Berikan benchmark & best practice untuk industri ini di pasar Indonesia.

Balas HANYA dengan JSON valid:
{
  "recommendedPlatforms": ["Platform1", "Platform2", "Platform3"],
  "recommendedFrequency": "string singkat, contoh: 3-5 posts per minggu",
  "topPillars": ["Pillar1", "Pillar2", "Pillar3"],
  "benchmark": "narrative 2-3 paragraf dalam markdown tentang benchmark engagement, audiens demografi typical, dan strategi yang biasanya efektif untuk industri ini (max 200 kata)"
}

Bahasa Indonesia. Recommendation harus spesifik untuk pasar Indonesia.`
  const raw = await geminiComplete(prompt, { temperature: 0.5, maxTokens: 700 })
  const parsed = parseAiJson<{
    recommendedPlatforms?: unknown[]
    recommendedFrequency?: unknown
    topPillars?: unknown[]
    benchmark?: unknown
  }>(raw)
  return {
    recommendedPlatforms: (parsed.recommendedPlatforms ?? []).map((s: unknown) => String(s)),
    recommendedFrequency: String(parsed.recommendedFrequency ?? ''),
    topPillars: (parsed.topPillars ?? []).map((s: unknown) => String(s)),
    benchmark: String(parsed.benchmark ?? ''),
  }
}

// ── 14: Churn Risk Analysis ──────────────────────────────────────────────────
export interface ChurnRiskInput {
  clientName: string
  contractEndDate?: string | null
  quotaTotal: number
  quotaUsedThisMonth: number
  postedLast30Days: number
  postedPrevious30Days: number
  overdueInvoices: number
  unpaidAmount: number
  daysSinceLastInvoicePaid?: number | null
}

export interface ChurnRiskResult {
  level: 'low' | 'medium' | 'high'
  score: number
  reasons: string[]
  recommendations: string[]
}

export async function aiChurnRisk(input: ChurnRiskInput): Promise<ChurnRiskResult> {
  const engagementTrend = input.postedPrevious30Days > 0
    ? ((input.postedLast30Days - input.postedPrevious30Days) / input.postedPrevious30Days * 100).toFixed(0) + '%'
    : 'n/a'
  const quotaPct = input.quotaTotal > 0 ? Math.round((input.quotaUsedThisMonth / input.quotaTotal) * 100) : 0
  const daysToContractEnd = input.contractEndDate
    ? Math.ceil((new Date(input.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const prompt = `Kamu adalah customer success analyst. Analisis risiko churn klien berikut.

Klien: ${input.clientName}
Kontrak berakhir: ${daysToContractEnd !== null ? `${daysToContractEnd} hari lagi` : 'tidak ada data'}
Quota bulan ini: ${input.quotaUsedThisMonth}/${input.quotaTotal} (${quotaPct}%)
Posts 30 hari terakhir: ${input.postedLast30Days} (vs 30 hari sebelumnya: ${input.postedPrevious30Days}, trend ${engagementTrend})
Invoice overdue: ${input.overdueInvoices} (total unpaid: ${fmtIDR(input.unpaidAmount)})
${input.daysSinceLastInvoicePaid !== null && input.daysSinceLastInvoicePaid !== undefined ? `Hari sejak invoice terakhir dibayar: ${input.daysSinceLastInvoicePaid}` : ''}

Tentukan risk level dan kasih actionable recommendations.

Balas HANYA dengan JSON valid:
{
  "level": "low" | "medium" | "high",
  "score": <0-100, 100 = paling risky>,
  "reasons": ["alasan 1 spesifik dengan angka", "alasan 2"],
  "recommendations": ["action item 1 konkret", "action item 2 konkret"]
}

Reasons harus berdasarkan data spesifik di atas, bukan generic. Max 3 reasons, max 3 recommendations.`
  const raw = await geminiComplete(prompt, { temperature: 0.3, maxTokens: 600 })
  const parsed = parseAiJson<{
    level?: string
    score?: unknown
    reasons?: unknown[]
    recommendations?: unknown[]
  }>(raw)
  const level = (parsed.level && ['low', 'medium', 'high'].includes(parsed.level) ? parsed.level : 'medium') as 'low' | 'medium' | 'high'
  return {
    level,
    score: Math.max(0, Math.min(100, Number(parsed.score) || 50)),
    reasons: (parsed.reasons ?? []).map((s: unknown) => String(s)).slice(0, 3),
    recommendations: (parsed.recommendations ?? []).map((s: unknown) => String(s)).slice(0, 3),
  }
}

// ── 15: Chat Assistant (multi-turn) ──────────────────────────────────────────
export interface ChatContext {
  currentPage?: string
  summary: SearchSummary
}

function buildChatMessages(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: ChatContext,
) {
  const ctxText = `Total klien: ${context.summary.totalClients} (${context.summary.activeClients} aktif)
Invoice: ${context.summary.totalInvoices} (${context.summary.paidInvoices} paid, ${context.summary.pendingInvoices} pending)
Revenue (paid): ${fmtIDR(context.summary.totalRevenue)} | Expense: ${fmtIDR(context.summary.totalExpense)}

Top klien by revenue: ${context.summary.topClients.length > 0 ? context.summary.topClients.map(c => `${c.name} (${fmtIDR(c.revenue)})`).join(', ') : '-'}
Top expense category: ${context.summary.topExpenseCategories.length > 0 ? context.summary.topExpenseCategories.map(c => `${c.cat} (${fmtIDR(c.amount)})`).join(', ') : '-'}
Konten by platform: ${context.summary.contentByPlatform.length > 0 ? context.summary.contentByPlatform.map(c => `${c.platform}: ${c.count}`).join(', ') : '-'}`

  const systemPrompt = `Kamu adalah AI assistant untuk AgencyOS — dashboard agensi digital Indonesia.

USER SEDANG DI HALAMAN: ${context.currentPage ?? 'unknown'}

DATA SUMMARY AGENSI USER:
${ctxText}

ATURAN:
- Bahasa Indonesia, casual tapi profesional
- Jawab singkat (1-3 kalimat untuk pertanyaan simple, maksimal 100 kata)
- Pakai data summary di atas untuk jawab pertanyaan
- Kalau butuh data yang tidak ada di summary, kasih saran navigasi: "Buka halaman X untuk detail Y"
- Halaman yang tersedia: Dashboard (/dashboard), Clients (/clients), Finance (/finance), Doc Studio → Invoice (/doc-studio/invoice), Slip Gaji (/doc-studio/salary)
- Bisa bantu user dengan: explain data, suggest action, navigation guidance, agency strategy advice
- Pakai markdown bold sederhana untuk emphasis, tapi jangan berlebihan`

  return [
    { role: 'system' as const, content: systemPrompt },
    ...messages.slice(-10), // keep last 10 turns
  ]
}

export async function aiChatStream(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: ChatContext,
  onToken: (chunk: string) => void,
): Promise<string> {
  return geminiChatStream(buildChatMessages(messages, context), onToken, { temperature: 0.7, maxTokens: 500 })
}
