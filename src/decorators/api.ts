import { Constructor } from '../container.js';
import { Reflector } from '../reflector.js';

export const METADATA_API_TAG = Symbol('API_TAG');

export interface ApiTagDefinition {
  name: string;
  description?: string;
}

export function ApiTag(tag: ApiTagDefinition) {
  return function<T>(value: Constructor<T>, _ctx: ClassDecoratorContext){
    (value as any)[METADATA_API_TAG] = tag;
    return value;
  };
}

export const METADATA_API_OPERATION = Symbol('API_OPERATION');

export interface ApiOperationDefinition {
  summary: string;
  description?: string;
  operationId?: string;
}

export function ApiOperation(operation: ApiOperationDefinition) {
  return function<Fn extends (...args: any[]) => any>(fn: Fn, _ctx: ClassMethodDecoratorContext): Fn {
    (fn as any)[METADATA_API_OPERATION] = operation;
    return fn;
  };
}

export const METADATA_API_SECURITY = Symbol('API_SECURITY');

/**
 * One OpenAPI security requirement: a map of security-scheme name → the scopes
 * it requires (an empty array for schemes that take none, e.g. `bearerAuth`).
 * Matches the shape of a Fastify Swagger `schema.security` entry exactly, so it
 * passes straight through.
 */
export type ApiSecurityRequirement = Record<string, string[]>;

/**
 * Declare the OpenAPI security requirement(s) for a route. Works at both levels
 * (like `@Hooks`):
 *  - on a **controller class** → the default requirement for every route of the
 *    controller;
 *  - on a **route method** → applies to that single route, overriding any
 *    controller-level requirement.
 */
export function ApiSecurity(...requirements: ApiSecurityRequirement[]) {
  return function<T>(value: T, _ctx: ClassDecoratorContext | ClassMethodDecoratorContext): T {
    (value as any)[METADATA_API_SECURITY] = requirements;
    return value;
  };
}

export function getApiTag(controller: Constructor<unknown>): ApiTagDefinition | undefined {
  return Reflector.get<ApiTagDefinition | undefined>(METADATA_API_TAG, controller);
}

export function getApiOperation(handler: (...args: any[]) => any): ApiOperationDefinition | undefined {
  return Reflector.get<ApiOperationDefinition | undefined>(METADATA_API_OPERATION, handler);
}

export function getApiSecurity(target: object): ApiSecurityRequirement[] | undefined {
  return Reflector.get<ApiSecurityRequirement[] | undefined>(METADATA_API_SECURITY, target);
}

export function compileApiTags(controllers: Constructor<unknown>[]): ApiTagDefinition[] {
  const byName = new Map<string, ApiTagDefinition>();

  for(const controller of controllers){
    const tag = getApiTag(controller);

    if(!tag){
      continue;
    }

    const existing = byName.get(tag.name);

    if(!existing){
      byName.set(tag.name, { name: tag.name, ...(tag.description ? { description: tag.description } : {}) });
      continue;
    }

    const parts = new Set(existing.description ? existing.description.split('\n') : []);

    if(tag.description){
      parts.add(tag.description);
    }

    existing.description = [...parts].join('\n') || undefined;
  }

  return [...byName.values()];
}
