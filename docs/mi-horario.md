# Mi horario del profesor

La página `/app/mi-horario` permite consultar las clases propias en un calendario semanal. No permite editar horarios, generar propuestas ni publicar planificaciones.

## Consulta

1. Ingresar con un usuario de rol profesor y abrir **Mi horario**.
2. Seleccionar **Carrera y período** antes del calendario. Cada opción identifica su estado: **Preparación**, **Propuesta** o **Publicado**.
3. Consultar las clases por día y rango horario, indicado en la primera columna. Cada tarjeta muestra el nombre de la asignatura en hasta dos líneas, debajo la sección y el tipo abreviado (`teo`, `prac` o `lab`), y luego la sala junto al intervalo completo de la sesión. Si falta espacio, esa última línea se ajusta sin ocultar datos. El nombre completo queda disponible en el detalle y para lectores de pantalla. Una clase sin sala muestra **sin sala**.
4. Presionar una clase, o enfocarla con el teclado y pulsar Enter, para abrir sus detalles completos: asignatura, sección, tipo, día, horario y sala. El diálogo se cierra con **Cerrar** o Escape y devuelve el foco a la clase.

Los bloques consecutivos del mismo día, oferta, tipo y sala se presentan como una sola sesión, con su intervalo completo y un único acceso al detalle. Se admite el recreo de diez minutos entre bloques consecutivos. No se agrupa a través de reservas, huecos o clases coincidentes, ni cuando faltan identificadores para distinguir las clases. La agrupación es visual, no modifica los horarios guardados.

Las filas vacías tienen una altura menor y separadores suaves. Crecen cuando coinciden varias clases, sin desplazamientos internos que oculten tarjetas. El fondo y el área de clic de una sesión agrupada abarcan toda su celda, incluso cuando otra clase aumenta la altura de las filas. Los encabezados de día permanecen visibles al desplazar el calendario. En pantallas estrechas, la columna horaria se desplaza con la tabla para no tapar clases ni su foco. El detalle de una sesión muestra el horario completo y la cantidad de bloques agrupados.

Las reservas de la carrera seleccionada aparecen con la etiqueta **Reservado**, con la paleta azul institucional, borde discontinuo, esquinas redondeadas y texto centrado. Las reservas consecutivas del mismo día sin clases se agrupan en una sola superficie. Una reserva aislada usa menos altura que una tarjeta de clase. Se obtienen del backend, no dependen del período ni bloquean otras carreras. Si una clase heredada coincide con una reserva, se conservan la clase y sus detalles y se muestra **Clase en bloque reservado**, sin agrupar a través de esa celda. Ambos contenidos permanecen visibles. La reserva no se distingue únicamente por el color.

Se incluyen planificaciones actuales e históricas con asignaciones del profesor autenticado, tanto externo como gestionado, en `preparacion`, `propuesta` o `publicado`. La carrera no necesita pertenecer a su departamento; sin asignaciones no se ofrece el período.

En **Preparación** se muestra: “Este período está en Preparación. El horario aún no está habilitado para consulta.” No se consulta ni se muestra el calendario, aunque existan horarios externos guardados. **Propuesta** y **Publicado** mantienen la consulta de clases propias.

Si no existen planificaciones visibles, se informa que no hay períodos con asignaciones docentes. En Propuesta o Publicado, si todavía no hay clases con horario, se muestra un estado vacío específico y se conserva el calendario cuando hay reservas para mostrar. En Preparación se mantiene únicamente el aviso, sin calendario ni clases. Al cambiar de período se limpia el calendario anterior y se descartan las respuestas tardías, incluidos errores. Los errores de consulta permiten reintentar.

## Contrato de lectura

| Endpoint GET | Respuesta `data` |
| --- | --- |
| `/api/horarios-asignaturas/mi-horario/contexto` | `{ planificaciones, bloques }`, con metadatos de períodos asignados en los tres estados y el catálogo de bloques, sin clases asignadas. |
| `/api/horarios-asignaturas/mi-horario?planificacionSemestreId=10` | Arreglo de clases propias de la planificación seleccionada. |
| `/api/horarios-asignaturas/mi-horario` | Arreglo de clases propias únicamente en Propuesta o Publicado; excluye Preparación. |

Cada elemento de `planificaciones` en el contexto incluye, de forma aditiva, `carreraId` y `bloquesReservadosIds`. El arreglo de reservas pertenece a esa carrera y puede estar vacío. Solo se consultan carreras de planificaciones con asignaciones del profesor autenticado. El catálogo `bloques` y los arreglos de clases conservan su contrato. El frontend admite contextos anteriores sin los campos nuevos, tratándolos como ausencia de reservas.

La identidad se obtiene de la sesión, nunca de un parámetro `profesorId`. Consultar directamente las clases de una planificación ajena, inexistente o en preparación produce `403`, aunque sus metadatos sean seleccionables. La pertenencia de una clase se determina por la combinación de oferta y tipo de hora asignada al profesor; compartir sección no permite consultar las clases de otro docente. Los permisos administrativos existentes no se modifican.

El endpoint de contexto no admite parámetros de consulta: cualquier filtro adicional se rechaza con `400`, en lugar de ignorarlo.

## Pruebas controladas

Desde `backend`:

```sh
pnpm exec vitest run tests/mi-horario.test.ts tests/mi-horario.repository.test.ts
```

Desde `frontend`, con Node 22.19 o posterior:

```sh
node --experimental-transform-types --test src/features/mi-horario/mi-horario.test.mjs
```

Estas pruebas usan datos controlados y un adaptador SQL simulado: no generan propuestas, cambian estados ni escriben en la base de desarrollo. Cubren estados, aviso sin calendario en Preparación, respuestas tardías, acceso por asignaciones fuera del departamento, aislamiento, sala nula y ausencia de clases. La comprobación SQL verifica el filtro por oferta, tipo y profesor; no sustituye una ejecución de integración contra PostgreSQL.

La cobertura de reservas comprueba el contexto por carrera, ausencia de reservas en otra carrera, etiquetas sin clases ficticias, conservación de clases heredadas y cambio de planificación sin arrastrar reservas. El renderizado controlado no sustituye la revisión visual y de teclado en navegador.

La integración PostgreSQL separa Preparación (metadatos seleccionables y clases protegidas), Propuesta/Publicado (aislamiento por docente y tipo de hora) y eliminación del docente sin horarios conservando la oferta compartida. Se ejecuta exclusivamente en `horarios_test` mediante `scripts/probar-excel-externos.ps1`; ver [pruebas de horarios externos](pruebas-excel-externos.md).
