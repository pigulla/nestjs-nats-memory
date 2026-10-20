import { Controller } from '@nestjs/common'
import {
  type IncomingRequest,
  type IncomingResponse,
  MessagePattern,
  NatsRequestJSONDeserializer,
  NatsResponseJSONDeserializer,
  Payload,
} from '@nestjs/microservices'
import { NatsRecordSerializer } from '@nestjs/microservices/serializers/nats-record.serializer.js'
import { describe, expect, it } from 'vitest'

import { delay, transports } from './transports.js'

type Packet = Record<string, unknown>

function shout(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value
}

function reverse(value: unknown): unknown {
  return typeof value === 'string' ? [...value].reverse().join('') : value
}

/** Upper-cases outgoing requests (on the client) and replies (on the server). */
class ShoutingSerializer extends NatsRecordSerializer {
  public override serialize(packet: Packet): ReturnType<NatsRecordSerializer['serialize']> {
    return super.serialize({
      ...packet,
      data: shout(packet.data),
      response: shout(packet.response),
    })
  }
}

class InitializableSerializer extends NatsRecordSerializer {
  public initialized = false

  public async init(): Promise<void> {
    await delay(10)
    this.initialized = true
  }
}

/** Reverses incoming requests (on the server). */
class ReversingRequestDeserializer extends NatsRequestJSONDeserializer {
  public override deserialize(
    value: Parameters<NatsRequestJSONDeserializer['deserialize']>[0],
    options?: Record<string, unknown>,
  ): IncomingRequest {
    const request = super.deserialize(value, options) as IncomingRequest
    return { ...request, data: reverse(request.data) }
  }
}

/** Reverses incoming replies (on the client). */
class ReversingResponseDeserializer extends NatsResponseJSONDeserializer {
  public override deserialize(
    value: Parameters<NatsResponseJSONDeserializer['deserialize']>[0],
    options?: Record<string, unknown>,
  ): IncomingResponse {
    const response = super.deserialize(value, options) as IncomingResponse
    return { ...response, response: reverse(response.response) }
  }
}

@Controller()
class SerializationController {
  @MessagePattern('serialization.echo')
  public echo(@Payload() value: unknown): unknown {
    return value
  }
}

describe.each(transports)('serialization ($name)', transport => {
  it('applies a custom server serializer to replies', async () => {
    const parity = await transport.createApp({
      controllers: [SerializationController],
      serverOptions: { serializer: new ShoutingSerializer() },
    })

    const reply = await parity.send('serialization.echo', 'hello')

    expect(reply).toBe('HELLO')
  })

  it('applies a custom server deserializer to requests', async () => {
    const parity = await transport.createApp({
      controllers: [SerializationController],
      serverOptions: { deserializer: new ReversingRequestDeserializer() },
    })

    const reply = await parity.send('serialization.echo', 'hello')

    expect(reply).toBe('olleh')
  })

  it('applies a custom client serializer to requests', async () => {
    const parity = await transport.createApp({
      controllers: [SerializationController],
      clientOptions: { serializer: new ShoutingSerializer() },
    })

    const reply = await parity.send('serialization.echo', 'hello')

    expect(reply).toBe('HELLO')
  })

  it('applies a custom client deserializer to replies', async () => {
    const parity = await transport.createApp({
      controllers: [SerializationController],
      clientOptions: { deserializer: new ReversingResponseDeserializer() },
    })

    const reply = await parity.send('serialization.echo', 'hello')

    expect(reply).toBe('olleh')
  })

  it('initializes a custom client serializer when connecting', async () => {
    const serializer = new InitializableSerializer()

    await transport.createApp({
      controllers: [SerializationController],
      clientOptions: { serializer },
    })

    expect(serializer.initialized).toBe(true)
  })
})
