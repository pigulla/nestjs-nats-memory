import { Controller } from '@nestjs/common'
import { MessagePattern } from '@nestjs/microservices'
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception.js'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, transports } from './transports.js'

@Controller()
class FirstController {
  @MessagePattern('isolation.first')
  public first(): string {
    return 'first'
  }
}

@Controller()
class SecondController {
  @MessagePattern('isolation.second')
  public second(): string {
    return 'second'
  }
}

describe.each(transports)('isolation ($name)', transport => {
  const inMemory = transport.name === 'in-memory'
  let first: ParityApp

  beforeEach(async () => {
    first = await transport.createApp({ controllers: [FirstController] })
    await transport.createApp({ controllers: [SecondController] })
  })

  it.runIf(!inMemory)(
    'lets an app reach the handlers of another app on the same server',
    async () => {
      const reply = await first.send('isolation.second')

      expect(reply).toBe('second')
    },
  )

  it.runIf(inMemory)('keeps an app from reaching the handlers of another app', async () => {
    const reply = first.send('isolation.second')

    await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
  })
})
