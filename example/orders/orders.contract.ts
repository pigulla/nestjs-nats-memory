/** The messages the orders slice publishes for other slices. */

/** Event: an order was created, with the Order as payload. */
export const ORDER_CREATED = 'orders.order-created'

export type Order = { id: string; product: string; quantity: number }
