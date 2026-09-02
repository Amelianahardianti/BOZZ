// backend/test/fakestore-status-sync.test.ts

// STEP 3 — FakeStore Status Sync (modul ecommerce-sync / Order Hub).
//
// Menguji updateOrderStatusOnPlatform() di adapters/fakestore/index.ts:
// parsing cart ID dari externalOrderId (format `CART-{id}`) dan body yang
// dikirim ke putCart(). putCart (HTTP layer) di-mock lewat jest.mock --
// TIDAK ada network request asli ke fakestoreapi.com di test ini.
//
// FakeStoreAPI sendiri tidak punya konsep/persistensi status order (lihat
// komentar di production code) -- test ini membuktikan adapter mem-parse
// & memanggil putCart() dengan benar, BUKAN membuktikan status "benar-benar
// tersimpan" di FakeStoreAPI (memang tidak bisa, itu di luar kendali kita).

import { fakestoreAdapter } from '../src/modules/ecommerce-sync/adapters/fakestore';
import * as apiClient from '../src/modules/ecommerce-sync/adapters/fakestore/api.client';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/ecommerce-sync/adapters/fakestore/api.client');
jest.mock('../src/modules/ecommerce-sync/repository');

const mockedPutCart = apiClient.putCart as jest.MockedFunction<typeof apiClient.putCart>;

const CREDS = { shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' };

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

describe('fakestoreAdapter.updateOrderStatusOnPlatform', () => {
  it('CART-123 -> cart ID diparse jadi angka 123', async () => {
    mockedPutCart.mockResolvedValue(undefined);

    await fakestoreAdapter.updateOrderStatusOnPlatform!(CREDS, 'CART-123', 'shipped');

    expect(mockedPutCart).toHaveBeenCalledTimes(1);
    const [cartId] = mockedPutCart.mock.calls[0];
    expect(cartId).toBe(123);
    expect(typeof cartId).toBe('number');
  });

  it('status dikirim sebagai { status: "shipped" }', async () => {
    mockedPutCart.mockResolvedValue(undefined);

    await fakestoreAdapter.updateOrderStatusOnPlatform!(CREDS, 'CART-123', 'shipped');

    expect(mockedPutCart).toHaveBeenCalledWith(123, { status: 'shipped' });
  });

  it('tidak melakukan network request asli -- cuma manggil putCart yang di-mock', async () => {
    mockedPutCart.mockResolvedValue(undefined);

    await fakestoreAdapter.updateOrderStatusOnPlatform!(CREDS, 'CART-7', 'completed');

    expect(mockedPutCart).toHaveBeenCalledWith(7, { status: 'completed' });
  });
});
