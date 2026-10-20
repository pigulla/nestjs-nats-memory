import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, inject, it } from 'vitest'

import { bootstrap } from './bootstrap.js'
import { inMemoryMessaging, natsMessaging } from './messaging.js'
import type { Order } from './orders/orders.contract.js'

describe.each([
  { name: 'in-memory', messaging: () => inMemoryMessaging() },
  { name: 'nats', messaging: () => natsMessaging(inject('natsUrl')) },
])('example app ($name)', ({ messaging }) => {
  let app: INestApplication
  let url: string

  beforeEach(async () => {
    app = await bootstrap(messaging(), 0)
    url = await app.getUrl()
    return () => app.close()
  })

  function postOrder(product: string, quantity: number): Promise<Response> {
    return fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product, quantity }),
    })
  }

  it('creates an order for a product in stock', async () => {
    const response = await postOrder('apple', 3)

    expect(await response.json()).toEqual({ id: expect.any(String), product: 'apple', quantity: 3 })
  })

  it('refuses an order exceeding the stock', async () => {
    const response = await postOrder('banana', 6)

    expect(response.status).toBe(409)
  })

  it('sends a notification for a created order', async () => {
    const order = (await (await postOrder('apple', 3)).json()) as Order

    const notifications = async (): Promise<unknown> => (await fetch(`${url}/notifications`)).json()

    await expect.poll(notifications).toEqual([`Order ${order.id}: 3 × apple`])
  })
})
