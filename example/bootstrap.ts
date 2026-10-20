import { type INestApplication, Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import type { Messaging } from './messaging.js'

/**
 * Starts the hybrid application: an HTTP server plus the microservice through which the slices communicate. It shuts
 * down gracefully on SIGINT and SIGTERM.
 */
export async function bootstrap(messaging: Messaging, port: number): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(messaging))
  app.enableShutdownHooks()
  app.connectMicroservice(messaging.server)
  await app.startAllMicroservices()
  await app.listen(port)

  Logger.log(`Listening on ${await app.getUrl()}`, 'Bootstrap')
  return app
}
