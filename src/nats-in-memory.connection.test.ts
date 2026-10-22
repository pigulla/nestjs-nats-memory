import { ClosedConnectionError, type Msg, type NatsConnection } from '@nats-io/transport-node'
import { beforeEach, describe, expect, it } from 'vitest'

import { NatsInMemoryBus } from './nats-in-memory.bus.js'
import { NatsInMemoryUnsupportedFeatureError } from './nats-in-memory-unsupported-feature.error.js'

function nextMacrotask(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('NatsInMemoryConnection', () => {
  let bus: NatsInMemoryBus
  let connection: NatsConnection

  beforeEach(() => {
    bus = new NatsInMemoryBus()
    connection = bus.connect()
  })

  it('does not deliver a message published before the connection was closed', async () => {
    const received: Msg[] = []
    connection.subscribe('a', {
      callback: (_error, msg) => {
        received.push(msg)
      },
    })
    bus.connect().publish('a')

    await connection.close()
    await nextMacrotask()

    expect(received).toEqual([])
  })

  it('refuses to publish once closed', async () => {
    await connection.close()

    const publish = (): void => connection.publish('a')

    expect(publish).toThrow(ClosedConnectionError)
  })

  it('can be closed twice', async () => {
    await connection.close()

    const closing = connection.close()

    await expect(closing).resolves.toBeUndefined()
  })

  it('closes without a status iterator', async () => {
    const closing = connection.close()

    await expect(closing).resolves.toBeUndefined()
  })

  it('flushes immediately', async () => {
    const flushing = connection.flush()

    await expect(flushing).resolves.toBeUndefined()
  })

  it('does not respond to a message without a reply subject', async () => {
    const received: Msg[] = []
    connection.subscribe('a', {
      callback: (_error, msg) => {
        received.push(msg)
      },
    })
    connection.publish('a')
    await nextMacrotask()

    const responded = received[0]?.respond()

    expect(responded).toBe(false)
  })

  describe('throws a NatsInMemoryUnsupportedFeatureError', () => {
    it('for an unimplemented member of NatsConnection', () => {
      const drain = (): unknown => connection.drain()

      expect(drain).toThrow(
        new NatsInMemoryUnsupportedFeatureError(
          'NatsConnection#drain',
          "the in-memory transport only implements what Nest's NATS transport uses",
        ),
      )
    })

    it('for an unimplemented member of Subscription', () => {
      const subscription = connection.subscribe('a', { callback: () => {} })

      const getSubject = (): unknown => subscription.getSubject()

      expect(getSubject).toThrow(NatsInMemoryUnsupportedFeatureError)
    })

    it('for an unimplemented member of an invalid Subscription', () => {
      const subscription = connection.subscribe('a..b', { callback: () => {} })

      const getSubject = (): unknown => subscription.getSubject()

      expect(getSubject).toThrow(NatsInMemoryUnsupportedFeatureError)
    })
  })

  it('lets an invalid subscription be unsubscribed', () => {
    const subscription = connection.subscribe('a..b', { callback: () => {} })

    const unsubscribe = (): void => subscription.unsubscribe()

    expect(unsubscribe).not.toThrow()
  })

  it('does not throw for a property that is no member of NatsConnection', () => {
    // E.g. `then`, which Promise#resolve looks up.
    const then = (connection as unknown as Record<string, unknown>).then

    expect(then).toBeUndefined()
  })
})
