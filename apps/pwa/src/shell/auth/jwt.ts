/**
 * Baca klaim `exp` dari JWT TANPA verifikasi signature -- ini BUKAN
 * validasi keamanan (itu tetap tugas backend tiap request), cuma buat
 * tau kapan token bakal ditolak backend, biar frontend bisa auto-
 * logout PAS itu terjadi (bukan nunggu user ngerasain sendiri lewat
 * error di tengah kerja).
 *
 * @returns waktu expiry dalam epoch ms, atau null kalau token gak
 *          bisa dibaca / gak punya klaim `exp`.
 */
export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return null

    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64)
    const payload = JSON.parse(json) as { exp?: unknown }

    if (typeof payload.exp !== 'number') return null
    return payload.exp * 1000
  } catch {
    return null
  }
}
