# Modelo de optimización del backend

El módulo `backend/src/optimizacion/index.ts` transforma datos del período en una entrada JSON revisada, ejecuta un proceso Julia y verifica su salida sin consultar la base de datos. Conserva la formulación de `Code_v2.ipynb` y `Formulacion_Matematica_HorariosVA.tex`. No crea secciones, docentes, salas físicas ni una selección global de secciones.

## API para la interfaz

Las rutas requieren autenticación y rol `admin` o `secretaria`. La carrera de secretaría se obtiene de su identidad autenticada. Solo se admite ICINF.

| Método y ruta bajo `/api/optimizacion` | Resultado |
|---|---|
| `GET /planificaciones/:id/preparacion` | Admisión, revisión, sugerencias por categoría, diagnóstico y declaración pendiente de laboratorios |
| `POST /planificaciones/:id/ejecuciones` | Inicia o recupera idempotentemente una ejecución, responde `202` |
| `GET /ejecuciones/:id` | Estado, resultado, diagnóstico, revisión, parámetros y fechas |
| `GET /planificaciones/:id/ultima-ejecucion` | Última ejecución de la planificación, o `null` |

El cuerpo de inicio tiene esta forma, los valores son ilustrativos y deben confirmarse para cada ejecución:

```json
{
  "claveIdempotencia": "solicitud-unica-del-cliente",
  "recursos": [
    { "id": "AA-Sala-90", "edificio": "AA", "tipo": "Sala", "capacidad": 90, "cantidad": 1, "fuente": "Disponibilidad confirmada para esta ejecución" },
    { "id": "laboratorios-departamentales", "edificio": "Departamento", "tipo": "Laboratorio", "capacidad": 60, "cantidad": 1, "fuente": "Declaración departamental para esta ejecución" }
  ]
}
```

Las salas deben coincidir con las categorías acreditadas, sin superar el catálogo físico. Para laboratorios se declaran capacidad y cantidad total departamental, sin crear recintos físicos. El backend no impone seis laboratorios ni capacidad 60. La interfaz utiliza el supuesto explícito de capacidad 60 y cantidad inicial 6 editable, enviado y confirmado por ejecución, no como inventario ni seed. Véase [uso de la interfaz](modelo-optimizacion-frontend.md). La clave de idempotencia pertenece a una planificación, repetirla con otros parámetros devuelve conflicto. Una nueva clave no reemplaza la propuesta ni evita la exclusión de otra ejecución activa.

No hay endpoints para aplicar ni reemplazar. Una solución completa, válida y vigente se incorpora automáticamente como Propuesta, nunca como Publicado. La interfaz de ejecución reutiliza la página de resultados, sin añadir una grilla al modelo. Véase [uso de la interfaz](modelo-optimizacion-frontend.md).

## Persistencia, concurrencia e interrupciones

`ejecuciones_optimizacion` conserva entrada efectiva, revisión, versión del modelo, parámetros, salida y diagnóstico. Una restricción única parcial impide dos ejecuciones activas por planificación. Las transacciones de inicio y aplicación siguen el orden carrera → planificación, el cálculo ocurre fuera de ellas.

Durante el cálculo se rechazan las escrituras de entradas y operaciones administrativas que invalidan la planificación. La lectura y navegación permanecen disponibles. Los catálogos compartidos no quedan bloqueados durante Julia, la incorporación comprueba nuevamente la revisión de entradas y toma bloqueos breves de lectura durante su validación final. Cualquier diferencia impide incorporar horarios.

El backend renueva cada 15 segundos un arrendamiento de 120 segundos. Tras una caída, el siguiente inicio o consulta, o el barrido periódico, marca las ejecuciones vencidas como `interrumpida`. La recuperación puede tardar hasta el vencimiento del arrendamiento, no reejecuta el cálculo ni incorpora parciales. Un proceso que perdió el arrendamiento no puede renovar ni aplicar su resultado tardío. Cerrar o recargar el navegador no cancela la tarea del backend. El apagado ordenado sí interrumpe sus hijos Julia.

La aplicación inserta todos los bloques gestionados y cambia a Propuesta en la misma transacción, después de volver a validar carga, restricciones y vigencia. No borra ni sobrescribe externos o publicados. Los bloques generados conservan `ejecucionOptimizacionId` y `categoriaOptimizacionId`, que no es `salaId`. Los movimientos preservan la categoría abstracta de cada bloque y su presupuesto, la asignación física sigue el flujo existente de salas.

Los estados terminales distinguen `aplicada`, `infactible`, `carga_incompleta`, `limite_tiempo`, `error`, `interrumpida` y `datos_desactualizados`. El estado del solver se conserva en la salida, por eso una ejecución `aplicada` puede tener un solver detenido por límite de tiempo sin optimalidad demostrada. En los demás casos la planificación permanece en Preparación y no se persisten bloques parciales.

Para regenerar, el administrador debe reiniciar explícitamente los horarios gestionados y devolver la planificación a Preparación, son operaciones existentes separadas. El reinicio conserva ofertas, docentes y externos cuando se seleccionan los horarios gestionados. Ninguna transición administrativa a Propuesta o Publicado puede eludir los validadores de carga y publicación.

## Integración interna

1. Construir `DatosOptimizacion` desde las ofertas gestionadas y externos del período. El servicio que llama al módulo controla carrera, período, estado y concurrencia.
2. Obtener sugerencias con `prepararCategoriasSalas(salas)`. Confirmar cantidades por ejecución y declarar los laboratorios con capacidad, cantidad total y fuente. Las sugerencias no son disponibilidad garantizada.
3. Llamar a `construirEntradaOptimizacion(datos, { limiteSolverSegundos: 300 })` y conservar la entrada efectiva, su revisión y versión.
4. Ejecutar `await ejecutarJulia(entrada)`. Después, comprobar `validarSalidaOptimizacion(entrada, salida)`, tanto `valida` como `completa` deben ser verdaderas para considerar una incorporación.
5. Antes de incorporar, el servicio debe volver a comprobar revisión, identidad y condiciones administrativas dentro de su transacción. Este módulo no persiste ni publica resultados.

En el apagado ordenado del servidor se debe invocar `cerrarProcesosJulia()`. Importar el módulo no instala manejadores de señales globales.

## Contrato TypeScript y JSON

### Entrada

`construirEntradaOptimizacion(datos: DatosOptimizacion, parametros?: ParametrosOptimizacion): EntradaOptimizacion` lanza un error en español ante datos inconsistentes. No modifica los argumentos.

| Campo de `datos` | Forma |
|---|---|
| `ofertas` | `{ id, asignaturaCodigo, seccion, cupos, semestreMalla, esCritica, requiereSala, componentes }[]` |
| `componentes` | `{ tipoHoraId, tipo: "T" \| "P" \| "L", horas, profesorId: number \| null }[]` |
| `bloques` | `{ id, dia, numeroBloque }[]`, cinco días de lunes a viernes, 16 bloques por día |
| `disponibilidades` | `{ profesorId, bloqueId }[]` |
| `externos` | `{ ofertaId, asignaturaCodigo, seccion, semestreMalla, tipoHoraId, bloqueId, esCritica? }[]` |
| `recursos` | `{ id: string, edificio, tipo: "Sala" \| "Laboratorio", capacidad, cantidad, fuente }[]` |
| `reservas` | `number[]`, IDs de bloques institucionales o de la unidad |

Los IDs de entidades son enteros positivos. Horas, cupos y cantidades son enteros no negativos. Cada componente positivo requiere exactamente un docente, cada tipo aparece una sola vez por oferta. La carga por tipo y el nivel deben coincidir entre secciones de la misma asignatura, como en los parámetros del notebook. `requiereSala=false` con carga positiva es un error visible, no una exclusión silenciosa. Los componentes con cero horas, y las ofertas sin componentes positivos, no producen requerimientos ni faltantes.

La entrada añade `version: 1`, `versionModelo: "notebook-v2-1"`, `revision`, `parametros`, `parejas` y `certificadoPrioridad`. La revisión SHA-256 cubre los datos normalizados, incluidos los de carga cero, parámetros y versión. El orden de lectura de filas no la cambia. Se ordenan por identidad y se eliminan repeticiones de disponibilidades, reservas y registros externos idénticos. Cambios administrativos no representados en estos datos deben verificarse aparte por el servicio.

Cada pareja contiene `{ id, asignaturaA, asignaturaB, status, seccionesA, seccionesB }`, las secciones se identifican por `ofertaId`. Se generan parejas obligatorias de asignaturas distintas del mismo nivel, con `status: 1`. Para cada crítica de nivel n se agrega una pareja flexible con cada asignatura ofertada de nivel n+2, con `status: 0.5`. No se agregan grupos flexibles entre las asignaturas superiores. Los externos aportan secciones y ocupación académica, no disponibilidad ni colisiones docentes de otras carreras, ni consumo de recursos.

### Salida

`ejecutarJulia(entrada, opciones?): Promise<SalidaOptimizacion>` devuelve:

```ts
{
  version: 1,
  revision: string,
  estado: "optimo" | "factible" | "limite_tiempo" | "infactible" | "sin_solucion",
  objetivo: number | null,
  asignaciones: { ofertaId: number, tipoHoraId: number, bloqueId: number, categoriaId: string }[],
  faltantes: { ofertaId: number, tipoHoraId: number, horas: number }[],
  protecciones: { parejaId: string, ofertaAId: number, ofertaBId: number, protegida: boolean }[]
}
```

`categoriaId` nunca es `salaId`, la asignación física pertenece al flujo posterior. Una salida con solución declara todos los faltantes, incluso los ceros, y todas las protecciones. Sin solución, `objetivo` es `null` y los tres arreglos están vacíos. Un límite de tiempo puede tener solución o no. El estado no acredita por sí solo completitud ni optimalidad.

`validarSalidaOptimizacion(entrada, salida: unknown): ValidacionSalidaOptimizacion` devuelve:

```ts
{
  valida: boolean,
  completa: boolean,
  errores: string[],
  faltantes: { ofertaId: number, tipoHoraId: number, horas: number }[],
  disponibilidadDocente: { profesorId: number, bloquesDisponibles: number }[]
}
```

Los faltantes se recalculan por componente. La disponibilidad se ordena ascendentemente y descuenta reservas, sin señalar responsables ni prometer que ampliarla resuelva el problema. El validador comprueba esquema estricto, versión, revisión, dominios, carga, duplicados, docentes, disponibilidad, reservas, capacidad/tipo/cantidad de recursos, continuidad, ocupación con externos, protecciones y objetivo. No demuestra optimalidad ni verifica por sí mismo la vigencia actual de la base.

## Categorías y procedencia

La clasificación cerrada de `categorias.ts` enumera los 56 códigos acreditados en `Resumen Salas Institucionales UBB al 16.11.2022.xls`, hoja `Salas_Institucionales`. La columna A acredita edificio, B código de sala y H capacidad. Los encabezados de edificio están en filas 7/12/19/44/51/55/59, para AA/AB/AC/AD/II/ExIM/EG respectivamente. La implementación se basa en la auditoría institucional entregada, no importa ni ejecuta seeds.

Se agrupa por edificio, tipo y capacidad efectiva del catálogo recibido, sin redondear capacidades ni deducir edificios por sufijos. `prepararCategoriasSalas(salas)` devuelve `{ categorias, diagnosticos }`. Cada categoría incluye `id`, `edificio`, `tipo`, `capacidad`, `cantidadCatalogo`, `cantidadSugerida`, `salaIds` y `fuente`. La sugerencia es `ceil(cantidadCatalogo / 2)`, no contiene `cantidad` operativa. Un código desconocido, un tipo no acreditado o una capacidad inválida genera diagnóstico y queda fuera de las sugerencias. No se asumen seis laboratorios de capacidad 60, deben declararse explícitamente por ejecución, sin reducir su total a la mitad.

## Correspondencia matemática

Se numeran las celdas por su `execution_count` en el notebook, no por sus salidas históricas.

| Fuente | Equivalencia en `modelo.jl` y validación TypeScript |
|---|---|
| Celdas 4–11, ecuaciones `hr`, `F`, `phi` | Adaptación JSON de bloques, docentes, reservas, cupos, componentes y ocupación fija |
| Celda 12, `x`, `f_bounds` | Binarias solamente en dominio factible, faltante continuo acotado |
| Celda 13, `asignacion` | Suma de asignaciones + faltante = carga, el faltante es implícitamente entero |
| Celdas 14–15, `salas`, `profesor` | Límite por categoría/bloque y una actividad gestionada por docente/bloque |
| Celda 16, `una_sala`, `inicio_par`, `inicio_b1`, `consecutivo`, `misma_sala` | Una categoría, inicio impar, mínimo dos y categoría constante dentro de una secuencia del componente |
| Celda 16, `una_actividad_asig`, `inicio_par_asig`, `max_consecutivos` | Una actividad por sección, inicio impar y ventanas de cinco bloques con suma ≤4 |
| Celda 17, `o`, `ocupacion_total` | Ocupación fija como indicador «alguna actividad», sumada a ocupación gestionada |
| Celda 17, `no_tope`, `proporcion` | Binaria de protección por combinación, al menos `ceil(0.5 × combinaciones)` por pareja obligatoria |
| Celda 17, `fo` | `1000 × suma(faltantes) + suma(status × (1 − protección))` para parejas flexibles |
| Celdas 18, 21 | Optimización y extracción JSON separadas del núcleo, sin exportar Excel |

El máximo cuatro es **continuo por sección**, no un máximo diario. Una sección puede tener seis bloques en el día si están separados en secuencias válidas. La continuidad de categoría rige por componente, no exige la misma categoría entre T/P/L distintos. La protección es por pareja de asignaturas sobre secciones completas T/P/L y externos, no exige que exista una selección global compatible. Una combinación flexible con varios bloques coincidentes se penaliza una sola vez, no por bloque.

### Certificado de prioridad, sin cambiar pesos

Se calcula `U = 0.5 × suma(s_a × s_b)` para las parejas críticas, donde `s_a/s_b` son sus cantidades de secciones. Si `U < 1000`, mejorar al menos un bloque de carga domina cualquier cambio flexible posible, porque el faltante es entero por la igualdad con binarias. El certificado no demuestra que exista carga completa ni que una solución detenida por tiempo sea óptima.

Si `U >= 1000`, la cota no certifica prioridad estricta, pero tampoco prueba una incompatibilidad de la entrada. Se informa `prioridadCertificada: false`, **sin rechazar la ejecución ni cambiar objetivo, pesos o restricciones**.

## Proceso hijo y despliegue

El backend usa `spawn("julia", ["--startup-file=no", "--project=<ruta fija>", "<script fijo>"])`, sin shell, parámetros de rutas aportados por cliente, archivos temporales ni conexión DB. La ubicación funciona desde `src/optimizacion` y `dist/optimizacion`. El despliegue debe incluir también `backend/optimizacion/julia`, no solo `dist`.

`Project.toml` fija JuMP 1.25.0, HiGHS 1.10.0 y JSON3 1.14.3, con compatibilidad Julia 1.11. El Dockerfile combina Julia 1.11.5 con Node 22 sobre Debian Bookworm, conserva el proceso hijo dentro del backend, sin servicio HTTP ni worker independiente. Esto evita mezclar las bibliotecas glibc de Julia con la base Alpine anterior. El depósito de paquetes queda en `/opt/julia-depot`, fuera del montaje de desarrollo `/app`. Las dependencias se aprovisionan al construir la imagen, no durante una solicitud. No hay `Manifest.toml` versionado, las dependencias transitivas se resuelven durante esa construcción.

| Reloj o canal | Regla |
|---|---|
| Solver | `limiteSolverSegundos`, valor predeterminado y máximo 300, configurado en HiGHS |
| Arranque/construcción | Watchdog separado, predeterminado 120 000 ms |
| Solver, watchdog externo | Límite del solver + margen predeterminado 30 000 ms |
| Extracción | Watchdog separado, predeterminado 60 000 ms |
| Entrada/salida JSON | Máximo predeterminado 8 MiB cada una |
| `stderr` | Control de fase por líneas, máximo 64 KiB, sin reenviar trazas al cliente |

`OpcionesProcesoJulia` permite al servidor ajustar `arranqueMs`, `extraccionMs`, `margenSolverMs`, `maxEntradaBytes` y `maxSalidaBytes`. No son opciones de producto para el cliente. Julia mantiene además un máximo de 8 MiB en ambos JSON. Los mensajes repetidos no reinician relojes. Los watchdogs, errores de streams, exceso de salida y apagado fuerzan cierre del hijo, sin reintentos. Los fallos de transporte rechazan la promesa con un error seguro, distinto de una salida válida sin solución.

## Verificación y límites de la evidencia

Desde `backend`:

```text
pnpm exec vitest run tests/optimizacion-matematica.test.ts tests/optimizacion-proceso.test.ts
```

Las pruebas son sintéticas, en memoria y con proceso falso. No ejecutan seeds, DB, datos de desarrollo, instalaciones ni solver. Cubren adaptación, revisión determinista, T/P/L, carga cero, inconsistencias, 50 % por pareja, críticas, pesos, recursos, externos, continuidad, estados incompletos, transporte acotado, relojes y apagado.

La imagen de prueba se construyó y ejecutó sin red, con Julia 1.11.5, JuMP 1.25.0, HiGHS 1.10.0 y JSON3 1.14.3. `pruebas.jl` aprobó 30 comprobaciones sintéticas de carga, recursos, externos, protección por parejas sin selección global, críticas y continuidad. Para repetirlas sobre una imagen aprovisionada:

```text
julia --startup-file=no --project=optimizacion/julia optimizacion/julia/pruebas.jl
```

Las pruebas PostgreSQL de `tests/integracion/optimizacion.postgres.test.ts` son opt-in. Antes de escribir verifican explícitamente la base `horarios_test`, el usuario restringido y un bloqueo exclusivo de pruebas. Cubren idempotencia, exclusión de ediciones, vigencia, interrupciones, aplicación atómica y preservación de externos/publicados. No deben habilitarse contra desarrollo.

La prueba sintética del núcleo no sustituye la validación operativa de recursos ni demuestra los tiempos reales de una planificación. Quedan por medir el arranque/extracción en el despliegue definitivo y el comportamiento con entradas operativas autorizadas. No se ejecutó el optimizador contra datos de desarrollo.
