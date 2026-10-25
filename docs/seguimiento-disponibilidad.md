# Seguimiento de disponibilidad para secretaría

La página **Seguimiento de disponibilidad**, disponible en el menú de secretaría,
permite consultar la disponibilidad de los profesores con carga asignada en una
planificación actual de su carrera. Es una consulta de solo lectura.

## Uso

1. Abrir `/app/seguimiento-disponibilidad` con una cuenta de secretaría.
2. Seleccionar la planificación o período. Si existe una sola planificación actual,
   se selecciona automáticamente.
3. Revisar profesor, departamento, estado y bloques enviados frente al mínimo.
   Usar **Actualizar disponibilidad** para consultar nuevamente los envíos.

## Alcance y estados

- Solo aparecen profesores de departamentos que la carrera **gestiona** y con
  asignaciones en la planificación seleccionada. Un departamento meramente
  relacionado no se incluye.
- **Enviada** significa que existen bloques guardados para ese profesor y esa
  planificación. **No enviada** significa que no existen y muestra `0 / mínimo`.
- El mínimo suma las horas de los tipos asignados al profesor en cada oferta y
  sección de esa planificación. Se expresa en bloques docentes, no horas reloj.
- No se agrega un estado de insuficiencia: el autoservicio del profesor valida el
  mínimo antes de guardar. La página no modifica ni completa disponibilidades.
- Cambiar de planificación descarta el resultado anterior; los errores de consulta
  no se presentan como ausencia de envío.

## API

`GET /api/disponibilidad-profesores/seguimiento?planificacionSemestreId=<id>`

Requiere sesión con rol `secretaria` y un perfil con carrera asociada. El alcance
se deriva de la identidad autenticada, no de parámetros del cliente. Una
planificación ajena se rechaza; otros roles no acceden al seguimiento.

La respuesta `data` contiene una fila por profesor con `profesorId`, `nombre`,
`departamento`, `minimoBloques`, `bloquesEnviados` y `enviada`. No incluye RUT,
credenciales ni datos de usuarios. No requiere migraciones.
