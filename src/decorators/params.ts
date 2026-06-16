import { FastifyReply, FastifyRequest } from 'fastify';
import type { Static, TSchema } from '@sinclair/typebox';
import { Container } from '../container.js';

export const METADATA_PARAMS = Symbol('PARAMS');

export type ParamDefRequest<_Output = FastifyRequest> = {
  from: 'request'
}

export type ParamDefReply<_Output = FastifyReply> = {
  from: 'reply'
}

export type ParamDefContainer<_Output = Container> = {
  from: 'container'
}

export type RouteSchema = {
  body?: TSchema;
  querystring?: TSchema;
  params?: TSchema;
  headers?: TSchema;
  response?: { [statusCode: number]: TSchema };
}

export type ParamDefSchema<S extends RouteSchema = RouteSchema> = {
  from: 'schema',
  schema: S
}

/**
 * The signature a custom resolver implements. It receives the same things the
 * built-in defs have access to (request, reply, container) and returns the value
 * to inject at its argument position — sync or async.
 */
export type ParamResolver<Output = unknown> = (
  request: FastifyRequest,
  reply: FastifyReply,
  container: Container,
) => Output | Promise<Output>;

/**
 * The escape hatch: a param def whose value is produced by a user-supplied
 * callback. Lets a consuming app build its own `@Params` helpers (e.g. a
 * `bouncer()` that pulls the user off the request and resolves a guard) without
 * extending the core's `from` union.
 */
export type ParamDefCustom<Output = unknown> = {
  from: 'custom',
  resolve: ParamResolver<Output>
}

export type ParamDefRaw<T> =
  | ParamDefRequest<T>
  | ParamDefReply<T>
  | ParamDefContainer<T>
  | ParamDefSchema
  | ParamDefCustom<T>;

export const request = (): ParamDefRequest => ({ from: 'request' })
export const reply = (): ParamDefReply => ({ from: 'reply' })
export const container = (): ParamDefContainer => ({ from: 'container' })
export const schema = <const S extends RouteSchema>(s: S): ParamDefSchema<S> => ({ from: 'schema', schema: s })
export const custom = <Output>(resolve: ParamResolver<Output>): ParamDefCustom<Output> => ({ from: 'custom', resolve })

export type ValidatedRequest<S extends RouteSchema> = {
  params:  S extends { params: infer P extends TSchema } ? Static<P> : unknown;
  query:   S extends { querystring: infer Q extends TSchema } ? Static<Q> : unknown;
  headers: S extends { headers: infer H extends TSchema } ? Static<H> : unknown;
  body:    S extends { body: infer B extends TSchema } ? Static<B> : unknown;
}

type ExtractFromDefs<Defs extends ParamDefRaw<any>[]> = {
  [K in keyof Defs]:
    Defs[K] extends ParamDefSchema<infer S> ? ValidatedRequest<S> :
    Defs[K] extends ParamDefCustom<infer Output> ? Awaited<Output> :
    Defs[K] extends ParamDefRaw<infer D> ? D :
    0
}

export function Params<const T extends any[]>(...args: T){
  return function<Fn extends (...args: ExtractFromDefs<T>) => any>(
    fn: Fn,
    _ctx: ClassMethodDecoratorContext
  ): Fn {
    (fn as any)[METADATA_PARAMS] = args;
    return fn;
  }
}

export function resolveArg(
  def: ParamDefRaw<unknown>,
  request: FastifyRequest,
  response: FastifyReply,
  diContainer: Container
){
  switch(def.from){
    case 'request':     return request;
    case 'reply':       return response;
    case 'container':   return diContainer;
    case 'custom':      return def.resolve(request, response, diContainer);
    case 'schema':
      return {
        params: request.params,
        query: request.query,
        headers: request.headers,
        body: request.body,
      };
  }
}
