# `nestbox-core` — usage guide for AI agents

> Consumer-facing doc: how to **build an app** with `nestbox-core`.

NestJS-style decorators on top of **your own** Fastify instance. You construct and
configure Fastify; nestbox turns decorated classes into routes and wires DI.

```ts
import Fastify from 'fastify';
import { Controller, Get, nestbox } from 'nestbox-core';

@Controller('hello')
class HelloController {
  @Get('/world')
  world() {
    return { ok: true };           // returned value is sent as JSON
  }
}

const app = Fastify();
nestbox({ app, controllers: [HelloController] })
  .setup()
  .then(app => app.listen({ port: 3000 }));   // GET /hello/world
```

## Prerequisites

- Peer deps you install yourself: `fastify`, `@sinclair/typebox`.
- **TC39 stage-3 decorators**, NOT `reflect-metadata`. In `tsconfig.json` keep
  `experimentalDecorators` **off** (`false`/unset) and target a runtime/TS that
  supports stage-3 decorators. Do not import `reflect-metadata`.
- Package is **ESM** (`"type": "module"`). In your own source use `.js` import
  specifiers. Import everything from the package root: `import { … } from 'nestbox-core'`.
- Types/signatures for any export live in `dist/src/*.d.ts` — read those when unsure.

## Bootstrap

```ts
nestbox({ app, controllers })
  .boot(c => c.bind(MY_TOKEN, () => makeValue()))  // optional: register non-class providers
  .setup()                                          // async: wires routes, awaits app.ready()
  .then(app => app.listen({ port }));
```

- `.boot(cb)` is **synchronous** and optional — use it only to `bind(...)` providers
  before anything resolves. Skip it if you have none.
- `.setup()` returns a `Promise<FastifyInstance>` that is ready to listen.
- You own Fastify config (Swagger, type provider, error handler) **before** passing `app` in.

## Controllers & routes

```ts
@Controller('users')                 // prefix; '' or omitted = root
class UsersController {
  @Get('/')        list()   { … }    // GET  /users
  @Get('/:id')     one()    { … }    // GET  /users/:id
  @Post('/')       create() { … }    // POST /users
  @Patch('/:id')   patch()  { … }
  @Delete('/:id')  remove() { … }
}
```

Final URL is `prefix + path`, slashes collapsed, trailing slash stripped (except root).
Return a value to send it as JSON; or send manually via `reply()` (see `@Params`).

## Dependency injection

Services are **singletons**, resolved once. Declare deps **explicitly** — the token
array must match the constructor parameters in order and count.

```ts
@Injectable([])                       // no deps
class Db { … }

@Injectable([Db])                     // one dep → constructor(db)
class UsersService {
  constructor(private db: Db) {}
}

@Controller('users')                  // controllers are resolved through DI too
class UsersController {
  constructor(private users: UsersService) {}   // remember @Injectable on the controller too if it has deps
}
```

- **Singletons only — no request scope.** No NestJS-style `Scope.REQUEST`; every
  instance is cached for the app lifetime. Pass per-request data as handler args
  (`request()` via `@Params`, or `request.server.nestbox.container` in a hook).
- **Always** put `@Injectable([...])` on any class with constructor params (controllers included).
- Non-class providers: `const T = createToken<X>('x')`, then `boot(c => c.bind(T, () => x))`,
  and list `T` in the consumer's `@Injectable([T])`.
- Need the container inside a method? Inject it with `container()` (below).
- `Reflector` is injectable (`@Injectable([Reflector])`) to read your own decorators.

## Request data & validation — `@Params(...)`

`@Params` declares, **positionally**, what each handler argument receives. Helpers:

```ts
import { Type } from '@sinclair/typebox';
import { Params, request, reply, container, schema,
         ValidatedRequest, RouteSchema } from 'nestbox-core';

const createSchema = {
  body: Type.Object({ name: Type.String() }, { additionalProperties: false }),
} satisfies RouteSchema;

@Post('/')
@Params(schema(createSchema))
create(req: ValidatedRequest<typeof createSchema>) {
  return req.body;                    // typed & validated; extra props stripped on the way out
}
```

- `request()` → raw `FastifyRequest`
- `reply()` → raw `FastifyReply` (cookies/headers/manual send; if you send yourself, don't also return)
- `container()` → the DI `Container`
- `schema(routeSchema)` → does double duty: registers the Fastify route schema **and**
  injects the validated request at that position.

`RouteSchema` parts are TypeBox schemas: `{ body?, querystring?, params?, headers?, response? }`
(`response` keyed by status code). Notes:

- Input validation is AJV: set `additionalProperties: false` to **reject** unexpected
  request fields (AJV otherwise neither strips nor rejects them).
- Output serialization is `fast-json-stringify`: it emits **only** the declared `response`
  properties, so undeclared fields are stripped whenever a `response` schema exists —
  `additionalProperties: false` is not needed for that. With **no** response schema the raw
  object is sent verbatim, so extra ("private") fields leak.
- Type the handler arg with `ValidatedRequest<typeof yourSchema>`. The **`querystring`**
  schema key surfaces as the **`query`** property on the request.
- Mixing helpers is fine — order args to match: `@Params(schema(s), reply())` →
  `handler(req, res)`.

## Hooks (middleware / auth)

`@Hooks({ ... })` accepts Fastify's own hook names (`onRequest`, `preHandler`, …) with a
single handler or an array. On a **controller class** it applies to all its routes; on a
**method** it applies to that one route.

```ts
@Controller('secure')
@Hooks({ onRequest: guard })
class SecureController { … }
```

`setup()` decorates the Fastify instance with `nestbox` (`{ container }`), so a hook can
resolve services from DI through the instance the normal Fastify way (e.g.
`this.nestbox.container.resolve(TokenService)`). Use a `function` (not an arrow) if you
need `this` bound to the instance.

## Errors

Throw the HTTP error classes from anywhere (services, handlers) — each carries its status:

```ts
import { NotFoundError, BadRequestError } from 'nestbox-core';
throw new NotFoundError('user not found');
throw new BadRequestError('invalid', validationDetails);   // some carry an `errors` field
```

Full class list and signatures: `dist/src/errors/httpError.d.ts`.

To turn thrown errors (and Fastify validation failures) into responses, register the
shipped handler **before** passing `app` to nestbox:

```ts
import { registerDefaultErrorHandler } from 'nestbox-core';
registerDefaultErrorHandler(app, { /* validationErrorStatus?, validationErrorsMapper? */ });
```

Options: see `dist/src/router.d.ts`.

## OpenAPI / Swagger metadata

Descriptive-only decorators — nestbox stamps them onto the route schema; wiring an actual
Swagger UI (e.g. `@fastify/swagger`) is your app's job.

- `@ApiTag({ name, description? })` — class.
- `@ApiOperation({ summary, description?, operationId? })` — method.
- `@ApiSecurity(...requirements)` — class default or method override. `@ApiSecurity()` with
  no args marks the route **public** (overrides the controller default).
- `compileApiTags(controllers)` → deduped `ApiTagDefinition[]` to feed your Swagger config.

Signatures: `dist/src/decorators/api.d.ts`.
