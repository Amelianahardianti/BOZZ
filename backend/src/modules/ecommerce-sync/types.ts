// backend/src/modules/ecommerce-sync/types.ts

// Kontrak internal modul ini: setiap adapter platform (Shopee/TikTok/
// FakeStore/dst) HARUS bisa dipetakan ke bentuk ini sebelum masuk ke
// service.ts. service.ts/repository.ts tidak pernah tahu bentuk asli
// payload tiap platform — itu urusan adapters/<platform>/.

export interface OAuthTokenResult {
  shopIdExternal: string;
  expiresAt: Date;
}

export interface PlatformCredentials {
  shopIdExternal: string;
  accessToken: string;
}

export interface NormalizedOrderItem {
  externalItemRef?: string;
  itemName: string;
  qty: number;
  unitPrice?: number;
  productId?: string;
}

export interface NormalizedOrder {
  externalOrderId: string;
  /** Sudah dipetakan ke ExternalOrderStatus (contracts/api.yaml). */
  status: 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled';
  totalAmount?: number;
  paymentMethod?: string;
  buyerUsername?: string;
  shippingCarrier?: string;
  rawPayload: unknown;
  items: NormalizedOrderItem[];
}

export interface PlatformAdapter {
  name: string;
  buildAuthorizationUrl(state?: string): string;
  exchangeCodeForToken(code: string, shopIdExternal?: string): Promise<OAuthTokenResult>;
  getValidAccessToken(): Promise<PlatformCredentials>;
  fetchRecentOrders(creds: PlatformCredentials, sinceSeconds: number): Promise<NormalizedOrder[]>;
  /** Hanya diisi adapter yang sudah dukung webhook/update balik ke platform. */
  verifyWebhookSignature?(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  normalizeWebhookPayload?(payload: unknown): NormalizedOrder | null;
  updateOrderStatusOnPlatform?(creds: PlatformCredentials, externalOrderId: string, status: string): Promise<void>;
}
