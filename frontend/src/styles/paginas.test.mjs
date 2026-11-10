import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';

const clasesCompartidas = [
  'pagina', 'cabecera', 'filtros', 'campos', 'acciones', 'accionPrincipal',
  'accionSecundaria', 'ayudaTabla', 'estado', 'error', 'soloLectores',
];

test('las clases comunes se exportan desde estilos y Asignaturas conserva sus composiciones privadas', async contexto => {
  const raizTemporal = process.env.OPENCODE_TMPDIR ?? tmpdir();
  await mkdir(raizTemporal, { recursive: true });
  const temporal = await mkdtemp(join(raizTemporal, 'paginas-css-'));
  contexto.after(() => rm(temporal, { recursive: true, force: true }));
  const entrada = join(temporal, 'entrada.mjs');
  const rutaAsignaturas = fileURLToPath(new URL('../features/asignaturas/Asignaturas.module.css', import.meta.url)).replaceAll('\\', '/');
  const rutaPaginas = fileURLToPath(new URL('./paginas.module.css', import.meta.url)).replaceAll('\\', '/');
  await writeFile(entrada,
    `import asignaturas from ${JSON.stringify(rutaAsignaturas)}; import paginas from ${JSON.stringify(rutaPaginas)}; export default { asignaturas, paginas };`, 'utf8');
  const resultado = await build({
    configFile: false, root: temporal, publicDir: false, logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: { entry: entrada, name: 'EstilosPaginasPrueba', formats: ['iife'], fileName: 'estilos-paginas-prueba' },
    },
  });
  const salidas = (Array.isArray(resultado) ? resultado[0] : resultado).output;
  const programa = salidas.find(salida => salida.type === 'chunk');
  assert.ok(programa);
  const entorno = {};
  runInNewContext(programa.code, entorno);
  const { asignaturas, paginas } = entorno.EstilosPaginasPrueba;
  assert.deepEqual(Object.keys(paginas).sort(), [...clasesCompartidas].sort());
  for (const clase of clasesCompartidas) {
    const compuestas = asignaturas[clase]?.split(/\s+/) ?? [];
    assert.ok(compuestas.includes(paginas[clase]), `${clase}: conserva el estilo compartido`);
    assert.equal(compuestas.length, 2, `${clase}: conserva también su clase local`);
  }
  for (const clase of ['tabla', 'panel', 'contextoSecciones', 'tablaAsignaciones']) {
    assert.ok(asignaturas[clase], `${clase}: permanece en Asignaturas`);
    assert.equal(clase in paginas, false);
  }
  const css = salidas.filter(salida => salida.type === 'asset' && salida.fileName.endsWith('.css'))
    .map(salida => typeof salida.source === 'string' ? salida.source : Buffer.from(salida.source).toString('utf8')).join('\n');
  const cabeceraLocal = asignaturas.cabecera.split(/\s+/).find(clase => clase !== paginas.cabecera);
  const selectorPanel = `.${cabeceraLocal}.${asignaturas.cabeceraPanel}`;
  const inicioPanel = css.indexOf(selectorPanel);
  assert.ok(inicioPanel >= 0, 'la cabecera del panel prevalece sobre la cabecera compartida');
  const reglaPanel = css.slice(inicioPanel, css.indexOf('}', inicioPanel));
  assert.match(reglaPanel, /align-items:\s*center/);
});

test('las otras funcionalidades consumen los estilos comunes sin depender del CSS de Asignaturas', async () => {
  for (const ruta of [
    '../features/administracion-periodos/AdministracionPeriodosPage.tsx',
    '../features/administracion-periodos/VistaPeriodo.tsx',
    '../features/horarios-externos/HorariosExternosPage.tsx',
    '../features/horarios-externos/ResumenDepartamentos.tsx',
    '../features/seguimiento-disponibilidad/SeguimientoDisponibilidadPage.tsx',
  ]) {
    const fuente = await readFile(new URL(ruta, import.meta.url), 'utf8');
    assert.match(fuente, /import\s+base\s+from\s+['"]\.\.\/\.\.\/styles\/paginas\.module\.css['"]/, ruta);
    assert.doesNotMatch(fuente, /asignaturas\/Asignaturas\.module\.css/, ruta);
  }
});
