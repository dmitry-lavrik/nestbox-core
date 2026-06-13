import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  ApiSecurity,
  Container,
  Controller,
  Get,
  registerControllerRouter,
} from '../index.js';

@Controller('secured')
@ApiSecurity({ bearerAuth: [] })
class SecuredController {
  @Get('/default')
  defaultRoute() {
    return {};
  }

  @Get('/override')
  @ApiSecurity({ apiKey: [] })
  overrideRoute() {
    return {};
  }

  @Get('/public')
  @ApiSecurity()
  publicRoute() {
    return {};
  }
}

@Controller('open')
class OpenController {
  @Get('/plain')
  plain() {
    return {};
  }
}

test('@ApiSecurity attaches per-route security with controller default, override and opt-out', async () => {
  const app = Fastify();
  const captured: any[] = [];

  app.addHook('onRoute', route => {
    captured.push(route);
  });

  registerControllerRouter(app, [SecuredController, OpenController], new Container());
  await app.ready();

  const find = (url: string) => captured.find(r => r.url === url);

  const defaultRoute = find('/secured/default');
  const overrideRoute = find('/secured/override');
  const publicRoute = find('/secured/public');
  const plainRoute = find('/open/plain');

  assert.ok(defaultRoute, 'route inheriting the controller default is registered');
  assert.deepEqual(
    defaultRoute.schema.security,
    [{ bearerAuth: [] }],
    'route with no @ApiSecurity inherits the controller-level requirement',
  );

  assert.ok(overrideRoute, 'route with its own @ApiSecurity is registered');
  assert.deepEqual(
    overrideRoute.schema.security,
    [{ apiKey: [] }],
    'route-level @ApiSecurity overrides the controller default',
  );

  assert.ok(publicRoute, 'opted-out route is registered');
  assert.deepEqual(
    publicRoute.schema.security,
    [],
    'empty @ApiSecurity() opts the route out of the inherited default',
  );

  assert.ok(plainRoute, 'route on a controller with no @ApiSecurity is registered');
  assert.equal(
    plainRoute.schema?.security,
    undefined,
    'no @ApiSecurity anywhere leaves security unset',
  );

  await app.close();
});
