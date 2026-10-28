import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificaciones } from './notificaciones.ts';
import { toast } from 'sonner';

test('all shared notices provide Sonner five seconds, explicit close and stable optional IDs', () => {
  const ids = [];
  for (const tipo of ['exito', 'error', 'advertencia']) {
    for (const id of [undefined, `aviso-${tipo}`, 100 + ids.length]) {
      const devuelto = notificaciones[tipo](`Mensaje ${tipo}`, id); ids.push(devuelto);
      if (id !== undefined) assert.equal(devuelto, id);
      const aviso = toast.getHistory().find(aviso => aviso.id === devuelto);
      assert.equal(aviso.title, `Mensaje ${tipo}`);
      assert.equal(aviso.type, { exito: 'success', error: 'error', advertencia: 'warning' }[tipo]);
      assert.equal(aviso.duration, 5000); assert.ok(Number.isFinite(aviso.duration));
      assert.equal(aviso.closeButton, true);
    }
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('cerrar delegates the supplied string or numeric ID without altering other notices', () => {
  const original = toast.dismiss; const llamadas = [];
  try {
    toast.dismiss = id => { llamadas.push(id); return id; };
    for (const id of ['aviso-error', 42]) assert.equal(notificaciones.cerrar(id), id);
    assert.deepEqual(llamadas, ['aviso-error', 42]);
  } finally { toast.dismiss = original; }
});
