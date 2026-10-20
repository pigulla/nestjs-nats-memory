/**
 * Limits that a NATS client or server enforces and that the in-memory transport mirrors, with the same errors, so that
 * it is never more lenient than the real thing.
 */
import { InvalidArgumentError, InvalidSubjectError } from '@nats-io/transport-node'

/**
 * The default `max_payload` of a NATS server (1 MiB), which the NATS client enforces when publishing. Unlike a NATS
 * server, the in-memory transport cannot be configured with a different limit (documented in the README).
 */
const MAX_PAYLOAD = 1024 * 1024

/** Like NatsConnectionImpl#_check: the NATS client refuses an empty subject or one containing whitespace. */
export function assertValidSubject(subject: string): void {
  if (subject.length === 0 || /[ \n\r\t]/.test(subject)) {
    throw new InvalidSubjectError(subject)
  }
}

/**
 * Like ProtocolHandler#publish: the NATS client refuses to publish a message whose data and encoded headers together
 * are larger than `max_payload`.
 */
export function assertWithinMaxPayload(length: number): void {
  if (length > MAX_PAYLOAD) {
    throw InvalidArgumentError.format('payload', 'max_payload size exceeded')
  }
}

/** The NATS server refuses to subscribe to a subject with an empty token (`a..b`, `.a`, `a.`) or a non-final `>`. */
export function isValidSubscriptionSubject(subject: string): boolean {
  const tokens = subject.split('.')
  return tokens.every(
    (token, index) => token !== '' && (token !== '>' || index === tokens.length - 1),
  )
}
