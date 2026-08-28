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
