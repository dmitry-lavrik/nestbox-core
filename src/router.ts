import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest, FastifySchema, FastifySchemaValidationError, RouteShorthandOptions } from "fastify";
import { Constructor, Container } from "./container.js";
import { Reflector } from "./reflector.js";
import {
  ApiSecurityRequirement,
  getApiOperation,
  getApiSecurity,
  getApiTag,
  getHooks,
  HooksMap,
  METADATA_CONTROLLER_PREFIX,
  METADATA_PARAMS,
  METADATA_ROUTES,
  ParamDefRaw,
  resolveArg,
  RouteDefinition,
} from "./decorators/index.js";
import { BadRequestError, HttpError, UnprocessableEntityError } from "./errors/httpError.js";

/* Same with fastify Swagger */
interface ApiSchemaDocs {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: ApiSecurityRequirement[];
}

// Controller inheritance is unsupported. Fail loud if a base class carries a
// decorated route, since own-prototype scanning would silently drop it.
function assertNoInheritedRoutes(ControllerClass: Constructor<any>): void {
  let proto = Object.getPrototypeOf(ControllerClass.prototype);

  while(proto && proto !== Object.prototype){

    for(const key of Object.getOwnPropertyNames(proto)){
      const fn = proto[key];

      if(typeof fn === 'function' && key !== 'constructor'){
        const route = Reflector.get<RouteDefinition | undefined>(METADATA_ROUTES, fn);

        if(route){
          throw new Error(
            `Controller "${ControllerClass.name}" inherits route "${route.method.toUpperCase()} ${route.path}" ` +
            `(handler "${route.handler}") from a base class. Controller inheritance is not supported — ` +
            `declare routes directly on the controller class.`
          );
        }
      }
    }

    proto = Object.getPrototypeOf(proto);
  }
}

function collectRoutes(ControllerClass: Constructor<any>): RouteDefinition[] {
  const routes: RouteDefinition[] = [];
  const ownPrototype = ControllerClass.prototype;

  for(const key of Object.getOwnPropertyNames(ownPrototype)){
    const fn = ownPrototype[key];

    if(typeof fn === 'function' && key !== 'constructor'){
      const route = Reflector.get<RouteDefinition | undefined>(METADATA_ROUTES, fn);

      if(route){
        routes.push(route);
      }
    }
  }

  assertNoInheritedRoutes(ControllerClass);

  return routes;
}

function buildUrl(prefix: string, path: string): string {
  return ('/' + prefix + '/' + path)
    .replace(/\/{2,}/g, '/')
    .replace(/(.+)\/$/, '$1');
}

/**
 * Register every hook in the map onto a Fastify scope. A hook value may be a
 * single handler or an array of them; `addHook` takes one at a time, so arrays
 * are spread out.
 */
function applyScopeHooks(scope: FastifyInstance, hooks: HooksMap) {
  for(const [name, handler] of Object.entries(hooks)){
    const handlers = Array.isArray(handler) ? handler : [handler];

    for(const h of handlers){
      (scope.addHook as any)(name, h);
    }
  }
}

export function registerControllerRouter(
  app: FastifyInstance,
  controllers: Constructor<any>[],
  container: Container,
) {
  for(const ControllerClass of controllers){

    // Each controller lives in its own encapsulated Fastify scope, so that
    // controller-level hooks/plugins can be attached to `scope` without leaking
    // to sibling controllers. URLs are still built by hand (`buildUrl`); we do
    // not use Fastify's native `prefix` option.
    app.register(async (scope) => {
      const routes = collectRoutes(ControllerClass);
      const prefix = Reflector.get<string>(METADATA_CONTROLLER_PREFIX, ControllerClass);
      const instance = container.resolve(ControllerClass);
      const tag = getApiTag(ControllerClass);
      const controllerSecurity = getApiSecurity(ControllerClass);
      const controllerHooks = getHooks(ControllerClass);

      // Controller-level hooks live on the scope, so they apply to every route
      // of this controller and nothing outside it.
      if(controllerHooks){
        applyScopeHooks(scope, controllerHooks);
      }

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

        // Route-level security overrides the controller-level default
        const security = getApiSecurity(fn) ?? controllerSecurity;

        if(security){
          schema.security = security;
        }

        // Route-level hooks are merged straight into the route options, which is
        // how Fastify natively accepts per-route hooks alongside the schema.
        const routeHooks = getHooks(fn) ?? {};
        const options: RouteShorthandOptions = { ...routeHooks };

        if(Object.keys(schema).length > 0){
          options.schema = schema;
        }

        scope[route.method](
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
    });
  }
}

interface DefaultErrorHandlerOptions{
  validationErrorsMapper?: (errors: FastifySchemaValidationError[]) => unknown,
  validationErrorStatus?: number
}

export function registerDefaultErrorHandler(app: FastifyInstance, options: DefaultErrorHandlerOptions){
  const validationErrorsMapper = options.validationErrorsMapper ?? (v => v)

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error.validation) {
      return reply.code(options.validationErrorStatus ?? 400).send({
        code: error.code,
        message: error.message,
        errors: validationErrorsMapper(error.validation)
      });
    }

    if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        errors: error.errors
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  })
}