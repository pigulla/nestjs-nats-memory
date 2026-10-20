/**
 * A connection to the NatsInMemoryBus, implementing the part of NatsConnection (and Msg) that Nest's ServerNats and
 * ClientNats use: `subscribe` (with `callback` and `queue`), `publish` (with `reply` and `headers`), `status()`,
 * `flush()` and `close()`. Like the NATS client, it encodes what it publishes and refuses invalid subjects and
 * payloads larger than `max_payload` (see nats-in-memory.limits.ts).
 *
 * Unlike a connection to a NATS server, it cannot be lost: it never reports `disconnect`, `reconnect` or `update`
 * statuses (documented in the README).
 */
import {
  ClosedConnectionError,
  type Msg,
  MsgHdrsImpl,
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

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class NatsInMemoryConnection {
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
    const headers = options.headers ? (options.headers as MsgHdrsImpl).encode() : undefined
    assertWithinMaxPayload(data.length + (headers?.length ?? 0))

    this.bus.publish({ subject, reply: options.reply || undefined, data, headers })
  }

  public subscribe(subject: string, options: SubOpts<Msg> = {}): { unsubscribe: () => void } {
    this.check(subject)
    if (!isValidSubscriptionSubject(subject)) {
      // The NATS server answers such a SUB with an error, which the client reports as a status, and the subscription
      // never receives a message.
      this.pushStatus({ type: 'error', error: new ProtocolError('Invalid Subject') })
      return { unsubscribe: () => {} }
    }

    const sid = this.nextSid++
    const unsubscribe = this.bus.subscribe(subject, options.queue, message => {
      options.callback?.(null, new InMemoryMsg(this, sid, message))
    })
    this.unsubscribers.add(unsubscribe)
    return {
      unsubscribe: () => {
        this.unsubscribers.delete(unsubscribe)
        unsubscribe()
      },
    }
  }

  public async *status(): AsyncGenerator<Status> {
    let endIteration: () => void = () => {}
    this.statusIteration = new Promise(resolve => {
      endIteration = resolve
    })
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
