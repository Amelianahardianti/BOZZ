// backend/test/openapi-docs.test.ts

// Menjaga dua hal yang gampang jebol tanpa disadari: spec-nya benar-benar
// terbaca dari contracts/api.yaml (path relatif ini beda antara dev dan
// hasil build), dan /api/docs tidak keburu ditelan jaring not-found.

import request from 'supertest';
import { app } from '../src/app';
import { describe, expect, it } from '@jest/globals';

describe('GET /api/docs.json', () => {
  it('menyajikan spec OpenAPI dari contracts/api.yaml', async () => {
    const res = await request(app).get('/api/docs.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('POS PWA Multi-Platform API');
    // Sanity check kalau YAML-nya beneran ke-parse, bukan cuma header.
    expect(res.body.paths['/auth/login']).toBeDefined();
  });
});

describe('GET /api/docs', () => {
  it('membalas halaman Swagger UI, bukan 404 dari jaring not-found', async () => {
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('swagger-ui');
  });
});
