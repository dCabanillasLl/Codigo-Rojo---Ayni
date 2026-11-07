import assert from 'node:assert/strict';
import test from 'node:test';
import { spreadMapPoints } from '../../src/lib/map-layout.js';
import { listingSymbol, markerHtml, mapSymbols } from '../../src/lib/map-symbols.js';

test('cinco publicaciones en una misma zona conservan cinco marcadores visibles', () => {
  const original = ['publicacion-1', 'solicitud-1', 'solicitud-3', 'solicitud-4', 'solicitud-5'].map(id => ({ id, x: 200, y: 200 }));
  const snapshot = JSON.stringify(original);
  const layout = spreadMapPoints(original);
  assert.deepEqual(layout.map(point => point.id).sort(), original.map(point => point.id).sort());
  assert.equal(new Set(layout.map(point => `${point.x}:${point.y}`)).size, 5);
  for (let first = 0; first < layout.length; first++) {
    assert.equal(layout[first].anchorX, 200);
    assert.equal(layout[first].anchorY, 200);
    for (let second = first + 1; second < layout.length; second++) assert.ok(Math.hypot(layout[first].x - layout[second].x, layout[first].y - layout[second].y) >= 49.99);
  }
  assert.equal(JSON.stringify(original), snapshot, 'La separación visual no modifica las ubicaciones originales');
});

test('puntos aislados mantienen su posición y no se crean marcadores con un listado vacío', () => {
  assert.deepEqual(spreadMapPoints([]), []);
  const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 200, y: 200 }];
  assert.ok(spreadMapPoints(points).every(point => point.x === point.anchorX && point.y === point.anchorY && !point.displaced));
});

test('grupos vecinos y muchas publicaciones no terminan ocultándose unas a otras', () => {
  const points = Array.from({ length: 100 }, (_, index) => ({ id: String(index), x: index < 50 ? 200 : 270, y: 200 }));
  const layout = spreadMapPoints(points);
  assert.equal(layout.length, 100);
  assert.equal(new Set(layout.map(point => point.id)).size, 100);
  for (let first = 0; first < layout.length; first++) {
    for (let second = first + 1; second < layout.length; second++) assert.ok(Math.hypot(layout[first].x - layout[second].x, layout[first].y - layout[second].y) >= 49.99);
  }
});

test('los iconos distinguen el contenido de una oferta o una necesidad', () => {
  assert.equal(listingSymbol({ categoria: 'Alimentos', titulo: 'Pan casero' }, 'product'), 'food');
  assert.equal(listingSymbol({ categoria: 'Reparaciones' }, 'service'), 'repair');
  assert.equal(listingSymbol({ categoria: 'Clases y oficios' }, 'service'), 'learning');
  assert.equal(listingSymbol({ categoria: 'Donación' }, 'help'), 'donation');
  assert.equal(listingSymbol({ categoria: 'Préstamo', titulo: 'Necesito una escalera' }, 'help'), 'repair');
  assert.equal(listingSymbol({ titulo: 'Arreglo bicicletas' }, 'service'), 'bicycle');
  assert.equal(listingSymbol({ titulo: 'Cuido mascotas' }, 'service'), 'animals');
  assert.equal(listingSymbol({ titulo: 'Necesito alimentos', urgencia: 'urgente' }, 'help'), 'urgent');
});

test('los tipos desconocidos de contenido mantienen un icono válido y sus distintivos de producto, servicio o ayuda', () => {
  for (const kind of ['product', 'service', 'help'] as const) {
    assert.equal(listingSymbol({ titulo: '<img src=x onerror=alert(1)>' }, kind), kind);
    for (const symbol of Object.keys(mapSymbols) as (keyof typeof mapSymbols)[]) {
      const html = markerHtml(kind, symbol);
      assert.ok(html.includes('<svg'));
      assert.ok(!html.includes('<img') && !html.includes('onerror') && !html.includes('<script'));
      assert.ok(html.includes(`>${kind === 'product' ? 'P' : kind === 'service' ? 'S' : 'A'}</span>`));
    }
  }
});
