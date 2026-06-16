import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  Controller, Get, Injectable, Params, custom, nestbox,
  type ParamResolver,
} from '../index.js';

/**
 * Characterizes the `custom()` escape hatch: a consuming app builds its own
 * @Params helper without extending the core's `from` union. Models the real
 * `bouncer()` case — pull the user off the request, resolve a guard from the
 * container, hand the handler the result.
 */

class User {
  constructor(public readonly name: string) {}
}

@Injectable([])
class Bouncer {
  check(user: User) {
    return `welcome ${user.name}`;
  }
}

// The user-defined helper, built entirely outside the core on top of custom().
const bouncer = (): ReturnType<typeof custom<string>> =>
  custom((request, _reply, container) => {
    const user = (request as any).user as User;
    return container.resolve(Bouncer).check(user);
  });

// A helper that resolves asynchronously, to prove async resolvers are awaited.
const asyncGreeting = (): ReturnType<typeof custom<string>> =>
  custom(async (request) => {
    const user = (request as any).user as User;
    return Promise.resolve(`async ${user.name}`);
  });

@Controller('guard')
class GuardController {
  @Get('/sync')
  @Params(bouncer())
  syncRoute(greeting: string) {
    // `greeting` is typed as string, inferred from the custom resolver.
    return { greeting };
  }

  @Get('/async')
  @Params(asyncGreeting())
  asyncRoute(greeting: string) {
    return { greeting };
  }
}

function appWithUser() {
  const app = Fastify();
  // Stand in for an auth hook that populates request.user.
  app.addHook('onRequest', async (req) => {
    (req as any).user = new User('ada');
  });
  return app;
}

test('custom() resolver injects a value built from the request and container', async () => {
  const app = appWithUser();
  await nestbox({ app, controllers: [GuardController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/guard/sync' })).json();

  assert.deepEqual(body, { greeting: 'welcome ada' });

  await app.close();
});

test('an async custom() resolver is awaited before the handler runs', async () => {
  const app = appWithUser();
  await nestbox({ app, controllers: [GuardController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/guard/async' })).json();

  assert.deepEqual(body, { greeting: 'async ada' });

  await app.close();
});

// Type-level check: ParamResolver is exported and usable for a typed helper.
const _typedResolver: ParamResolver<number> = () => 1;
void _typedResolver;
