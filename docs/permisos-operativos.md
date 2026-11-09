# Permisos por operación

El backend autoriza cada operación según el rol, la identidad, la carrera y el estado de los datos. Las restricciones de la interfaz ayudan a presentar el flujo permitido, pero no sustituyen los controles de la API. Conocer una URL o enviar un cuerpo manualmente no concede permisos adicionales.

## Facultades por rol

| Operación | Administración | Secretaría | Profesor |
|---|---|---|---|
| Ejecutar y seguir el modelo | No | Sí, dentro de su carrera y las condiciones del modelo | No |
| Consultar resultados de horarios | Sí, sin acciones operativas | Sí, dentro de su carrera | Mediante Mi horario, sobre sus asignaciones |
| Mover clases, intercambiar Excel de salas y publicar desde Resultados | No | Sí, con las validaciones del resultado | No |
| Crear, editar o eliminar horarios por las rutas generales | No | No | No |
| Importar horarios externos | No | Sí, en su alcance y en Preparación | No |
| Modificar ofertas, secciones y asignaciones docentes | No | Sí, dentro del alcance y estado permitidos | No |
| Consultar disponibilidad de profesores | Consulta administrativa autorizada | Consulta y seguimiento de su carrera | Solo su autoservicio |
| Registrar o reemplazar disponibilidad | No | No | Solo la propia, mediante Mi disponibilidad |
| Crear, editar o eliminar salas del catálogo físico | Administración del catálogo, según dependencias | No | No |
| Declarar cantidades de salas para el modelo | No | Sí, no modifica el catálogo físico | No |
| Gestionar períodos | Sí, conserva el mantenimiento administrativo | No | No |
| Descartar una propuesta no publicada | Mediante el mantenimiento administrativo de períodos | Operación limitada sobre la propuesta de su carrera | No |

Las consultas auxiliares necesarias para formularios, selección de profesores, períodos, categorías y validaciones conservan su autorización específica. No se eliminan por no tener un botón independiente. Por ejemplo, el editor de secciones en Asignaturas consume las operaciones de ofertas.

## Excepción administrativa: Gestión de períodos

Administración conserva las operaciones que ofrece [Gestión de períodos](administracion-periodos.md): crear períodos, seleccionar el actual, eliminar cuando corresponde, consultar resúmenes, reiniciar datos por alcance y cambiar estados, incluido **Publicado**. Conserva las confirmaciones, las huellas de revisión, el bloqueo de ejecuciones activas y los validadores del resultado.

Esta excepción no concede permiso para ejecutar el modelo ni habilita los movimientos, la importación/exportación de salas o la publicación mediante la API operativa de Resultados. La autorización depende del comando solicitado, no de una cabecera que afirme desde qué página se envió.

## Descartar una propuesta desde secretaría

El descarte permite volver a generar un horario sin conceder reinicios generales:

- Solo sobre una propuesta no publicada de la carrera autorizada.
- Requiere confirmación y que la propuesta consultada siga vigente, sin ejecución activa.
- Elimina los horarios gestionados de esa propuesta y su ejecución asociada, y vuelve a Preparación.
- Conserva ofertas, asignaciones docentes, disponibilidades y horarios externos.
- Rechaza períodos publicados, destinos ajenos o desactualizados, sin aplicar cambios parciales.

No permite borrar ofertas ni reiniciar departamentos externos. La consulta del horario por administración sigue siendo de solo lectura desde Resultados.

## Catálogos, perfiles y cuentas

Administración puede crear registros en los catálogos de salas, asignaturas/mallas, carreras y departamentos. Los registros utilizados por ofertas, disponibilidades u horarios quedan de solo lectura para administración. La modificación y eliminación deben comprobar las dependencias académicas relevantes, no depender únicamente de que una clave foránea permita el borrado.

Administración conserva el mantenimiento institucional y las cuentas vinculadas de profesores de planta. No puede eliminar un perfil con disponibilidad, asignaciones u horarios asociados. Retirar un acceso no debe borrar los datos académicos del perfil.

Secretaría conserva la gestión autorizada de profesores part time y sus cuentas vinculadas. No puede administrar cuentas privilegiadas, elevar roles ni exceder su alcance. Los recortes de salas, disponibilidad y rutas generales de horarios no eliminan esta facultad.

## Consulta docente

El profesor utiliza **Mi disponibilidad** y **Mi horario**. No utiliza las rutas generales equivalentes para consultar horarios ajenos o administrar disponibilidad. Se conservan las reglas de asignación, propiedad y estados del autoservicio: la consulta de clases propias admite Propuesta y Publicado, no Preparación.

## Verificación

Las pruebas de permisos deben comprobar llamadas directas a cada método de la API, la ausencia de efectos en rechazos y la continuidad de los flujos autorizados. Las pruebas con repositorios simulados no demuestran integridad referencial, bloqueos o rollback en PostgreSQL real. Tampoco reemplazan una comprobación autenticada de la interfaz.
