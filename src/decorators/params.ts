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

export type ParamDefRaw<T> = ParamDefRequest<T> | ParamDefReply<T> | ParamDefContainer<T> | ParamDefSchema;

export const request = (): ParamDefRequest => ({ from: 'request' })
export const reply = (): ParamDefReply => ({ from: 'reply' })
export const container = (): ParamDefContainer => ({ from: 'container' })
export const schema = <const S extends RouteSchema>(s: S): ParamDefSchema<S> => ({ from: 'schema', schema: s })

export type ValidatedRequest<S extends RouteSchema> = {
  params:  S extends { params: infer P extends TSchema } ? Static<P> : unknown;
  query:   S extends { querystring: infer Q extends TSchema } ? Static<Q> : unknown;
  headers: S extends { headers: infer H extends TSchema } ? Static<H> : unknown;
  body:    S extends { body: infer B extends TSchema } ? Static<B> : unknown;
}

type ExtractFromDefs<Defs extends ParamDefRaw<any>[]> = {
  [K in keyof Defs]:
    Defs[K] extends ParamDefSchema<infer S> ? ValidatedRequest<S> :
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
    case 'schema':
      return {
        params: request.params,
        query: request.query,
        headers: request.headers,
        body: request.body,
      };
  }
}
