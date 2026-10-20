/**
 * Parity test harness: every parity test runs once against a real NATS server (see nats.global-setup.ts) and once
 * against the in-memory transport, through `describe.each(transports)`.
 *
 * All test files share the same NATS server and run in parallel, so each file must prefix its subjects with its own
 * name (e.g. `events.` in events.test.ts). Every app is closed after the test that created it.
 */
import type { NatsConnection } from '@nats-io/transport-node'
import type { INestApplication, INestMicroservice, LoggerService, Type } from '@nestjs/common'
import {
  type AsyncMicroserviceOptions,
  type ClientProxy,
  ClientsModule,
  type MicroserviceOptions,
  ServerNats,
  Transport,
} from '@nestjs/microservices'
import { Test, type TestingModule } from '@nestjs/testing'
import { firstValueFrom, toArray } from 'rxjs'
import { afterEach, inject } from 'vitest'

import {
  NatsInMemoryBus,
  NatsInMemoryClientProxy,
  NatsInMemoryModule,
  NatsInMemoryServer,
} from '../../src/index.js'

/** The injection token of the client every parity app registers. */
const CLIENT = 'PARITY_CLIENT'

type AnyOptions = Record<string, unknown>

type ParityAppOptions = {
  controllers: Type[]
  /** `hybrid` connects the microservice to an HTTP application, `standalone` creates a microservice. */
  mode?: 'hybrid' | 'standalone'
  /** NATS options for the server (without `servers`). */
  serverOptions?: AnyOptions
  /** NATS options for the client (without `servers`). */
  clientOptions?: AnyOptions
}

type LogLevel = keyof LoggerService

export type ParityApp = {
  app: INestApplication | INestMicroservice
  client: ClientProxy
  /** Sends a request and resolves with the (first) reply. */
  send: <T = unknown>(pattern: string, data?: unknown) => Promise<T>
  /** Sends a request and resolves with all replies. */
  sendAll: <T = unknown>(pattern: string, data?: unknown) => Promise<T[]>
  /** Emits an event and resolves once it was published. */
  emit: (pattern: string, data?: unknown) => Promise<void>
  /** The messages Nest logged at `level` since the app was created (nothing is printed). */
  logged: (level: LogLevel) => unknown[]
  /** Closes the client and the app (at most once). */
  close: () => Promise<void>
}

export type ParityTransport = {
  name: 'nats' | 'in-memory'
  createApp: (options: ParityAppOptions) => Promise<ParityApp>
}

type TransportSetup = {
  imports: NonNullable<Parameters<typeof Test.createTestingModule>[0]['imports']>
  server: MicroserviceOptions | AsyncMicroserviceOptions
  // Resolves once the server's subscriptions are active.
  ready: () => Promise<void>
}

const nats: ParityTransport = {
  name: 'nats',
  createApp: options => {
    const servers = inject('natsUrl')
    const server = new ServerNats({ ...options.serverOptions, servers })
    return createApp(options, {
      imports: [
        ClientsModule.register([
          {
            name: CLIENT,
            transport: Transport.NATS,
            options: { ...options.clientOptions, servers },
          },
        ]),
      ],
      server: { strategy: server },
      // A NATS subscription only becomes active once the server processed the SUB, which a flush waits for.
      ready: () => server.unwrap<NatsConnection>().flush(),
    })
  },
}

const inMemory: ParityTransport = {
  name: 'in-memory',
  createApp: options =>
    createApp(options, {
      imports: [
        NatsInMemoryModule.forRoot(),
        ClientsModule.registerAsync([
          {
            name: CLIENT,
            inject: [NatsInMemoryBus],
            useFactory: (bus: NatsInMemoryBus) => ({
              customClass: NatsInMemoryClientProxy,
              options: { ...options.clientOptions, bus },
            }),
          },
        ]),
      ],
      server: {
        inject: [NatsInMemoryBus],
        useFactory: (bus: NatsInMemoryBus) => ({
          strategy: new NatsInMemoryServer({ ...options.serverOptions, bus }),
        }),
      },
      ready: () => Promise.resolve(),
    }),
}

export const transports: ParityTransport[] = [nats, inMemory]

const openApps = new Set<ParityApp>()

afterEach(async () => {
  await Promise.all([...openApps].map(parity => parity.close()))
})

async function createApp(
  { controllers, mode = 'standalone' }: ParityAppOptions,
  { imports, server, ready }: TransportSetup,
): Promise<ParityApp> {
  const logs: Array<{ level: LogLevel; message: unknown }> = []
  const moduleRef = await Test.createTestingModule({ imports, controllers })
    .setLogger(recordingLogger(logs))
    .compile()
  try {
    const app = await start(moduleRef, mode, server)
    await ready()
    const client = moduleRef.get<ClientProxy>(CLIENT)
    await client.connect()
    let closed = false
    const parity: ParityApp = {
      app,
      client,
      send: (pattern, data = {}) => firstValueFrom(client.send(pattern, data)),
      sendAll: (pattern, data = {}) => firstValueFrom(client.send(pattern, data).pipe(toArray())),
      emit: (pattern, data = {}) =>
        firstValueFrom(client.emit(pattern, data), { defaultValue: undefined }),
      logged: level => logs.filter(entry => entry.level === level).map(({ message }) => message),
      close: async () => {
        if (!closed) {
          closed = true
          openApps.delete(parity)
          await client.close()
          await app.close()
        }
      },
    }
    openApps.add(parity)
    return parity
  } catch (error) {
    await moduleRef.close()
    throw error
  }
}

async function start(
  moduleRef: TestingModule,
  mode: 'hybrid' | 'standalone',
  server: MicroserviceOptions | AsyncMicroserviceOptions,
): Promise<INestApplication | INestMicroservice> {
  if (mode === 'hybrid') {
    const app = moduleRef.createNestApplication()
    app.connectMicroservice(server)
    await app.startAllMicroservices()
    await app.init()
    return app
  }
  const microservice = moduleRef.createNestMicroservice(server)
  await microservice.listen()
  return microservice
}

function recordingLogger(logs: Array<{ level: LogLevel; message: unknown }>): LoggerService {
  const record =
    (level: LogLevel) =>
    (message: unknown): void => {
      logs.push({ level, message })
    }
  return {
    log: record('log'),
    error: record('error'),
    warn: record('warn'),
    debug: record('debug'),
    verbose: record('verbose'),
    fatal: record('fatal'),
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Waits long enough for all messages in flight to be delivered and handled. */
export function settle(): Promise<void> {
  return delay(200)
}
