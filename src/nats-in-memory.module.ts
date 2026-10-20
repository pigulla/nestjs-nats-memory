import { type DynamicModule, Module } from '@nestjs/common'

import { NatsInMemoryBus } from './nats-in-memory.bus.js'

/**
 * Provides the NatsInMemoryBus shared by the in-memory server and client(s) of one Nest application. The module is global,
 * so the bus can be injected anywhere (e.g. in `ClientsModule.registerAsync`), and every application gets its own
 * bus, so several applications in the same process stay isolated.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are classes with static factories.
export class NatsInMemoryModule {
  public static forRoot(): DynamicModule {
    return {
      module: NatsInMemoryModule,
      global: true,
      providers: [NatsInMemoryBus],
      exports: [NatsInMemoryBus],
    }
  }
}
