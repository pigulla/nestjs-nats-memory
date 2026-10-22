import type { NatsConnection } from '@nats-io/transport-node'
import type { OnApplicationShutdown } from '@nestjs/common'
import { ClientNats, type NatsOptions } from '@nestjs/microservices'

import type { NatsInMemoryBus } from './nats-in-memory.bus.js'
import { warnAboutIgnoredOptions } from './nats-in-memory.options.js'
import { NatsInMemoryUnsupportedFeatureError } from './nats-in-memory-unsupported-feature.error.js'

export type NatsInMemoryClientOptions = Required<NatsOptions>['options'] & { bus: NatsInMemoryBus }

// The options ClientNats reads itself; it passes all others to the NATS connection.
const HONORED_OPTIONS = ['headers', 'inboxPrefix', 'serializer', 'deserializer']

type Initializable = { init?: () => Promise<void> | void }

/**
 * Nest's NATS client, connected to an NatsInMemoryBus instead of a NATS server: everything else (serialization, headers,
 * reply handling, …) is ClientNats' own behavior.
 *
 * Unlike ClientNats, it closes itself when the application shuts down, also when it was not created by ClientsModule
 * (which does the same for the clients it creates), e.g. when it replaces a NATS client through
 * `overrideProvider(…).useFactory(…)` in a test.
 */
export class NatsInMemoryClientProxy extends ClientNats implements OnApplicationShutdown {
  private readonly bus: NatsInMemoryBus

  public constructor({ bus, ...options }: NatsInMemoryClientOptions) {
    super(options)
    this.bus = bus
    warnAboutIgnoredOptions(this.logger, options, HONORED_OPTIONS)
  }

  public override async createClient(): Promise<NatsConnection> {
    // Like ClientNats#createClient, the serializer and deserializer are initialized eagerly.
    await (this.serializer as Initializable).init?.()
    await (this.deserializer as Initializable).init?.()
    return this.bus.connect()
  }

  public onApplicationShutdown(): Promise<void> {
    return this.close()
  }

  public override unwrap<T>(): T {
    throw new NatsInMemoryUnsupportedFeatureError('unwrap()', 'there is no NATS connection')
  }
}
