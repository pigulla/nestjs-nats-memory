import { Injectable, Logger } from '@nestjs/common'

import type { Order } from '../orders/orders.contract.js'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private readonly notifications: string[] = []

  public notifyOrderCreated({ id, product, quantity }: Order): void {
    const notification = `Order ${id}: ${quantity} × ${product}`
    this.notifications.push(notification)
    this.logger.log(`Sent notification "${notification}"`)
  }

  public sent(): string[] {
    return [...this.notifications]
  }
}
