import { Controller } from '@nestjs/common'
import { EventPattern, MessagePattern } from '@nestjs/microservices'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ParityApp, settle, transports } from './transports.js'

// Enough messages that each member of a queue group gets some (with a probability of 1 - 2^-39).
const COUNT = 40

const received: string[] = []

function countOf(handler: string): number {
  return received.filter(entry => entry === handler).length
}

@Controller()
class HandlerQueueController {
  @EventPattern('queue-groups.event.*', { queue: 'workers' })
  public workerA(_payload: unknown): void {
    received.push('worker A')
  }

  @EventPattern('queue-groups.event.>', { queue: 'workers' })
  public workerB(_payload: unknown): void {
    received.push('worker B')
  }

  @EventPattern('queue-groups.*.created', { queue: 'auditors' })
  public auditor(_payload: unknown): void {
    received.push('auditor')
  }

  @EventPattern('queue-groups.event.created')
  public listener(_payload: unknown): void {
    received.push('listener')
  }

  @MessagePattern('queue-groups.request.*', { queue: 'workers' })
  public requestA(_payload: unknown): string {
    return 'worker A'
  }

  @MessagePattern('queue-groups.request.>', { queue: 'workers' })
  public requestB(_payload: unknown): string {
    return 'worker B'
  }
}

@Controller()
class ServerQueueController {
  @EventPattern('queue-groups.server.*')
  public first(_payload: unknown): void {
    received.push('first')
  }

  @EventPattern('queue-groups.server.>')
  public second(_payload: unknown): void {
    received.push('second')
  }
}

describe.each(transports)('queue groups ($name)', transport => {
  let parity: ParityApp

  async function emitMany(pattern: string): Promise<void> {
    for (let i = 0; i < COUNT; i++) {
      await parity.emit(pattern, i)
    }
    await settle()
  }

  async function sendMany(pattern: string): Promise<unknown[][]> {
    const replies: unknown[][] = []
    for (let i = 0; i < COUNT; i++) {
      replies.push(await parity.sendAll(pattern, i))
    }
    return replies
  }

  beforeEach(() => {
    received.length = 0
  })

  describe('of handlers', () => {
    beforeEach(async () => {
      parity = await transport.createApp({ controllers: [HandlerQueueController] })
    })

    it('deliver each event to one member of the group', async () => {
      await emitMany('queue-groups.event.created')

      expect(countOf('worker A') + countOf('worker B')).toBe(COUNT)
    })

    it('distribute events among all members of the group', async () => {
      await emitMany('queue-groups.event.created')

      expect(received).toEqual(expect.arrayContaining(['worker A', 'worker B']))
    })

    it('deliver each event to every other queue group', async () => {
      await emitMany('queue-groups.event.created')

      expect(countOf('auditor')).toBe(COUNT)
    })

    it('deliver each event to every handler without a queue group', async () => {
      await emitMany('queue-groups.event.created')

      expect(countOf('listener')).toBe(COUNT)
    })

    it('answer each request once', async () => {
      const replies = await sendMany('queue-groups.request.x')

      expect(replies.map(reply => reply.length)).toEqual(Array(COUNT).fill(1))
    })

    it('distribute requests among all members of the group', async () => {
      const replies = await sendMany('queue-groups.request.x')

      expect(new Set(replies.flat())).toEqual(new Set(['worker A', 'worker B']))
    })
  })

  describe('of the server', () => {
    beforeEach(async () => {
      parity = await transport.createApp({
        controllers: [ServerQueueController],
        serverOptions: { queue: 'everyone' },
      })
    })

    it('deliver each event to one of its handlers', async () => {
      await emitMany('queue-groups.server.created')

      expect(received).toHaveLength(COUNT)
    })

    it('distribute events among all of its handlers', async () => {
      await emitMany('queue-groups.server.created')

      expect(new Set(received)).toEqual(new Set(['first', 'second']))
    })
  })
})
