/** JWT palsu buat test -- signature-nya sembarangan, cuma header.payload yang perlu valid. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature-palsu`
}
