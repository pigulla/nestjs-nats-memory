/**
 * Shows how to test an application that uses NATS in production without a NATS server: the test takes the production
 * wiring (here natsMessaging(), which a real application would hard-code in its root module), replaces the NATS client
 * with an in-memory one and connects an in-memory microservice instead of a NATS one. The application code stays as it
 * is, and each controller is tested through its own entry point: HTTP, requests or events.
 */
import type { INestApplication } from '@nestjs/common'
import type { AsyncMicroserviceOptions, ClientProxy } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { firstValueFrom } from 'rxjs'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  NatsInMemoryBus,
  NatsInMemoryClientProxy,
  NatsInMemoryModule,
  NatsInMemoryServer,
} from '../src/index.js'

import { AppModule } from './app.module.js'
import {
  RESERVE_STOCK,
  type ReserveStock,
  type ReserveStockResult,
} from './inventory/inventory.contract.js'
import { MESSAGING_CLIENT, natsMessaging } from './messaging.js'
import { ORDER_CREATED, type Order } from './orders/orders.contract.js'

describe('example app (integration)', () => {
  let app: INestApplication
  let url: string
  let client: ClientProxy

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // The production wiring; no NATS server is ever contacted, as its client is replaced below.
      imports: [
        AppModule.register(natsMessaging('nats://localhost:4222')),
        NatsInMemoryModule.forRoot(),
      ],
    })
      .overrideProvider(MESSAGING_CLIENT)
      .useFactory({
        inject: [NatsInMemoryBus],
        factory: (bus: NatsInMemoryBus) => new NatsInMemoryClientProxy({ bus }),
      })
      .compile()

    app = moduleRef.createNestApplication()
    app.connectMicroservice<AsyncMicroserviceOptions>({
      inject: [NatsInMemoryBus],
      useFactory: (bus: NatsInMemoryBus) => ({ strategy: new NatsInMemoryServer({ bus }) }),
    })
    await app.startAllMicroservices()
    await app.listen(0)
    url = await app.getUrl()
    // The same client the application uses, to send requests and emit events like another slice would.
    client = app.get(MESSAGING_CLIENT)
    return () => app.close()
  })

  function postOrder(product: string, quantity: number): Promise<Response> {
    return fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product, quantity }),
    })
  }

  async function notifications(): Promise<unknown> {
    return (await fetch(`${url}/notifications`)).json()
  }

  function reserveStock(product: string, quantity: number): Promise<ReserveStockResult> {
    return firstValueFrom(
      client.send<ReserveStockResult, ReserveStock>(RESERVE_STOCK, { product, quantity }),
    )
  }

  describe('InventoryController', () => {
    it('reserves stock that is available', async () => {
      const result = await reserveStock('apple', 10)

      expect(result).toEqual({ reserved: true })
    })

    it('refuses to reserve more than the stock', async () => {
      const result = await reserveStock('banana', 6)

      expect(result).toEqual({ reserved: false })
    })

    it('refuses to reserve stock that was already reserved', async () => {
      await reserveStock('banana', 5)

      const result = await reserveStock('banana', 1)

      expect(result).toEqual({ reserved: false })
    })
  })

  describe('NotificationsController', () => {
    it('sends a notification when an order was created', async () => {
      const order: Order = { id: 'order-1', product: 'apple', quantity: 2 }

      await firstValueFrom(client.emit(ORDER_CREATED, order), { defaultValue: undefined })

      await expect.poll(notifications).toEqual(['Order order-1: 2 × apple'])
    })

    it('lists no notifications initially', async () => {
      const sent = await notifications()

      expect(sent).toEqual([])
    })
  })

  describe('OrdersController', () => {
    it('creates an order for a product in stock', async () => {
      const response = await postOrder('apple', 3)

      expect(await response.json()).toEqual({
        id: expect.any(String),
        product: 'apple',
        quantity: 3,
      })
    })

    it('refuses an order exceeding the stock', async () => {
      const response = await postOrder('banana', 6)

      expect(response.status).toBe(409)
    })

    it('refuses an order once the stock ran out', async () => {
      await postOrder('banana', 5)

      const response = await postOrder('banana', 1)

      expect(response.status).toBe(409)
    })

    it('announces a created order', async () => {
      const order = (await (await postOrder('apple', 3)).json()) as Order

      await expect.poll(notifications).toEqual([`Order ${order.id}: 3 × apple`])
    })
  })
})
