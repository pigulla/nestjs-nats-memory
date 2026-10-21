/**
 * Features the in-memory transport does not support: they work with NATS, and the in-memory transport must fail with
 * a NatsInMemoryUnsupportedFeatureError.
 */
import { Controller, type INestMicroservice } from '@nestjs/common'
import { MessagePattern } from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { NatsInMemoryUnsupportedFeatureError } from '../../src/index.js'

import { type ParityApp, transports } from './transports.js'

@Controller()
class UnsupportedController {
  @MessagePattern('unsupported.echo')
  public echo(): void {}
}

describe.each(transports)('unsupported features ($name)', transport => {
  const inMemory = transport.name === 'in-memory'
  let parity: ParityApp

  beforeEach(async () => {
    parity = await transport.createApp({ controllers: [UnsupportedController] })
  })

  describe('unwrap() of the server', () => {
    it.runIf(!inMemory)('returns the NATS connection', () => {
      const connection = (parity.app as INestMicroservice).unwrap()

      expect(connection).toHaveProperty('publish', expect.any(Function))
    })

    it.runIf(inMemory)('throws a NatsInMemoryUnsupportedFeatureError', () => {
      const unwrap = (): unknown => (parity.app as INestMicroservice).unwrap()

      expect(unwrap).toThrow(NatsInMemoryUnsupportedFeatureError)
    })
  })

  describe('unwrap()', () => {
    it.runIf(!inMemory)('returns the NATS connection', () => {
      const connection = parity.client.unwrap()

      expect(connection).toHaveProperty('publish', expect.any(Function))
    })

    it.runIf(inMemory)('throws a NatsInMemoryUnsupportedFeatureError', () => {
      const unwrap = (): unknown => parity.client.unwrap()

      expect(unwrap).toThrow(NatsInMemoryUnsupportedFeatureError)
    })

    it.runIf(inMemory)('explains that there is no NATS connection', () => {
      const unwrap = (): unknown => parity.client.unwrap()

      expect(unwrap).toThrow(
        'The in-memory NATS transport does not support unwrap() (there is no NATS connection).',
      )
    })
  })
})
