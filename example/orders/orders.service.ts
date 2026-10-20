import { randomUUID } from 'node:crypto'

import { ConflictException, Inject, Injectable } from '@nestjs/common'
import type { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'

import {
  RESERVE_STOCK,
  type ReserveStock,
  type ReserveStockResult,
} from '../inventory/inventory.contract.js'
import { MESSAGING_CLIENT } from '../messaging.js'

import { ORDER_CREATED, type Order } from './orders.contract.js'

@Injectable()
export class OrdersService {
  private readonly messaging: ClientProxy

  public constructor(@Inject(MESSAGING_CLIENT) messaging: ClientProxy) {
    this.messaging = messaging
  }

  public async create(product: string, quantity: number): Promise<Order> {
    // A request to the inventory slice, answered by its @MessagePattern handler.
    const { reserved } = await firstValueFrom(
      this.messaging.send<ReserveStockResult, ReserveStock>(RESERVE_STOCK, { product, quantity }),
    )
    if (!reserved) {
      throw new ConflictException(`Not enough ${product} in stock`)
    }

    const order: Order = { id: randomUUID(), product, quantity }
    // An event for whichever slices are interested, handled by their @EventPattern handlers.
    await firstValueFrom(this.messaging.emit(ORDER_CREATED, order), { defaultValue: undefined })
    return order
  }
}
