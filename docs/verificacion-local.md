# Verificación local para la demostración

Estas comprobaciones establecen una línea base local, no certifican el servidor universitario ni el funcionamiento integrado de todos los flujos. No ejecutan migraciones, seed, preparación de demostración ni Julia real. Requieren las dependencias ya instaladas, no descargan herramientas.

La fase siguiente tiene un [ensayo HTTP/SQL separado con PostgreSQL efímero y resultados sintéticos](escenario-demostracion.md). Requiere autorización explícita para crear y retirar su propio cluster. No cambia las listas ni los efectos de los comandos de esta guía. Las cinco expectativas frontend antiguas descritas en la línea base inferior se corrigieron en esa fase, se conserva aquí la evidencia histórica de fase 1.

## Comandos desde la raíz

| Comando | Alcance | Efectos previstos |
| --- | --- | --- |
| `node scripts/verificar-local.mjs --listar` | Muestra las listas positivas exactas, sin ejecutar pruebas | Solo lectura |
| `node --test scripts/verificar-local.test.mjs frontend/tests/soporte/vite.test.mjs` | Regresión del selector, entorno hijo, conservación de scripts y aislamiento Vite | Sin aplicación ni base, un servidor SSR sin listener HTTP/WebSocket |
| `node --test scripts/verificar-demostracion.test.mjs` | Prueba aislada de los validadores de demostración: autorización explícita, validación del destino y aislamiento del entorno hijo | No ejecuta el ensayo HTTP/SQL, no arranca PostgreSQL ni ejecuta Julia |
| `pnpm --dir frontend test:transporte` | Cliente API y proxy Vite contra destino HTTP sintético | Servidores loopback efímeros y caché temporal externa |
| `pnpm --dir frontend test:funcionalidades` | 40 archivos seleccionados de `src`, lógica, render y estilos con dobles | Vite/compilación de pruebas en memoria, temporales externos, sin backend real |
| `pnpm --dir backend test:local` | Inventario explícito de validación, autenticación HTTP, CSRF, frontend compilado, Excel y contratos del optimizador con dobles | HTTP local de Supertest, sin PostgreSQL ni proceso Julia real |
| `pnpm --dir frontend test:tipos` | TypeScript de `frontend/src` | Sin emisión de archivos |
| `pnpm --dir backend test:tipos` | TypeScript de `backend/src` | Sin emisión de archivos |

El ejecutor usa el Node actual y los ejecutables instalados en cada paquete. Si falta un archivo o herramienta, termina con error sin instalar. Cada ejecución crea un directorio temporal externo, restringe el entorno heredado y retira ese directorio al finalizar. No hereda `DATABASE_URL`, `JWT_SECRET`, `NODE_OPTIONS` ni `CAPTURAS_INTERFAZ`, deshabilita la habilitación de integraciones. Esto no sustituye una auditoría de imports: las listas positivas son la frontera revisada, no un sandbox del sistema operativo.

El helper `frontend/tests/soporte/vite.mjs` conserva la carga de la configuración React, pero usa el cargador `runner`, caché externa y `envDir:false`. Desactiva vigilancia, WebSocket y descubrimiento automático de dependencias, y mantiene los builds del ensayo CSS en memoria. Así evita el bundle temporal de configuración dentro de `.vite-temp` y el listener WebSocket que Vite puede abrir incluso en modo middleware. El test de transporte sí levanta su proxy y destino sintético en loopback. Supertest usa puertos efímeros de su propio servidor de pruebas, su configuración predeterminada no garantiza bind exclusivo a loopback.

## Por qué se mantienen los comandos habituales

- `pnpm --dir frontend test` conserva `node --test tests/*.test.mjs`. En la base `1f351f7` selecciona un archivo de transporte, no los 42 archivos de `src`. Las peticiones de login, formularios y archivos de ese test van a un servidor sintético, no prueban login real ni importación académica.
- `pnpm --dir backend test` conserva `vitest run`, pero **no es un comando seguro para esta fase**. Su selección general incluye pruebas que requieren PostgreSQL y pueden escribir datos. Tampoco ejecutar `test:excel-externos:integracion`.
- No basta con ampliar el glob frontend: dos archivos necesitan navegador, los restantes tienen requisitos de transformación TypeScript, render y Vite distintos del transporte.

## Selección y omisiones explícitas

La fuente del inventario ejecutable es `scripts/verificar-local.mjs`. Las incorporaciones requieren revisar imports, preparación, llamadas externas y escrituras, no solo el nombre de la prueba.

| Pendiente o excluido | Motivo |
| --- | --- |
| `frontend/src/app/pulido-interfaz.test.mjs` y `frontend/src/components/notificaciones/navegador.test.mjs` | Lanzan navegador y perfil temporal, el primero admite capturas. No forman parte del comando seguro de funcionalidades |
| `frontend/src/features/resultados-horarios/salas.navegador.test.mjs` | Regresión de duplicación de salas, requiere Edge/Chromium instalado, perfil externo y API sintética. Ejecución explícita según docs/escenario-demostracion.md, fuera de la selección local sin navegador |
| `backend/tests/integracion/**` | Requieren base y operaciones persistidas, algunas suites migran y truncan |
| `backend/tests/seed/**` | Fuera del alcance, no se ejecuta seed ni su CLI, tampoco se certifica anonimización |
| Tests backend fuera del inventario explícito | Pendientes de revisión transitiva individual. En particular, `health.test.ts` y `horarios-externos-http.test.ts` alcanzan `app.ts` y la configuración real |
| Build habitual de ambos paquetes | Genera `dist` y puede leer configuración local de Vite, no forma parte del arnés de pruebas. Se verifica aparte al adaptar ejecución productiva, el chequeo de tipos solo no demuestra empaquetado |
| Julia/HiGHS real, Excel con persistencia y recorrido del navegador contra la aplicación | Los dobles y contratos puros no certifican esos flujos integrados |
| HTTP, cookies en navegador del destino y acceso desde la red universitaria | Sin verificación remota, HTTPS no es requisito de alcance |

Los siete archivos Excel seleccionados usan libros en memoria y repositorios/DB simulados. Los cuatro de optimización comprueban validación, contrato matemático, HTTP simulado y manejo de un subproceso simulado. Ninguno resuelve un problema mediante Julia real. Las pruebas de configuración sustituyen `dotenv` y las de conexión sustituyen el cliente PostgreSQL.

## Línea base observada

Base: `1f351f7`. Entorno observado: Windows, Node `22.19.0`, pnpm `11.25.0`, Vite frontend `6.4.4`, TypeScript frontend `5.9.3`, Vitest `5.0.2` y TypeScript backend `7.0.2`. No se modificaron dependencias ni lockfiles. No hay script de formateo configurado en estos paquetes, no se ejecutó un normalizador mutante.

| Comprobación | Resultado observado | Salida |
| --- | --- | --- |
| Arnés del selector y Vite | 7 aprobadas | `0` |
| Transporte frontend | 3 aprobadas | `0` |
| Funcionalidades frontend, 40 archivos | 513 aprobadas, 5 fallidas de 518, sin omitidas | `1` |
| Backend local, 15 archivos | 334 aprobadas, sin omitidas | `0` |
| Tipos frontend y backend | Ambos sin errores | `0` en cada uno |
| Contraste acotado de los cinco fallos en `1f351f7` | Los mismos cinco casos fallan en una copia externa de la base | `1` |

Los cinco fallos ya se reproducen en la base, no fueron introducidos por los cambios de aislamiento. No se cambiaron expectativas ni fuentes de la aplicación para ocultarlos:

- `src/features/disponibilidad/disponibilidad.test.mjs`, caso «API uses only self-service endpoints…»: espera URLs absolutas a `localhost:3000`, recibe rutas `/api/…`.
- `src/features/optimizacion/optimizacion.test.mjs`, caso «API transporta contrato real…»: el doble elimina el prefijo absoluto antiguo, por lo que conserva `/api/` en el registro y no coincide con la expectativa.
- `src/features/resultados-horarios/resultados-horarios.test.mjs`, caso «public API uses only proposal-result endpoints…»: el doble construye `new URL()` con una ruta relativa sin base y produce `ERR_INVALID_URL`.
- `src/lib/api.test.mjs`, casos «JSON requests retain headers…» y «binary downloads retain cookie…»: esperan el origen absoluto antiguo, reciben `/api/…`.

La implementación vigente usa `/api` por defecto, coherente con el test de transporte de mismo origen. Los cinco casos quedan visibles como desajustes de las pruebas respecto de ese contrato, no como certificación de que los flujos funcionales pasaron. La reproducción de base seleccionó únicamente esos cinco casos, sin iniciar Vite, backend ni base de datos, y eliminó la copia externa al terminar.

Durante la construcción del arnés se observó RED por módulos aún inexistentes y luego GREEN. El primer chequeo SSR pasó, pero mostró un error de cierre del escaneo automático de dependencias. Se desactivó ese escaneo innecesario y el recheck de 7 casos terminó sin ese mensaje. Vitest emitió un aviso de obsolescencia de `envFile:false`, se conservó esa opción compatible en su configuración local, no afecta el resultado observado.

## Continuidad para la fase 2

Partir de esta línea base histórica y de sus omisiones, sin volver a diseñar la autenticación integrada. La [configuración vigente](configuracion-demostracion.md) establece HTTP normal con frontend y API compilados en el mismo origen. Antes del ensayo de alojamiento, confirmar restricciones de ejecución y acceso desde la red universitaria, y revisar los datos de referencia sin asumir que todos los registros sean ficticios. Las pruebas en el alojamiento y con datos necesitan autorización propia. No interpretar esta guía como autorización para ejecutar preparación, migraciones o seed.
