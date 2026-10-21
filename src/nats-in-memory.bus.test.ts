import { describe, expect, it } from 'vitest'

import { type InMemoryMessage, matchesSubject, NatsInMemoryBus } from './nats-in-memory.bus.js'

describe('NatsInMemoryBus', () => {
  it('does not deliver a message to a subscription that ended before the message arrived', async () => {
    const bus = new NatsInMemoryBus()
    const received: InMemoryMessage[] = []
    const unsubscribe = bus.subscribe('a', undefined, message => received.push(message))
    bus.publish({ subject: 'a', data: new Uint8Array() })

    unsubscribe()
    await new Promise(resolve => setImmediate(resolve))

    expect(received).toEqual([])
  })
})

describe('matchesSubject', () => {
  it.each([
    ['a.b', 'a.b'],
    ['a.*', 'a.b'],
    ['*.b', 'a.b'],
    ['*.*', 'a.b'],
    ['a.>', 'a.b'],
    ['a.>', 'a.b.c'],
    ['>', 'a'],
    ['>', 'a.b.c'],
    ['a.*.>', 'a.b.c'],
    ['a*', 'a*'],
    ['a.b>', 'a.b>'],
  ])('%s matches %s', (pattern, subject) => {
    expect(matchesSubject(pattern, subject)).toBe(true)
  })

  it.each([
    ['a.b', 'a.c'],
    ['a.b', 'a.b.c'],
    ['a.b.c', 'a.b'],
    ['a.*', 'a'],
    ['a.*', 'a.b.c'],
    ['a.>', 'a'],
    ['a.*.>', 'a.b'],
    ['a*', 'ab'],
    ['a.b>', 'a.bc'],
  ])('%s does not match %s', (pattern, subject) => {
    expect(matchesSubject(pattern, subject)).toBe(false)
  })
})
