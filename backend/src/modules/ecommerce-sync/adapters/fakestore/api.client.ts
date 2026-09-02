const HOST = 'https://fakestoreapi.com';

export interface FakeStoreProduct {
  id: number;
  title: string;
  price: number;
}

export interface FakeStoreCart {
  id: number;
  userId: number;
  date: string;
  products: { productId: number; quantity: number }[];
}

export interface FakeStoreUser {
  id: number;
  username: string;
}

export async function getProducts(): Promise<FakeStoreProduct[]> {
  const res = await fetch(`${HOST}/products`);
  // Konsisten dengan getUser() di bawah -- tanpa ini, respons non-JSON
  // (mis. halaman error 5xx dari FakeStoreAPI) bikin res.json() gagal
  // dengan SyntaxError yang membingungkan, bukan pesan yang jelas.
  if (!res.ok) throw new Error(`FakeStoreAPI GET /products gagal: HTTP ${res.status}`);
  return (await res.json()) as FakeStoreProduct[];
}

export async function getCarts(): Promise<FakeStoreCart[]> {
  const res = await fetch(`${HOST}/carts`);
  if (!res.ok) throw new Error(`FakeStoreAPI GET /carts gagal: HTTP ${res.status}`);
  return (await res.json()) as FakeStoreCart[];
}

export async function getUser(userId: number): Promise<FakeStoreUser | null> {
  const res = await fetch(`${HOST}/users/${userId}`);
  if (!res.ok) return null;
  return (await res.json()) as FakeStoreUser;
}

// PUT /carts/:id -- FakeStoreAPI menerima body apapun dan membalas sukses
// tanpa benar-benar persist (khas fake REST API). Dipakai adapter sebagai
// simulator outbound status sync, bukan update yang benar-benar tersimpan.
export async function putCart(cartId: number, body: unknown): Promise<void> {
  await fetch(`${HOST}/carts/${cartId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
