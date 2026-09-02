// backend/src/modules/sales-inventory/event-subscribers.ts

// STEP 4 — konsumen `order.received` dari Order Hub (Ecommerce Sync).
//
// SENGAJA TIDAK membuat/assign ticket otomatis di sini: SRS mewajibkan
// Owner yang membuat ticket dan memilih SATU Pengepak secara manual
// (POST /tickets, PATCH /tickets/:id/assign -- sudah ada, tidak diubah).
// Yang dilakukan handler ini cuma mengabari Owner bahwa ada order baru
// yang siap diproses, supaya Owner tahu harus buka layar order & bikin
// ticket -- bukan menggantikan keputusan itu.
//
// Data order itu sendiri (item, dst) TIDAK diambil di sini. Payload
// `order.received` memang tidak membawa item (lihat OrderReceivedPayload
// di shared/event-bus.ts), dan modul ini tidak berhak mengintip data
// internal Ecommerce Sync langsung -- Owner melihat detail order lewat
// GET /api/orders/:id milik modul itu sendiri, lalu bikin ticket manual
// dari sana. Kalau nanti disepakati item perlu ikut, itu perubahan
// contract/payload yang harus disepakati bertiga, bukan jalan pintas di sini.

import { subscribe, EVENTS } from '../../shared/event-bus';
import { createNotification, listStaff } from '../auth-product';

// Bus event ini TIDAK persisten (lihat catatan di shared/event-bus.ts) --
// Set ini cuma jaga-jaga kalau publisher/proses yang sama entah kenapa
// mem-publish order yang sama dua kali dalam satu lifetime proses, supaya
// Owner tidak dibanjiri notifikasi ganda untuk order yang sama. Ini BUKAN
// idempotency lintas restart -- itu di luar cakupan Step 4 (bus in-memory
// memang begitu adanya, sudah didokumentasikan sebagai batasan bersama).
const orderSudahDikabari = new Set<string>();

subscribe(EVENTS.ORDER_RECEIVED, async (payload) => {
  if (orderSudahDikabari.has(payload.external_order_id)) return;
  orderSudahDikabari.add(payload.external_order_id);

  try {
    const staff = await listStaff();
    const owners = staff.filter((s) => s.role === 'owner' && s.is_active);

    for (const owner of owners) {
      try {
        await createNotification({
          userId: owner.id,
          type: 'new_order',
          title: 'Order baru perlu ticket packing',
          message: `Order marketplace baru (SLA ${payload.sla_type}) siap diproses -- buat ticket packing dan pilih Pengepak.`,
          referenceType: 'external_order',
          referenceId: payload.external_order_id,
        });
      } catch (err) {
        // Gagal notifikasi TIDAK boleh menjatuhkan handler event ini --
        // event-bus.ts sudah menangkap error handler, tapi log di sini
        // biar jelas notifikasi siapa yang gagal, bukan cuma "listener gagal".
        console.error(`[sales-inventory] gagal bikin notifikasi order baru untuk owner ${owner.id}`, err);
      }
    }
  } catch (err) {
    console.error(`[sales-inventory] gagal memproses order.received untuk ${payload.external_order_id}`, err);
  }
});
