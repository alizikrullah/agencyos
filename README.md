# AgencyOS

> **AI-Powered Dashboard untuk Agensi Digital** — manajemen klien, konten, iklan, dan keuangan dalam satu workspace, ditenagai Google Gemini 2.5 Flash.

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285f4?logo=google&logoColor=white)](https://ai.google.dev)
[![Neon](https://img.shields.io/badge/Neon-Postgres-00e599?logo=postgresql&logoColor=white)](https://neon.tech)

AgencyOS adalah dashboard end-to-end untuk pemilik agensi digital Indonesia. Mengelola **klien**, **konten**, **iklan**, **invoice**, **slip gaji**, dan **keuangan** dalam satu tempat — dengan **15 fitur AI** terintegrasi yang mempercepat workflow harian: dari kategorisasi transaksi, generate caption, brainstorm konten, sampai analisa risiko klien dan executive summary laporan bulanan.

---

## ✨ Fitur Utama

### 🏠 Dashboard
Stat overview (klien aktif, konten, revenue), invoice & konten terbaru, daily briefing AI, quick actions.

### 👥 Client Management
- List klien dengan search + filter status
- **URL slug** berbasis nama klien (`/clients/healthylife-clinic`)
- **Badge churn risk** otomatis (heuristik: invoice overdue, kontrak ending, posting turun, quota rendah)
- Industry dropdown dengan opsi custom ("Lainnya")
- Detail klien punya 4 tab:
  - **Detail** — info umum, kontrak & kontak
  - **Content Calendar** — kalender bulanan + add/edit konten dengan metrik
  - **Ads Management** — campaign iklan + metrik CTR/CPC/CPM/budget
  - **Monthly Report** — views/likes/comments, donut platform, bar mingguan, top konten

### 📄 Doc Studio
- **Invoice** — form + preview live + riwayat, cetak PDF, **auto-create transaksi income** di Finance
- **Slip Gaji** — sama, **auto-create transaksi expense**

### 💰 Finance
Transaksi income/expense, stat bulan ini, bar chart 6 bulan, filter tipe/bulan/klien, inline form, hapus dengan konfirmasi.

### 🎨 UI/UX
- **Dark / Light mode** toggle (tersimpan di localStorage)
- Sidebar collapsible
- Header global dengan profile chip + theme + logout
- Layout responsif

---

## 🤖 15 Fitur AI (Google Gemini 2.5 Flash)

| # | Fitur | Lokasi | Apa yang dilakukan |
|---|---|---|---|
| 1 | **Auto-Categorize Transaksi** | Finance → form | Suggest kategori dari deskripsi transaksi |
| 2 | **Financial Insight** | Finance | Analisa keuangan bulan ini (tren, kategori dominan) |
| 3 | **Ad Copy Generator** | Client → Ads → form | 3 variasi caption iklan (Direct / Storytelling / Curiosity) |
| 4 | **Ad Performance Recommendation** | Client → Ads | Analisa performa campaign + action items konkret |
| 5 | **Smart Line Items** | Invoice | Suggest item dari riwayat invoice klien |
| 6 | **Email Draft** | Invoice + Slip Gaji | Generate email pengiriman dokumen ke klien/karyawan |
| 7 | **Caption + Hashtag** | Content → form | Generate caption + 5–8 hashtag dari judul |
| 8 | **Content Variations** | Content → form | Adaptasi caption ke 3 platform lain dengan tone berbeda |
| 9 | **Bulk Brainstorm** | Content Calendar header | 10 ide konten relevan industri (sesuai brand klien) |
| 10 | **Best Posting Time** | Content Calendar header | Rekomendasi jadwal posting dari engagement history |
| 11 | **Daily Briefing** | Dashboard | Ringkasan prioritas harian (invoice overdue, konten pending, dll) |
| 12 | **Industry Benchmark** | Client → Detail | Benchmark engagement + strategi spesifik per industri |
| 13 | **Churn Risk Analysis** | Client → Detail | Score 0–100 + reasons + recommendations retensi |
| 14 | **Executive Summary** | Client → Monthly Report | Kesimpulan analitis report (siap PPT) |
| 15 | **Chat Assistant** | Floating button (semua halaman) | Multi-turn chat streaming, context-aware, history di DB |

### Infrastruktur AI Pendukung
- 🚀 **Streaming response** (Chat Assistant) — token muncul mengalir, terasa instan
- 💾 **Caching localStorage** — hasil insight/benchmark/brainstorm tersimpan per klien+bulan, hemat kuota & instan saat reopen
- 🗄️ **Chat history persist di Neon DB** — survives browser refresh/clear cache
- 🔄 **Auto-retry** untuk error transient (503 "high demand")
- ⚡ **Thinking-off** (`thinkingBudget: 0`) — output cepat & predictable
- 🛡️ **Error handling ramah** — pesan user-friendly (rate-limit, network, API key, dll)
- 🧹 **JSON sanitizer** — handle control characters dalam respons LLM

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | **React 19** + **TypeScript** + **Vite 8** |
| Routing | React Router 7 |
| Database | **Neon** (PostgreSQL serverless) via `@neondatabase/serverless` |
| AI | **Google Gemini 2.5 Flash** via `@google/generative-ai` |
| Icons | lucide-react |
| Styling | CSS variables (no framework) |

**Tidak ada backend terpisah** — semua langsung dari browser ke Neon DB & Gemini API. Cocok untuk Vercel / Cloudflare Pages / Netlify (statis).

---

## 🚀 Setup

### Prasyarat
- **Node.js 18+**
- Akun **Neon** gratis ([neon.tech](https://neon.tech))
- API key **Google AI Studio** gratis ([aistudio.google.com/apikey](https://aistudio.google.com/apikey))

### 1. Clone & install

```bash
git clone https://github.com/<username>/agencyos.git
cd agencyos
npm install
```

### 2. Environment variables

Buat file `.env` di root:

```env
VITE_NEON_DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
VITE_GEMINI_API_KEY=AIzaSy...
```

### 3. Setup database (Neon)

Buat tabel-tabel berikut di Neon SQL Editor. Struktur kolom mengikuti definisi di [`src/lib/types.ts`](src/lib/types.ts):

- `users` (id, email, password_hash, role, agency_id)
- `clients` (id, agency_id, name, brand_name, industry, contact_*, status, package, platforms, contract_start/end, quota_per_month)
- `content_items` (id, client_id, agency_id, title, platform, schedule_date, status, caption, views, likes, comments)
- `invoices` (id, client_id, agency_id, invoice_number, amount, status, issued_date, items jsonb, recipient_*, payment_*)
- `transactions` (id, agency_id, client_id, type, category, amount, date, reference_id)
- `salary_slips` (id, agency_id, employee_name, month, year, net_salary, slip_number, items jsonb)
- `ad_campaigns` (id, agency_id, client_id, name, platform, objective, status, budget, spent, impressions, reach, clicks, conversions)
- `chat_messages`:

```sql
CREATE TABLE chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_agency ON chat_messages(agency_id, created_at);
```

> 💡 **Demo mode**: kalau mau eksplorasi UI tanpa setup DB, klik **"Coba Demo"** di halaman login — semua fitur jalan dengan data dummy (chat history tidak di-persist di demo mode).

### 4. Run

```bash
npm run dev
```

Aplikasi jalan di [http://localhost:5173](http://localhost:5173).

---

## 📜 Scripts

| Command | Aksi |
|---|---|
| `npm run dev` | Start dev server dengan HMR |
| `npm run build` | Production build (tsc + vite) |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint check |

---

## 📁 Struktur Project

```
src/
├── components/
│   ├── ChatAssistant.tsx       # Floating AI chat (streaming + DB history)
│   ├── IndustrySelect.tsx      # Industry dropdown + opsi custom
│   ├── MiniMarkdown.tsx        # Renderer markdown ringan
│   └── layout/Layout.tsx       # Sidebar + topbar + theme toggle
├── context/
│   ├── AuthContext.tsx         # Auth + demo mode
│   └── ThemeContext.tsx        # Dark/light mode
├── lib/
│   ├── gemini.ts               # 15 AI functions + retry + streaming
│   ├── neon.ts                 # Neon SQL client
│   ├── queries.ts              # DB hooks & mutations (semua DB ter-parse)
│   ├── types.ts                # Domain types
│   ├── demo-data.ts            # Data dummy untuk demo mode
│   ├── slug.ts                 # URL slug helper
│   └── useAiCache.ts           # localStorage cache untuk hasil AI
├── pages/                      # Page components (Dashboard, Clients, Finance, dll)
└── router/AppRouter.tsx        # React Router config
```

---

## ⚙️ Catatan Penting

### Kuota Gemini Free Tier
- `gemini-2.5-flash` di free tier = **20 request/hari per project**
- Caching aggressive mengurangi waste (insight/brainstorm tidak generate ulang saat buka modal)
- Kalau habis: buat API key baru di project Google AI Studio lain, atau enable billing

### Ganti model
Cukup ubah satu baris di [`src/lib/gemini.ts`](src/lib/gemini.ts):

```ts
const GEMINI_MODEL = 'gemini-2.5-flash'  // ganti ke 'gemini-2.5-flash-lite' atau 'gemini-3.5-flash'
```

### Penanganan tipe data dari Neon
- Kolom `numeric` PostgreSQL dikembalikan sebagai **string** di Neon serverless driver
- Solusi: setiap tabel punya parser (`parseInvoice`, `parseContentItem`, dll) di [`queries.ts`](src/lib/queries.ts) yang `Number()`-wrap field numeric → semua DB rows konsisten typed

---

## 🎯 Roadmap

- [ ] Export Monthly Report jadi PDF langsung dari aplikasi
- [ ] Bulk operations (delete multiple, bulk schedule)
- [ ] Multi-agency support (workspace switching)
- [ ] Mobile-responsive optimization
- [ ] Real-time collaboration (Neon Live)

---

## 📝 License

MIT

---

Built untuk **Google Vibe Coding Competition** 🚀
