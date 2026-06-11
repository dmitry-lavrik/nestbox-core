import { METADATA_DI } from "./decorators.js";
import { Reflector } from "./reflector.js";

export type Constructor<T> = new (...args: any[]) => T
export interface Token<_> extends Symbol{}
export type TokensUnion<T> = Constructor<T> | Token<T>

export function createToken<T>(description?: string) : Token<T>{
  return Symbol(description)
}

export class Container{
  protected instances = new Map<TokensUnion<unknown>, unknown>();
  protected factories = new Map<TokensUnion<unknown>, (c: Container) => unknown>();
  protected resolving = new Set<TokensUnion<unknown>>;

  resolve<T>(token: TokensUnion<T>) : T{
    if(this.instances.has(token)){
      return this.instances.get(token) as T;
    }

    if(this.resolving.has(token)){
      throw new Error('Circilar deps \n' + [...this.resolving, token])
    }

    this.resolving.add(token);

    const factory = this.factories.get(token);

    if(factory){
      const instance = factory(this) as T;
      this.instances.set(token, instance);
      this.factories.delete(token);
      this.resolving.delete(token);
      return instance;
    }

    if(typeof token !== 'function'){
      throw new Error(`${token} is symbol but has not factory`);
    }

    const meta = Reflector.get<Constructor<any>[] | undefined>(METADATA_DI, token);

    if(meta === undefined && token.length > 0){
      throw new Error(token.name + ' have constructor Params, but have not @Injectable!');
    }

    if(meta && meta.length < token.length){
      throw new Error(token.name + ', @Injectable(HERE_LESS_PARAMS) than contructor(HERE)');
    }

    const deps = (meta ?? []).map((dep: Constructor<any>) => this.resolve(dep));
    const instance = new token(...deps);
    this.instances.set(token, instance);
    this.resolving.delete(token);
    return instance;
  }

  bind<T>(token: TokensUnion<T>, factory: (c: Container) => T){
    this.factories.set(token, factory);
  }
}
