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
  HttpMethod,
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

/**
 * Controller inheritance is unsupported. Fail loud if a base class carries a
 * decorated route, since own-prototype scanning would silently drop it.
 */
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
 * Register every hook in the map onto a Fastify scope. Array values are spread,
 * since `addHook` takes one handler at a time.
 */
function applyScopeHooks(scope: FastifyInstance, hooks: HooksMap) {
  for(const [name, handler] of Object.entries(hooks)){
    const handlers = Array.isArray(handler) ? handler : [handler];

    for(const h of handlers){
      (scope.addHook as any)(name, h);
    }
  }
}

/**
 * Record a route's method+url and fail loud on an exact collision, naming both
 * controllers. Parametric collisions still fall through to Fastify's own check.
 */
function trackRoute(seen: Map<string, string>, method: HttpMethod, url: string, controllerName: string): void {
  const key = `${method.toUpperCase()} ${url}`;
  const existing = seen.get(key);

  if(existing !== undefined){
    throw new Error(`Duplicate route ${key}: declared by both "${existing}" and "${controllerName}".`);
  }

  seen.set(key, controllerName);
}

export function registerControllerRouter(
  app: FastifyInstance,
  controllers: Constructor<any>[],
  container: Container,
) {
  const seenRoutes = new Map<string, string>();

  for(const ControllerClass of controllers){

    /**
     * Each controller gets its own encapsulated Fastify scope, so controller-level
     * hooks don't leak to siblings. URLs are built by hand, not via Fastify prefix.
     */
    app.register(async (scope) => {

      if(!Reflector.has(METADATA_CONTROLLER_PREFIX, ControllerClass)){
        throw new Error(`Class "${ControllerClass.name}" is missing the @Controller decorator.`);
      }

      const routes = collectRoutes(ControllerClass);
      const prefix = Reflector.get<string>(METADATA_CONTROLLER_PREFIX, ControllerClass);
      const instance = container.resolve(ControllerClass);
      const tag = getApiTag(ControllerClass);
      const controllerSecurity = getApiSecurity(ControllerClass);
      const controllerHooks = getHooks(ControllerClass);

      /**
       * Controller-level hooks live on the scope, applying to every route of this
       * controller and nothing outside it.
       */
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

        /**
         * Route-level hooks merge into the route options — Fastify's native
         * per-route mechanism, alongside the schema.
         */
        const routeHooks = getHooks(fn) ?? {};
        const options: RouteShorthandOptions = { ...routeHooks };

        if(Object.keys(schema).length > 0){
          options.schema = schema;
        }

        const url = buildUrl(prefix, route.path);

        trackRoute(seenRoutes, route.method, url, ControllerClass.name);

        scope[route.method](
          url,
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