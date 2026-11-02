# API de resultados de horarios para secretaría

Usa `/api/resultados-horarios` para revisar un horario existente, solicitar salas, mover clases gestionadas por la carrera y publicar una propuesta. Este backend no ejecuta el modelo matemático ni incorpora una pantalla para crear horarios manualmente.

## Ciclo de trabajo

La preparación y la ejecución del modelo siguen siendo procesos separados. Esta API permite editar únicamente la **propuesta actual**. Los resultados publicados se pueden consultar y exportar, pero este flujo no permite mover sus clases, importar respuestas ni reabrirlos. El mantenimiento administrativo existente no sustituye la publicación por secretaría.

Todas las rutas requieren autenticación y el rol `secretaria` o `admin`. El acceso de secretaría queda limitado a la carrera de la cuenta autenticada, el cliente no puede elegir otra carrera. Los filtros solo cambian la presentación, nunca el alcance de la validación.

## Rutas

| Método | Ruta después de `/api/resultados-horarios` | Entrada | Resultado |
|---|---|---|---|
| GET | `/:id` | Parámetro de consulta opcional `semestreMalla` | Planificación, revisión, bloques, disponibilidad declarada, sesiones agrupadas y total de pendientes de toda la planificación |
| POST | `/:id/validar-movimiento` | Cuerpo del movimiento | Validar el destino sin modificar datos y devolver los problemas de forma estructurada |
| POST | `/:id/movimientos` | El mismo cuerpo del movimiento | Validar de nuevo y guardar el grupo confirmado de forma atómica |
| GET | `/:id/salas/exportar` | Parámetro opcional `soloPendientes=true` | Solicitud de salas en XLSX, con las celdas de sala vacías de forma intencional |
| POST | `/:id/salas/importar` | Formulario multipart con `archivo` y `revision` | Validar la respuesta completa y guardar sus asignaciones de sala de forma atómica |
| GET | `/:id/validacion-publicacion` | Sin entrada | Estado de preparación para publicar, problemas y revisión actual |
| POST | `/:id/publicar` | `{ "revision": "<current SHA-256>" }` | Validar con la planificación bloqueada y publicar |

Las respuestas correctas usan `{ "status": "success", "data": ... }`. Una escritura inválida o basada en una revisión desactualizada devuelve HTTP 409, una entrada mal formada devuelve 400 y una planificación no accesible devuelve 404. La vista previa de un destino inválido devuelve HTTP 200 con `data.valido: false` y `data.problemas`. Los colores corresponden al frontend, la disponibilidad de una celda individual no equivale a poder iniciar un movimiento completo. Los colores van acompañados de descripciones accesibles.

### Cuerpo del movimiento

```json
{
  "revision": "<64 lowercase hexadecimal characters from the latest read>",
  "idsHorarios": [100, 101],
  "bloqueInicioId": 25
}
```

La revisión obtenida al consultar abarca todo el contexto de la planificación, incluida la disponibilidad, la gestión de las clases y los requisitos de sala. Si ese contexto cambia, la confirmación deja de ser válida. La vista previa es informativa, al guardar siempre se valida de nuevo dentro de una transacción.

Las sesiones se forman con las reglas institucionales de continuidad existentes, incluido el descanso de diez minutos después de un par de bloques. Los identificadores no determinan el orden cronológico. El frontend selecciona la sesión completa de forma predeterminada, pero la API acepta un grupo consecutivo de una misma sesión si cumple estas condiciones:

- Se mueven al menos dos bloques juntos y el grupo completo cabe en un mismo día de destino.
- El destino comienza en un **`numeroBloque` institucional impar**, sin importar su identificador en el catálogo.
- Cada segmento que queda en el origen tiene al menos dos bloques y comienza en un número institucional impar, o no queda ningún segmento.
- La sesión resultante en el destino, tras unir registros adyacentes de la misma oferta, tipo de hora y profesor, también comienza en un número institucional impar.
- Todos los bloques de destino están dentro de la disponibilidad declarada del profesor.
- No hay conflictos de profesor, sala ni nivel de la malla en ninguna parte de la planificación.

Por eso, una sesión de dos o tres bloques se mueve completa, mientras que una de cuatro puede dividirse en dos más dos. Se conservan la carga docente total, los identificadores de los registros, la oferta, el tipo de hora y la sala asignada. Si la operación falla, se revierten sus cambios. Las clases externas importadas permanecen fijas, pero se incluyen al detectar conflictos. Un mismo nivel de la malla no puede tener clases simultáneas, aunque correspondan a secciones diferentes. Los conflictos de recursos se revisan dentro de la planificación, esta API no incorpora coordinación de recursos entre carreras.

En una sesión de los bloques 1–5 se rechaza mover 1–3, porque 4–5 comenzaría en un número par. Mover 1–2 sí puede dejar 3–5. En una sesión 1–7 se rechaza mover 3–5, porque el segmento restante 6–7 comienza en par. Una sesión antigua que comienza en par puede moverse completa a un inicio impar. Estas comprobaciones solo se aplican al movimiento y a los grupos afectados, los inicios de sesiones antiguas o externas fijas no relacionadas no lo bloquean. La consulta, el intercambio Excel, las escrituras de preparación y la publicación conservan sus reglas existentes. La vista previa y el guardado con bloqueo reutilizan `prepararMovimiento`, la vista previa no autoriza guardar después sin volver a validar.

## Solicitudes de salas

Se reutilizan el formato de planilla de salas y la agrupación de sesiones existentes. Las solicitudes solo incluyen sesiones docentes gestionadas por la carrera que requieren sala:

- `asignaturas.requiereSala` es un valor booleano por asignatura, con valor predeterminado `true`.
- Práctica Profesional I/II (`620449`, `620456`) y Proyecto de Título (`620477`) quedan explícitamente exentos en la migración y en la carga inicial de datos. Anteproyecto (`620472`) no está exento.
- Las sesiones de laboratorio se excluyen por separado, los demás tipos de hora de la misma asignatura pueden seguir requiriendo sala.
- No se incluyen sesiones de departamentos externos.

Los estados de sala de una sesión son `asignada`, `pendiente`, `noRequiere`, `laboratorio` o `externa`. Las sesiones excluidas nunca cuentan como pendientes de sala. No se guarda un estado duplicado, este se determina según si la sesión requiere sala y las asignaciones reales.

`soloPendientes=true` exporta sesiones completas que requieren sala y tienen al menos un bloque sin asignación, no bloques faltantes aislados. Se mantiene el límite existente de cinco sesiones por fila. Superarlo produce un error explícito, nunca un recorte silencioso.

### Importar una respuesta

Envía un solo archivo `.xlsx` en `archivo`, de hasta 10 MB, junto con la revisión de la propuesta a la que responde. La respuesta debe coincidir con la asignatura, sección, tipo de hora, día y horario existentes:

| Celda de sala | Comportamiento al responder una propuesta |
|---|---|
| Código de sala reconocido | Asignar esa sala a todos los bloques de la sesión identificada |
| `SIN SALA` | Dejar explícitamente la sesión sin sala |
| Celda vacía | Conservar las asignaciones existentes, sin borrarlas |
| Sesión omitida | Mantener la sesión sin cambios |
| Sala desconocida o clave de sesión inválida | Rechazar la respuesta completa con errores que indican fila y columna |

La validación final de ocupación de salas incluye tanto las sesiones modificadas como las que no cambian. Para intercambiar salas, las asignaciones modificadas se liberan en conjunto antes de aplicar el estado final validado. La planificación permanece bloqueada durante la validación y el guardado de la importación. Después de importar, actualiza los resultados para obtener la nueva revisión y el total general de pendientes. Los conteos de la importación corresponden a las sesiones procesadas en el archivo.

Los endpoints antiguos de Excel para preparación siguen disponibles. Conservan su regla de borrar asignaciones ante celdas vacías y allí `SIN SALA` sigue siendo una sala no reconocida. No los uses para procesar respuestas de una propuesta.

## Publicación

La publicación valida toda la planificación, sin aplicar el filtro de visualización:

1. Los bloques requeridos por oferta y tipo de hora coinciden con la carga de la malla, y las asignaturas obligatorias del período tienen una oferta.
2. No hay clases simultáneas que compartan profesor, sala o nivel de la malla.
3. Todas las clases gestionadas por la carrera están dentro de la disponibilidad declarada del profesor. Si no hay declaración, se considera que no hay disponibilidad, no que sea ilimitada. No se inventa una declaración de disponibilidad para las clases externas importadas y fijas.
4. Todas las sesiones que requieren sala tienen una asignada. Las asignaturas exentas, los laboratorios y las sesiones externas no bloquean la publicación por falta de sala.

Estas comprobaciones protegen la propuesta, no validan la ejecución del modelo matemático. La publicación usa el mismo orden de bloqueo que las escrituras de preparación existentes, primero la carrera y después la planificación. Una revisión desactualizada o una validación rechazada no modifican el horario ni el estado de la planificación.

## Migración y verificaciones registradas

La migración `0016_asignaturas_requiere_sala.sql` agrega el requisito de sala y exime los tres códigos indicados. La persona operadora aplicó únicamente `0016` a la base local de desarrollo después de crear un respaldo verificado. Las comprobaciones posteriores verificaron el registro de migraciones, los indicadores de requisito de sala y la conservación de los conteos de filas y hashes previos de las tablas públicas. El respaldo verificado se conservó fuera del repositorio. Los demás entornos deben aplicar la migración antes de usar este backend.

Comprobaciones específicas desde `backend/`:

```sh
pnpm exec vitest run tests/asignaturas-requiere-sala.test.ts tests/resultados-horarios-http.test.ts tests/resultados-horarios.repository.test.ts
pnpm exec tsc --noEmit
```

Las pruebas HTTP ejercitan las rutas, controladores y servicios reales con persistencia aislada en memoria. Las pruebas con un intermediario SQL inspeccionan el orden de bloqueo, las escrituras de grupos completos y la propagación de fallos. No sustituyen las pruebas de integración con PostgreSQL.

Una verificación separada con una base PostgreSQL desechable obtuvo 23 resultados de escenarios satisfactorios. Incluyó una reversión real tras forzar un fallo de escritura, solicitudes concurrentes con la misma revisión, intercambios de salas sujetos a restricciones de unicidad, comprobaciones de estado y alcance, y validación de publicación. Esa evidencia verifica el flujo del backend, no la integración con el frontend ni la ejecución del modelo matemático. Nunca dirijas comandos de prueba a una base de desarrollo habitual que contenga datos.
