import { Controller } from '@nestjs/common'
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices'
import { EmptyResponseException } from '@nestjs/microservices/errors/empty-response.exception.js'
import { from, of } from 'rxjs'
import { beforeEach, describe, expect, it } from 'vitest'

import { delay, type ParityApp, transports } from './transports.js'

@Controller()
class RequestResponseController {
  @MessagePattern('request-response.sync')
  public sync(@Payload() value: number): number {
    return value + 1
  }

  @MessagePattern('request-response.async')
  public async async(@Payload() value: number): Promise<number> {
    await delay(10)
    return value + 1
  }

  @MessagePattern('request-response.observable')
  public observable(@Payload() value: number): unknown {
    return of(value + 1)
  }

  @MessagePattern('request-response.stream')
  public stream(): unknown {
    return from([1, 2, 3])
  }

  @MessagePattern('request-response.echo')
  public echo(@Payload() value: unknown): unknown {
    return value
  }

  @MessagePattern('request-response.rpc-exception')
  public rpcException(): never {
    throw new RpcException('Something went wrong')
  }

  @MessagePattern('request-response.rpc-exception-object')
  public rpcExceptionObject(): never {
    throw new RpcException({ code: 'E_CUSTOM', detail: 42 })
  }

  @MessagePattern('request-response.error')
  public error(): never {
    throw new Error('Not to be leaked')
  }

  @MessagePattern('request-response.slow')
  public async slow(): Promise<string> {
    await delay(100)
    return 'done'
  }
}

describe.each(transports)('request/response ($name)', transport => {
  let parity: ParityApp

  beforeEach(async () => {
    parity = await transport.createApp({ controllers: [RequestResponseController] })
  })

  it('answers with the return value of a synchronous handler', async () => {
    const reply = await parity.send('request-response.sync', 1)

    expect(reply).toBe(2)
  })

  it('answers with the resolved value of an asynchronous handler', async () => {
    const reply = await parity.send('request-response.async', 1)

    expect(reply).toBe(2)
  })

  it('answers with the value of an Observable emitting once', async () => {
    const reply = await parity.send('request-response.observable', 1)

    expect(reply).toBe(2)
  })

  it('answers with every value of an Observable emitting several times', async () => {
    const replies = await parity.sendAll('request-response.stream')

    expect(replies).toEqual([1, 2, 3])
  })

  it('transfers the payload as JSON, e.g. a Date as a string', async () => {
    const date = new Date('2026-01-02T03:04:05.000Z')

    const reply = await parity.send('request-response.echo', { date })

    expect(reply).toEqual({ date: '2026-01-02T03:04:05.000Z' })
  })

  it('fails with the message of an RpcException', async () => {
    const reply = parity.send('request-response.rpc-exception')

    await expect(reply).rejects.toEqual({ status: 'error', message: 'Something went wrong' })
  })

  it('fails with the object of an RpcException', async () => {
    const reply = parity.send('request-response.rpc-exception-object')

    await expect(reply).rejects.toEqual({ code: 'E_CUSTOM', detail: 42 })
  })

  it('hides the details of any other error', async () => {
    const reply = parity.send('request-response.error')

    await expect(reply).rejects.toEqual({ status: 'error', message: 'Internal server error' })
  })

  it('fails with an EmptyResponseException if nobody subscribed to the subject', async () => {
    const reply = parity.send('request-response.nobody')

    await expect(reply).rejects.toBeInstanceOf(EmptyResponseException)
  })

  it('fails a pending request when the client is closed', async () => {
    const reply = parity.send('request-response.slow')
    await delay(20)

    await parity.client.close()

    await expect(reply).rejects.toThrow('Connection closed')
  })
})
