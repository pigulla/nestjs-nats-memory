/**
 * A connection to the NatsInMemoryBus, implementing the part of NatsConnection (and Msg) that Nest's ServerNats and
 * ClientNats use: `subscribe` (with `callback` and `queue`), `publish` (with `reply` and `headers`), `status()`,
 * `flush()` and `close()`. Like the NATS client, it encodes what it publishes and refuses invalid subjects and
 * payloads larger than `max_payload` (see nats-in-memory.limits.ts). Any other member of NatsConnection or
 * Subscription throws a NatsInMemoryUnsupportedFeatureError, e.g. if a newer Nest version starts to use `drain()`.
 *
 * Unlike a connection to a NATS server, it cannot be lost: it never reports `disconnect`, `reconnect` or `update`
 * statuses (documented in the README).
 */
import {
  ClosedConnectionError,
  type Msg,
  MsgHdrsImpl,
  type NatsConnection,
  type Payload,
  ProtocolError,
  type PublishOptions,
  type Status,
  type SubOpts,
} from '@nats-io/transport-node'

import type { InMemoryMessage, NatsInMemoryBus } from './nats-in-memory.bus.js'
import {
  assertValidSubject,
  assertWithinMaxPayload,
  isValidSubscriptionSubject,
} from './nats-in-memory.limits.js'
import { NatsInMemoryUnsupportedFeatureError } from './nats-in-memory-unsupported-feature.error.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// The members of the nats.js interfaces that the in-memory classes stand in for, see withUnsupportedMembers.
const NATS_CONNECTION_MEMBERS = [
  'info',
  'closed',
  'close',
  'publish',
  'publishMessage',
  'respondMessage',
  'subscribe',
  'request',
  'requestMany',
  'flush',
  'drain',
  'isClosed',
  'isDraining',
  'getServer',
  'status',
  'stats',
  'rtt',
  'reconnect',
  'setServers',
  'getServers',
]
const SUBSCRIPTION_MEMBERS = [
  'closed',
  'unsubscribe',
  'drain',
  'isDraining',
  'isClosed',
  'callback',
  'getSubject',
  'getReceived',
  'getProcessed',
  'getPending',
  'getID',
  'getMax',
  Symbol.asyncIterator,
]

/** Opens a connection to the bus, see NatsInMemoryConnection. */
export function createConnection(bus: NatsInMemoryBus): NatsConnection {
  const connection = new NatsInMemoryConnection(bus)
  return withUnsupportedMembers(
    connection,
    'NatsConnection',
    NATS_CONNECTION_MEMBERS,
  ) as unknown as NatsConnection
}

class NatsInMemoryConnection {
  private readonly bus: NatsInMemoryBus
  private readonly unsubscribers = new Set<() => void>()
  private readonly statuses: Status[] = []
  private notifyStatus: () => void = () => {}
  // Resolves once the status iterator (if any) has ended, i.e. its consumer has seen the "close" status.
  private statusIteration: Promise<void> = Promise.resolve()
  private nextSid = 1
  private closed = false

  public constructor(bus: NatsInMemoryBus) {
    this.bus = bus
  }

  public publish(subject: string, payload: Payload = '', options: PublishOptions = {}): void {
    this.check(subject)
    if (options.reply) {
      this.check(options.reply)
    }
    // Copied, so that later changes by the publisher do not leak through, like on the wire.
    const data = typeof payload === 'string' ? encoder.encode(payload) : payload.slice()
    const headers = (options.headers as MsgHdrsImpl | undefined)?.encode()
    assertWithinMaxPayload(data.length + (headers?.length ?? 0))

    this.bus.publish({ subject, reply: options.reply || undefined, data, headers })
  }

  public subscribe(subject: string, options: SubOpts<Msg> = {}): { unsubscribe: () => void } {
    this.check(subject)
    if (!isValidSubscriptionSubject(subject)) {
      // The NATS server answers such a SUB with an error, which the client reports as a status, and the subscription
      // never receives a message.
      this.pushStatus({ type: 'error', error: new ProtocolError('Invalid Subject') })
      return withUnsupportedMembers({ unsubscribe: () => {} }, 'Subscription', SUBSCRIPTION_MEMBERS)
    }

    const sid = this.nextSid++
    const unsubscribe = this.bus.subscribe(subject, options.queue, message => {
      options.callback?.(null, new InMemoryMsg(this, sid, message))
    })
    this.unsubscribers.add(unsubscribe)
    const subscription = {
      unsubscribe: () => {
        this.unsubscribers.delete(unsubscribe)
        unsubscribe()
      },
    }
    return withUnsupportedMembers(subscription, 'Subscription', SUBSCRIPTION_MEMBERS)
  }

  public async *status(): AsyncGenerator<Status> {
    const { promise, resolve: endIteration } = Promise.withResolvers<void>()
    this.statusIteration = promise
    try {
      while (true) {
        const status = this.statuses.shift()
        if (status) {
          yield status
        } else if (this.closed) {
          return
        } else {
          await new Promise<void>(resolve => {
            this.notifyStatus = resolve
          })
        }
      }
    } finally {
      endIteration()
    }
  }

  public flush(): Promise<void> {
    return Promise.resolve()
  }

  public isClosed(): boolean {
    return this.closed
  }

  /** Like NatsConnection#close, this reports a "close" status and resolves once the status iterator has ended. */
  public async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true
      for (const unsubscribe of this.unsubscribers) {
        unsubscribe()
      }
      this.unsubscribers.clear()
      this.pushStatus({ type: 'close' })
    }
    await this.statusIteration
  }

  private check(subject: string): void {
    if (this.closed) {
      throw new ClosedConnectionError()
    }
    assertValidSubject(subject)
  }

  private pushStatus(status: Status): void {
    this.statuses.push(status)
    this.notifyStatus()
  }
}

class InMemoryMsg implements Msg {
  public readonly subject: string
  public readonly sid: number
  public readonly reply?: string
  public readonly data: Uint8Array
  public readonly headers?: MsgHdrsImpl
  private readonly connection: NatsInMemoryConnection

  public constructor(connection: NatsInMemoryConnection, sid: number, message: InMemoryMessage) {
    this.connection = connection
    this.sid = sid
    this.subject = message.subject
    this.reply = message.reply
    // Every subscriber gets its own copy, as if it had been decoded from the wire.
    this.data = message.data.slice()
    this.headers = message.headers ? MsgHdrsImpl.decode(message.headers) : undefined
  }

  public respond(payload?: Payload, options?: PublishOptions): boolean {
    if (!this.reply) {
      return false
    }
    // Like nats.js, responding after the connection was closed is not an error, but the reply is lost.
    if (!this.connection.isClosed()) {
      this.connection.publish(this.reply, payload, options)
    }
    return true
  }

  public json<T>(reviver?: (key: string, value: unknown) => unknown): T {
    return JSON.parse(this.string(), reviver) as T
  }

  public string(): string {
    return decoder.decode(this.data)
  }
}

/**
 * Makes `target` throw a NatsInMemoryUnsupportedFeatureError when a member of the nats.js interface it stands in for
 * (`type`, with the given `members`) is used but not implemented, instead of failing with "… is not a function".
 */
function withUnsupportedMembers<T extends object>(
  target: T,
  type: string,
  members: ReadonlyArray<string | symbol>,
): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (!(property in object) && members.includes(property)) {
        throw new NatsInMemoryUnsupportedFeatureError(
          `${type}#${String(property)}`,
          "the in-memory transport only implements what Nest's NATS transport uses",
        )
      }
      return Reflect.get(object, property, receiver)
    },
  })
}
