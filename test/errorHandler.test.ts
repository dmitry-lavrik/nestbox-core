import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  BadRequestError,
  Container,
  Controller,
  Get,
  NotFoundError,
  Params,
  Post,
  RouteSchema,
  ValidatedRequest,
  registerControllerRouter,
  registerDefaultErrorHandler,
  schema,
} from '../index.js';

const createSchema = {
  body: Type.Object({ name: Type.String() }, { additionalProperties: false }),
} satisfies RouteSchema;

@Controller('err')
class ErrController {
  @Post('/validate')
  @Params(schema(createSchema))
  validate(req: ValidatedRequest<typeof createSchema>) {
    return req.body;
  }

  @Get('/notfound')
  notfound(): unknown {
    throw new NotFoundError('nope');
  }

  @Get('/badreq')
  badreq(): unknown {
    throw new BadRequestError('bad', [{ field: 'x' }]);
  }

  @Get('/boom')
  boom(): unknown {
    throw new Error('kaboom');
  }
}

type Options = Parameters<typeof registerDefaultErrorHandler>[1];

async function buildApp(options: Options): Promise<FastifyInstance> {
  const app = Fastify();
  registerDefaultErrorHandler(app, options);
  registerControllerRouter(app, [ErrController], new Container());
  await app.ready();
  return app;
}

test('validation failure → 400 with passthrough errors by default', async () => {
  const app = await buildApp({});

  const res = await app.inject({ method: 'POST', url: '/err/validate', payload: {} });
  const body = res.json();

  assert.equal(res.statusCode, 400);
  assert.ok(body.message);
  assert.ok(Array.isArray(body.errors), 'errors are the passed-through Fastify validation array');

  await app.close();
});

test('validationErrorStatus overrides the validation status code', async () => {
  const app = await buildApp({ validationErrorStatus: 422 });

  const res = await app.inject({ method: 'POST', url: '/err/validate', payload: {} });

  assert.equal(res.statusCode, 422);

  await app.close();
});

test('validationErrorsMapper reshapes the reported errors', async () => {
  const app = await buildApp({ validationErrorsMapper: () => 'MAPPED' });

  const res = await app.inject({ method: 'POST', url: '/err/validate', payload: {} });

  assert.equal(res.json().errors, 'MAPPED');

  await app.close();
});

test('a thrown HttpError carries its own status and shape', async () => {
  const app = await buildApp({});

  const res = await app.inject({ method: 'GET', url: '/err/notfound' });
  const body = res.json();

  assert.equal(res.statusCode, 404);
  assert.equal(body.code, 'NOT_FOUND');
  assert.equal(body.message, 'nope');

  await app.close();
});

test('a thrown BadRequestError includes its errors field', async () => {
  const app = await buildApp({});

  const res = await app.inject({ method: 'GET', url: '/err/badreq' });
  const body = res.json();

  assert.equal(res.statusCode, 400);
  assert.equal(body.code, 'BAD_REQUEST');
  assert.deepEqual(body.errors, [{ field: 'x' }]);

  await app.close();
});

test('an unknown error falls through to 500', async () => {
  const app = await buildApp({});

  const res = await app.inject({ method: 'GET', url: '/err/boom' });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: 'Internal Server Error' });

  await app.close();
});
