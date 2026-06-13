import type { FastifyInstance } from "fastify";
import { Constructor, Container } from "./container.js";
import { registerControllerRouter } from "./router.js";

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
    registerControllerRouter(this.app, this.controllers, this.container);
    await this.app.ready();
    return this.app;
  }
}

export function nestbox(config: NestboxConfig): Nestbox {
  return new Nestbox(config);
}
