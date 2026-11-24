# Modelo de optimización del backend

El módulo `backend/src/optimizacion/index.ts` transforma datos del período en una entrada JSON revisada, ejecuta un proceso Julia y verifica su salida sin consultar la base de datos. Conserva la formulación de `Code_v2.ipynb` y `Formulacion_Matematica_HorariosVA.tex`. No crea secciones, docentes, salas físicas ni una selección global de secciones.

## API para la interfaz

Las rutas requieren autenticación y rol `secretaria`. Su carrera se obtiene de la identidad autenticada. Solo se admite ICINF. Administración consulta el horario mediante Resultados, no ejecuta ni sigue el modelo mediante esta API. Conserva las operaciones de mantenimiento de Gestión de períodos.

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

La preparación informa `docentesSinDisponibilidad` por separado de los demás bloqueos. Antes de crear un intento, el `POST` vuelve a verificar la carga que programa el modelo y los bloques guardados en esa planificación. Si algún docente tiene carga programable y ningún bloque guardado, responde `409` con `codigo: "disponibilidad_no_registrada"` y la lista vigente. Cada fila incluye `profesorId`, `nombre`, `bloquesEnviados` y `minimoBloques`. No se crea una ejecución ni se invoca el solver. Este control no mide la suficiencia ni descuenta reservas.

No hay endpoints para aplicar ni reemplazar. Una solución completa, válida y vigente se incorpora automáticamente como Propuesta, nunca como Publicado. La interfaz de ejecución reutiliza la página de resultados, sin añadir una grilla al modelo. Véase [uso de la interfaz](modelo-optimizacion-frontend.md).

## Persistencia, concurrencia e interrupciones

`ejecuciones_optimizacion` conserva únicamente el intento actual de cada planificación, con entrada efectiva, revisión, versión del modelo, parámetros, salida y diagnóstico. Si falla, el registro permanece disponible hasta que se acepta otro intento o el administrador reinicia los horarios gestionados. Un nuevo intento válido sustituye al anterior dentro de la misma transacción, sin acumular historial. Si la preparación o la escritura falla, se conserva el registro previo. Reenviar la clave del intento conservado recupera ese mismo registro, no ejecuta nuevamente el modelo.

Una restricción única parcial impide dos ejecuciones activas por planificación. El bloqueo de carrera → planificación serializa la sustitución de intentos y el reinicio, el cálculo ocurre fuera de esas transacciones. No se modifican el esquema ni las migraciones, los intentos antiguos que ya existan se limpian al aceptar un nuevo intento o al reiniciar los horarios gestionados de esa planificación, no mediante un borrado global.

Durante el cálculo se rechazan las escrituras de entradas y operaciones administrativas que invalidan la planificación. La lectura y navegación permanecen disponibles. Los catálogos compartidos no quedan bloqueados durante Julia, la incorporación comprueba nuevamente la revisión de entradas y toma bloqueos breves de lectura durante su validación final. Cualquier diferencia impide incorporar horarios.

El backend renueva cada 15 segundos un arrendamiento de 120 segundos. Tras una caída, el siguiente inicio o consulta, o el barrido periódico, marca las ejecuciones vencidas como `interrumpida`. La recuperación puede tardar hasta el vencimiento del arrendamiento, no reejecuta el cálculo ni incorpora parciales. Un proceso que perdió el arrendamiento no puede renovar ni aplicar su resultado tardío. Cerrar o recargar el navegador no cancela la tarea del backend. El apagado ordenado sí interrumpe sus hijos Julia.

La aplicación inserta todos los bloques gestionados y cambia a Propuesta en la misma transacción, después de volver a validar carga, restricciones y vigencia. No borra ni sobrescribe externos o publicados. Los bloques generados conservan `ejecucionOptimizacionId` y `categoriaOptimizacionId`, que no es `salaId`. Los movimientos preservan la categoría abstracta de cada bloque y su presupuesto, la asignación física sigue el flujo existente de salas.

Los estados terminales distinguen `aplicada`, `infactible`, `carga_incompleta`, `limite_tiempo`, `error`, `interrumpida` y `datos_desactualizados`. El estado del solver se conserva en la salida, por eso una ejecución `aplicada` puede tener un solver detenido por límite de tiempo sin optimalidad demostrada. En los demás casos la planificación permanece en Preparación y no se persisten bloques parciales.

### Diagnóstico técnico acotado

El campo opcional `diagnostico.procesoJulia` conserva el origen del término, la fase, tiempos monotónicos en milisegundos y hasta 60 muestras numéricas de progreso. Se registra tanto con una salida válida como ante un corte del proceso. No requiere migraciones ni cambia la respuesta JSON del solver, las entradas, los recursos o los criterios para incorporar horarios.

- **Tiempos:** arranque total y, si se reciben sus hitos, inicio del script Julia, carga de módulos y lectura de entrada, construcción, llamada al solver y extracción. La llamada incluye su posible compilación inicial, no equivale al tiempo interno de HiGHS.
- **Subfases:** dentro de `llamadaSolver`, `tiemposMs.transferencia` mide la sincronización explícita del cache de JuMP con el optimizador mediante `attach_optimizer`. `tiemposMs.resolucion` mide la llamada posterior a `optimize!`, incluida su compilación, preparación y recuperación interna del wrapper. No es tiempo nativo puro. `extraccion` sigue midiendo la lectura de la solución, serialización y cierre del proceso. Los hitos adicionales no cambian opciones ni reinician el watchdog, cuyo valor predeterminado es de 1830 segundos.
- **Corte durante el solver:** `subfaseSolver` identifica el último hito recibido, `transferencia` o `resolucion`. El tiempo de la subfase interrumpida es parcial, hasta el corte. Los registros anteriores o sin estos hitos omiten los campos nuevos, no se reconstruyen tiempos históricos. Los hitos fuera de orden o repetidos se ignoran.
- **Progreso:** el callback público de HiGHS.jl 1.10.0 observa tiempo interno, nodos, objetivo candidato, cota dual y brecha relativa. Espacia las muestras al menos `max(5 segundos, límite configurado / 60)`, actualmente 30 segundos para 1800, y conserva el máximo de 60 muestras. Sin límite configurado usa cinco segundos. No emite texto libre ni datos de docentes. Un candidato interno no acredita un horario completo ni validado. Los valores no finitos se representan como `null`.
- **Límites:** el progreso no renueva los watchdogs. El solver tiene un límite predeterminado y máximo de 1800 segundos, se mantienen los márgenes y el límite total de 64 KiB del canal de control. Si el callback no puede instalarse se registra `progresoNoDisponible`, sin alterar el cálculo.
- **Interpretación:** el corte externo por tiempo se registra como `limite_tiempo` con `origenFin: "watchdog"`, la fase (`arranque`, `solver` o `extraccion`) y resultado nulo. No equivale a una respuesta `TIME_LIMIT` de HiGHS ni a una declaración de inviabilidad. El diagnóstico visible distingue estas causas del error de ejecución e indica por separado si se incorporó una propuesta. Si un intento anterior no contiene evidencia suficiente, se muestra el límite sin atribuirlo a HiGHS. La ausencia de muestras de progreso tampoco demuestra ausencia de soluciones.
- **Confirmación del cierre:** ante un corte externo o una interrupción, se descartan las salidas del intento y se envía `SIGKILL`. La espera asíncrona de `exit` o `close` tiene un plazo de 2000 ms y no extiende el cálculo ni bloquea la API. El campo opcional `procesoJulia.cierreProceso` registra el estado (`confirmada`, `no_confirmada` o `no_iniciado`), la duración de la espera y si se envió la señal. Cuando no se confirma la salida, el servidor también lo registra sin exponer la salida del hijo.

El campo opcional `procesoJulia.registroHiGHS` agrega un registro nativo filtrado:

- `configurado` confirma la instalación del registro, no que se hayan emitido mensajes. `limiteSolverSegundos` se consulta directamente al optimizador nativo después de transferir el modelo, no se copia de los parámetros esperados. Es informativo y no cambia el límite de vigilancia.
- `hitos` conserva una sola aparición de hasta siete códigos: `inicio`, `preprocesamiento`, `fin_preprocesamiento`, `preprocesamiento_desactivado`, `busqueda`, `informe` y `limite_tiempo`. `tiempoDesdeSolverMs` usa el reloj monotónico del backend desde el hito SOLVER. Los códigos dependen de mensajes reconocidos, su ausencia no demuestra que una etapa no se ejecutó. `busqueda` identifica el inicio de la etapa MIP, no acredita soluciones ni nodos explorados.
- El callback de logging comparte receptor con el progreso y siempre retorna cero. Los mensajes se clasifican en memoria, sin conservar su texto, nombres ni valores. No se escribe un archivo de log. El transporte conserva los límites de 64 KiB de control, 8 MiB de JSON y 60 muestras de progreso, ningún hito renueva los plazos.

En HiGHS 1.7.2, `log_to_console=false` también impide estos callbacks cuando no hay un stream de log. Por eso el registro se instala primero y luego activa `log_to_console` y `output_flag`, el callback sustituye la escritura a consola. Solo cambian opciones de observación, no las del algoritmo. Si falla la activación se restauran silencio, progreso y opciones previas. Si no se puede restablecer un canal seguro, se aborta antes de `optimize!`. El registro está desactivado por defecto en el helper y se habilita explícitamente desde `ejecutar.jl`. Registrar mensajes puede añadir sobrecarga, no acelera la resolución.

El diagnóstico no publica logs crudos, rutas, credenciales ni contenidos de entrada. No agrega una barra de porcentaje. `pruebas-diagnostico.jl` simula eventos y adjunta un callback a un modelo vacío, sin resolverlo. El alcance de las comprobaciones de cierre y persistencia se describe más abajo.

`pruebas-etapas.jl` compara dos modelos sintéticos de cuatro variables binarias, uno con la llamada habitual y otro con transferencia y registro explícitos. Comprueba el mismo óptimo, solución, opciones del algoritmo e hitos, con un límite de solver de tres segundos por modelo. Solo esta prueba desactiva presolve para observar también el progreso MIP, el modelo académico conserva sus opciones. Se ejecuta con `julia --startup-file=no --project=backend/optimizacion/julia backend/optimizacion/julia/pruebas-etapas.jl`, no usa datos académicos ni inicia una planificación real.

Para regenerar una propuesta, secretaría dispone del [descarte controlado desde Resultados](gestion-resultado-horarios.md). Administración conserva además el mantenimiento explícito: reiniciar los horarios gestionados y devolver la planificación a Preparación son operaciones administrativas separadas. Ese reinicio elimina primero los bloques gestionados y luego los registros de ejecución de esa planificación, en una misma transacción. Conserva ofertas, docentes, horarios externos y otras planificaciones. También permite eliminar un intento fallido aunque no haya generado bloques. El reinicio exclusivamente externo no borra la ejecución del modelo y no se permite reiniciar mientras haya un cálculo activo. Ninguna transición administrativa a Propuesta o Publicado puede eludir los validadores de carga y publicación.

## Integración interna

1. Construir `DatosOptimizacion` desde las ofertas gestionadas y externos del período. El servicio que llama al módulo controla carrera, período, estado y concurrencia.
2. Obtener sugerencias con `prepararCategoriasSalas(salas)`. Confirmar cantidades por ejecución y declarar los laboratorios con capacidad, cantidad total y fuente. Las sugerencias no son disponibilidad garantizada.
3. Llamar a `construirEntradaOptimizacion(datos)` para usar el límite predeterminado de 1800 segundos y conservar la entrada efectiva, su revisión y versión. Se admite un límite explícito positivo de hasta 1800 segundos.
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

`Project.toml` fija JuMP 1.25.0, HiGHS 1.10.0 y JSON3 1.14.3, con compatibilidad Julia 1.11. El Dockerfile combina Julia 1.11.5 con Node 22 sobre Debian Bookworm, conserva el proceso hijo dentro del backend, sin servicio HTTP ni worker independiente. Esto evita mezclar las bibliotecas glibc de Julia con la base Alpine anterior. El depósito de paquetes queda en `/opt/julia-depot`, fuera del montaje de desarrollo `/app`. El archivo `backend/optimizacion/julia/Manifest.toml` está versionado y registra las versiones resueltas de las dependencias directas y transitivas. Durante la construcción de la imagen, el Dockerfile instala las dependencias con `Pkg.instantiate()` y las precompila con `Pkg.precompile()`, no durante una solicitud.

| Reloj o canal | Regla |
|---|---|
| Solver | `limiteSolverSegundos`, valor predeterminado y máximo 1800, configurado en HiGHS |
| Arranque/construcción | Watchdog separado, predeterminado 120 000 ms |
| Solver, watchdog externo | Límite del solver + margen predeterminado 30 000 ms |
| Extracción | Watchdog separado, predeterminado 60 000 ms |
| Entrada/salida JSON | Máximo predeterminado 8 MiB cada una |
| `stderr` | Control de fase por líneas, máximo 64 KiB, sin reenviar trazas al cliente |

`OpcionesProcesoJulia` permite al servidor ajustar `arranqueMs`, `extraccionMs`, `margenSolverMs`, `maxEntradaBytes` y `maxSalidaBytes`. No son opciones de producto para el cliente. Julia mantiene además un máximo de 8 MiB en ambos JSON. Los mensajes repetidos no reinician relojes. Los watchdogs, errores de streams, exceso de salida y apagado fuerzan cierre del hijo, sin reintentos. Los fallos de transporte rechazan la promesa con un error seguro, distinto de una salida válida sin solución.

### Dónde ajustar el tiempo

El límite predeterminado y máximo es **1800 segundos, treinta minutos**. Es un presupuesto máximo, no una espera mínima: HiGHS puede terminar antes cuando alcanza un criterio de término, por ejemplo, la optimalidad. Encontrar la primera solución factible no obliga a detener la búsqueda. No se cambia ese comportamiento ni se reescriben intentos anteriores.

Secretaría puede dejar el cálculo ejecutándose en el backend, cerrar o recargar el navegador no lo cancela. Debe evitarse reiniciar el servidor mientras haya una ejecución activa.

Para cambiar el presupuesto, actualizar las guardas y las pruebas en conjunto:

| Ubicación | Responsabilidad |
|---|---|
| `backend/src/optimizacion/contrato.ts`, `LIMITE_SOLVER_SEGUNDOS` | Fuente compartida TypeScript del máximo y valor predeterminado de `esquemaParametros` |
| `backend/src/services/optimizacion.service.ts` | Consume la constante al adaptar la entrada y presentar la preparación |
| `backend/src/repositories/optimizacion.repository.ts` | Consume la constante al registrar los parámetros del nuevo intento, no reescribe intentos anteriores |
| `backend/src/optimizacion/proceso.ts` | Valida el máximo antes de `spawn`, calcula el watchdog del solver con el parámetro efectivo más 30 000 ms |
| `backend/optimizacion/julia/ejecutar.jl` | Guarda independiente `0 < limiteSolverSegundos <= 1800`, debe mantenerse coordinada con TypeScript |
| `backend/optimizacion/julia/modelo.jl` | Recibe `entrada.parametros.limiteSolverSegundos` y lo aplica mediante `set_time_limit_sec`, sin cambiar la formulación |
| `backend/optimizacion/julia/diagnostico.jl` | Lee `JuMP.time_limit_sec(modelo)` para calibrar la cadencia, actualmente 30 segundos y hasta 60 muestras, sin ampliar `stderr` ni decidir sobre el solver |

El runner conserva 120 segundos para arranque/construcción, 1800 + 30 para la llamada al solver y 60 para extracción. La suma de ventanas del proceso es **hasta 33 minutos 30 segundos**, no un plazo HTTP ni de transacciones DB. Ningún evento de progreso extiende estas ventanas. La revisión de entrada incluye el parámetro efectivo, la versión del modelo no cambia por este ajuste.

En desarrollo local con Docker, comprobar la recarga efectiva del backend y que la preparación informa el nuevo límite. No basta con actualizar los archivos del montaje. Cualquier reinicio debe hacerse sin un cálculo activo.

Los valores `300`, `600` y `900` que permanecen en fixtures y pruebas comprueban compatibilidad con límites explícitos anteriores, no representan el valor predeterminado operativo. Con esos límites la cadencia sigue siendo de cinco, diez y quince segundos, respectivamente. Los intentos ya registrados conservan sus parámetros y no se reescriben. Las pruebas de `backend/tests/optimizacion/` y `pruebas-diagnostico.jl` cubren las guardas, relojes, metadata y cadencia sin ejecutar una optimización real. Para observar una futura ejecución de 1800 segundos se debe preparar una ventana de monitorización que cubra las ventanas del proceso, por ejemplo, 35 minutos desde el inicio, no reutilizar el monitor de 20 minutos del ensayo de 900.

## Verificación y límites de la evidencia

Desde `backend`:

```text
pnpm exec vitest run tests/optimizacion/optimizacion-matematica.test.ts tests/optimizacion/optimizacion-proceso.test.ts
```

Estas pruebas son sintéticas, en memoria y con proceso simulado. No ejecutan seeds, bases de datos ni el solver. Cubren adaptación, revisión determinista, T/P/L, carga cero, inconsistencias, 50 % por pareja, críticas, pesos, recursos, externos, continuidad, estados incompletos, transporte acotado, relojes y apagado.

La imagen de prueba se construyó y ejecutó sin red, con Julia 1.11.5, JuMP 1.25.0, HiGHS 1.10.0 y JSON3 1.14.3. `pruebas.jl` aprobó 30 comprobaciones sintéticas de carga, recursos, externos, protección por parejas sin selección global, críticas y continuidad. Para repetirlas sobre una imagen aprovisionada:

```text
julia --startup-file=no --project=optimizacion/julia optimizacion/julia/pruebas.jl
```

Las pruebas PostgreSQL de `tests/integracion/optimizacion.postgres.test.ts` son opt-in. Antes de escribir verifican explícitamente la base `horarios_test`, el usuario restringido y un bloqueo exclusivo de pruebas. Cubren idempotencia, exclusión de ediciones, vigencia, interrupciones, aplicación atómica y preservación de externos/publicados. No deben habilitarse contra desarrollo.

### Corte externo e incorporación de propuestas

| Comprobación | Evidencia |
|---|---|
| Rechazo de salida tardía y cierre sin confirmar | Pruebas del proceso simulado. La espera concluye al observar la salida o al vencer el plazo, sin aceptar datos tardíos. |
| Disponibilidad HTTP durante el cierre | `optimizacion-http.test.ts` ejercita la ruta de consulta mientras la confirmación está pendiente y comprueba la salida de un hijo real de Node. Se sustituyen Julia, la autenticación y el repositorio en esa prueba. |
| Confirmación con Julia real | En un contenedor aislado se ejecutó `ejecutarJulia` sin sustituir el hijo y con un plazo de arranque de 100 ms, solo para la prueba. Se observó `exit` por `SIGKILL` antes del rechazo, el PID ya no existía y `cierreProceso.estado` fue `confirmada`. Un servidor HTTP mínimo respondió a una consulta durante la ejecución, sin usar la aplicación completa ni una base de datos. |
| Persistencia transaccional | `optimizacion-http.postgres.test.ts`, en PostgreSQL 18 descartable, usa rutas, permisos y persistencia reales con respuestas de Julia simuladas. Un `TIME_LIMIT` completo y válido queda en Propuesta, no Publicado. Una salida incompleta o inválida y los cortes de arranque, solver y extracción conservan la huella de los horarios y el estado Preparación. |

### Ensayo aislado con HiGHS nativo

Se reprodujo dos veces `TIME_LIMIT` con `FEASIBLE_POINT` y 64 bloques completos, **solo al proporcionar un inicio MIP factible en el ensayo**. Se usaron `construir_modelo` y `extraer_salida` sin cambios, junto con el adaptador y el validador TypeScript. Las dos salidas pasaron la validación completa, sin faltantes ni errores.

El ensayo se realizó sin red ni base de datos, con Julia 1.11.5, JuMP 1.25.0, HiGHS.jl 1.10.0 y HiGHS nativo 1.7.2. La entrada sintética tenía dos asignaturas con 16 secciones cada una, dos bloques teóricos por sección, docentes independientes, una categoría ficticia con 32 salas y 256 combinaciones de protección. El inicio MIP asignó a cada oferta un intervalo disponible de dos bloques y activó las protecciones sin coincidencia. No se cambió la formulación ni el presupuesto operativo.

| Límite de ensayo | Inicio MIP | Resultado nativo |
|---|---|---|
| 1 s | Con y sin | `OPTIMAL`, objetivo 0, 64 bloques en ambos casos. |
| 0,001 s | Sin | Dos `TIME_LIMIT` con `NO_SOLUTION`, sin asignaciones. |
| 0,001 s | Con | Dos `TIME_LIMIT` con `FEASIBLE_POINT`, objetivo 35, 64 bloques. |

El corte fue del solver durante el preprocesamiento, no del vigilante externo. Los dos casos completos registraron aproximadamente 0,057 y 0,028 s de tiempo de solver. El ensayo no demuestra que HiGHS encuentre por sí solo una solución completa al límite, ni comprueba de extremo a extremo que una salida nativa `TIME_LIMIT` se incorpore desde `ejecutar.jl` hasta la base de datos. La incorporación se comprobó por separado con la salida simulada.

### Ensayo local del flujo completo

En el ensayo local controlado del 20 de noviembre de 2026 se ejecutó Julia desde la aplicación, sin cambiar la formulación. El caso declaró 31 salas y 6 laboratorios de capacidad 60, estos valores son supuestos del ensayo, no una garantía de disponibilidad física.

| Comprobación | Resultado observado |
|---|---|
| Resolución con presupuesto de 900 segundos | Óptimo, objetivo 0, solución completa y sin errores de validación |
| Incorporación | 167 bloques internos, preservando los 148 bloques externos |
| Duración del proceso | Aproximadamente 13 minutos 18 segundos, con transferencia de 1,70 segundos y extracción de 2,91 segundos |
| Hitos internos | Aproximadamente 11 minutos 19 segundos entre preprocesamiento e inicio MIP, luego 88 segundos hasta el informe, no son medidas de tiempo nativo puro |
| Respuesta Excel con una sala inexistente | Rechazada desde el frontend |
| Respuesta Excel válida | 65 sesiones y 149 bloques con sala, sin pendientes de sala requeridos |
| Publicación | Estado `publicado` confirmado en la planificación |
| Preservación | Disponibilidades, horarios externos, otras entradas y migraciones conservaron sus huellas durante la generación y las comprobaciones |

Los intentos previos con menor presupuesto no devolvieron una solución completa, algunos terminaron por vigilancia externa y otro devolvió un límite de tiempo nativo. No son pruebas de infactibilidad. El presupuesto actual de 1800 segundos se verificó mediante pruebas de contrato, ventanas y cadencia, no mediante otro cálculo completo de treinta minutos. El intento exitoso conserva sus parámetros originales de 900 segundos.

Esta evidencia no sustituye las pruebas de permisos, concurrencia, consulta docente o despliegue. Quedan por medir el arranque y la extracción en el entorno definitivo y el comportamiento con otras entradas operativas autorizadas. No hay reintentos automáticos ni se publica un resultado incompleto.
