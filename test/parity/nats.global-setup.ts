import { GenericContainer, Wait } from 'testcontainers'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    natsUrl: string
  }
}

const NATS_PORT = 4222

/** Starts one NATS server shared by all parity tests; see transports.ts for how tests stay isolated on it. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new GenericContainer('nats:latest')
    .withExposedPorts(NATS_PORT)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .start()
  project.provide('natsUrl', `nats://${container.getHost()}:${container.getMappedPort(NATS_PORT)}`)

  return async () => {
    await container.stop()
  }
}
