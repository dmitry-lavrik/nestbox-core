# nestbox-core

> ⚠️ **FIRST TESTING VERSION — DO NOT USE IN PRODUCTION YET.**
> This is an early, experimental release. APIs may change without notice and it
> has not been hardened or battle-tested. Use it for experiments and feedback only.

NestJS-style **decorators**, a small **dependency-injection** container, and a
**router** for [Fastify](https://fastify.dev) — with first-class
[TypeBox](https://github.com/sinclairzx81/typebox) schemas that drive validation,
serialization, **and** static types from a single source.

- 🎯 Decorator-based controllers (`@Controller`, `@Get`, `@Post`, …)
- 💉 Constructor dependency injection (`@Injectable`) with circular-dep detection
- 🧩 One TypeBox schema per route → AJV validation + `fast-json-stringify`
  serialization + inferred request types
- 🪶 Tiny and dependency-light: Fastify and TypeBox are **peer** dependencies
- ⚡ Modern **TC39 decorators** — no `reflect-metadata`, no `experimentalDecorators`

> 📦 **Just want to start?** Scaffold a ready-to-run project with the
> [`create-nestbox`](https://www.npmjs.com/package/create-nestbox) starter:
> `npm create nestbox@latest my-app` (the app name is required).

> 🤖 **Building with an AI agent?** Point it at [`AI.md`](./AI.md) — a terse,
> example-first usage guide written for coding agents.

## Install

You bring your own Fastify and TypeBox (they're peer dependencies):

```sh
npm install nestbox-core fastify @sinclair/typebox
```

### Requirements

- **Node** with ESM (`"type": "module"`) — nestbox-core is ESM-only.
- **TC39 stage-3 decorators.** Do **not** enable `experimentalDecorators` and do
  **not** install `reflect-metadata`. A minimal `tsconfig.json`:

  ```jsonc
  {
    "compilerOptions": {
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "target": "ES2022",
      "strict": true
      // no "experimentalDecorators", no "emitDecoratorMetadata"
    }
  }
  ```

## Quick start

```ts
import Fastify from 'fastify';
import { Controller, Get, nestbox } from 'nestbox-core';

@Controller('hello')
class HelloController {
  @Get('/world')
  world() {
    return { ok: true };          // a returned value is serialized and sent as JSON
  }
}

const app = Fastify();

nestbox({ app, controllers: [HelloController] })
  .setup()                        // wires routes, awaits app.ready()
  .then(app => app.listen({ port: 3000 }));
```

```sh
curl localhost:3000/hello/world
# {"ok":true}
```

You always construct and configure **your own** Fastify instance, then hand it to
`nestbox(...)`. The framework stays out of your Fastify version, plugins, and
server options.

## Controllers & routes

`@Controller(prefix)` marks a class; the method decorators register routes. The
final URL is `prefix + path` with slashes collapsed and any trailing slash
stripped (except the root `/`).

```ts
import { Controller, Get, Post, Patch, Delete } from 'nestbox-core';

@Controller('users')
class UsersController {
  @Get('/')        list()   { /* GET    /users      */ }
  @Get('/:id')     one()    { /* GET    /users/:id   */ }
  @Post('/')       create() { /* POST   /users       */ }
  @Patch('/:id')   update() { /* PATCH  /users/:id   */ }
  @Delete('/:id')  remove() { /* DELETE /users/:id   */ }
}
```

A handler's return value is sent as JSON. To take over the response yourself
(status, headers, cookies), inject the raw reply — see
[Request data](#request-data--validation).

## Dependency injection

Services live in a container and are resolved **once** (singletons). Because
nestbox-core uses TC39 decorators (no emitted type metadata), you declare each
class's dependencies **explicitly** as a token array — its order and length must
match the constructor.

```ts
import { Controller, Get, Injectable } from 'nestbox-core';

@Injectable([])                 // no dependencies
class Clock {
  now() { return new Date().toISOString(); }
}

@Injectable([Clock])            // one dependency → constructor(clock)
class GreetingService {
  constructor(private clock: Clock) {}
  greet(name: string) {
    return { hello: name, at: this.clock.now() };
  }
}

@Controller('greet')
@Injectable([GreetingService])  // controllers are resolved through DI too
class GreetController {
  constructor(private greetings: GreetingService) {}

  @Get('/:name')
  greet() {
    return this.greetings.greet('world');
  }
}
```

> **Always** add `@Injectable([...])` to any class that has constructor
> parameters — controllers included. The container throws if a class needs
> arguments but isn't `@Injectable`, if the token array is shorter than the
> constructor, or if it detects a circular dependency.

### Non-class providers

For values that aren't classes (a config object, a third-party client, a
function-built singleton), create a token and bind a factory during the
synchronous `boot` phase:

```ts
import { createToken, nestbox } from 'nestbox-core';

interface Config { dbUrl: string; }
const CONFIG = createToken<Config>('config');

@Injectable([CONFIG])
class Repo {
  constructor(private config: Config) {}
}

nestbox({ app, controllers: [/* … */] })
  .boot(c => c.bind(CONFIG, () => ({ dbUrl: process.env.DB_URL! })))
  .setup()
  .then(app => app.listen({ port: 3000 }));
```

## Request data & validation

`@Params(...)` declares, **by argument position**, what each handler parameter
receives. The key helper is `schema(...)`: it registers a TypeBox schema as the
route's native Fastify schema **and** injects the validated request at that
position.

```ts
import { Type } from '@sinclair/typebox';
import {
  Controller, Post, Params, schema,
  RouteSchema, ValidatedRequest,
} from 'nestbox-core';

const createUserSchema = {
  body: Type.Object(
    { name: Type.String({ minLength: 1 }), age: Type.Integer({ minimum: 0 }) },
    { additionalProperties: false },
  ),
  response: {
    200: Type.Object(
      { id: Type.String(), name: Type.String() },
      { additionalProperties: false },
    ),
  },
} satisfies RouteSchema;

// Re-export the inferred request type as your DTO:
export type CreateUserRequest = ValidatedRequest<typeof createUserSchema>;

@Controller('users')
class UsersController {
  @Post('/')
  @Params(schema(createUserSchema))
  create(req: CreateUserRequest) {
    // req.body is fully typed and already validated (AJV) by the time we get here
    const { name } = req.body;
    // `age` and any other field absent from the 200 response schema is stripped
    // from the output by fast-json-stringify:
    return { id: '1', name, internalSecret: 'hidden' };
  }
}
```

A `RouteSchema` accepts these TypeBox parts:
`{ body?, querystring?, params?, headers?, response? }` (with `response` keyed by
status code). Two things worth remembering:

- Use `additionalProperties: false` to **strip** unexpected fields — on input
  (rejected by validation) and on output (omitted by serialization).
- The schema's `querystring` key surfaces on the request as **`query`**
  (`req.query`), matching Fastify.

### Other parameter helpers

Mix helpers freely; just keep the handler's argument order matching the
`@Params(...)` order.

```ts
import { Params, request, reply, container, schema } from 'nestbox-core';

@Get('/raw')
@Params(request(), reply())
raw(req: FastifyRequest, res: FastifyReply) {
  res.code(202).send({ accepted: true });   // sent manually → don't also return
}
```

- `request()` → the raw `FastifyRequest`
- `reply()` → the raw `FastifyReply` (status, headers, cookies, manual send)
- `container()` → the DI `Container`, to resolve a service inside a method
- `schema(routeSchema)` → register the route schema **and** inject the validated request

## Hooks (middleware, auth)

`@Hooks({...})` attaches Fastify lifecycle hooks (`onRequest`, `preHandler`, …),
each value being a single handler or an array. On a **controller class** the
hooks apply to all of its routes; on a **single method** they apply to just that
route.

`setup()` decorates the Fastify instance with a `nestbox` namespace exposing the
container, so a hook can pull services out of DI the usual Fastify way:

```ts
import { Controller, Get, Hooks, Injectable, UnauthorizedError } from 'nestbox-core';
import type { onRequestHookHandler } from 'fastify';

@Injectable([])
class TokenService {
  isValid(token: string | undefined) { return token === 'secret'; }
}

// plain `function` (not an arrow) so Fastify binds `this` to the instance
const guard: onRequestHookHandler = function (req, _reply, done) {
  const tokens = this.nestbox.container.resolve(TokenService);

  if(!tokens.isValid(req.headers.authorization)){
    throw new UnauthorizedError('bad token');
  }

  done();
};

@Controller('secure')
@Hooks({ onRequest: guard })
class SecureController {
  @Get('/data')
  data() { return { ok: true }; }
}
```

## Errors

Throw a typed HTTP error from anywhere in the call stack (a service, a handler) —
each subclass hard-codes its status, so you never have to thread `reply` through
your code:

```ts
import { NotFoundError, ConflictError, BadRequestError } from 'nestbox-core';

throw new NotFoundError('user not found');
throw new ConflictError('email already taken');
throw new BadRequestError('invalid payload', validationDetails); // carries an `errors` field
```

Available classes (with their status codes) are in `HttpError` &
subclasses — `BadRequestError` (400), `UnauthorizedError` (401),
`ForbiddenError` (403), `NotFoundError` (404), `MethodNotAllowedError` (405),
`ConflictError` (409), `UnprocessableEntityError` (422),
`TooManyRequestsError` (429), `InternalServerError` (500).

To turn thrown errors — and Fastify's own schema-validation failures — into
clean responses, register the bundled error handler on your instance **before**
passing it to nestbox:

```ts
import Fastify from 'fastify';
import { registerDefaultErrorHandler, nestbox } from 'nestbox-core';

const app = Fastify();
registerDefaultErrorHandler(app, {
  // validationErrorStatus: 422,                 // default 400
  // validationErrorsMapper: (errors) => errors, // reshape reported validation errors
});

nestbox({ app, controllers: [/* … */] }).setup().then(app => app.listen({ port: 3000 }));
```

## API documentation (OpenAPI / Swagger)

nestbox-core stamps descriptive metadata onto the route schema but stays
Swagger-agnostic — wiring an actual UI (e.g. `@fastify/swagger`) is your app's
job.

```ts
import { ApiTag, ApiOperation, ApiSecurity, compileApiTags } from 'nestbox-core';

@ApiTag({ name: 'Users', description: 'User management' })
@ApiSecurity({ bearerAuth: [] })            // default security for every route
@Controller('users')
class UsersController {
  @ApiOperation({ summary: 'Create a user', operationId: 'createUser' })
  @Post('/')
  create() { /* … */ }

  @ApiSecurity()                            // no args → marks this route public
  @Get('/health')
  health() { return { ok: true }; }
}

// Feed your Swagger config the deduped tag list:
const tags = compileApiTags([UsersController]);
```

- `@ApiTag` — class-level tag.
- `@ApiOperation` — method-level summary / description / operationId.
- `@ApiSecurity(...requirements)` — class default or method override; calling it
  with **no arguments** marks a route public.

## Lifecycle

```ts
nestbox({ app, controllers })
  .boot(c => c.bind(/* … */))   // optional, synchronous: register providers before anything resolves
  .setup()                      // async: decorate, register routes, await app.ready()
  .then(app => app.listen({ port: 3000 }));
```

- **`.boot(cb)`** runs `cb(container)` immediately so you can `bind(...)`
  non-class providers up front. Skip it entirely if you have none.
- **`.setup()`** resolves to a ready-to-listen `FastifyInstance`.

## License

MIT
