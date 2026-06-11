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

export function getApiTag(controller: Constructor<unknown>): ApiTagDefinition | undefined {
  return Reflector.get<ApiTagDefinition | undefined>(METADATA_API_TAG, controller);
}

export function getApiOperation(handler: (...args: any[]) => any): ApiOperationDefinition | undefined {
  return Reflector.get<ApiOperationDefinition | undefined>(METADATA_API_OPERATION, handler);
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
