/**
 * In-process stand-in for a NATS server, shared by the in-memory server and client(s) of one application. Each of them
 * gets its own NatsInMemoryConnection (see nats-in-memory.connection.ts), which Nest's ServerNats / ClientNats use exactly
 * like a connection to a real NATS server.
 *
 * Like a NATS server, the bus routes a message to every subscription matching its subject (including the wildcards
 * `*` and `>`), except that each queue group (matching subscriptions with the same queue name) gets it only once, by a
 * randomly chosen member. A request nobody subscribed to is answered with a "no responders" status. Messages travel encoded (data
 * and headers as bytes) and are delivered asynchronously, as on the wire.
 *
 * The bus is provided through Nest DI by NatsInMemoryModule, one per application.
 */
import { MsgHdrsImpl, type NatsConnection } from '@nats-io/transport-node'

import { NatsInMemoryConnection } from './nats-in-memory.connection.js'

/** A message as it travels through the bus: encoded like on the wire. */
export type InMemoryMessage = {
  subject: string
  reply?: string
  data: Uint8Array
  headers?: Uint8Array
}

type Subscription = { subject: string; queue?: string; deliver: (message: InMemoryMessage) => void }

// What a NATS server sends to the reply subject of a request without subscribers.
const NO_RESPONDERS = new MsgHdrsImpl(503, 'No Responders').encode()

export class NatsInMemoryBus {
  private readonly subscriptions = new Set<Subscription>()

  /**
   * Opens a connection to the bus. It implements the part of NatsConnection that Nest's NATS transport uses, see
   * NatsInMemoryConnection.
   */
  public connect(): NatsConnection {
    return new NatsInMemoryConnection(this) as unknown as NatsConnection
  }

  /** `subject` may contain the wildcards `*` and `>`; it must be a valid subscription subject. */
  public subscribe(
    subject: string,
    queue: string | undefined,
    deliver: (message: InMemoryMessage) => void,
  ): () => void {
    const subscription: Subscription = { subject, queue, deliver }
    this.subscriptions.add(subscription)
    return () => {
      this.subscriptions.delete(subscription)
    }
  }

  public publish(message: InMemoryMessage): void {
    const subscribers = [...this.subscriptions].filter(({ subject }) =>
      matchesSubject(subject, message.subject),
    )
    if (subscribers.length === 0 && message.reply) {
      this.publish({ subject: message.reply, data: new Uint8Array(), headers: NO_RESPONDERS })
      return
    }
    for (const { deliver } of pickReceivers(subscribers)) {
      setImmediate(() => deliver(message))
    }
  }
}

/** Like a NATS server: every subscription without a queue, and one random member of each queue group. */
function pickReceivers(subscribers: Subscription[]): Subscription[] {
  const receivers: Subscription[] = []
  const queueGroups = new Map<string, Subscription[]>()
  for (const subscriber of subscribers) {
    if (subscriber.queue) {
      queueGroups.set(subscriber.queue, [...(queueGroups.get(subscriber.queue) ?? []), subscriber])
    } else {
      receivers.push(subscriber)
    }
  }
  for (const members of queueGroups.values()) {
    receivers.push(members[Math.floor(Math.random() * members.length)] as Subscription)
  }
  return receivers
}

/**
 * Whether a subscription `pattern` matches a published `subject`, as in ServerNats#matchNatsSubject: `*` matches
 * exactly one token, a trailing `>` one or more tokens, and every other token (including `a*` or `b>`) only itself.
 */
export function matchesSubject(pattern: string, subject: string): boolean {
  const patternTokens = pattern.split('.')
  const subjectTokens = subject.split('.')
  for (const [index, token] of patternTokens.entries()) {
    if (token === '>') {
      return subjectTokens.length > index
    }
    if (token !== '*' && token !== subjectTokens[index]) {
      return false
    }
  }
  return patternTokens.length === subjectTokens.length
}
