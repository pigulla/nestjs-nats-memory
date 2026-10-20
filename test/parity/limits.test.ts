import { InvalidArgumentError, InvalidSubjectError } from '@nats-io/transport-node'
import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { firstValueFrom, TimeoutError, timeout } from 'rxjs'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, settle, transports } from './transports.js'

const ONE_MEBIBYTE = 1024 * 1024

@Controller()
class LimitsController {
  @MessagePattern('limits.echo')
  public echo(@Payload() value: unknown): unknown {
    return value
  }

  @MessagePattern('limits.large-reply')
  public largeReply(): string {
    return 'x'.repeat(ONE_MEBIBYTE)
  }
}

@Controller()
class InvalidPatternController {
  @MessagePattern('limits.with space')
  public invalid(): string {
    return 'unreachable'
  }
}

describe.each(transports)('limits ($name)', transport => {
  it('refuses to start with a handler pattern containing whitespace', async () => {
    const app = transport.createApp({ controllers: [InvalidPatternController] })

    await expect(app).rejects.toBeInstanceOf(InvalidSubjectError)
  })

  describe('of a running app', () => {
    let parity: ParityApp

    beforeEach(async () => {
      parity = await transport.createApp({ controllers: [LimitsController] })
    })

    it('refuse to send a request to a subject containing whitespace', async () => {
      const reply = parity.send('limits.with space')

      await expect(reply).rejects.toBeInstanceOf(InvalidSubjectError)
    })

    it('refuse to emit an event to an empty subject', async () => {
      const published = parity.emit('')

      await expect(published).rejects.toBeInstanceOf(InvalidSubjectError)
    })

    it('refuse to send a payload larger than max_payload', async () => {
      const reply = parity.send('limits.echo', 'x'.repeat(ONE_MEBIBYTE))

      await expect(reply).rejects.toBeInstanceOf(InvalidArgumentError)
    })

    it('accept a payload just below max_payload', async () => {
      const payload = 'x'.repeat(ONE_MEBIBYTE - 1024)

      const reply = await parity.send('limits.echo', payload)

      expect(reply).toBe(payload)
    })

    it('leave a request unanswered if the reply is larger than max_payload', async () => {
      const reply = firstValueFrom(parity.client.send('limits.large-reply', {}).pipe(timeout(500)))

      await expect(reply).rejects.toBeInstanceOf(TimeoutError)
    })

    it('log an error if the reply is larger than max_payload', async () => {
      parity.send('limits.large-reply').catch(() => {})

      await settle()

      expect(parity.logged('error')).toEqual([
        expect.objectContaining({ message: "'payload' max_payload size exceeded" }),
      ])
    })
  })
})
