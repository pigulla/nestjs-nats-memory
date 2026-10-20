/** The messages other slices may send to the inventory slice. */

/** Request: reserves stock of a product, answered with a ReserveStockResult. */
export const RESERVE_STOCK = 'inventory.reserve-stock'

export type ReserveStock = { product: string; quantity: number }

export type ReserveStockResult = { reserved: boolean }
