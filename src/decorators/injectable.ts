import { type TokensUnion } from '../container.js';

type ConstructorList<Deps extends any[]> = {
  [K in keyof Deps]: TokensUnion<Deps[K]>
}

export const METADATA_DI = Symbol('DI');

export function Injectable<Deps extends any[] = []>(deps?: ConstructorList<Deps>){
  return function<T extends new (...agrs: Deps) => any>(value: T, _ctx: ClassDecoratorContext) : T{
    (value as any)[METADATA_DI] = deps;
    return value;
  };
}
