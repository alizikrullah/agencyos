import { useState } from 'react'

// Industry preset + opsi "Lainnya" yang memunculkan input teks bebas.
// Nilai custom (cth "Tekstil") disimpan langsung di field industry — tanpa kolom DB tambahan,
// sehingga AI tetap melihat industri spesifik, bukan sekadar "Other".
const PRESETS = ['Retail', 'F&B', 'Technology', 'Fashion', 'Property', 'Healthcare', 'Education', 'Finance', 'Entertainment']
const OTHER = '__other__'

export default function IndustrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [otherMode, setOtherMode] = useState(() => value !== '' && !PRESETS.includes(value))
  const selectVal = otherMode ? OTHER : value

  return (
    <>
      <select className="input" value={selectVal} onChange={e => {
        const v = e.target.value
        if (v === OTHER) { setOtherMode(true); onChange('') }
        else { setOtherMode(false); onChange(v) }
      }}>
        <option value="">Pilih industry...</option>
        {PRESETS.map(i => <option key={i} value={i}>{i}</option>)}
        <option value={OTHER}>Lainnya (isi sendiri)</option>
      </select>
      {otherMode && (
        <input
          className="input"
          style={{ marginTop: 8 }}
          placeholder="Tulis industri — cth: Tekstil, Otomotif (opsional)"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </>
  )
}
