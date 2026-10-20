import { Module, type OnApplicationShutdown } from '@nestjs/common'
import { GenericContainer, Wait } from 'testcontainers'

import { bootstrap } from './bootstrap.js'
import { natsMessaging } from './messaging.js'

const NATS_PORT = 4222

// Starts a throwaway NATS server for this demo; a real application would connect to an existing one.
const nats = await new GenericContainer('nats:latest')
  .withExposedPorts(NATS_PORT)
  .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
  .start()

/**
 * Stops the NATS server when the application shuts down. Nest runs the shutdown hooks of global modules last, in reverse
 * order of registration, so being global and imported before the messaging client lets this one run after the client
 * has disconnected.
 */
@Module({})
class NatsContainerModule implements OnApplicationShutdown {
  public async onApplicationShutdown(): Promise<void> {
    await nats.stop()
  }
}

const messaging = natsMessaging(`nats://${nats.getHost()}:${nats.getMappedPort(NATS_PORT)}`)
await bootstrap(
  { ...messaging, imports: [{ module: NatsContainerModule, global: true }, ...messaging.imports] },
  3000,
)
