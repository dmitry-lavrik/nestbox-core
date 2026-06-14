import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  ApiOperation,
  ApiTag,
  Container,
  Controller,
  Params,
  Post,
  compileApiTags,
  registerControllerRouter,
  RouteSchema,
  ValidatedRequest,
  schema,
} from '../index.js';

const bodySchema = {
  body: Type.Object({ name: Type.String() }, { additionalProperties: false }),
} satisfies RouteSchema;

@Controller('users')
@ApiTag({ name: 'Users', description: 'User operations' })
class UsersController {
  @Post('/')
  @ApiOperation({ summary: 'Create user', operationId: 'createUser' })
  @Params(schema(bodySchema))
  create(req: ValidatedRequest<typeof bodySchema>) {
    return req.body;
  }
}

// Two controllers share a tag name with the same lines in different order. The
// merge must dedup line-by-line on both sides, not add the incoming one whole.
@ApiTag({ name: 'Shared', description: 'a\nb' })
class SharedTagOne {}

@ApiTag({ name: 'Shared', description: 'b\na' })
class SharedTagTwo {}

test('compileApiTags dedups multi-line descriptions regardless of line order', () => {
  const tags = compileApiTags([SharedTagOne, SharedTagTwo]);

  assert.equal(tags.length, 1, 'tags sharing a name collapse to one');
  assert.deepEqual(tags[0].description!.split('\n'), ['a', 'b'], 'lines deduped, no whole-blob leftover');
});

test('schema, @ApiTag and @ApiOperation are attached to the registered route', async () => {
  const app = Fastify();
  const captured: any[] = [];

  app.addHook('onRoute', route => {
    captured.push(route);
  });

  registerControllerRouter(app, [UsersController], new Container());
  await app.ready();

  const route = captured.find(r => r.url === '/users');

  assert.ok(route, 'route is registered at the hand-built /users url');
  assert.deepEqual(route.schema.tags, ['Users']);
  assert.equal(route.schema.summary, 'Create user');
  assert.equal(route.schema.operationId, 'createUser');
  assert.ok(route.schema.body, 'TypeBox body schema is attached');

  await app.close();
});
