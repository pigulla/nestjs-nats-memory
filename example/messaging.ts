/**
 * How the slices talk to each other. This is the only place where the NATS and the in-memory variant of the example
 * differ: both provide the same client (MESSAGING_CLIENT) and microservice, the slices do not know which one they get.
 */
import type { DynamicModule } from '@nestjs/common'
import {
  type AsyncMicroserviceOptions,
  ClientsModule,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices'
import {
  NatsInMemoryBus,
  NatsInMemoryClientProxy,
  NatsInMemoryModule,
  NatsInMemoryServer,
} from 'nestjs-nats-memory'

/** The injection token of the client the slices use to send requests and emit events. */
export const MESSAGING_CLIENT = 'MESSAGING_CLIENT'

export type Messaging = {
  /** Modules providing MESSAGING_CLIENT (globally). */
  imports: DynamicModule[]
  /** Options of the microservice that receives the requests and events. */
  server: MicroserviceOptions | AsyncMicroserviceOptions
}

export function natsMessaging(servers: string): Messaging {
  return {
    imports: [
      ClientsModule.register({
        isGlobal: true,
        clients: [{ name: MESSAGING_CLIENT, transport: Transport.NATS, options: { servers } }],
      }),
    ],
    server: { transport: Transport.NATS, options: { servers } },
  }
}

export function inMemoryMessaging(): Messaging {
  return {
    imports: [
      NatsInMemoryModule.forRoot(),
      ClientsModule.registerAsync({
        isGlobal: true,
        clients: [
          {
            name: MESSAGING_CLIENT,
            inject: [NatsInMemoryBus],
            useFactory: (bus: NatsInMemoryBus) => ({
              customClass: NatsInMemoryClientProxy,
              options: { bus },
            }),
          },
        ],
      }),
    ],
    server: {
      inject: [NatsInMemoryBus],
      useFactory: (bus: NatsInMemoryBus) => ({ strategy: new NatsInMemoryServer({ bus }) }),
    },
  }
}
