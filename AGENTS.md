# Agent Guide

This package is an in-memory, API-compatible replacement for the [NATS transport](https://github.com/nestjs/nest/blob/master/packages/microservices/server/server-nats.ts) of NestJS microservices: application code must not be able to tell it from real NATS. The [README](./README.md) covers usage, the feature table and the documented differences; keep it current with every change. It serves production monoliths and tests equally, so it must be both robust (no leaks, clean shutdown) and faithful to NATS, including edge cases.

## The Golden Rule

For every feature of the NATS transport, one of the following must hold:

- it behaves identically, _or_
- it differs in a way unlikely to affect real applications, documented in the README and in the source code, and logged as a warning where appropriate, _or_
- it is unsupported, documented in the README, and throws a descriptive `NatsInMemoryUnsupportedFeatureError`.

## Architecture

`NatsInMemoryServer` and `NatsInMemoryClientProxy` extend Nest's `ServerNats` and `ClientNats` and only override the public connection factories (`createNatsClient()` / `createClient()`), plus `unwrap()` (throws). Never reimplement Nest's logic (serialization, headers, handler routing, replies, shutdown); the in-memory code only has to behave like a NATS connection and server:

- `src/nats-in-memory.connection.ts`: the subset of `NatsConnection` and `Msg` that Nest uses, with nats.js semantics (subject and payload checks, status iterator, `close()` behavior).
- `src/nats-in-memory.bus.ts`: the NATS server stand-in (subject and queue group routing, "no responders").
- `src/nats-in-memory.limits.ts`: limits and validation mirrored from nats.js and the NATS server.
- `src/nats-in-memory.options.ts`: warnings for ignored connection options.
- `src/nats-in-memory.module.ts`: provides one `NatsInMemoryBus` per application through DI.

Invariants: messages travel encoded as bytes (never by reference) and are delivered asynchronously; there is no process-global state.

Non-goals: communication across processes, message persistence, JetStream.

## Tests

- **Parity tests** (`test/parity/`) cover the entire API surface. Each runs against a real NATS server (Testcontainers, started once in `nats.global-setup.ts`) and the in-memory transport via `describe.each(transports)` from `transports.ts`. Expected values come from real NATS: when unsure how NATS behaves, write the test and let the NATS run decide. Unsupported features are tested too, asserting the error in memory.
- All test files share one NATS server: prefix every subject with the file's name (e.g. `events.` in `events.test.ts`). The harness closes every app after its test.
- Mark a known in-memory deviation with `it.fails` for the in-memory run only, and remove the marker when fixing it.
- Follow Arrange-Act-Assert with one behavior per test and shared setup in `beforeEach`. Use the `ParityApp` helpers (`send`, `sendAll`, `emit`, `logged`) and `settle()` before asserting on events; use `it.runIf` for transport-specific expectations.
- **Unit tests** (`src/**/*.test.ts`) only cover reimplemented logic, such as subject matching.
- Run `npm test` (lint and all tests). If Testcontainers cannot find Docker, set `DOCKER_HOST` (OrbStack: `unix://$HOME/.orbstack/run/docker.sock`).

## Example

`example/` is a hybrid app whose vertical slices (`orders`, `inventory`, `notifications`, one module each) only talk through the microservice client, using each other's `*.contract.ts`. All transport-specific code lives in `example/messaging.ts`. Run it with `npm run example:memory` or `npm run example:nats` (starts NATS via Testcontainers); `example/example.test.ts` smoke-tests both, so keep it working when the API changes. It imports the package through a relative import of `src/index.ts` (no build needed).
