import type { RouteShorthandOptions } from 'fastify';
import { Reflector } from '../reflector.js';

export const METADATA_HOOKS = Symbol('HOOKS');

/**
 * The Fastify request/response lifecycle hooks we expose. Names match Fastify's
 * own so we stay with the grain — values reuse Fastify's handler types, which
 * already accept either a single handler or an array of them.
 */
export type HookName =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'preSerialization'
  | 'onSend'
  | 'onResponse'
  | 'onTimeout'
  | 'onError'
  | 'onRequestAbort';

export type HooksMap = Pick<RouteShorthandOptions, HookName>;

/**
 * Attach lifecycle hooks. Works at both levels:
 *  - on a **controller class** → hooks are added to that controller's Fastify
 *    scope (apply to every route of the controller);
 *  - on a **route method** → hooks are merged into that single route's options.
 */
export function Hooks(hooks: HooksMap){
  return function<T>(value: T, _ctx: ClassDecoratorContext | ClassMethodDecoratorContext): T {
    (value as any)[METADATA_HOOKS] = hooks;
    return value;
  };
}

export function getHooks(target: object): HooksMap | undefined {
  return Reflector.get<HooksMap | undefined>(METADATA_HOOKS, target);
}
