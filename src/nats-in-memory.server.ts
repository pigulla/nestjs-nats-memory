import type { NatsConnection } from '@nats-io/transport-node'
import { type NatsOptions, ServerNats } from '@nestjs/microservices'

import type { NatsInMemoryBus } from './nats-in-memory.bus.js'
import { warnAboutIgnoredOptions } from './nats-in-memory.options.js'
import { NatsInMemoryUnsupportedFeatureError } from './nats-in-memory-unsupported-feature.error.js'

export type NatsInMemoryServerOptions = Required<NatsOptions>['options'] & { bus: NatsInMemoryBus }

// The options ServerNats reads itself; it passes all others to the NATS connection.
const HONORED_OPTIONS = ['queue', 'serializer', 'deserializer', 'gracefulShutdown', 'gracePeriod']

/**
 * Nest's NATS server, connected to an NatsInMemoryBus instead of a NATS server: everything else (serialization, headers,
 * routing between event and message handlers, graceful shutdown, …) is ServerNats' own behavior.
 */
export class NatsInMemoryServer extends ServerNats {
  private readonly bus: NatsInMemoryBus

  public constructor({ bus, ...options }: NatsInMemoryServerOptions) {
    super(options)
    this.bus = bus
    warnAboutIgnoredOptions(this.logger, options, HONORED_OPTIONS)
  }

  public override createNatsClient(): Promise<NatsConnection> {
    return Promise.resolve(this.bus.connect())
  }

  public override unwrap<T>(): T {
    throw new NatsInMemoryUnsupportedFeatureError('unwrap()', 'there is no NATS connection')
  }
}
