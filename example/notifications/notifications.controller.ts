import { Controller, Get } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'

import { ORDER_CREATED, type Order } from '../orders/orders.contract.js'

import { NotificationsService } from './notifications.service.js'

@Controller('notifications')
export class NotificationsController {
  private readonly notifications: NotificationsService

  public constructor(notifications: NotificationsService) {
    this.notifications = notifications
  }

  @EventPattern(ORDER_CREATED)
  public onOrderCreated(@Payload() order: Order): void {
    this.notifications.notifyOrderCreated(order)
  }

  @Get()
  public sent(): string[] {
    return this.notifications.sent()
  }
}
