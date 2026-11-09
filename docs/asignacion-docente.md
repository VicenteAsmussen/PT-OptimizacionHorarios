# Asignación docente por sección y tipo de hora

Cada oferta representa una sección de una asignatura en una planificación semestral. Sus profesores se asignan por tipo de hora mediante `oferta_tipo_hora`, no directamente en `ofertas_asignaturas`.

## Editar una sección

En **Asignaturas > Secciones**, elige un profesor para cada tipo de hora. Un mismo docente puede cubrir varios tipos y secciones. Puedes guardar una sección incompleta, los tipos sin profesor quedan identificados como pendientes.

Escribe el nombre o RUT y elige una sugerencia del mismo departamento de la asignatura, que muestra nombre, RUT y departamento. También puedes usar las flechas, Enter y Escape. El texto escrito por sí solo no asigna un profesor. Si borras o cambias una selección, ese tipo queda pendiente hasta que elijas otra sugerencia.

El selector solo anuncia una lista expandida y la referencia mediante ARIA cuando hay sugerencias visibles. Sin coincidencias conserva el mensaje de estado, sin apuntar a una lista inexistente. La prueba de [pulido de interfaz](navegacion-principal.md#comprobación) ejercita el selector real dentro del diálogo nativo con datos sintéticos, sin modificar las reglas de búsqueda o asignación.

Elegir al docente del primer tipo completa los demás campos vacíos, sin reemplazar asignaciones existentes. Después puedes ajustar cada campo por separado. Los cambios se guardan únicamente con **Guardar sección**.

**Editar asignatura** muestra las horas de la malla como información de solo lectura, editar otros datos no las modifica.

Solo se editan planificaciones actuales en `preparacion`. Se conserva el alcance por carrera. El catálogo de profesores sigue siendo global, pero las sugerencias y el guardado de secciones solo admiten docentes del departamento de la asignatura, no de cualquier departamento gestionado por la secretaría.

Las asignaciones anteriores no se eliminan automáticamente. Si una sección conserva profesores de otro departamento, al editarla se muestran sus nombres en un aviso: reemplaza esas asignaciones o limpia sus campos antes de guardar, incluso si solo cambias los cupos.

En la edición de asignaturas y la gestión de secciones, las validaciones se muestran junto al formulario. Las confirmaciones breves y los fallos de guardado se anuncian solo mediante Sonner, sin duplicarlos en el panel. Un nuevo intento reemplaza el aviso anterior y cerrar el panel retira sus fallos. La confirmación permanece brevemente aunque guardar cierre el panel.

Cancelar una sección o cambiar sus datos retira los errores del intento anterior. La selección de profesor también limpia la validación anterior, aunque se realice con un botón en lugar de escribir en el campo.

La aplicación mantiene un único Toaster global. Su contenedor acompaña al diálogo modal abierto y vuelve al documento al cerrarlo, sin reiniciar los avisos. Así las notificaciones no quedan detrás del fondo modal ni fuera de su interacción con teclado.

Si el guardado se confirma pero falla la recarga de secciones, el panel conserva el error y aclara que los cambios ya se guardaron. **Reintentar carga** actualiza la lista sin repetir el guardado.

## Verificar las notificaciones en navegador

Desde `frontend`, con las dependencias instaladas y Edge o Chromium disponible:

```powershell
node --experimental-strip-types --experimental-transform-types --test src/components/notificaciones/navegador.test.mjs
```

La prueba abre un perfil temporal nuevo y un servidor exclusivo en loopback, sin iniciar el backend ni acceder a una base de datos. Usa el formulario y Sonner reales con una respuesta de guardado simulada. Comprueba el diálogo nativo a 390 px, la visibilidad mediante hit-test, el árbol accesible, el cierre con Tab y Espacio, la validación local y la conservación del aviso al cerrar y reabrir el panel. Los procesos y el perfil temporal se retiran al terminar.

Si el navegador no está en una ubicación reconocida, configura `NAVEGADOR_PRUEBAS` con la ruta de su ejecutable. Sin navegador instalado se informa una prueba omitida, no una comprobación aprobada. `OPENCODE_TMPDIR` permite elegir la carpeta temporal, de lo contrario se usa la del sistema. Esta prueba no demuestra anuncios de NVDA o Narrador ni reemplaza la revisión manual con esos lectores.

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
