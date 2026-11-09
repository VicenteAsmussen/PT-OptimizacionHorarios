# Disponibilidad del profesor

En **Mi disponibilidad**, cada profesor indica cuándo puede impartir clases para una carrera y período. El acceso depende de sus asignaciones, incluso fuera de su departamento. La disponibilidad de una carrera no se comparte con las demás.

## Cómo registrar disponibilidad

1. Revisa la carrera, período y estado del selector, como en **Mi horario**. La etiqueta **Estado del período** también muestra Preparación, Propuesta o Publicado para la selección actual. La página abre la primera planificación actual en la que tienes carga, sin incluir períodos anteriores.
2. Consulta el mínimo en **Carga docente**. Despliega la tarjeta para ver asignaturas, secciones y tipos de hora, el detalle comienza cerrado en cada planificación.
3. Selecciona por parejas del mismo día: **1–2, 3–4, 5–6**, y así sucesivamente. Un clic, Enter, Espacio o un toque en cualquiera de los dos marca ambos. Si ambos están marcados, los desmarca, si solo uno está marcado, completa la pareja. Con el mouse también puedes mantener presionado y arrastrar: comenzar en una pareja completa marcada desmarca el recorrido, en cualquier otra pareja libre lo marca. Pasar nuevamente por la misma pareja no vuelve a alternarla. Al soltar, incluso fuera de la grilla, termina el gesto. Si un bloque está **Reservado**, no se puede seleccionar ninguno de los dos, tampoco mediante **Seleccionar todo**. Un bloque sin compañero en el catálogo queda deshabilitado. Si no hay disponibilidad guardada, la grilla comienza vacía.
4. Pulsa **Enviar disponibilidad**. Al guardarse, los bloques conservan el celeste y la grilla se bloquea. El mensaje **Disponibilidad enviada** confirma el envío. Usa **Editar disponibilidad** para modificarla y volver a enviar. **Seleccionar todo** y **Deseleccionar todo** solo aparecen en modo edición, también al registrar una disponibilidad nueva.

Debes cubrir el mínimo de bloques, pero se recomienda seleccionar más para facilitar la generación del horario. No se admiten envíos vacíos. Marcar bloques no guarda cambios y un envío rechazado conserva lo guardado anteriormente.

Carrera y período aparecen antes de la grilla. El contador y la carga docente están juntos, las acciones de envío quedan al pie. La primera columna muestra solo los horarios, sin enumerar bloques. Cuando coinciden entre días, se muestran una vez, si difieren, se conservan también en cada casilla. Las casillas libres quedan blancas y las seleccionadas celestes, sin dibujos interiores. `aria-pressed` comunica la selección a lectores de pantalla. Las reservas mantienen su etiqueta y borde discontinuo, con el horario completo en el nombre accesible. En escritorio la grilla es más compacta, en pantallas táctiles las casillas conservan una altura mínima de 44 px. En móvil se conserva el toque individual para no interferir con el desplazamiento. Ningún gesto envía la disponibilidad automáticamente.

Solo se puede editar una planificación actual en `preparacion`, incluidos los controles para seleccionar o quitar todos los bloques. En `propuesta` o `publicado`, la disponibilidad es de solo lectura. Enviarla no cambia ese estado, secretaría pasa a propuesta al ejecutar el modelo. La consulta de horarios asignados e históricos queda para otra etapa.

## Cómo se calcula el mínimo

Se suman las horas de `asignatura_tipo_hora` para cada oferta y tipo asignados al profesor en `oferta_tipo_hora`, dentro de la planificación elegida.

- Cada sección suma por separado, aunque sea la misma asignatura.
- Solo cuentan los tipos que imparte ese profesor, sin mezclar otras carreras ni períodos.
- Las horas de la malla equivalen a bloques docentes, no se convierten desde horas de reloj.

Por ejemplo, dos secciones con 2 horas prácticas cada una y otra asignatura con 3 horas teóricas requieren al menos **7 bloques**.

## Reservas y disponibilidad anterior

Las reservas se obtienen del servidor para la carrera seleccionada, no bloquean otras carreras ni modifican el mínimo. **Seleccionar todo** selecciona solo parejas completas sin reservas. La capacidad utilizable excluye ambos bloques de una pareja con reserva. El contador no cuenta las reservas para cubrir el mínimo. Las selecciones anteriores no se completan automáticamente al consultar, y cancelar conserva los bloques guardados.

Si el catálogo de bloques no reservados no alcanza el mínimo, la página bloquea el envío y muestra: «La capacidad utilizable es de 4 bloques y no cubre el mínimo de 5. Contacta a secretaría.», con las cantidades correspondientes. No se reduce el mínimo automáticamente.

Consultar no borra disponibilidad anterior de la base. Al comenzar una edición, las reservas se excluyen automáticamente del borrador, sin un botón adicional. Para guardar la selección actualizada:

1. Pulsa **Editar disponibilidad**.
2. Revisa la selección de bloques utilizables. Si lo necesitas, usa **Deseleccionar todo** para vaciar el borrador.
3. Completa el mínimo con bloques no reservados y pulsa **Enviar disponibilidad**.

**Cancelar edición** restaura los bloques guardados, incluidas las reservas anteriores, sin modificar la base. La eliminación de las reservas guardadas solo se confirma al pulsar **Enviar disponibilidad**. Cambiar de carrera descarta el borrador sin guardar. En una planificación de solo lectura no se permite editar.

## API del profesor

Estas rutas son exclusivas del rol profesor. El servidor obtiene su identidad desde la sesión, el cliente no envía `profesorId`.

| Solicitud | Respuesta |
| --- | --- |
| `GET /api/disponibilidad-profesores/mi-disponibilidad` | Planificaciones actuales asignadas y catálogo de bloques, sin selección. |
| `GET /api/disponibilidad-profesores/mi-disponibilidad?planificacionSemestreId=3` | Lo anterior, más bloques guardados, `bloquesReservadosIds` de esa carrera, mínimo, detalle de carga y permiso de edición. |
| `POST /api/disponibilidad-profesores/mi-disponibilidad` | Valida y reemplaza la disponibilidad de esa planificación en una transacción. |

Cuerpo del envío:

```json
{
  "planificacionSemestreId": 3,
  "bloquesIds": [1, 2, 3, 4, 5, 6, 7]
}
```

Los bloques repetidos cuentan una sola vez. Se rechazan bloques inexistentes, selecciones insuficientes y planificaciones ajenas o no editables. Identidad, carga y estado se validan en el servidor al guardar, bajo el bloqueo de planificación. Ocultar botones no reemplaza esas comprobaciones.

El servidor vuelve a leer las reservas dentro de la transacción y rechaza con `400` una capacidad insuficiente o una selección que incluya reservas. Para reservas seleccionadas responde: «La selección incluye bloques reservados para esta carrera. Retíralos del borrador antes de enviar.». El rechazo conserva los datos guardados. La página conserva el error, consulta nuevamente permisos y reservas y, si aún puede editar, excluye las reservas nuevas del borrador sin alterar los demás bloques. Exige otro envío explícito y nunca reenvía automáticamente. El profesor utiliza exclusivamente las rutas de Mi disponibilidad, las rutas generales no le conceden acceso alternativo. Administración y secretaría no registran, sincronizan ni borran disponibilidad de terceros.

Los datos se guardan en `disponibilidad_profesores`, vinculados al profesor, planificación y bloque. No hay una entidad de borrador, los cambios locales permanecen en el navegador hasta enviarlos.

## Qué revisar

- Acceso por carga asignada, sin permitir suplantar a otro profesor.
- Suma correcta por sección y tipo, sin mezclar carreras, períodos ni docentes.
- Grilla vacía al comenzar, guardado explícito y datos conservados ante un error.
- Colores, bloqueo y edición coherentes con el estado de la planificación.
- Reservas por carrera, selección individual y masiva bloqueada, mínimo y capacidad utilizable.
- Reservas con una sola etiqueta visible, retirada automática del borrador al editar, cancelación sin persistencia y rechazo ante reservas nuevas sin perder los demás bloques.

La relación de ofertas y tipos de hora se explica en [Asignación docente](asignacion-docente.md).
