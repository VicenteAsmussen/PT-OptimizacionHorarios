# Permisos de cuentas y autenticación con JWT

La administración general de usuarios queda reservada a `admin`. Secretaría conserva la gestión de profesores part time y de sus accesos dentro de los departamentos gestionados de su carrera. La autenticación usa JWT en una cookie HttpOnly y consulta el usuario vigente, sin guardar una sesión por token.

## Permisos

| Operación | Admin | Secretaría |
| --- | --- | --- |
| Listar, crear, editar y eliminar cuentas mediante `/api/usuarios` | Sí | No, responde 403 |
| Gestionar profesores part time | Sí | Según el alcance de su carrera |
| Crear, editar o retirar el acceso de un profesor part time | Sí | Solo en departamentos gestionados y con rol de cuenta `profesor` |
| Vincular una cuenta existente por `usuarioId` | Sí | No, debe crear el acceso desde el profesor |
| Cambiar roles o administrar cuentas privilegiadas | Sí, mediante administración general | No, tampoco mediante un profesor vinculado |

El cambio de nombre y la eliminación de un profesor también pueden afectar su cuenta vinculada. Esas rutas aplican las mismas protecciones. Secretaría no puede convertir un profesor planta a part time para eludirlas. Las respuestas de profesores y usuarios no incluyen contraseñas ni la versión interna de sesión.

Administración conserva el mantenimiento institucional y el acceso de profesores de planta, pero no puede eliminar un perfil con disponibilidades, asignaciones u horarios asociados. La retirada de acceso no elimina el perfil ni sus datos académicos. La gestión part time de secretaría conserva sus reglas específicas. Consulte la separación entre identidad, catálogos y operación en [permisos operativos](permisos-operativos.md).

## JWT y cookies

- El login firma el identificador del usuario y su `versionSesion`, sin `sid` ni inserciones en una tabla de sesiones. El vencimiento predeterminado es de **8 horas desde el login**, sin renovación automática por actividad ni ajuste a una hora de salida laboral.
- La cookie `auth_token` es HttpOnly y vence junto con el JWT. Usa `Secure=false`, `SameSite=Lax` y `Path=/` tanto en producción como en desarrollo, coherentemente en login y logout. HTTP es el transporte normal de la tesis, con ejecución compilada en producción. También se conserva la aceptación de bearer para clientes que ya lo utilicen, sin trasladar tokens a localStorage.
- Cada petición autenticada comprueba firma HS256, expiración, existencia del usuario y coincidencia de versión. Los permisos usan el rol vigente y mantienen las comprobaciones de carrera, no dependen del rol antiguo incluido en el JWT.
- **Logout solo borra la cookie del navegador. No revoca el JWT:** una copia puede reutilizarse hasta vencer, incluso después de cerrar sesión. Repetir logout o hacerlo sin token válido sigue respondiendo con éxito, sin consultar la base, siempre que la petición cumpla la protección CSRF.
- Cambiar rol, contraseña o correo incrementa `usuarios.version_sesion` en la misma actualización. Todos los tokens anteriores de esa cuenta se rechazan, incluso si luego se restaura el valor anterior. El contador pertenece al usuario, no representa una entidad de sesiones ni permite cerrar un dispositivo individualmente.
- Eliminar la cuenta impide autenticar sus tokens porque el usuario ya no existe. Cambiar solo el nombre conserva el acceso y las siguientes peticiones reciben el nombre actual.
- El login vuelve a consultar las credenciales después de comparar la contraseña. Si detecta una baja o un cambio de versión, correo, contraseña o rol, rechaza el acceso. Si el cambio se confirma después de esa consulta, el JWT conserva la versión anterior y no autentica las peticiones posteriores al cambio. Una petición autenticada antes de una actualización puede terminar, no se cancelan solicitudes en curso.

**Los JWT anteriores a este cambio, que no incluyen una versión válida, se rechazan y requieren iniciar sesión otra vez.** No se admite un modo de compatibilidad con los tokens antiguos.

## Configuración productiva

`PORT` debe contener únicamente dígitos decimales y representar un entero entre 1 y 65535. El valor omitido conserva `3000`, un valor vacío, negativo o con sufijo se rechaza.

`JWT_SECRET` no puede estar vacío ni contener solo espacios. En producción debe estar definido, ser distinto del secreto predeterminado de desarrollo y contener al menos 32 bytes UTF-8 sin contar espacios exteriores. Se usa el valor original para firmar, no se recorta ni normaliza. Esta longitud mínima para HS256 no demuestra entropía suficiente, use un secreto aleatorio y manténgalo fuera del repositorio.

`JWT_EXPIRES_IN` conserva el formato de duración de `jsonwebtoken`, con valor predeterminado `8h`. Se rechazan al arrancar duraciones inválidas o que no produzcan al menos un segundo completo. Use unidades explícitas, una cadena numérica sin unidad representa milisegundos. Configure `JWT_EXPIRES_IN=8h` también en los entornos que antes indicaban `7d`, un valor explícito válido prevalece sobre el predeterminado. La duración de la cookie se obtiene del vencimiento del JWT, no de una segunda duración fija. Una configuración mayor amplía también el tiempo de reutilización después de logout.

`CLIENT_URL` debe representar exactamente un origen HTTP o HTTPS, sin barra final, credenciales, ruta, consulta ni fragmento. En producción es obligatorio definirlo, fuera de producción se conserva `http://localhost:5173` cuando se omite. La configuración normal usa un origen HTTP compartido entre frontend y `/api`, por ejemplo `http://localhost:3000` en una ejecución local compilada. Se conserva la validación de orígenes HTTPS por compatibilidad, no como requisito de este proyecto. `DATABASE_URL` rechaza valores vacíos o compuestos solo por espacios, esta validación no comprueba conexión ni permisos de PostgreSQL.

La protección CSRF se aplica centralmente antes de los parsers y las rutas de `/api`: toda mutación exige `X-CSRF-Protection: 1`, incluidos login, logout y Excel multipart. Si aparece `Origin`, debe coincidir exactamente con `CLIENT_URL`, `null` y otros orígenes se rechazan. También se rechaza `Sec-Fetch-Site: cross-site`, pero no se exige su presencia sobre HTTP. Sin `Origin`, un cliente no navegador debe seguir aportando la cabecera. No se alteran roles ni alcance de carrera. Consulte [configuración HTTP y fundamento de la defensa](configuracion-demostracion.md#cookies-y-protección-csrf).

HTTP no cifra credenciales, cookies ni datos. CSRF no protege frente a interceptación, alteración del tráfico ni XSS. No se presupone una red restringida, su comprobación y el acceso al alojamiento siguen pendientes y requieren autorización separada.

El migrador registra inicio, éxito o fallo sin imprimir la URL de conexión ni el error original, que podría incluir credenciales. No interprete un mensaje de inicio como una migración exitosa.

El manejador HTTP de errores inesperados registra `Error interno no controlado` con una categoría controlada por el prototipo del error, el método HTTP reconocido y la plantilla de ruta registrada en Express. No copia el nombre ni serializa el error original, su causa, pila, parámetros, URL solicitada, cabeceras o cuerpo. Así conserva contexto mínimo para distinguir fallos sin volcar datos de consultas o planillas. Mantiene la respuesta 500 genérica y los contratos anteriores de errores de dominio y JSON 400/413. Esto no certifica todos los registros de la aplicación. Consulte las [condiciones de configuración de la demostración](configuracion-demostracion.md) antes de publicar.

## Migración y límites de verificación

La migración histórica `0020_sesiones-revocables.sql` se conserva intacta. `0021_retirar-sesiones-autenticacion.sql` elimina únicamente la tabla `sesiones`, incluidos sus registros, índice y clave foránea. Conserva usuarios, `usuarios.version_sesion` y todos los datos académicos. No reescriba migraciones aplicadas, no reinicialice la base ni vuelva a ejecutar la seed para este cambio.

Antes de aplicar `0021`, confirme el destino y disponga de un respaldo adecuado. Detenga el backend anterior, aplique la cadena pendiente con `pnpm db:migrate` desde `backend` y arranque la versión actualizada. La versión anterior necesita la tabla que se elimina y no debe seguir atendiendo peticiones. Los usuarios deben iniciar sesión otra vez. El backend nuevo requiere `version_sesion`, pero no necesita la tabla antigua para funcionar si todavía no se aplicó su retirada física.

La preparación del archivo SQL **no equivale a haber aplicado ni validado la migración**. Una comprobación sobre una base nueva no demuestra que toda la cadena sea segura sobre datos heredados poblados, incluidos los antecedentes de `0009`, `0011` y `0013`. Esta guía no autoriza por sí sola una ejecución sobre desarrollo o producción.

Las pruebas focales sin base real son:

```text
node node_modules/vitest/vitest.mjs run tests/usuarios-autorizacion.test.ts tests/profesores-permisos.test.ts tests/auth-jwt.test.ts tests/usuarios-version.test.ts tests/configuracion-entorno.test.ts tests/migrate-logs.test.ts
```

Ejecute desde `backend`, con los ejecutores instalados y caché/temporales aislados. Utilizan repositorios o drivers simulados, no prueban persistencia, reversión ni concurrencia real de PostgreSQL. Las integraciones opt-in requieren autorización y una base dedicada antes de ejecutarse.

### Verificación PostgreSQL de autenticación

`backend/tests/integracion/auth-jwt.postgres.test.ts` comprueba la transición desde `0020` con una cuenta y una sesión sintéticas, la conservación íntegra de la cuenta y su versión, la eliminación de la tabla y el rechazo de un JWT antiguo. Incluye login y logout por HTTP, reutilización del token después de logout, invalidación al cambiar rol, correo o contraseña y baja de cuenta. Los permisos por rol y carrera tienen además sus pruebas específicas.

El archivo se omite sin conectar ni cargar la configuración de la aplicación cuando `RUN_ISOLATED_DATABASE_TESTS` no es `true`. Para habilitarlo exige además `NODE_ENV=test`, `PRUEBAS_EN_EJECUCION=yes`, `BASE_PRUEBAS_REINICIABLE=yes` y el destino sintético exacto definido en `backend/tests/soporte/base-pruebas.ts`. Antes de migrar comprueba base, usuario restringido, propietario, ausencia de tablas públicas y del esquema `drizzle`, y exclusión mediante un advisory lock. Nunca trunca datos existentes ni ejecuta seeds.

El diseño aplica la cadena hasta `0020` mediante el migrador normal en una base nueva, inserta los datos sintéticos y aplica las migraciones posteriores con el mismo migrador. La preparación del test **no acredita su ejecución ni la aprobación de las migraciones**, y estos casos no prueban concurrencia PostgreSQL real.

Comando preparado dentro del backend descartable, con configuración externa y `.env` vacío, ambos de solo lectura:

```text
node node_modules/vitest/vitest.mjs run --config /app/vitest-aislado.mjs tests/integracion/auth-jwt.postgres.test.ts --reporter=verbose
```

El arnés externo limita la ejecución a cinco minutos, usa imágenes locales sin descargas, raíz de solo lectura, red interna propia, cero puertos publicados y datos PostgreSQL en tmpfs. Antes del arranque debe inspeccionar aislamiento y montajes. La retirada se limita a recursos identificados por nombre y etiqueta propios.

La existencia del archivo y del comando no demuestra que se hayan ejecutado los casos. Antes de cada ejecución confirme autorización e aislamiento. Si falla la preparación, detenga el procedimiento antes de migrar o ejecutar las pruebas, sin reintentos automáticos. El historial de cada comprobación se conserva fuera de la documentación versionada del sistema.

El [drenaje HTTP y el manejo de errores JSON 400/413](http-apagado.md) forman parte del backend. Su implementación y las pruebas locales disponibles no demuestran preparación del alojamiento. La sesión HTTP y CSRF tienen pruebas locales sin base real, la exposición de servicios y el recorrido en navegador del entorno destino siguen sin verificarse. También quedan los límites operativos, salud/readiness, respaldo/restauración, migraciones sobre datos heredados poblados, dependencias e integraciones pendientes. La mejora matemática de selección global de secciones permanece excluida, no la seguridad e integración del optimizador.
