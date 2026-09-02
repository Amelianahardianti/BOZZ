// backend/test/order-ingestion.test.ts

// TEST #1 — Order Ingestion (modul ecommerce-sync / Order Hub & Customer).
//
// Menguji upsertExternalOrder() -- inti dedup + ingestion order marketplace
// (FR-OC-04, SRS 9.3). repository.ts di-mock total lewat jest.mock, persis
// pola yang sudah dipakai error-handling.test.ts untuk auth-product/repository
// -- supaya test ini cepat, tidak butuh koneksi Supabase, dan tidak numpuk
// data ke DB beneran tiap kali dijalankan.
//
// event-bus TIDAK di-mock. publish() ASLI yang dipakai (cuma di-spy), supaya
// assert "ORDER_RECEIVED terpublish" membuktikan sesuatu yang nyata, bukan
// sekadar mengetes mock buatan sendiri.

import * as repo from '../src/modules/ecommerce-sync/repository';
import { upsertExternalOrder } from '../src/modules/ecommerce-sync/service';
import * as eventBus from '../src/shared/event-bus';
import { EVENTS } from '../src/shared/event-bus';
import type { NormalizedOrder } from '../src/modules/ecommerce-sync/types';
import type { customers, external_orders } from '@prisma/client';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

const PLATFORM_ID = 'platform-uuid-fakestore';
const PLATFORM_NAME = 'fakestore';

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

/** Order ternormalisasi valid dari adapter -- bentuknya sama untuk semua platform. */
function buildOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    externalOrderId: 'CART-1',
    status: 'new',
    totalAmount: 150000,
    buyerUsername: 'johnd',
    shippingCarrier: 'GrabExpress Instant',
    rawPayload: { mock: true, platform: PLATFORM_NAME },
    items: [{ itemName: 'Kaos Polos Hitam L', qty: 2, unitPrice: 75000 }],
    ...overrides,
  };
}

/** Baris customers palsu -- tidak pernah ke database beneran. */
function buildCustomer(overrides: Partial<customers> = {}): customers {
  return {
    id: 'customer-uuid-1',
    name: null,
    phone: null,
    email: null,
    source: PLATFORM_NAME,
    external_customer_ref: null,
    external_username: 'johnd',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Baris external_orders palsu -- tidak pernah ke database beneran. */
function buildOrderRow(overrides: Partial<external_orders> = {}): external_orders {
  return {
    id: 'order-uuid-1',
    platform_id: PLATFORM_ID,
    external_order_id: 'CART-1',
    customer_id: null,
    status: 'new',
    sla_type: 'instant',
    sla_deadline: null,
    total_amount: null,
    payment_method: null,
    raw_payload: null,
    received_at: new Date('2026-01-01T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    external_status_raw: null,
    fulfillment_flag: null,
    is_cod: false,
    shipping_carrier: null,
    currency: 'IDR',
    paid_at: null,
    days_to_ship: null,
    cancel_by: null,
    cancel_reason: null,
    buyer_message: null,
    seller_note: null,
    dropshipper_name: null,
    dropshipper_phone: null,
    pickup_done_at: null,
    warnings: null,
    ...overrides,
  };
}

describe('upsertExternalOrder — Order Ingestion', () => {
  it('order baru: upsert ke repository dengan data hasil pemrosesan service, lalu mempublish ORDER_RECEIVED', async () => {
    mockedRepo.findCustomerByExternalUsername.mockResolvedValue(null);
    mockedRepo.createCustomerFromMarketplace.mockResolvedValue(buildCustomer());
    mockedRepo.findExternalOrder.mockResolvedValue(null); // order belum pernah ada -> ini order baru

    const savedRow = buildOrderRow();
    mockedRepo.upsertExternalOrderRow.mockResolvedValue(savedRow);

    const publishSpy = jest.spyOn(eventBus, 'publish');

    const order = buildOrder();
    const result = await upsertExternalOrder(PLATFORM_ID, PLATFORM_NAME, order);

    // Customer di-resolve dulu lewat marketplace-matching (bukan langsung null)
    expect(mockedRepo.findCustomerByExternalUsername).toHaveBeenCalledWith(PLATFORM_NAME, 'johnd');
    expect(mockedRepo.createCustomerFromMarketplace).toHaveBeenCalledWith(PLATFORM_NAME, 'johnd');

    // Repository benar-benar dipanggil untuk menyimpan/upsert order, dengan
    // hasil pemrosesan service (SLA dihitung dari shippingCarrier, customer
    // ter-attach) -- bukan cuma diteruskan mentah-mentah.
    expect(mockedRepo.upsertExternalOrderRow).toHaveBeenCalledTimes(1);
    const savedInput = mockedRepo.upsertExternalOrderRow.mock.calls[0][0];
    expect(savedInput.platformId).toBe(PLATFORM_ID);
    expect(savedInput.externalOrderId).toBe('CART-1');
    expect(savedInput.customerId).toBe('customer-uuid-1');
    expect(savedInput.status).toBe('new');
    // classifySla('GrabExpress Instant') ASLI dieksekusi (sla.util.ts tidak di-mock)
    expect(savedInput.slaType).toBe('instant');
    expect(savedInput.items).toEqual(order.items);
    expect(savedInput.rawPayload).toEqual(order.rawPayload);

    // Order baru -> ORDER_RECEIVED wajib terpublish lewat publish() asli.
    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith(
      EVENTS.ORDER_RECEIVED,
      expect.objectContaining({
        external_order_id: savedRow.id,
        platform_id: PLATFORM_ID,
        sla_type: 'instant',
      })
    );

    expect(result.created).toBe(true);
    expect(result.order).toBe(savedRow);
  });

  it('order yang sudah ada (dedup): SLA lama dipertahankan dan ORDER_RECEIVED TIDAK dipublish ulang', async () => {
    const existingRow = buildOrderRow({
      sla_type: 'same_day',
      sla_deadline: new Date('2026-01-01T06:00:00.000Z'),
      received_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    mockedRepo.findCustomerByExternalUsername.mockResolvedValue(buildCustomer());
    mockedRepo.findExternalOrder.mockResolvedValue(existingRow); // order SUDAH ada
    mockedRepo.upsertExternalOrderRow.mockResolvedValue({ ...existingRow, status: 'processing' });

    const publishSpy = jest.spyOn(eventBus, 'publish');

    const order = buildOrder({ status: 'processing' });
    const result = await upsertExternalOrder(PLATFORM_ID, PLATFORM_NAME, order);

    // Karena order sudah ada, findOrCreateCustomer tidak boleh membuat customer baru.
    expect(mockedRepo.createCustomerFromMarketplace).not.toHaveBeenCalled();

    expect(mockedRepo.upsertExternalOrderRow).toHaveBeenCalledTimes(1);
    const savedInput = mockedRepo.upsertExternalOrderRow.mock.calls[0][0];
    // SLA & receivedAt milik order LAMA dipertahankan, tidak dihitung ulang
    // dari payload baru (kalau tidak, deadline bisa mundur tiap kali platform sync ulang).
    expect(savedInput.slaType).toBe('same_day');
    expect(savedInput.slaDeadline).toEqual(existingRow.sla_deadline);
    expect(savedInput.receivedAt).toEqual(existingRow.received_at);
    expect(savedInput.status).toBe('processing');

    // Dedup: order lama TIDAK memicu ORDER_RECEIVED lagi.
    expect(publishSpy).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
  });
});
