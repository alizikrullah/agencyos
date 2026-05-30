// Ubah nama klien jadi slug URL-friendly. Contoh: "HealthyLife Clinic" -> "healthylife-clinic".
// Dipakai untuk routing /clients/<slug>, di-generate on-the-fly dari nama (tanpa kolom DB).
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '') // buang aksen (é -> e)
      .replace(/[^a-z0-9]+/g, '-')                       // non-alfanumerik -> strip
      .replace(/^-+|-+$/g, '')                           // buang strip di ujung
    || 'klien'
  )
}
