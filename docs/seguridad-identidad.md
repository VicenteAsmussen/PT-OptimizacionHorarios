# Permisos de cuentas y sesiones revocables

La administración general de usuarios queda reservada a `admin`. Secretaría conserva la gestión de profesores part time y de sus accesos dentro de los departamentos gestionados de su carrera. Las sesiones requieren un registro vigente en PostgreSQL, además de un JWT válido.

## Permisos

| Operación | Admin | Secretaría |
| --- | --- | --- |
| Listar, crear, editar y eliminar cuentas mediante `/api/usuarios` | Sí | No, responde 403 |
| Gestionar profesores part time | Sí | Según el alcance de su carrera |
| Crear, editar o retirar el acceso de un profesor part time | Sí | Solo en departamentos gestionados y con rol de cuenta `profesor` |
| Vincular una cuenta existente por `usuarioId` | Sí | No, debe crear el acceso desde el profesor |
| Cambiar roles o administrar cuentas privilegiadas | Sí, mediante administración general | No, tampoco mediante un profesor vinculado |

El cambio de nombre y la eliminación de un profesor también pueden afectar su cuenta vinculada. Esas rutas aplican las mismas protecciones. Secretaría no puede convertir un profesor planta a part time para eludirlas. Las respuestas de profesores y usuarios no incluyen contraseñas ni la versión interna de sesión.

## Sesiones

- El login crea una sesión aleatoria y firma su identificador en el JWT. La expiración persistida coincide con la del token.
- Cada petición autenticada comprueba firma, expiración, sesión vigente, existencia de cuenta y autoridad actual. No hay aceptación alternativa de JWT sin persistencia.
- Logout acepta cookie o bearer y elimina únicamente la sesión presentada. Repetirlo, no presentar token o presentar uno inválido conserva el cierre idempotente. Un fallo de almacenamiento no se informa como cierre exitoso.
- Cambiar rol, contraseña o correo invalida las sesiones de la cuenta en la misma transacción. Eliminar la cuenta elimina sus sesiones por clave foránea. Cambiar solo el nombre no cierra sesiones.
- El login vuelve a comprobar las credenciales bajo bloqueo antes de persistir la sesión. La versión interna detecta también cambios de rol de ida y vuelta durante ese intervalo.

**Los JWT anteriores a este cambio dejan de ser válidos y requieren iniciar sesión otra vez.** La expiración impide usar sesiones vencidas, pero no elimina sus filas automáticamente. Su retención y limpieza deben definirse como parte de la operación, sin habilitar trabajos externos implícitos.

## Configuración productiva

`PORT` debe contener únicamente dígitos decimales y representar un entero entre 1 y 65535. El valor omitido conserva `3000`, un valor vacío, negativo o con sufijo se rechaza.

`JWT_SECRET` no puede estar vacío ni contener solo espacios. En producción debe estar definido y no puede ser el secreto predeterminado de desarrollo, tampoco rodeado de espacios. La validación no demuestra que un secreto elegido tenga entropía suficiente, use un valor aleatorio y manténgalo fuera del repositorio. `JWT_EXPIRES_IN` conserva su contrato existente.

El migrador registra inicio, éxito o fallo sin imprimir la URL de conexión ni el error original, que podría incluir credenciales. No interprete un mensaje de inicio como una migración exitosa.

## Migración y límites de verificación

`backend/src/db/migrations/0020_sesiones-revocables.sql` agrega `sesiones`, su índice y clave foránea, y `usuarios.version_sesion`. No reemplaza datos ni modifica las migraciones heredadas. El backend actualizado necesita ese esquema antes de atender autenticación, no debe desplegarse sin coordinar la transición.

La preparación del archivo SQL **no equivale a haber aplicado ni validado la migración**. Antes de aplicarla sobre datos existentes se deben comprobar la cadena completa de migraciones, incluidos los antecedentes de `0009`, `0011` y `0013`, el respaldo y la restauración en un entorno aislado. Una comprobación sobre una base nueva no demuestra que la migración sea segura sobre datos heredados poblados. Esta guía no autoriza una ejecución sobre desarrollo o producción.

Las pruebas focales sin base real son:

```text
node node_modules/vitest/vitest.mjs run tests/usuarios-autorizacion.test.ts tests/profesores-permisos.test.ts tests/auth-sesiones.test.ts tests/sesiones-repository.test.ts tests/configuracion-entorno.test.ts tests/migrate-logs.test.ts
```

Ejecute desde `backend`, con los ejecutores instalados y caché/temporales aislados. Utilizan repositorios o drivers simulados, no prueban persistencia, reversión ni concurrencia real de PostgreSQL. Las integraciones opt-in requieren autorización y una base dedicada antes de ejecutarse.

### Verificación PostgreSQL de sesiones

`backend/tests/integracion/sesiones.postgres.test.ts` contiene comprobaciones HTTP reales de logout individual, cambio de rol por otro administrador, baja con eliminación en cascada, rollback ante un fallo de revocación y dos carreras de login. La variante de ida y vuelta cambia admin → profesor → admin en una transacción. Las carreras esperan un bloqueo `FOR UPDATE` observado mediante `pg_stat_activity` y `pg_blocking_pids`, no usan una pausa como garantía de orden.

El archivo se omite sin conectar ni cargar la configuración de la aplicación cuando `RUN_ISOLATED_DATABASE_TESTS` no es `true`. Para habilitarlo exige además `NODE_ENV=test`, `PRUEBAS_EN_EJECUCION=yes`, `BASE_PRUEBAS_REINICIABLE=yes` y el destino sintético exacto definido en `backend/tests/soporte/base-pruebas.ts`. Antes de migrar comprueba base, usuario restringido, propietario, ausencia de tablas públicas y del esquema `drizzle`, y exclusión mediante un advisory lock. Nunca trunca datos existentes ni ejecuta seeds.

El diseño aplica `0000`–`0019` mediante el migrador normal en una base nueva, inserta una cuenta sintética con bcrypt y aplica `0020` con el mismo migrador. Comprueba el diario de 20 y luego 21 entradas, la conservación de la cuenta, la versión inicial 0, el índice y la clave foránea. La preparación del test **no acredita su ejecución ni la aprobación de las migraciones**.

Comando preparado dentro del backend descartable, con configuración externa y `.env` vacío, ambos de solo lectura:

```text
node node_modules/vitest/vitest.mjs run --config /app/vitest-aislado.mjs tests/integracion/sesiones.postgres.test.ts --reporter=verbose
```

El arnés externo limita la ejecución a cinco minutos, usa imágenes locales sin descargas, raíz de solo lectura, red interna propia, cero puertos publicados y datos PostgreSQL en tmpfs. Antes del arranque debe inspeccionar aislamiento y montajes. La retirada se limita a recursos identificados por nombre y etiqueta propios.

La existencia del archivo y del comando no demuestra que se hayan ejecutado los casos. Antes de cada ejecución confirme autorización e aislamiento. Si falla la preparación, detenga el procedimiento antes de migrar o ejecutar las pruebas, sin reintentos automáticos. El historial de cada comprobación se conserva fuera de la documentación versionada del sistema.

El [drenaje HTTP y el manejo de errores JSON 400/413](http-apagado.md) forman parte del backend. Su implementación y las pruebas disponibles no demuestran preparación productiva. Siguen requiriendo verificación la configuración y exposición de servicios, cookies/CORS/CSRF, los límites operativos, salud/readiness, respaldo/restauración, migraciones sobre datos heredados poblados, dependencias e integraciones pendientes. La mejora matemática de selección global de secciones permanece excluida, no la seguridad e integración del optimizador.
