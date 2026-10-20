import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, transports } from './transports.js'

const IGNORED_OPTIONS_WARNING =
  'The in-memory transport ignores these NATS options, which only concern a connection to a NATS server:'

@Controller()
class OptionsController {
  @MessagePattern('options.echo')
  public echo(@Payload() value: unknown): unknown {
    return value
  }
}

describe.each(transports)('options ($name)', transport => {
  const inMemory = transport.name === 'in-memory'
  let parity: ParityApp

  describe('that only concern the connection to a NATS server', () => {
    beforeEach(async () => {
      parity = await transport.createApp({
        controllers: [OptionsController],
        serverOptions: { name: 'parity-server', maxReconnectAttempts: 1 },
        clientOptions: { name: 'parity-client', pingInterval: 60_000 },
      })
    })

    it('do not keep the app from answering requests', async () => {
      const reply = await parity.send('options.echo', 1)

      expect(reply).toBe(1)
    })

    it.runIf(inMemory)('are named in a warning by the server', () => {
      expect(parity.logged('warn')).toContain(
        `${IGNORED_OPTIONS_WARNING} name, maxReconnectAttempts.`,
      )
    })

    it.runIf(inMemory)('are named in a warning by the client', () => {
      expect(parity.logged('warn')).toContain(`${IGNORED_OPTIONS_WARNING} name, pingInterval.`)
    })
  })

  describe('that Nest reads itself', () => {
    beforeEach(async () => {
      parity = await transport.createApp({
        controllers: [OptionsController],
        serverOptions: { gracefulShutdown: false, gracePeriod: 100, queue: undefined },
        clientOptions: { inboxPrefix: '_INBOX_OPTIONS', headers: { 'x-test': 'yes' } },
      })
    })

    it('cause no warning', () => {
      expect(parity.logged('warn')).toEqual([])
    })
  })
})
