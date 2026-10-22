import test from 'node:test';
import assert from 'node:assert/strict';

test('JSON requests retain headers, credentials, body and successful responses', async () => {
  const { api } = await import('./api.ts');
  const anterior = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opciones) => {
      assert.equal(url, 'http://localhost:3000/api/asignaturas');
      assert.equal(opciones.credentials, 'include');
      assert.equal(opciones.headers.get('Content-Type'), 'application/json');
      assert.equal(opciones.headers.get('Accept'), 'application/json');
      assert.equal(opciones.body, '{"nombre":"Course"}');
      return Response.json({ status: 'success' });
    };
    assert.deepEqual(await api('/asignaturas', { method: 'PUT', body: '{"nombre":"Course"}' }), { status: 'success' });
  } finally { globalThis.fetch = anterior; }
});
test('multipart leaves its boundary to fetch and retains structured import failures', async () => {
  const { api, ApiError } = await import('./api.ts');
  const anterior = globalThis.fetch;
  const detalle = { status: 'error', errores: [{ fila: 2, columna: 'Cupos', valor: '-1' }], data: { cobertura: [] } };
  const archivo = new FormData(); archivo.append('archivo', new Blob(['file']), 'horarios.xlsx');
  try {
    globalThis.fetch = async (_, opciones) => {
      assert.equal(opciones.headers.has('Content-Type'), false);
      assert.equal(opciones.body, archivo);
      return Response.json(detalle, { status: 400 });
    };
    await assert.rejects(api('horarios/excel/externos/importar', { method: 'POST', body: archivo }), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, 400);
      assert.deepEqual(error.detalle, detalle); return true;
    });
  } finally { globalThis.fetch = anterior; }
});
test('existing API error messages and no-content responses remain unchanged', async () => {
  const { api, ApiError } = await import('./api.ts');
  const anterior = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ message: 'Previous error' }, { status: 403 });
    await assert.rejects(api('asignaturas'), error => error instanceof ApiError && error.message === 'Previous error' && error.status === 403);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(await api('asignaturas/A', { method: 'DELETE' }), undefined);
  } finally { globalThis.fetch = anterior; }
});
