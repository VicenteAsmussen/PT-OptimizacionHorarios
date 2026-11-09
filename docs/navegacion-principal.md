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
- El botón de usuario conserva los colores originales, blanco sobre `#58A6CF` en reposo y `#4596C0` al pasar el puntero. Los contrastes de texto son 2,70:1 y 3,29:1, inferiores a 4,5:1 para texto pequeño. El contraste del icono y del foco blancos en reposo también queda por debajo de 3:1. Esta limitación permanece pendiente, la prueba de colores no la considera resuelta.
- Una dirección desconocida dentro de `/app` conserva el marco autenticado, muestra el título «Página no encontrada» y ofrece volver al panel principal, disponible para los tres perfiles. No añade otro `main`.

## Comprobación

Desde `frontend/`, ejecutar `node --experimental-transform-types --test src/components/layout/AppLayout.test.mjs` para revisar rutas, orden, grupos e iconos por rol en las variantes de escritorio y móvil. Las pruebas incluyen aserciones estáticas de estilos, no sustituyen la validación visual y de teclado en navegador.

`node --experimental-transform-types --test src/app/pulido-interfaz.test.mjs` comprueba el botón en Edge o Chromium headless a 1280 y 390 px, incluidos colores calculados, foco con Tab, menú con Enter y Escape e icono cargado. También verifica el 404 interno por perfil, el selector dentro del diálogo nativo y las cargas de Mi horario. Usa un perfil temporal nuevo, identidad y respuestas sintéticas, sin backend, credenciales ni datos reales. Las páginas ajenas al escenario y el seguimiento de optimización se sustituyen por componentes de prueba, no se comprueban sus reglas de negocio. El servidor es exclusivo de loopback y las solicitudes externas están bloqueadas. Sin navegador, se informa una omisión. `NAVEGADOR_PRUEBAS` permite indicar el ejecutable y `OPENCODE_TMPDIR` la carpeta temporal.

Estas comprobaciones no certifican accesibilidad completa ni anuncios de lectores de pantalla. La hipótesis de cierre accidental del formulario con el primer Escape no se reprodujo en Edge, no se cambió su gestión de teclado ni el cierre directo del diálogo.
