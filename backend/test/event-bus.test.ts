// backend/test/event-bus.test.ts

import {
  EVENTS,
  HandlerFailure,
  listenerCount,
  onHandlerError,
  publish,
  resetEventBus,
  subscribe,
} from '../src/shared/event-bus';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

// Bus itu singleton, jadi sisa listener dari test sebelumnya bisa bocor
// ke test berikutnya kalau tidak dibersihkan.
afterEach(() => {
  resetEventBus();
});

describe('publish/subscribe', () => {
  it('mengantar payload ke listener yang terdaftar', () => {
    const diterima: unknown[] = [];
    subscribe(EVENTS.STOCK_UPDATED, (payload) => {
      diterima.push(payload);
    });

    publish(EVENTS.STOCK_UPDATED, {
      product_id: 'p-1',
      change_qty: -2,
      stock_after: 8,
      reason: 'sale',
    });

    expect(diterima).toHaveLength(1);
    expect(diterima[0]).toMatchObject({
      product_id: 'p-1',
      change_qty: -2,
      stock_after: 8,
      reason: 'sale',
    });
  });

  it('mengisi occurred_at otomatis kalau tidak diisi pemanggil', () => {
    const hasil = publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'o-1',
      platform_id: 'plat-1',
      sla_type: 'instant',
    });

    expect(typeof hasil.occurred_at).toBe('string');
    expect(new Date(hasil.occurred_at).toISOString()).toBe(hasil.occurred_at);
  });

  it('memakai occurred_at dari pemanggil kalau memang diisi', () => {
    const waktuAsli = '2026-01-02T03:04:05.000Z';
    const hasil = publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'o-2',
      platform_id: 'plat-1',
      sla_type: 'reguler',
      occurred_at: waktuAsli,
    });

    expect(hasil.occurred_at).toBe(waktuAsli);
  });

  it('hanya memicu listener event yang bersangkutan', () => {
    const stok = jest.fn(() => undefined);
    const order = jest.fn(() => undefined);
    subscribe(EVENTS.STOCK_UPDATED, stok);
    subscribe(EVENTS.ORDER_RECEIVED, order);

    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'o-3',
      platform_id: 'plat-1',
      sla_type: 'same_day',
    });

    expect(order).toHaveBeenCalledTimes(1);
    expect(stok).not.toHaveBeenCalled();
  });

  it('memanggil semua listener sesuai urutan pendaftaran', () => {
    const urutan: string[] = [];
    subscribe(EVENTS.ORDER_STATUS_CHANGED, () => void urutan.push('pertama'));
    subscribe(EVENTS.ORDER_STATUS_CHANGED, () => void urutan.push('kedua'));

    publish(EVENTS.ORDER_STATUS_CHANGED, {
      external_order_id: 'o-4',
      new_status: 'shipped',
    });

    expect(urutan).toEqual(['pertama', 'kedua']);
  });
});

describe('unsubscribe', () => {
  it('menghentikan pengiriman event setelah dipanggil', () => {
    const handler = jest.fn(() => undefined);
    const berhenti = subscribe(EVENTS.STOCK_UPDATED, handler);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'p-1', stock_after: 5, reason: 'restock' });
    berhenti();
    publish(EVENTS.STOCK_UPDATED, { product_id: 'p-1', stock_after: 6, reason: 'restock' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(listenerCount(EVENTS.STOCK_UPDATED)).toBe(0);
  });
});

describe('isolasi error listener', () => {
  it('listener yang throw tidak menjatuhkan publisher maupun listener lain', () => {
    const kegagalan: HandlerFailure[] = [];
    onHandlerError((f) => void kegagalan.push(f));

    subscribe(EVENTS.STOCK_UPDATED, () => {
      throw new Error('Shopee API down');
    });
    const listenerSehat = jest.fn(() => undefined);
    subscribe(EVENTS.STOCK_UPDATED, listenerSehat);

    expect(() =>
      publish(EVENTS.STOCK_UPDATED, { product_id: 'p-9', stock_after: 3, reason: 'sale' })
    ).not.toThrow();

    expect(listenerSehat).toHaveBeenCalledTimes(1);
    expect(kegagalan).toHaveLength(1);
    expect((kegagalan[0].error as Error).message).toBe('Shopee API down');
    expect(kegagalan[0].event).toBe('stock.updated');
    expect(kegagalan[0].payload).toMatchObject({ product_id: 'p-9' });
  });

  it('handler async yang reject dilaporkan, bukan jadi unhandled rejection', async () => {
    const kegagalan: HandlerFailure[] = [];
    onHandlerError((f) => void kegagalan.push(f));

    subscribe(EVENTS.ORDER_RECEIVED, async () => {
      throw new Error('gagal simpan ticket');
    });

    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'o-5',
      platform_id: 'plat-1',
      sla_type: 'instant',
    });

    // Rejection ditangkap di microtask, jadi tunggu satu putaran dulu.
    await Promise.resolve();

    expect(kegagalan).toHaveLength(1);
    expect((kegagalan[0].error as Error).message).toBe('gagal simpan ticket');
  });
});
