# Navegación principal

La barra lateral conserva Roboto, la paleta institucional y los destinos existentes. El panel principal aparece primero, los enlaces de gestión se agrupan en Catálogos y Planificación. Los profesores mantienen una lista breve, sin grupos adicionales.

## Opciones por perfil

| Perfil | Catálogos | Planificación | Opciones personales |
| --- | --- | --- | --- |
| Administración | Asignaturas, Profesores | Administración de períodos, Modelo de optimización, Gestión del horario | — |
| Secretaría | Asignaturas, Profesores | Seguimiento de disponibilidad, Horarios departamentos externos, Modelo de optimización, Gestión del horario | — |
| Profesor | — | — | Mi disponibilidad, Mi horario |

Panel principal está disponible para los tres perfiles. La agrupación no modifica rutas, permisos ni las guardias de acceso.

## Presentación y accesibilidad

- Las etiquetas permanecen completas y pueden ocupar varias líneas. Los iconos decorativos comparten una columna de 20 px y se alinean con la primera línea del texto.
- El padding lateral de `1rem` y la separación de `0.5rem` entre icono y etiqueta amplían el espacio útil sin cambiar el ancho de la barra ni el tamaño de letra. El icono del modelo tiene un ajuste óptico dentro de su columna, sin modificar el SVG.
- La página activa combina fondo oscuro y una marca lateral blanca. El foco de teclado conserva su contorno visible.
- Los enlaces tienen un mínimo de 40 px de altura y 44 px cuando el dispositivo dispone de un puntero táctil, sin limitar el crecimiento por texto.
- El enlace «Saltar al contenido» aparece al recibir foco y lleva al contenido principal.
- Hasta `48rem`, la navegación utiliza el diálogo lateral existente, con cierre explícito, Escape y restauración del foco. No se añade una variante de solo iconos.
- Administración de períodos reserva el espacio de su icono, pendiente del SVG elegido, sin sustituirlo por otro recurso.

## Comprobación

Desde `frontend/`, ejecutar `node --experimental-transform-types --test src/components/layout/AppLayout.test.mjs` para revisar rutas, orden, grupos e iconos por rol en las variantes de escritorio y móvil. Las pruebas incluyen aserciones estáticas de estilos, no sustituyen la validación visual y de teclado en navegador.
