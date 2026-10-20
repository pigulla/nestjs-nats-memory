# Example

A small hybrid NestJS application (HTTP and microservice) that runs unchanged on a real NATS server and on the in-memory transport.

## How it works

The application is split into vertical slices, one module each, that only talk to each other through the microservice client:

- **orders** (`POST /orders`) asks **inventory** to reserve stock (a request, `send` / `@MessagePattern`). If that succeeds, it creates the order and emits an `orders.order-created` event; otherwise it answers with `409 Conflict`.
- **inventory** answers the reservation request from its stock (10 apples, 5 bananas).
- **notifications** handles the event (`emit` / `@EventPattern`) and lists the notifications it sent (`GET /notifications`).

The producing slice uses the client (`send` for a request, `emit` for an event), the consuming slice handles the message with `@MessagePattern` or `@EventPattern`:

```text
    POST /orders
          |
          v
   +-------------+  send('inventory.reserve-stock')  +-------------+
   |   orders    | --------------------------------> |  inventory  |  @MessagePattern
   |             | <-------------------------------- |             |
   +-------------+        reply { reserved }         +-------------+
          |
          | emit('orders.order-created')
          v
  +---------------+
  | notifications |  @EventPattern
  +---------------+
          ^
          |
 GET /notifications
```

A slice never imports another slice's module or services, only its `*.contract.ts` (message subjects and payload types). All transport-specific code is in [`messaging.ts`](./messaging.ts); the two entry points only differ in which variant they pass to `bootstrap()`:

- [`index.memory.ts`](./index.memory.ts) uses the in-memory transport.
- [`index.nats.ts`](./index.nats.ts) uses a real NATS server, which it starts in Docker via [Testcontainers](https://node.testcontainers.org/) (a real application would connect to an existing one).

## Running

```shell
npm run example:memory    # in memory
npm run example:nats      # with NATS (needs Docker)
```

Both listen on port 3000:

```shell
curl -X POST localhost:3000/orders -H 'content-type: application/json' -d '{"product":"apple","quantity":2}'
curl localhost:3000/notifications
```

The example imports this package by its name (`nestjs-nats-memory`), which the `development` export condition resolves to its sources, so no build is needed. [`example.test.ts`](./example.test.ts) runs the same flow against both transports.

The scripts pass `--disable-warning=DEP0205` because jiti's loader (`jiti/register`) still uses `module.register()`, which Node deprecated in favor of `module.registerHooks()`. Remove the flag once jiti switches.

## Debugging

The scripts above run the TypeScript sources through [jiti](https://github.com/unjs/jiti), which compiles them on the fly. Its compiled code does not match the source maps a debugger relies on, so breakpoints end up in the wrong place or are not hit at all. To debug, build the example (and the package) with source maps and run it with Node directly:

```shell
npm run example:build
node --enable-source-maps --inspect dist/example/index.memory.js    # or index.nats.js
```

Then attach your debugger (e.g. `chrome://inspect`), or let your IDE run `dist/example/index.memory.js` as a Node.js configuration. Breakpoints set in the `.ts` files of `example/` and `src/` work as expected. Rebuild after every change.
