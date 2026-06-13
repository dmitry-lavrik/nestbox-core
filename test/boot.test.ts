import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Controller, Get, Injectable, createToken, nestbox } from '../index.js';

interface AppConfig {
  a: number;
}

const CONFIG = createToken<AppConfig>('config');

@Controller('boot')
@Injectable([CONFIG])
class BootController {
  constructor(private readonly config: AppConfig) {}

  @Get('/value')
  getValue() {
    return this.config;
  }
}

test('boot() bindings are resolvable inside a controller', async () => {
  const app = Fastify();

  await nestbox({ app, controllers: [BootController] })
    .boot(c => c.bind(CONFIG, () => ({ a: 1 })))
    .setup();

  const res = await app.inject({ method: 'GET', url: '/boot/value' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { a: 1 });

  await app.close();
});
