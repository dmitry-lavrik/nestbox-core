import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, METADATA_DI, createToken } from '../index.js';

test('resolve caches a single instance per token', () => {
  class Service {}

  const container = new Container();

  assert.equal(container.resolve(Service), container.resolve(Service));
});

test('bind registers a factory that resolve uses', () => {
  const TOKEN = createToken<number>('answer');
  const container = new Container();

  container.bind(TOKEN, () => 42);

  assert.equal(container.resolve(TOKEN), 42);
});

test('throws on a circular dependency', () => {
  const A = createToken<unknown>('A');
  const B = createToken<unknown>('B');
  const container = new Container();

  container.bind(A, c => c.resolve(B));
  container.bind(B, c => c.resolve(A));

  assert.throws(() => container.resolve(A), /Circ/);
});

test('throws when a class has constructor args but no @Injectable', () => {
  class NeedsDep {
    constructor(_dep: number) {}
  }

  const container = new Container();

  assert.throws(() => container.resolve(NeedsDep), /@Injectable/);
});

test('throws when the @Injectable deps list is shorter than the constructor arity', () => {
  class Short {
    constructor(_dep: number) {}
  }

  // Simulate a deps array that does not cover the constructor arity. The
  // decorator's types would normally forbid this, so we stamp the metadata
  // directly to exercise the runtime guard.
  (Short as any)[METADATA_DI] = [];

  const container = new Container();

  assert.throws(() => container.resolve(Short), /contructor/);
});
