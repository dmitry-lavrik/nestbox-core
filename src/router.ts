import type { FastifyInstance } from "fastify";
import { Constructor, Container } from "./container.js";
import {
  METADATA_CONTROLLER_PREFIX,
  METADATA_PARAMS,
  METADATA_ROUTES,
  ParamDefRaw,
  resolveArg,
  RouteDefinition,
} from "./decorators.js";

function collectRoutes(ControllerClass: Constructor<any>): RouteDefinition[] {
  const routes: RouteDefinition[] = [];

  for (const key of Object.getOwnPropertyNames(ControllerClass.prototype)) {
    const fn = ControllerClass.prototype[key];

    if (typeof fn === 'function' && key !== 'constructor') {
      const route: RouteDefinition | undefined = fn[METADATA_ROUTES];

      if (route) {
        routes.push(route);
      }
    }
  }

  return routes;
}

function buildUrl(prefix: string, path: string): string {
  return ('/' + prefix + '/' + path)
    .replace(/\/{2,}/g, '/')
    .replace(/(.+)\/$/, '$1');
}

export function registerControllerRouter(
  app: FastifyInstance,
  controllers: Constructor<any>[],
  container: Container,
) {
  for (const ControllerClass of controllers) {
    const routes = collectRoutes(ControllerClass);
    const prefix: string = (ControllerClass as any)[METADATA_CONTROLLER_PREFIX];
    const instance = container.resolve(ControllerClass);

    for (const route of routes) {
      const fn = instance[route.handler];
      const params: ParamDefRaw<unknown>[] = fn[METADATA_PARAMS] ?? [];

      const schemaDef = params.find(p => p.from === 'schema');
      const options = schemaDef ? { schema: schemaDef.schema } : {};

      app[route.method](
        buildUrl(prefix, route.path),
        options,
        async (req, resp) => {
          const args = params.map(p => resolveArg(p, req, resp, container));
          const result = await instance[route.handler].apply(instance, args);

          if (!resp.sent) {
            resp.send(result);
          }
        }
      );
    }
  }
}
