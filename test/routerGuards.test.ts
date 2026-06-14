import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Controller, Get, nestbox } from '../index.js';

// A base controller that carries a decorated route. Controller inheritance is
// deliberately unsupported, so a child extending this must fail loud rather than
// silently dropping the inherited route.
@Controller('base')
class BaseRouteController {
  @Get('/inherited')
  inherited() {
    return { ok: 'inherited' };
  }
}

@Controller('child')
class ChildController extends BaseRouteController {
  @Get('/own')
  own() {
    return { ok: 'own' };
  }
}

test('a controller inheriting a decorated route throws at setup', async () => {
  const app = Fastify();

  // The throw happens inside collectRoutes, which avvio runs during app.ready(),
  // so setup() rejects.
  await assert.rejects(
    nestbox({ app, controllers: [ChildController] }).setup(),
    /Controller inheritance is not supported/,
  );

  await app.close();
});

// A class with routes but no @Controller decorator: prefix metadata is absent,
// which previously produced a "/undefined/..." mount. Must fail loud instead.
class UndecoratedController {
  @Get('/orphan')
  orphan() {
    return { ok: 'orphan' };
  }
}

test('a class without @Controller throws at setup', async () => {
  const app = Fastify();

  await assert.rejects(
    nestbox({ app, controllers: [UndecoratedController] }).setup(),
    /is missing the @Controller decorator/,
  );

  await app.close();
});

// Two controllers produce the exact same method+url. We detect the collision
// before Fastify does and name both controllers in the error.
@Controller('dup')
class DupAController {
  @Get('/x')
  x() {
    return { from: 'A' };
  }
}

@Controller('dup')
class DupBController {
  @Get('/x')
  x() {
    return { from: 'B' };
  }
}

test('a duplicate method+url across controllers throws naming both controllers', async () => {
  const app = Fastify();

  await assert.rejects(
    nestbox({ app, controllers: [DupAController, DupBController] }).setup(),
    (err: Error) => {
      assert.match(err.message, /Duplicate route GET \/dup\/x/);
      assert.match(err.message, /DupAController/);
      assert.match(err.message, /DupBController/);
      return true;
    },
  );

  await app.close();
});

test('a route decorator on a symbol-named method throws at decoration', () => {
  const handlerSymbol = Symbol('handler');

  assert.throws(
    () => {
      @Controller('symbol')
      class SymbolController {
        @Get('/')
        [handlerSymbol]() {
          return { ok: 'symbol' };
        }
      }

      return SymbolController;
    },
    /symbol-named methods/,
  );
});