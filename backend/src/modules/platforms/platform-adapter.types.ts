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
  modelId?: string;
  modelSku?: string;
  modelName?: string;
  orderItemId?: string;
}

export interface NormalizedOrder {
  externalOrderId: string;
  status: string; // sudah dipetakan ke enum external_orders.status (new|processing|shipped|completed|cancelled)
  externalStatusRaw?: string;
  totalAmount?: number;
  paymentMethod?: string;
  currency?: string;
  isCod?: boolean;
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
  // Opsional — hanya adapter yang sudah mendukung webhook/update balik ke platform yang mengisi ini.
  verifyWebhookSignature?(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  normalizeWebhookPayload?(payload: unknown): NormalizedOrder | null;
}
