import { Controller } from '@nestjs/common'
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { delay, type ParityApp, settle, transports } from './transports.js'

const received: Array<[handler: string, payload: unknown]> = []

@Controller()
class EventsController {
  @EventPattern('events.created')
  public created(@Payload() payload: unknown): void {
    received.push(['first', payload])
  }

  @EventPattern('events.answering')
  public answering(_payload: unknown): string {
    return 'from the event handler'
  }

  @MessagePattern('events.to-message-handler')
  public messageHandler(@Payload() payload: unknown): void {
    received.push(['message handler', payload])
  }

  @MessagePattern('events.mixed.request')
  public async mixedRequest(): Promise<string> {
    // Gives the event handler below every chance to answer first.
    await delay(50)
    return 'from the message handler'
  }

  @EventPattern('events.mixed.*')
  public mixedEvent(@Payload() payload: unknown): string {
    received.push(['event handler', payload])
    return 'from the event handler'
  }
}

@Controller()
class MoreEventsController {
  @EventPattern('events.created')
  public created(@Payload() payload: unknown): void {
    received.push(['second', payload])
  }
}

describe.each(transports)('events ($name)', transport => {
  let parity: ParityApp

  beforeEach(async () => {
    received.length = 0
    parity = await transport.createApp({ controllers: [EventsController, MoreEventsController] })
  })

  it('delivers an event once to every handler of its pattern', async () => {
    await parity.emit('events.created', 'payload')
    await settle()

    expect(received.toSorted()).toEqual([
      ['first', 'payload'],
      ['second', 'payload'],
    ])
  })

  it('delivers events in the order they were emitted', async () => {
    const payloads = Array.from({ length: 100 }, (_, index) => index)

    await Promise.all(payloads.map(payload => parity.emit('events.created', payload)))
    await settle()

    expect(
      received.filter(([handler]) => handler === 'first').map(([, payload]) => payload),
    ).toEqual(payloads)
  })

  it('runs a message handler for an event', async () => {
    await parity.emit('events.to-message-handler', 'payload')
    await settle()

    expect(received).toEqual([['message handler', 'payload']])
  })

  it('accepts an event nobody subscribed to', async () => {
    const published = parity.emit('events.nobody')

    await expect(published).resolves.toBeUndefined()
  })

  it('lets an event handler answer a request if no message handler matches', async () => {
    const reply = await parity.send('events.answering')

    expect(reply).toBe('from the event handler')
  })

  describe('if an event handler and a message handler match the same request', () => {
    it('answers with the message handler', async () => {
      const reply = await parity.send('events.mixed.request', 'payload')

      expect(reply).toBe('from the message handler')
    })

    it('also runs the event handler, as for an event', async () => {
      await parity.send('events.mixed.request', 'payload')

      expect(received).toEqual([['event handler', 'payload']])
    })
  })
})
