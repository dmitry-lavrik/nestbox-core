import { Constructor } from '../container.js';

export const METADATA_CONTROLLER_PREFIX = Symbol('CONTROLLER_PREFIX');

export function Controller(prefix = '') {
  return function<T>(value: Constructor<T>, _ctx: ClassDecoratorContext){
    (value as any)[METADATA_CONTROLLER_PREFIX] = prefix;
    return value;
  };
}
