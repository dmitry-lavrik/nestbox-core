import type { FastifyInstance, FastifySchema } from "fastify";
import { Constructor, Container } from "./container.js";
import { Reflector } from "./reflector.js";
import {
  getApiOperation,
  getApiTag,
  METADATA_CONTROLLER_PREFIX,
  METADATA_PARAMS,
  METADATA_ROUTES,
  ParamDefRaw,
  resolveArg,
  RouteDefinition,
} from "./decorators/index.js";

/* Same with fastify Swagger */
interface ApiSchemaDocs {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
}

function collectRoutes(ControllerClass: Constructor<any>): RouteDefinition[] {
  const routes: RouteDefinition[] = [];

  for(const key of Object.getOwnPropertyNames(ControllerClass.prototype)){
    const fn = ControllerClass.prototype[key];

    if(typeof fn === 'function' && key !== 'constructor'){
      const route = Reflector.get<RouteDefinition | undefined>(METADATA_ROUTES, fn);

      if(route){
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
  for(const ControllerClass of controllers){
    const routes = collectRoutes(ControllerClass);
    const prefix = Reflector.get<string>(METADATA_CONTROLLER_PREFIX, ControllerClass);
    const instance = container.resolve(ControllerClass);
    const tag = getApiTag(ControllerClass);

    for(const route of routes){
      const fn = instance[route.handler];
      const params = Reflector.get<ParamDefRaw<unknown>[]>(METADATA_PARAMS, fn) ?? [];

      const schemaDef = params.find(p => p.from === 'schema');
      const operation = getApiOperation(fn);

      const schema: FastifySchema & ApiSchemaDocs = { ...(schemaDef?.schema ?? {}) };

      // Setup data from api helpers for fastify swagger
      if(tag){
        schema.tags = [tag.name];
      }

      if(operation){
        schema.summary = operation.summary;

        if(operation.description){
          schema.description = operation.description;
        }

        if(operation.operationId){
          schema.operationId = operation.operationId;
        }
      }

      const options = Object.keys(schema).length > 0 ? { schema } : {};

      app[route.method](
        buildUrl(prefix, route.path),
        options,
        async (req, resp) => {
          const args = params.map(p => resolveArg(p, req, resp, container));
          const result = await instance[route.handler].apply(instance, args);

          if(!resp.sent){
            resp.send(result);
          }
        }
      );
    }
  }
}
