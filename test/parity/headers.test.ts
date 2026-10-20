import { headers as natsHeaders } from '@nats-io/transport-node'
import { Controller } from '@nestjs/common'
import {
  Ctx,
  EventPattern,
  MessagePattern,
  NatsContext,
  NatsRecordBuilder,
} from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, settle, transports } from './transports.js'

type Headers = Record<string, string[]>

const receivedEventHeaders: Headers[] = []

function headersOf(ctx: NatsContext): Headers {
  const headers = ctx.getHeaders()
  return Object.fromEntries(headers?.keys().map((key: string) => [key, headers.values(key)]) ?? [])
}

function record(headers: Record<string, string>, data: unknown = {}): unknown {
  const natsRecordHeaders = natsHeaders()
  for (const [key, value] of Object.entries(headers)) {
    natsRecordHeaders.set(key, value)
  }
  return new NatsRecordBuilder(data).setHeaders(natsRecordHeaders).build()
}

@Controller()
class HeadersController {
  @MessagePattern('headers.request')
  public request(_payload: unknown, @Ctx() ctx: NatsContext): Headers {
    return headersOf(ctx)
  }

  @EventPattern('headers.event')
  public event(_payload: unknown, @Ctx() ctx: unknown): void {
    receivedEventHeaders.push(headersOf(ctx as NatsContext))
  }

  @MessagePattern('headers.reply')
  public reply(): unknown {
    return record({ 'x-test': 'reply' }, 'data')
  }
}

describe.each(transports)('headers ($name)', transport => {
  describe('without static client headers', () => {
    let parity: ParityApp

    beforeEach(async () => {
      receivedEventHeaders.length = 0
      parity = await transport.createApp({ controllers: [HeadersController] })
    })

    it('passes no headers with a plain request', async () => {
      const headers = await parity.send('headers.request')

      expect(headers).toEqual({})
    })

    it('passes the headers of a request record', async () => {
      const headers = await parity.send('headers.request', record({ 'x-test': 'request' }))

      expect(headers).toEqual({ 'x-test': ['request'] })
    })

    it('passes the headers of an event record', async () => {
      await parity.emit('headers.event', record({ 'x-test': 'event' }))
      await settle()

      expect(receivedEventHeaders).toEqual([{ 'x-test': ['event'] }])
    })

    it('answers with the data of a reply record', async () => {
      const reply = await parity.send('headers.reply')

      expect(reply).toBe('data')
    })
  })

  describe('with static client headers', () => {
    let parity: ParityApp

    beforeEach(async () => {
      parity = await transport.createApp({
        controllers: [HeadersController],
        clientOptions: { headers: { 'x-static': 'static', 'x-test': 'static' } },
      })
    })

    it('adds them to a request', async () => {
      const headers = await parity.send('headers.request')

      expect(headers).toEqual({ 'x-static': ['static'], 'x-test': ['static'] })
    })

    it('lets the headers of a request record take precedence', async () => {
      const headers = await parity.send('headers.request', record({ 'x-test': 'request' }))

      expect(headers).toEqual({ 'x-static': ['static'], 'x-test': ['request'] })
    })
  })
})
