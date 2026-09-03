import type { CachedProduct } from '../../shell/offline/db'

export interface CartItem {
  product: CachedProduct
  qty: number
}
