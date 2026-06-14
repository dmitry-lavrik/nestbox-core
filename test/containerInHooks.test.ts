import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type onRequestHookHandler } from 'fastify';
import { Controller, Get, Hooks, Injectable, nestbox } from '../index.js';

// A plain service that lives in the container. The hook below has no reference
// to it directly — it reaches it through `request.server.nestbox.container`.
@Injectable([])
class TokenService {
  isValid(token: string | undefined): boolean {
    return token === 'secret';
  }
}

// The hook resolves the service from the container exposed on the Fastify
// instance, proving request-time code can use the DI system. Declared as a
// regular `function` (not an arrow) so Fastify binds `this` to the instance —
// both `this.nestbox` and `req.server.nestbox` reach the same decorator.
const guard: onRequestHookHandler = function (req, reply, done) {
  assert.equal(this.nestbox, req.server.nestbox);

  const tokens = this.nestbox.container.resolve(TokenService);

  if(!tokens.isValid(req.headers.authorization)){
    reply.code(401).send({ message: 'unauthorized' });
    return;
  }

  done();
};

@Controller('secure')
@Hooks({ onRequest: guard })
class SecureController {
  @Get('/data')
  data() {
    return { ok: true };
  }
}

test('a hook can resolve a service from the container via request.server.nestbox', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [SecureController] }).setup();

  // The decorator is reachable on the instance itself...
  assert.ok(app.nestbox.container.resolve(TokenService) instanceof TokenService);

  // ...and inside the hook: rejected without the right token, allowed with it.
  const denied = await app.inject({ method: 'GET', url: '/secure/data' });
  assert.equal(denied.statusCode, 401);

  const allowed = await app.inject({
    method: 'GET',
    url: '/secure/data',
    headers: { authorization: 'secret' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(allowed.json(), { ok: true });

  await app.close();
});
