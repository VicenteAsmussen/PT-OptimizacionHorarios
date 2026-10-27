# Mi horario del profesor

La página `/app/mi-horario` permite consultar las clases propias en un calendario semanal. No permite editar horarios, generar propuestas ni publicar planificaciones.

## Consulta

1. Ingresar con un usuario de rol profesor y abrir **Mi horario**.
2. Seleccionar **Carrera y período** en la tarjeta del título. Cada opción identifica su estado: **Preparación**, **Propuesta** o **Publicado**.
3. Consultar las clases por día y rango horario, indicado en la primera columna. Cada tarjeta muestra las iniciales de la asignatura junto a la sección (`IALP · sec 1`) y, debajo, el tipo abreviado (`teo`, `prac` o `lab`) junto a la sala. El nombre completo de la asignatura y el tipo quedan disponibles al pasar el cursor y para lectores de pantalla. Una clase sin sala muestra **sin sala**.
4. Presionar una clase, o enfocarla con el teclado y pulsar Enter, para abrir sus detalles completos: asignatura, sección, tipo, día, horario y sala. El diálogo se cierra con **Cerrar** o Escape y devuelve el foco a la clase.

Las filas mantienen la misma altura compacta, tengan o no clases. Si coinciden varias clases en una celda, su contenido se puede desplazar sin aumentar la altura de la fila.

Se incluyen planificaciones actuales e históricas con asignaciones del profesor autenticado, tanto externo como gestionado, en `preparacion`, `propuesta` o `publicado`. La carrera no necesita pertenecer a su departamento; sin asignaciones no se ofrece el período.

En **Preparación** se muestra: “Este período está en Preparación. El horario aún no está habilitado para consulta.” No se consulta ni se muestra el calendario, aunque existan horarios externos guardados. **Propuesta** y **Publicado** mantienen la consulta de clases propias.

Si no existen planificaciones visibles, se informa que no hay períodos con asignaciones docentes. En Propuesta o Publicado, si todavía no hay clases con horario, se muestra un estado vacío específico. Al cambiar de período se limpia el calendario anterior y se descartan las respuestas tardías, incluidos errores. Los errores de consulta permiten reintentar.

## Contrato de lectura

| Endpoint GET | Respuesta `data` |
| --- | --- |
| `/api/horarios-asignaturas/mi-horario/contexto` | `{ planificaciones, bloques }`, con metadatos de períodos asignados en los tres estados y el catálogo de bloques, sin clases asignadas. |
| `/api/horarios-asignaturas/mi-horario?planificacionSemestreId=10` | Arreglo de clases propias de la planificación seleccionada. |
| `/api/horarios-asignaturas/mi-horario` | Arreglo de clases propias únicamente en Propuesta o Publicado; excluye Preparación. |

La identidad se obtiene de la sesión, nunca de un parámetro `profesorId`. Consultar directamente las clases de una planificación ajena, inexistente o en preparación produce `403`, aunque sus metadatos sean seleccionables. La pertenencia de una clase se determina por la combinación de oferta y tipo de hora asignada al profesor; compartir sección no permite consultar las clases de otro docente. Los permisos administrativos existentes no se modifican.

El endpoint de contexto no admite parámetros de consulta: cualquier filtro adicional se rechaza con `400`, en lugar de ignorarlo.

## Pruebas controladas

Desde `backend`:

```sh
pnpm exec vitest run tests/mi-horario.test.ts tests/mi-horario.repository.test.ts
```

Desde `frontend`, con Node 22.19 o posterior:

```sh
node --experimental-strip-types --test src/features/mi-horario/mi-horario.test.mjs
```

Estas pruebas usan datos controlados y un adaptador SQL simulado: no generan propuestas, cambian estados ni escriben en la base de desarrollo. Cubren estados, aviso sin calendario en Preparación, respuestas tardías, acceso por asignaciones fuera del departamento, aislamiento, sala nula y ausencia de clases. La comprobación SQL verifica el filtro por oferta, tipo y profesor; no sustituye una ejecución de integración contra PostgreSQL.

La integración PostgreSQL separa Preparación (metadatos seleccionables y clases protegidas), Propuesta/Publicado (aislamiento por docente y tipo de hora) y eliminación del docente sin horarios conservando la oferta compartida. Se ejecuta exclusivamente en `horarios_test` mediante `scripts/probar-excel-externos.ps1`; ver [pruebas de horarios externos](pruebas-excel-externos.md).
