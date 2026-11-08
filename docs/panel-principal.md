# Panel principal

El panel orienta el ingreso según el perfil, sin reemplazar la navegación ni ejecutar cambios de planificación. Conserva Roboto y la paleta institucional, con una columna en móvil y sin tarjetas de estadísticas generales.

## Contenido por perfil

- **Administración:** contexto de carrera y período, acceso principal a Administración de períodos y accesos secundarios a Asignaturas y Profesores.
- **Secretaría:** solo planificaciones actuales autorizadas. En Preparación prioriza Seguimiento de disponibilidad, con un resumen de registros. En Propuesta y Publicado prioriza Gestión del horario, distinguiendo revisión de propuesta y consulta del horario publicado.
- **Profesor:** períodos con asignaciones propias, disponibilidad registrada y accesos a Mi disponibilidad y Mi horario. En Preparación se informa que el horario aún no está habilitado. Propuesta no se presenta como Publicado.

La selección inicial requiere una única planificación actual. Con varias, el usuario debe elegir. El selector se omite cuando existe un único contexto ya seleccionado. Administración y profesores pueden identificar períodos históricos, sin consultar disponibilidad actual para ellos. La selección del panel es local, no cambia el período actual ni las selecciones de otras páginas. Solo Modelo de optimización y Gestión del horario reciben `?planificacion=ID`, los demás destinos conservan sus selectores.

## Fuentes y significado

Se reutilizan las consultas existentes de planificaciones, contexto de Mi horario, disponibilidad propia y seguimiento de disponibilidad. No se incorporan endpoints, permisos ni dependencias.

El resumen de secretaría cuenta docentes con carga en departamentos gestionados de la carrera y planificación seleccionadas. Un registro significa que hay bloques guardados, no que se alcance el mínimo ni que el horario sea factible. Sin docentes incluidos se muestra un estado vacío, no un indicador de avance.

La disponibilidad del profesor distingue bloques persistidos, ausencia de carga y permiso de edición. No se leen borradores locales ni se inventan vencimientos. Una consulta fallida o en carga nunca se convierte en cero. Los datos se consultan al ingresar o cambiar de contexto, el botón Actualizar panel permite renovarlos. El seguimiento global de ejecuciones de optimización permanece sin cambios.

## Comprobación

Desde `frontend/`, ejecutar `node --experimental-transform-types --test src/features/dashboard/pages/DashboardPage.test.mjs` y `npm run build`. Las pruebas verifican contenido por rol, enlaces, estados de consulta y semántica de los resúmenes. Las comprobaciones estáticas de CSS no sustituyen una revisión visual y de teclado en navegador.
