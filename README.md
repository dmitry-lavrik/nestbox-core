# @nestbox/core

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

## Install

> 📦 **Starter pack** — [`create-nestbox`](https://www.npmjs.com/package/create-nestbox).