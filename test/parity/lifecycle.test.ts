import { Controller, type INestApplication, type INestMicroservice } from '@nestjs/common'
import { type ClientNats, MessagePattern } from '@nestjs/microservices'
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception.js'
import { Test } from '@nestjs/testing'
import { firstValueFrom } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NatsInMemoryBus, NatsInMemoryClientProxy, NatsInMemoryModule } from '../../src/index.js'

import { delay, type ParityApp, settle, transports } from './transports.js'

const CLOSE_STATUS = 'NatsStatus: type: "close", data: "".'

@Controller()
class LifecycleController {
  @MessagePattern('lifecycle.slow')
  public async slow(): Promise<string> {
    await delay(100)
    return 'done'
  }
}

describe.each(transports)('lifecycle ($name)', transport => {
  let parity: ParityApp

  describe('while running', () => {
    beforeEach(async () => {
      parity = await transport.createApp({ controllers: [LifecycleController] })
    })

    it('reports the client as connected', async () => {
      const status = await firstValueFrom(parity.client.status)

      expect(status).toBe('connected')
    })

    it('reports the server as connected', async () => {
      const status = await firstValueFrom((parity.app as INestMicroservice).status)

      expect(status).toBe('connected')
    })

    it('never calls status event listeners', async () => {
      const client = parity.client as ClientNats
      const listener = vi.fn()

      client.on('disconnect', listener)
      await parity.send('lifecycle.slow')

      expect(listener).not.toHaveBeenCalled()
    })

    it('logs a close status for the server and the client when closed', async () => {
      await parity.close()

      expect(parity.logged('log').filter(message => message === CLOSE_STATUS)).toHaveLength(2)
    })
  })

  describe('when shutting down gracefully', () => {
    beforeEach(async () => {
      parity = await transport.createApp({
        controllers: [LifecycleController],
        serverOptions: { gracefulShutdown: true, gracePeriod: 300 },
      })
    })

    it('answers a pending request', async () => {
      const reply = parity.send('lifecycle.slow')
      await delay(20)

      await parity.app.close()

      await expect(reply).resolves.toBe('done')
    })

    it('answers new requests with "no responders"', async () => {
      const closing = parity.app.close()
      await delay(20)

      const reply = parity.send('lifecycle.slow')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
      await closing
    })
  })

  describe('when shutting down immediately', () => {
    beforeEach(async () => {
      parity = await transport.createApp({ controllers: [LifecycleController] })
    })

    it('fails a pending request', async () => {
      const reply = parity.send('lifecycle.slow')
      await delay(20)

      await parity.app.close()

      await expect(reply).rejects.toThrow('Connection closed')
    })

    it('drops the late reply to a pending request without logging an error', async () => {
      parity.send('lifecycle.slow').catch(() => {})
      await delay(20)

      await parity.app.close()
      await settle()

      expect(parity.logged('error')).toEqual([])
    })
  })
})

// A deliberate difference: ClientsModule closes the clients it creates on shutdown, but a ClientNats created otherwise
// (e.g. through overrideProvider) stays connected. The in-memory client always closes itself.
describe('lifecycle (in-memory only)', () => {
  let app: INestApplication
  let client: NatsInMemoryClientProxy

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NatsInMemoryModule.forRoot()],
      providers: [
        {
          provide: 'LIFECYCLE_CLIENT',
          inject: [NatsInMemoryBus],
          useFactory: (bus: NatsInMemoryBus) => new NatsInMemoryClientProxy({ bus }),
        },
      ],
    }).compile()
    app = await moduleRef.createNestApplication().init()
    client = app.get('LIFECYCLE_CLIENT')
    await client.connect()
    return () => app.close()
  })

  it('closes a client not created by ClientsModule when the application shuts down', async () => {
    const close = vi.spyOn(client, 'close')

    await app.close()

    expect(close).toHaveBeenCalledOnce()
  })
})
