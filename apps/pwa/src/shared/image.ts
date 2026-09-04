export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024 // 5MB mentah, sebelum di-compress
export const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
export const LOGO_MAX_DIMENSION = 512
export const LOGO_JPEG_QUALITY = 0.82

/** Validasi murni (gak nyentuh browser API) -- gampang dites, dipanggil sebelum compress. */
export function validateLogoFile(file: File): string | null {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    return 'Format logo harus JPG atau PNG.'
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    return `Ukuran file maksimal ${MAX_LOGO_FILE_BYTES / (1024 * 1024)}MB.`
  }
  return null
}

/**
 * Resize ke maks LOGO_MAX_DIMENSION px (sisi terpanjang) + encode ulang
 * sebagai JPEG kualitas LOGO_JPEG_QUALITY -- hasil base64-nya disimpan
 * langsung di kolom logo_url (TEXT), gak butuh object storage terpisah.
 * Background diisi putih dulu (flatten) karena PNG transparan yang
 * di-convert ke JPEG bakal item kalau enggak.
 */
export function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'))
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_DIMENSION / Math.max(img.width, img.height))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Browser gak mendukung pemrosesan gambar.'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', LOGO_JPEG_QUALITY))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
