import type { LoggerService } from '@nestjs/common'

/**
 * Warns about the NATS options the in-memory transport ignores: all but the `honored` ones, which Nest's NATS transport
 * reads itself. The others only configure the connection to a NATS server (`servers`, authentication, reconnects,
 * pings, …), which the in-memory transport does not have.
 */
export function warnAboutIgnoredOptions(
  logger: LoggerService,
  options: object,
  honored: readonly string[],
): void {
  const ignored = Object.entries(options)
    .filter(([key, value]) => value !== undefined && !honored.includes(key))
    .map(([key]) => key)
  if (ignored.length > 0) {
    logger.warn(
      `The in-memory transport ignores these NATS options, which only concern a connection to a NATS server: ${ignored.join(', ')}.`,
    )
  }
}
