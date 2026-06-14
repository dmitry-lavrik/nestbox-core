import type { FastifyInstance } from "fastify";
import { Constructor, Container } from "./container.js";
import { registerControllerRouter } from "./router.js";

/**
 * The object decorated onto the Fastify instance under the `nestbox` namespace.
 * Namespaced (rather than a bare `container`) so it can't collide with a
 * decorator from an external plugin, and so new fields can be appended later
 * without re-decorating. Visible in every controller scope (Fastify inherits
 * root decorators into child scopes) and in any hook via `request.server.nestbox`.
 */
export interface NestboxDecorator {
  container: Container;
}

declare module "fastify" {
  interface FastifyInstance {
    nestbox: NestboxDecorator;
  }
}

export interface NestboxConfig {
  /**
   * A Fastify instance the consuming app has already built and configured
   * (Swagger, type provider, error handler, ...). The core stays
   * framework-agnostic: Nestbox only wires DI + routes onto it.
   */
  app: FastifyInstance;
  controllers: Constructor<any>[];
}

/**
 * Thin lifecycle wrapper around the container + router. Usage:
 *
 *   nestbox({ app, controllers })
 *     .boot(container => { container.bind(...) })   // sync: register providers
 *     .setup()                                      // async: wire routes, await ready
 *     .then(app => app.listen({ port }));           // app is ready to run
 */
export class Nestbox {
  protected readonly app: FastifyInstance;
  protected readonly controllers: Constructor<any>[];
  protected readonly container: Container;

  constructor(config: NestboxConfig){
    this.app = config.app;
    this.controllers = config.controllers;
    this.container = new Container();
  }

  /**
   * Synchronous binding phase. Runs the callback against the container so the
   * caller can `bind(...)` non-class providers before anything is resolved.
   * Returns `this` for chaining into `setup`.
   */
  boot(cb: (container: Container) => void): this {
    cb(this.container);
    return this;
  }

  /**
   * Asynchronous wiring phase. Registers every controller (each in its own
   * Fastify scope) and awaits `app.ready()` so the plugin queue is flushed and
   * routes are live. Resolves to the running-capable Fastify instance.
   */
  async setup(): Promise<FastifyInstance> {
    /**
     * Expose the container to request-time code, decorated on the root so every
     * controller scope inherits it (hooks reach `request.server.nestbox.container`).
     */
    if(this.app.hasDecorator("nestbox")){
      throw new Error("The `nestbox` decorator name is already taken — another plugin is using our core name.");
    }

    this.app.decorate("nestbox", { container: this.container });
    registerControllerRouter(this.app, this.controllers, this.container);
    await this.app.ready();
    return this.app;
  }
}

export function nestbox(config: NestboxConfig): Nestbox {
  return new Nestbox(config);
}
