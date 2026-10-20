import { Controller } from '@nestjs/common'
import { Ctx, MessagePattern, NatsContext } from '@nestjs/microservices'
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception.js'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, settle, transports } from './transports.js'

const INVALID_SUBJECT_ERROR = 'NatsError: type: "error", error: "ProtocolError: Invalid Subject".'

@Controller()
class WildcardsController {
  @MessagePattern('wildcards.star.*')
  public star(): string {
    return 'star'
  }

  @MessagePattern('wildcards.tail.>')
  public tail(): string {
    return 'tail'
  }

  @MessagePattern('wildcards.literal.a*')
  public literal(): string {
    return 'literal'
  }

  @MessagePattern('wildcards.subject.*')
  public subject(_payload: unknown, @Ctx() ctx: NatsContext): string {
    return ctx.getSubject()
  }

  @MessagePattern('wildcards.middle.>.end')
  public middle(): string {
    return 'middle'
  }

  @MessagePattern('wildcards..empty')
  public empty(): string {
    return 'empty'
  }
}

describe.each(transports)('wildcards ($name)', transport => {
  let parity: ParityApp

  beforeEach(async () => {
    parity = await transport.createApp({ controllers: [WildcardsController] })
  })

  it('pass the published subject to the handler', async () => {
    const reply = await parity.send('wildcards.subject.published')

    expect(reply).toBe('wildcards.subject.published')
  })

  describe('`*`', () => {
    it('matches exactly one token', async () => {
      const reply = await parity.send('wildcards.star.one')

      expect(reply).toBe('star')
    })

    it('does not match several tokens', async () => {
      const reply = parity.send('wildcards.star.one.two')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })

    it('does not match a missing token', async () => {
      const reply = parity.send('wildcards.star')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })

    it('matches itself literally within a token', async () => {
      const reply = await parity.send('wildcards.literal.a*')

      expect(reply).toBe('literal')
    })

    it('is no wildcard within a token', async () => {
      const reply = parity.send('wildcards.literal.ab')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })
  })

  describe('a trailing `>`', () => {
    it('matches one token', async () => {
      const reply = await parity.send('wildcards.tail.one')

      expect(reply).toBe('tail')
    })

    it('matches several tokens', async () => {
      const reply = await parity.send('wildcards.tail.one.two')

      expect(reply).toBe('tail')
    })

    it('does not match a missing token', async () => {
      const reply = parity.send('wildcards.tail')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })
  })

  describe('an invalid pattern', () => {
    it('never matches if `>` is not its last token', async () => {
      const reply = parity.send('wildcards.middle.x.end')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })

    it('never matches if it has an empty token', async () => {
      const reply = parity.send('wildcards..empty')

      await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
    })

    it('is logged as an error', async () => {
      await settle()

      expect(parity.logged('error')).toEqual([INVALID_SUBJECT_ERROR, INVALID_SUBJECT_ERROR])
    })
  })
})
