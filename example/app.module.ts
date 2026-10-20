import { type DynamicModule, Module } from '@nestjs/common'

import { InventoryModule } from './inventory/inventory.module.js'
import type { Messaging } from './messaging.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { OrdersModule } from './orders/orders.module.js'

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are classes with static factories.
export class AppModule {
  public static register(messaging: Messaging): DynamicModule {
    return {
      module: AppModule,
      imports: [...messaging.imports, OrdersModule, InventoryModule, NotificationsModule],
    }
  }
}
