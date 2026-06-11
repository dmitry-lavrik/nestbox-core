export class Reflector {
  static get<T>(token: symbol, target: object): T {
    return (target as any)[token];
  }

  static has(token: symbol, target: object): boolean {
    return token in target;
  }

  // Instance methods for the injectable use case via constructor(protected reflector: Reflector)
  get<T>(token: symbol, target: object): T {
    return Reflector.get<T>(token, target);
  }

  has(token: symbol, target: object): boolean {
    return Reflector.has(token, target);
  }
}
