import { Body, Controller, Post } from '@nestjs/common'

import type { Order } from './orders.contract.js'
import { OrdersService } from './orders.service.js'

type CreateOrder = { product: string; quantity: number }

@Controller('orders')
export class OrdersController {
  private readonly orders: OrdersService

  public constructor(orders: OrdersService) {
    this.orders = orders
  }

  @Post()
  public create(@Body() { product, quantity }: CreateOrder): Promise<Order> {
    return this.orders.create(product, quantity)
  }
}
