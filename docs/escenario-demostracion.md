# Escenario ficticio de demostración

El escenario se comprobó mediante un ensayo automatizado aislado y un recorrido manual de la aplicación, ambos con **resultados sintéticos en lugar de Julia**. La reproducción automática no utiliza la base de desarrollo y elimina su entorno al terminar. El recorrido manual posterior utilizó datos ficticios cargados en la base local normal, tras autorización específica para reemplazar sus datos descartables. Ninguna de estas comprobaciones acredita el optimizador real ni el alojamiento universitario.

## Ejecutar el ensayo aislado

Requiere Node y las dependencias del proyecto ya instaladas, además de los binarios de PostgreSQL 18. No instala herramientas ni usa Docker. Antes de ejecutarlo, autorizar expresamente este destino y sus efectos:

- Cluster nuevo, usuario y contraseña sintéticos, base `demo_tesis_fase2`, exclusivamente en `127.0.0.1:55432`.
- Directorio temporal externo `tesis-fase2-*`, dentro de `opencode` bajo el temporal del sistema en Windows. No reutiliza un directorio ni credenciales existentes.
- Inicialización, migraciones desde vacío y datos ficticios explícitos, sin ejecutar la seed común. Las planillas se construyen y leen en memoria.
- HTTP propio en otro puerto efímero de `127.0.0.1`. No contacta servicios de desarrollo, servidores universitarios ni Julia.
- Detención exclusiva del cluster creado y eliminación de sus temporales al terminar, incluso tras errores controlados. Ante fallo de detención conserva el directorio e informa su ubicación, no borrar datos de un proceso que siga activo.

Desde la raíz, **solo después de autorizar esos efectos**:

```bash
node scripts/verificar-demostracion.mjs --autorizar-entorno-efimero
```

En Windows busca PostgreSQL en `C:/Program Files/PostgreSQL/18/bin`. Si está en otra ubicación, indicar los binarios existentes, sin instalar:

```bash
node scripts/verificar-demostracion.mjs --autorizar-entorno-efimero --bin-postgres "ruta/al/bin/de/PostgreSQL/18"
```

Si el puerto está ocupado, termina sin conectar a su ocupante. Si fallan las migraciones, termina sin modificar el historial SQL. No ejecutar el comando general de integración como sustituto: sus guardas y destino son distintos. El ensayo sustituye únicamente configuración/conexión dentro del test y el proceso Julia, no los repositorios, la autenticación ni las reglas de negocio. Comprueba mediante SQL la base, el usuario, la dirección, el puerto y el directorio del cluster antes de migrar.

## Datos y guion

La fuente reproducible es [`backend/tests/demostracion/escenario.test.ts`](../backend/tests/demostracion/escenario.test.ts). El período es `2099-2`, marcado actual y creado mediante la API de administración. Los nombres personales y asignaturas son inventados. Los códigos `A101AA` y `A102AA` respetan la clasificación cerrada de salas del prototipo, sus capacidades de 90 y la cantidad utilizada son valores del fixture, no una medición ni una declaración institucional.

| Paso | Actor y preparación | Resultado esperado |
| --- | --- | --- |
| 1. Acceso | Cuentas ficticias `admin`, `secretaria`, `ajena`, `docente` y `docente2` en `example.test` | Login real y cookies, sin sesiones persistidas nuevas |
| 2. Período | Administración crea ICINF `2099-2` | Actual, en Preparación, secretaría no puede crearlo |
| 3. Oferta | Secretaría crea `DEMO101` y `DEMO301`, sección 1, 30 cupos, dos bloques teóricos por asignatura | Cada oferta queda asignada a su docente del departamento gestionado |
| 4. Disponibilidad | Cada docente declara lunes B1–B2 y B5–B8 | Doce registros propios, seguimiento consultable por secretaría |
| 5. Externos | Secretaría importa `DEMOEXT` del departamento externo, RUT ficticio `12.345.678-5`, lunes B3–B4 | Una oferta y dos bloques externos, sin sala, `Sala N` se ignora |
| 6. Propuesta sintética | El test entrega una salida explícita al doble de `ejecutarJulia` | `DEMO101` lunes 08:10–09:30 y `DEMO301` lunes 11:10–12:30, cuatro bloques gestionados, estado Propuesta |
| 7. Revisión y salas | Secretaría consulta las tres sesiones, descarga y completa el Excel de propuesta | Solo dos filas gestionadas solicitan sala, se asigna `A101AA` a ambas en horarios distintos |
| 8. Publicación | Secretaría valida y confirma con la revisión actual | Sin problemas bloqueantes, estado Publicado y posteriores escrituras rechazadas |
| 9. Consulta y exportación | Docente consulta solo su oferta, secretaría las seis entradas y descarga Excel general | Dos bloques propios para el primer docente y tres filas en el Excel general, además de la cabecera |

El fixture usa una contraseña ficticia exclusiva del test, definida junto a las cuentas en el archivo citado. No son accesos de un servicio desplegado. Los archivos y cuentas desaparecen con el cluster al finalizar.

El orden de pantallas para la presentación es: Administración de períodos → Asignaturas y secciones → Mi disponibilidad, con cada docente → Horarios externos → Resultados de horarios → asignación de salas → publicación → Mi horario. Las descargas de solicitud y pendientes se realizan desde Resultados. El arnés automático no deja datos cargados para navegar, preparar un destino manual requiere autorización específica. No trasladar los mocks de pruebas a producción.

## Recorrido manual confirmado

La persona que operó la aplicación confirmó los pasos siguientes durante el ensayo guiado. Esta evidencia es manual, no una ejecución automatizada de todas las pantallas.

| Área | Comprobación realizada |
| --- | --- |
| Asignaturas y oferta | Período actual en Preparación, tres asignaturas ficticias, secciones, cupos y docentes esperados, catálogo de solo lectura para secretaría |
| Disponibilidad | Consulta de los docentes y seguimiento de secretaría, edición explícita y cancelación que conserva lo enviado |
| Horarios externos | Reimportación válida sin duplicación y rechazo de un lote con RUT ausente, conservando la carga anterior |
| Resultados | Consulta de la propuesta sintética por semestre de malla y detalle de las sesiones |
| Excel con varias sesiones | Dos sesiones de `DEMO101`, con la misma sección, docente y tipo de hora, exportadas en una sola fila |
| Salas y atomicidad | Rechazo de celdas vacías y de un libro con una sala inexistente, sin aplicar sus asignaciones válidas |
| `SIN SALA` | Importación aceptada con sesiones pendientes, publicación bloqueada mientras faltan salas |
| Asignación parcial | Dos sesiones asignadas y una pendiente, exportación exclusiva de esa sesión y posterior asignación sin perder las anteriores |
| Roles y carrera | Administración consulta sin operar, una secretaría de otra carrera no accede al período de ICINF |
| Publicación | Estado Publicado persistente tras actualizar, sin controles para modificar, importar o descartar |
| Consulta docente | Cada docente ve únicamente sus clases, horarios y salas, sin controles de modificación |

Para comprobar la agrupación se amplió la carga ficticia de `DEMO101` a cuatro bloques, distribuidos los lunes de 08:10 a 09:30 y de 12:40 a 14:00. La propuesta sintética se volvió a validar e incorporar, conservando el horario externo. No se modificó el exportador ni se ejecutó Julia. `DEMO301` conserva su sesión de 11:10 a 12:30, las tres sesiones gestionadas quedaron en `A101AA`, en horarios distintos.

Una consulta operativa de lectura al cierre confirmó `2099-2` en Publicado, cuatro sesiones totales, tres gestionadas con sala, una externa y cero pendientes. La preparación del período y de la propuesta se realizó con herramientas locales, su creación no se presenta como una acción manual del navegador. Las pruebas automatizadas continuaron usando su entorno aislado, no la base local normal.

## Casos que deben conservar el estado

El ensayo compara una huella de todas las filas de las tablas públicas antes y después de los rechazos, incluidas ofertas, asignaciones, disponibilidad, horarios y estado del período. No afirma inmutabilidad de secuencias internas PostgreSQL.

- Sin autenticación, rol docente en resultados, secretaría de otra carrera y operaciones administrativas intentadas por secretaría.
- Administración intentando crear ofertas o publicar, y secretaría intentando declarar disponibilidad docente o un docente suplantando a otro mediante campos adicionales.
- Archivo corrupto, extensión inválida y un lote externo cuya primera fila es válida pero otra carece de RUT. No se aplica parcialmente la primera fila.
- Dos secciones externas con el mismo docente y bloques, movimiento hacia horarios externos y movimiento hacia una sala ocupada.
- Planilla de salas con una fila válida y otra desconocida o vacía, y revisión anterior tras cambiar salas.
- Publicación con carga todavía pendiente o salas sin asignar, y modificaciones posteriores a publicar.

### `SIN SALA` y los dos Excel

En la **propuesta**, una celda vacía para una sesión pendiente es error. `SIN SALA` es una decisión explícita aceptada, conserva `sala_id = null` y la sesión continúa pendiente. No habilita la publicación de una sesión gestionada que requiere sala, puede completarse después.

El Excel de salas tiene 25 columnas. El de externos tiene 26, añade `RUT Profesor` antes de `Profesor`, y sus columnas `Sala N` se ignoran. Los encabezados exactos están en `backend/src/utils/excel/excel-salas.ts` y `excel-horarios-externos.ts`.

La exportación de propuesta incluye solo las sesiones gestionadas solicitables. La exportación general posterior también incluye la externa de este caso. Ambas dejan `Sala N` vacía deliberadamente, son archivos de intercambio para completar, **no informes de las salas actualmente asignadas**. El ensayo completa e importa el archivo realmente descargado de la propuesta. No intercambiar estos endpoints ni atribuir a las rutas antiguas la semántica de pendientes de la propuesta, véase [gestión de resultados](gestion-resultado-horarios.md).

## Evidencia y límites

El ensayo focal pasó sus dos pruebas: migraciones desde vacío y recorrido completo HTTP/SQL con resultados sintéticos. Durante su preparación se corrigieron problemas del arnés de Windows y expectativas del fixture, sin modificar la aplicación. Cinco pruebas frontend heredadas también reprodujeron expectativas antiguas de URLs absolutas, se ajustaron a `/api` sin cambiar el transporte de producción.

El ensayo visual posterior detectó duplicación de la tarjeta de salas al revisar la publicación. La causa era una colisión de claves React entre el formulario de salas y el diálogo de publicación. La corrección distingue esas claves y conserva su vínculo con la revisión actual. Una regresión de navegador reproduce el flujo con respuestas sintéticas, sin backend ni base real:

```bash
node --test frontend/src/features/resultados-horarios/salas.navegador.test.mjs
```

Requiere Edge o Chromium ya instalado, admite `NAVEGADOR_PRUEBAS` para indicar su ejecutable y no descarga herramientas. Usa perfil temporal externo, compilación en memoria y bloqueo de peticiones ajenas al servidor sintético local. Comprueba un único título y formulario de salas al abrir y cerrar publicación, rechazar una importación y aceptar `SIN SALA` con revisión igual o distinta. No prueba el parser Excel ni la persistencia, esos casos pertenecen al ensayo backend. No se añade a los comandos habituales ni a la selección local sin navegador.

Comprobaciones complementarias y omisiones de base: [verificación local](verificacion-local.md). La guarda de conexión de producción, las políticas de rol/carrera, JWT simplificado y el modelo matemático permanecen sin cambios.

La verificación independiente final se ejecutó en una copia externa autónoma, con el código y los temporales separados. Se reutilizaron las dependencias instaladas sin instalar paquetes ni mantener enlaces al repositorio original. Los intentos previos con dependencias incompletas o temporales dentro de la raíz del código fallaron por el aislamiento, no por defectos reproducidos de la aplicación. Esos problemas se resolvieron antes de obtener los resultados siguientes.

| Comprobación | Resultado observado |
| --- | --- |
| Regresión Node de ambos arneses y soporte Vite | 10/10, salida 0 |
| Frontend, selección segura de 40 archivos | 518/518, salida 0 |
| Backend, selección segura de 15 archivos | 334/334, salida 0 |
| Tipos backend y frontend, sin emisión | Salida 0 en ambos |
| Ensayo PostgreSQL/HTTP desde vacío | 2/2, salida 0 |
| Regresión de duplicación de salas en Edge, después de la corrección | 1/1, salida 0, un único título y formulario tras cada transición |

Los probes independientes también comprobaron rechazo sin autorización, rechazo con puerto ocupado y limpieza del cluster tras un fallo controlado. No se añadieron nuevos probes de negocio a los casos del ensayo durante la verificación independiente. Vitest conserva un aviso de deprecación de `envFile` que no impide ejecutar las pruebas.

**Pendiente:** generación real con Julia, medición de recursos y aceptación del optimizador en fase 3. También quedan el alojamiento sin Docker y la comprobación desde la red universitaria. El transporte normal es HTTP con ejecución compilada, según la [configuración vigente](configuracion-demostracion.md), HTTPS no es un requisito de este alcance. El recorrido manual confirmado y el valor `optimo` del fixture no constituyen evidencia de optimalidad real. La integración de los cambios en `main` corresponde a una entrega separada, no queda acreditada por este ensayo.
