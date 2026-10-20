/** Thrown when an application uses a feature of Nest's NATS transport that the in-memory transport does not support. */
export class NatsInMemoryUnsupportedFeatureError extends Error {
  public constructor(feature: string, detail: string) {
    super(`The in-memory NATS transport does not support ${feature} (${detail}).`)
    this.name = NatsInMemoryUnsupportedFeatureError.name
  }
}
