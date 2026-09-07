// Entry point khusus Vercel. Vercel Node Functions native support Express
// app langsung -- app itu sendiri sudah callable (req, res), jadi TIDAK
// perlu wrapper serverless-http (itu buat AWS Lambda mentah, beda
// signature, dan bikin function hang nunggu callback yang gak pernah
// kepanggil).
export { app as default } from '../src/app';
