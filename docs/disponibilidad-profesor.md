# Disponibilidad del profesor

En **Mi disponibilidad**, cada profesor indica cuándo puede impartir clases para una carrera y período. El acceso depende de sus asignaciones, incluso fuera de su departamento. La disponibilidad de una carrera no se comparte con las demás.

## Cómo registrar disponibilidad

1. Revisa la carrera y período seleccionados. La página abre la primera planificación actual en la que tienes carga, sin incluir períodos anteriores.
2. Consulta el mínimo en **Carga docente**. Despliega la tarjeta para ver asignaturas, secciones y tipos de hora, el detalle comienza cerrado en cada planificación.
3. Marca los bloques de la grilla o usa **Seleccionar todo** y **Deseleccionar todo**. Si no hay disponibilidad guardada, la grilla comienza vacía. El celeste claro indica cambios sin enviar.
4. Pulsa **Enviar disponibilidad**. Al guardarse, los bloques se oscurecen y la grilla se bloquea. Usa **Editar disponibilidad** para modificarla y volver a enviar.

Debes cubrir el mínimo de bloques, pero se recomienda seleccionar más para facilitar la generación del horario. No se admiten envíos vacíos. Marcar bloques no guarda cambios y un envío rechazado conserva lo guardado anteriormente.

La página tiene tres tarjetas: encabezado, grilla y configuración. En escritorio, período y carga quedan a la derecha, en pantallas pequeñas pasan debajo. Los botones están al final de esa tarjeta. Las celdas muestran solo la hora, con colores para el estado y `aria-pressed` para lectores de pantalla. La tabla conserva un nombre accesible.

Solo se puede editar una planificación actual en `preparacion`, incluidos los controles para seleccionar o quitar todos los bloques. En `propuesta` o `publicado`, la disponibilidad es de solo lectura. Enviarla no cambia ese estado, secretaría pasa a propuesta al ejecutar el modelo. La consulta de horarios asignados e históricos queda para otra etapa.

## Cómo se calcula el mínimo

Se suman las horas de `asignatura_tipo_hora` para cada oferta y tipo asignados al profesor en `oferta_tipo_hora`, dentro de la planificación elegida.

- Cada sección suma por separado, aunque sea la misma asignatura.
- Solo cuentan los tipos que imparte ese profesor, sin mezclar otras carreras ni períodos.
- Las horas de la malla equivalen a bloques docentes, no se convierten desde horas de reloj.

Por ejemplo, dos secciones con 2 horas prácticas cada una y otra asignatura con 3 horas teóricas requieren al menos **7 bloques**.

## API del profesor

Estas rutas son exclusivas del rol profesor. El servidor obtiene su identidad desde la sesión, el cliente no envía `profesorId`.

| Solicitud | Respuesta |
| --- | --- |
| `GET /api/disponibilidad-profesores/mi-disponibilidad` | Planificaciones actuales asignadas y catálogo de bloques, sin selección. |
| `GET /api/disponibilidad-profesores/mi-disponibilidad?planificacionSemestreId=3` | Lo anterior, más bloques guardados, mínimo, detalle de carga y permiso de edición. |
| `POST /api/disponibilidad-profesores/mi-disponibilidad` | Valida y reemplaza la disponibilidad de esa planificación en una transacción. |

Cuerpo del envío:

```json
{
  "planificacionSemestreId": 3,
  "bloquesIds": [1, 2, 3, 4, 5, 6, 7]
}
```

Los bloques repetidos cuentan una sola vez. Se rechazan bloques inexistentes, selecciones insuficientes y planificaciones ajenas o no editables. Identidad, carga y estado se validan en el servidor al guardar, bajo el bloqueo de planificación. Ocultar botones no reemplaza esas comprobaciones.

Los datos se guardan en `disponibilidad_profesores`, vinculados al profesor, planificación y bloque. No hay una entidad de borrador, los cambios locales permanecen en el navegador hasta enviarlos.

## Qué revisar

- Acceso por carga asignada, sin permitir suplantar a otro profesor.
- Suma correcta por sección y tipo, sin mezclar carreras, períodos ni docentes.
- Grilla vacía al comenzar, guardado explícito y datos conservados ante un error.
- Colores, bloqueo y edición coherentes con el estado de la planificación.

La relación de ofertas y tipos de hora se explica en [Asignación docente](asignacion-docente.md).
