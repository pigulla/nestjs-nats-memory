# nestjs-nats-memory

An in-memory drop-in replacement for the [NATS transport](https://docs.nestjs.com/microservices/nats) of [NestJS microservices](https://docs.nestjs.com/microservices/basics). Your application uses it exactly like NATS, but messages never leave the process: there is no NATS server to run, and your handlers and clients stay as they are.

Use it to [start with a monolith](https://martinfowler.com/bliki/MonolithFirst.html) whose modules already talk through NATS: splitting off a microservice later only means switching the transport back. It also works as a lightweight stand-in for NATS in tests and local development.

## Installation

```shell
npm install nestjs-nats-memory
```

Peer dependencies: `@nestjs/common`, `@nestjs/core` and `@nestjs/microservices` 12.x, `@nats-io/transport-node` 3.x and `rxjs` 7.x.

## Usage

Import `NatsInMemoryModule.forRoot()` once, in your root module. It provides the `NatsInMemoryBus` that connects the server and clients of your application. Every application gets its own bus, so applications in the same process (e.g. parallel tests) are isolated from each other.

Register clients with `ClientsModule.registerAsync`, keeping your injection tokens:

```typescript
import { NatsInMemoryBus, NatsInMemoryClientProxy, NatsInMemoryModule } from "nestjs-nats-memory";

@Module({
    imports: [
        NatsInMemoryModule.forRoot(),
        ClientsModule.registerAsync([
            {
                name: "ORDERS_SERVICE", // was: { name: "ORDERS_SERVICE", transport: Transport.NATS }
                inject: [NatsInMemoryBus],
                useFactory: (bus: NatsInMemoryBus) => ({ customClass: NatsInMemoryClientProxy, options: { bus } }),
            },
        ]),
    ],
})
class AppModule {}
```

Create the server through async microservice options, for hybrid applications or standalone microservices:

```typescript
import { NatsInMemoryBus, NatsInMemoryServer } from "nestjs-nats-memory";

const serverOptions: AsyncMicroserviceOptions = {
    inject: [NatsInMemoryBus],
    useFactory: (bus: NatsInMemoryBus) => ({ strategy: new NatsInMemoryServer({ bus }) }),
};

const app = await NestFactory.create(AppModule);
app.connectMicroservice<AsyncMicroserviceOptions>(serverOptions);
// or: await NestFactory.createMicroservice<AsyncMicroserviceOptions>(AppModule, serverOptions)
```

Server and client accept the options of the NATS transport next to `bus`, e.g. `new NatsInMemoryServer({ bus, queue: "orders", gracefulShutdown: true })`.

## Features

`NatsInMemoryServer` and `NatsInMemoryClientProxy` extend Nest's own `ServerNats` and `ClientNats` and only replace their connection to the NATS server, so everything Nest's NATS transport does works the same way. Every feature is tested against both a real NATS server and the in-memory transport.

| Feature                                                                           | Status      |
| --------------------------------------------------------------------------------- | ----------- |
| Request/response (`send`, `@MessagePattern`) and events (`emit`, `@EventPattern`) | Supported   |
| Subject wildcards (`*`, `>`) and queue groups (`queue` option)                    | Supported   |
| Headers (`NatsRecordBuilder`, `NatsContext#getHeaders()`, client `headers`)       | Supported   |
| Custom serializers and deserializers                                              | Supported   |
| Observable responses emitting several values                                      | Supported   |
| Timeouts, "no responders" errors (`EmptyResponseException`), `RpcException`       | Supported   |
| `status`, `on()`, graceful shutdown (`gracefulShutdown`, `gracePeriod`)           | Supported   |
| `unwrap()`                                                                        | Unsupported |
| JetStream                                                                         | Unsupported |

Unsupported features throw a `NatsInMemoryUnsupportedFeatureError`: there is no NATS connection for `unwrap()` to return or JetStream to use.

### Differences from NATS

- **Connection options are ignored**, with a logged warning: everything except the options Nest reads itself (`queue`, `serializer`, `deserializer`, `gracefulShutdown`, `gracePeriod` on the server; `headers`, `inboxPrefix`, `serializer`, `deserializer` on the client).
- **The payload limit is always 1 MiB**, the default `max_payload` of a NATS server, which may be configured differently.
- **There are no connection status events**: `disconnect`, `reconnect` and `update` never happen, and `status` stays `connected`.
- **Messages never leave the process**: only the server and clients of the same application reach each other.

## Example

[`example/`](./example) is a small hybrid application whose modules talk to each other through the microservice client. It runs unchanged on NATS (`npm run example:nats`) and in memory (`npm run example:memory`). See its [README](./example/README.md).

## Development

```shell
npm test                      # lint and all tests
npm run vitest:unit           # unit tests
npm run vitest:integration    # parity tests (in-memory vs. a real NATS server, needs Docker)
```

If Testcontainers cannot find your Docker socket (e.g. with OrbStack), set `DOCKER_HOST` (e.g. `unix://$HOME/.orbstack/run/docker.sock`) or `docker.host` in `~/.testcontainers.properties`.

## License

[ISC](./LICENSE)
