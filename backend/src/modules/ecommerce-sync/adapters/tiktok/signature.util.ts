import { createHmac } from 'crypto';

// Algoritma umum TikTok Shop Open API: HMAC-SHA256 dengan key=app_secret,
// atas app_secret + path + sorted_params + [body] + app_secret. Verifikasi
// ulang urutan/casing persis di dokumen App-mu di Partner Center — detail
// bisa berbeda per versi API (dokumen resminya di balik login).

export function buildSortedParamString(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');
}

export function sign(appSecret: string, path: string, sortedParams: string, body?: string): string {
  const message = `${appSecret}${path}${sortedParams}${body ?? ''}${appSecret}`;
  return createHmac('sha256', appSecret).update(message).digest('hex').toUpperCase();
}
