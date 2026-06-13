import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance, type onRequestHookHandler } from 'fastify';
import { Constructor, Controller, Get, Hooks, nestbox } from '../index.js';

// Auth emulator: pass through only when the authorization header is exactly '1',
// otherwise short-circuit with 401.
const auth: onRequestHookHandler = (req, reply, done) => {

  if(req.headers.authorization !== '1'){
    reply.code(401).send({ message: 'unauthorized' });
    return;
  }

  done();
};

@Controller('guarded')
@Hooks({ onRequest: auth })
class GuardedController {
  @Get('/a')
  a() {
    return { ok: 'a' };
  }

  @Get('/b')
  b() {
    return { ok: 'b' };
  }
}

@Controller('partial')
class PartialController {
  @Get('/open')
  open() {
    return { ok: 'open' };
  }

  @Get('/closed')
  @Hooks({ onRequest: auth })
  closed() {
    return { ok: 'closed' };
  }
}

async function buildApp(controllers: Constructor<any>[]): Promise<FastifyInstance> {
  const app = Fastify();
  await nestbox({ app, controllers }).setup();
  return app;
}

test('controller-level hook guards every route of the controller', async () => {
  const app = await buildApp([GuardedController]);

  assert.equal((await app.inject({ method: 'GET', url: '/guarded/a' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/guarded/b' })).statusCode, 401);

  const okA = await app.inject({ method: 'GET', url: '/guarded/a', headers: { authorization: '1' } });
  const okB = await app.inject({ method: 'GET', url: '/guarded/b', headers: { authorization: '1' } });

  assert.equal(okA.statusCode, 200);
  assert.deepEqual(okA.json(), { ok: 'a' });
  assert.equal(okB.statusCode, 200);

  await app.close();
});

test('method-level hook guards only its own route', async () => {
  const app = await buildApp([PartialController]);

  // No hook on /open → always reachable.
  assert.equal((await app.inject({ method: 'GET', url: '/partial/open' })).statusCode, 200);

  // Hook on /closed → 401 without the header, 200 with it.
  assert.equal((await app.inject({ method: 'GET', url: '/partial/closed' })).statusCode, 401);
  assert.equal(
    (await app.inject({ method: 'GET', url: '/partial/closed', headers: { authorization: '1' } })).statusCode,
    200,
  );

  await app.close();
});

test('controller-level hook does not leak into a sibling controller (scope isolation)', async () => {
  const app = await buildApp([GuardedController, PartialController]);

  // GuardedController has the class-level hook, PartialController does not.
  assert.equal((await app.inject({ method: 'GET', url: '/guarded/a' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/partial/open' })).statusCode, 200);

  await app.close();
});
