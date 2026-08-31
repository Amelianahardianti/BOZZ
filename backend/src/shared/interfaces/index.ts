// Kontrak TypeScript antar modul backend (dipanggil langsung via
// function call, BUKAN lewat event bus — untuk kasus butuh jawaban
// sinkron, misal cek stok). Isi ini disepakati bareng 3 developer,
// bukan diputuskan sepihak oleh 1 modul.
//
// Contoh (isi sesuai kebutuhan nyata pas modul mulai dibangun):
//
// export interface ProductStockChecker {
//   getAvailableStock(productId: string): Promise<number>;
// }

/**
 * Diimplementasikan modul auth-product (backend/src/modules/auth-product),
 * diekspor lewat index.ts publiknya sebagai `createNotification`.
 *
 * Dipakai modul lain untuk bikin notifikasi in-app (FR-FI-10), contoh:
 *  - Sales & Inventory (Fulfillment): assign ticket ke pengepak ->
 *    type: 'new_ticket', reference_type: 'ticket'
 *  - Order Hub & Customer: order marketplace baru masuk ->
 *    type: 'new_order', reference_type: 'external_order'
 */
export interface NotificationCreator {
  createNotification(input: {
    userId: string;
    type: string;
    title: string;
    message?: string;
    referenceType?: 'external_order' | 'ticket';
    referenceId?: string;
  }): Promise<{
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string | null;
    reference_type: 'external_order' | 'ticket' | null;
    reference_id: string | null;
    is_read: boolean;
    created_at: string;
  }>;
}
