import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('existing navigation remains runnable without another test resolver', () => {
  const archivo = fileURLToPath(new URL('../horarios-externos/permisos.test.mjs', import.meta.url));
  const entorno = { ...process.env };
  delete entorno.NODE_TEST_CONTEXT;
  const resultado = spawnSync(process.execPath, [
    '--experimental-transform-types', '--test', '--test-name-pattern=rendered navigation', archivo,
  ], { encoding: 'utf8', env: entorno });
  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
});
