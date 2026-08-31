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
  return (await res.json()) as FakeStoreProduct[];
}

export async function getCarts(): Promise<FakeStoreCart[]> {
  const res = await fetch(`${HOST}/carts`);
  return (await res.json()) as FakeStoreCart[];
}

export async function getUser(userId: number): Promise<FakeStoreUser | null> {
  const res = await fetch(`${HOST}/users/${userId}`);
  if (!res.ok) return null;
  return (await res.json()) as FakeStoreUser;
}
