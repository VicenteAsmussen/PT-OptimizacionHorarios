# Asignación docente por sección y tipo de hora

Cada oferta representa una sección de una asignatura en una planificación semestral. Sus profesores se asignan por tipo de hora mediante `oferta_tipo_hora`, no directamente en `ofertas_asignaturas`.

## Editar una sección

En **Asignaturas > Secciones**, elige un profesor para cada tipo de hora. Un mismo docente puede cubrir varios tipos y secciones. Puedes guardar una sección incompleta, los tipos sin profesor quedan identificados como pendientes.

Escribe el nombre o RUT y elige una sugerencia del mismo departamento de la asignatura, que muestra nombre, RUT y departamento. También puedes usar las flechas, Enter y Escape. El texto escrito por sí solo no asigna un profesor. Si borras o cambias una selección, ese tipo queda pendiente hasta que elijas otra sugerencia.

Elegir al docente del primer tipo completa los demás campos vacíos, sin reemplazar asignaciones existentes. Después puedes ajustar cada campo por separado. Los cambios se guardan únicamente con **Guardar sección**.

**Editar asignatura** muestra las horas de la malla como información de solo lectura, editar otros datos no las modifica.

Solo se editan planificaciones actuales en `preparacion`. Se conserva el alcance por carrera. El catálogo de profesores sigue siendo global, pero las sugerencias y el guardado de secciones solo admiten docentes del departamento de la asignatura, no de cualquier departamento gestionado por la secretaría.

Las asignaciones anteriores no se eliminan automáticamente. Si una sección conserva profesores de otro departamento, al editarla se muestran sus nombres en un aviso: reemplaza esas asignaciones o limpia sus campos antes de guardar, incluso si solo cambias los cupos.

## Datos de la API

Al crear o actualizar una oferta, usa `asignaciones` en lugar del antiguo `profesorId`:

```json
{
  "asignaturaCodigo": "INF100",
  "planificacionSemestreId": 3,
  "seccion": 1,
  "cupos": 30,
  "asignaciones": [
    { "tipoHoraId": 1, "profesorId": 7 },
    { "tipoHoraId": 2, "profesorId": 8 }
  ]
}
```

- Al crear, omitir `asignaciones` deja la sección incompleta. Al actualizar, omitirlas conserva las existentes y enviar un arreglo las reemplaza. `[]` las elimina solo si no tienen horarios asociados.
- Cada `(ofertaId, tipoHoraId)` admite un profesor y debe usar un tipo definido para la asignatura. No se puede quitar una asignación con horarios ni cambiar su docente si genera un conflicto.
- Crear o actualizar una oferta con un profesor de otro departamento devuelve `400` sin guardar cambios. La validación usa la asignatura efectiva y también revisa las asignaciones conservadas cuando se omiten en una actualización.
- Las ofertas devuelven `asignaciones` y los horarios, `asignacion`. El filtro por profesor considera oferta y tipo de hora. La gestión de profesores también devuelve `asignaciones`, no el antiguo campo `ofertas`.
- Los datos anidados del profesor no incluyen su RUT.

## Compatibilidad con Excel

El [formato de horarios externos](horarios-externos.md) no cambia. Cada fila aporta un profesor y sus sesiones, la importación crea una asignación por tipo de hora y guarda los bloques. Al reimportar, asignaciones y horarios se reemplazan juntos en una transacción.

Se mantienen las validaciones de duplicados, cobertura y alcance, junto con los errores y contadores. Este formato no permite distintos profesores por tipo dentro de una misma sección. El Excel de salas conserva su formato y obtiene al docente desde el tipo programado.

## Migración

La migración `0015_asignacion_docente_por_tipo_hora.sql` crea la relación, copia el profesor anterior para los tipos programados, vincula sus horarios y elimina la columna antigua de la oferta. Las ofertas sin horarios quedan incompletas y los tipos sin programación requieren revisión manual.

Revisa el entorno antes de aplicarla y ejecuta las [pruebas aisladas de PostgreSQL](pruebas-excel-externos.md). **No es necesario reiniciar ni borrar la base de desarrollo.**

Para el cálculo de carga y el registro de bloques, consulta [Disponibilidad del profesor](disponibilidad-profesor.md).
