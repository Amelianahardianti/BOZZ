const BASE_URL = "https://fakestoreapi.com";

// API publik, tanpa auth/signature sama sekali — dipakai sebagai bukti pipeline
// omnichannel (fetch -> normalisasi -> persist) jalan nyata lewat network call asli,
// bukan data statis di memori.

export interface FakestoreProduct {
  id: number;
  title: string;
  price: number;
  category: string;
}

export interface FakestoreCartItem {
  productId: number;
  quantity: number;
}

export interface FakestoreCart {
  id: number;
  userId: number;
  date: string;
  products: FakestoreCartItem[];
}

export interface FakestoreUser {
  id: number;
  username: string;
  email: string;
}

export async function getProducts(): Promise<FakestoreProduct[]> {
  const res = await fetch(`${BASE_URL}/products`);
  return (await res.json()) as FakestoreProduct[];
}

export async function getCarts(): Promise<FakestoreCart[]> {
  const res = await fetch(`${BASE_URL}/carts`);
  return (await res.json()) as FakestoreCart[];
}

export async function getUser(userId: number): Promise<FakestoreUser | null> {
  const res = await fetch(`${BASE_URL}/users/${userId}`);
  if (!res.ok) return null;
  return (await res.json()) as FakestoreUser;
}
