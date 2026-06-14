import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Type } from '@sinclair/typebox';
import { Controller, Get, Params, schema, nestbox } from '../index.js';

// Characterizes how a returned object is serialized, pinning the contract that
// outbound stripping is driven by *declaring a response schema*, not by
// `additionalProperties: false` (which is an input-validation concern).

const withResponseSchema = {
  response: {
    200: Type.Object({ id: Type.String() }),
  },
};

const withResponseSchemaNoAdditional = {
  response: {
    200: Type.Object({ id: Type.String() }, { additionalProperties: false }),
  },
};

@Controller('serialize')
class SerializeController {
  // A response schema is present but does NOT set additionalProperties: false.
  @Get('/schema')
  @Params(schema(withResponseSchema))
  schemaOnly() {
    return { id: '1', secret: 'LEAK' };
  }

  // A response schema present WITH additionalProperties: false.
  @Get('/schema-no-additional')
  @Params(schema(withResponseSchemaNoAdditional))
  schemaNoAdditional() {
    return { id: '1', secret: 'LEAK' };
  }

  // No response schema at all.
  @Get('/no-schema')
  noSchema() {
    return { id: '1', secret: 'LEAK' };
  }
}

test('a response schema strips undeclared fields even without additionalProperties: false', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [SerializeController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/serialize/schema' })).json();

  assert.deepEqual(body, { id: '1' }, 'undeclared "secret" is stripped by fast-json-stringify');

  await app.close();
});

test('additionalProperties: false on the response is a no-op (same stripping)', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [SerializeController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/serialize/schema-no-additional' })).json();

  assert.deepEqual(body, { id: '1' }, 'stripping is identical with or without additionalProperties: false');

  await app.close();
});

test('without a response schema the raw object is sent and extra fields leak', async () => {
  const app = Fastify();
  await nestbox({ app, controllers: [SerializeController] }).setup();

  const body = (await app.inject({ method: 'GET', url: '/serialize/no-schema' })).json();

  assert.deepEqual(body, { id: '1', secret: 'LEAK' }, 'no serializer schema → nothing is stripped');

  await app.close();
});
