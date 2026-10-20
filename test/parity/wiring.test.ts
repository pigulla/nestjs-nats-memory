import { Controller } from '@nestjs/common'
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, settle, transports } from './transports.js'

const received: unknown[] = []

@Controller()
class WiringController {
  @MessagePattern('wiring.double')
  public double(@Payload() value: number): number {
    return value * 2
  }

  @EventPattern('wiring.event')
  public event(@Payload() value: unknown): void {
    received.push(value)
  }
}

describe.each(transports)('wiring ($name)', transport => {
  describe.each(['hybrid', 'standalone'] as const)('as a %s application', mode => {
    let parity: ParityApp

    beforeEach(async () => {
      received.length = 0
      parity = await transport.createApp({ controllers: [WiringController], mode })
    })

    it('answers a request', async () => {
      const reply = await parity.send('wiring.double', 21)

      expect(reply).toBe(42)
    })

    it('delivers an event', async () => {
      await parity.emit('wiring.event', 'payload')
      await settle()

      expect(received).toEqual(['payload'])
    })
  })
})
