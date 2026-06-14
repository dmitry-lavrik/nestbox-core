export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: string;
}

export const METADATA_ROUTES = Symbol('ROUTES');

function createRouteDecorator(method: HttpMethod){
  return (path: string = '/') => {
    return (fn: (...args: any[]) => any, ctx: ClassMethodDecoratorContext) => {

      if(typeof ctx.name === 'symbol'){
        throw new Error(`Route decorators cannot be applied to symbol-named methods (${String(ctx.name)}).`);
      }

      (fn as any)[METADATA_ROUTES] = {
        method,
        path,
        handler: ctx.name
      }

      return fn;
    }
  }
}

export const Get = createRouteDecorator('get');
export const Post = createRouteDecorator('post');
export const Put = createRouteDecorator('put');
export const Patch = createRouteDecorator('patch');
export const Delete = createRouteDecorator('delete');
