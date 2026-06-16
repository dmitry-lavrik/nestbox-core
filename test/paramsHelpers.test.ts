import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  Controller, Get, Post, Params,
  schema, reply, request, container,
  nestbox, Container,
  type ValidatedRequest,
} from '../index.js';

/**
 * Characterizes the built-in @Params helpers (request/reply/container) and,
 * importantly, schema() combined with reply(). The reply() case is a regression
 * guard: FastifyReply is thenable, so resolving args via Promise.all/await used
 * to chain it into a deadlock (request hung forever, injected reply was
 * undefined).
 */

const loginSchema = {
  body: Type.Object({ name: Type.String() }),
  response: { 200: Type.Object({ token: Type.String() }) },
};
type LoginRequest = ValidatedRequest<typeof loginSchema>;

@Controller('p')
class ParamsController {
  @Get('/request')
  @Params(request())
  reqRoute(req: FastifyRequest) {
    return { url: req.url };
  }

  @Get('/reply')
  @Params(reply())
  replyRoute(resp: FastifyReply) {
    // Manual send through the injected reply.
    resp.send({ sent: 'manual' });
  }

  @Get('/container')
  @Params(container())
  containerRoute(c: Container) {
    return { isContainer: c instanceof Container };
  }

  @Post('/login')
  @Params(schema(loginSchema), reply())
  async login({ body }: LoginRequest, resp: FastifyReply) {
    // Mimic `await reply.jwtSign(...)`: a method that lives on the reply.
    const token = await (resp as any).fakeSign(body.name);
    return { token };
  }
}

test('request() injects the raw FastifyRequest', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [ParamsController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/p/request' })).json();

  assert.deepEqual(body, { url: '/p/request' });

  await app.close();
});

test('reply() injects the raw FastifyReply usable for a manual send', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [ParamsController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/p/reply' })).json();

  assert.deepEqual(body, { sent: 'manual' });

  await app.close();
});

test('container() injects the DI Container', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [ParamsController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/p/container' })).json();

  assert.deepEqual(body, { isContainer: true });

  await app.close();
});

test('schema() + reply() injects the real reply (no thenable deadlock)', async () => {
  const app = Fastify();
  app.decorateReply('fakeSign', function (this: FastifyReply, name: string) {
    return Promise.resolve(`tok-${name}`);
  });

  await nestbox({ app, controllers: [ParamsController] }).setup();

  const res = await app.inject({ method: 'POST', url: '/p/login', payload: { name: 'ada' } });

  assert.equal(res.statusCode, 200, res.payload);
  assert.deepEqual(res.json(), { token: 'tok-ada' });

  await app.close();
});