# Configuración mínima de la demostración

La demostración requiere configuración productiva y transporte seguro hasta el navegador. Las comprobaciones locales no acreditan HTTPS, restricción de red, proxy, PostgreSQL ni revisión de todos los datos del servidor universitario. Esta guía no autoriza acceso remoto, despliegue, modificación de cuentas ni ejecución de seed.

## Condiciones que deben confirmarse antes de publicar

| Tema | Estado y condición necesaria |
| --- | --- |
| HTTP o HTTPS | HTTPS no está confirmado. Verificar el esquema que verá el navegador, no solo el enlace interno entre proxy y API |
| Origen público | Confirmar esquema, host y puerto del frontend y la API. El frontend usa `/api` por defecto, eso no configura un proxy productivo |
| Proxy o servidor web | Confirmar qué ofrece el alojamiento sin Docker adicional. Preferir frontend y `/api` bajo un mismo origen si es viable |
| Acceso de red | Está previsto acceso universitario, la restricción efectiva sigue pendiente. Verificarla desde dentro y fuera de la red autorizada |
| Secretos y cuentas | Falta confirmar responsable y canal de configuración, sin valores en Git, capturas o logs. Revisar las cuentas que quedarán habilitadas |
| Datos | La demostración debe usar datos ficticios, pero no se ha acreditado que todos los registros existentes hayan sido revisados |

No usar `NODE_ENV=development` para sortear cookies ni sustituir el arranque productivo por el servidor de desarrollo de Vite. La compilación y el proceso de publicación pertenecen al procedimiento de alojamiento, no quedan demostrados por un chequeo de tipos.

## Variables de configuración

| Variable | Requisito |
| --- | --- |
| `NODE_ENV` | Definir `production` en el proceso de la API. Solo se aceptan `development`, `test` y `production`, la omisión conserva desarrollo por compatibilidad local |
| `PORT` | Puerto interno acordado con el alojamiento, entero decimal de 1 a 65535, predeterminado `3000`. No equivale a autorizar exposición pública |
| `DATABASE_URL` | Configurar externamente el destino autorizado. No puede estar vacío ni contener solo espacios. La validación no conecta, no comprueba formato completo, permisos, TLS de PostgreSQL ni migraciones |
| `CLIENT_URL` | Obligatorio en producción. Origen exacto del frontend, sin barra final, ruta, consulta, fragmento ni credenciales, por ejemplo `https://cliente.invalid` solo como valor sintético |
| `JWT_SECRET` | Secreto aleatorio exclusivo del entorno, distinto del predeterminado y de al menos 32 bytes UTF-8 sin espacios exteriores para el cómputo. La firma usa el valor original. La longitud no prueba aleatoriedad |
| `JWT_EXPIRES_IN` | Predeterminado `8h`, mantener ocho horas para la demostración. Admite la sintaxis válida de `jsonwebtoken`, rechaza duraciones inválidas o menores de un segundo completo |
| `VITE_API_URL` | Configuración de compilación del frontend, no un secreto. Omitirla conserva `/api`, usar otro destino solo después de confirmar los orígenes y la política de cookies |

Las validaciones fallan al cargar la configuración, antes de atender login, con nombres de campos y mensajes, sin imprimir sus valores. No generan secretos ni alteran archivos de entorno. Una cadena como `JWT_EXPIRES_IN=120` significa 120 milisegundos, no 120 segundos, y se rechaza. Preferir siempre unidades explícitas.

El mínimo de longitud del secreto se fundamenta en [RFC 7518, sección 3.2](https://www.rfc-editor.org/rfc/rfc7518#section-3.2), HS256 requiere una clave de al menos 256 bits. Un texto repetido puede superar la validación de longitud sin ser un secreto adecuado. La sintaxis de duración se conserva mediante la API pública de [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken#token-expiration-exp-claim), sin añadir dependencias.

## Cookies, CORS y exposición CSRF

Se conserva `auth_token` HttpOnly, `Secure` y `SameSite=None` en producción, tanto al emitir como al borrar la cookie. El JWT dura ocho horas por defecto, los cambios relevantes de cuenta lo invalidan mediante su versión. Logout borra la cookie, no revoca copias del JWT. No hay sesiones persistidas, Redis ni SSO.

Si la universidad ofrece **solo HTTP al navegador**, la autenticación actual con cookie `Secure` no es una configuración viable para ese destino. Además, las credenciales viajarían sin cifrado. Detener la publicación y decidir con la universidad cómo proporcionar HTTPS, no quitar `Secure`, cambiar a desarrollo ni usar bearer como atajo. Un backend HTTP detrás de un terminador HTTPS es un caso distinto que debe comprobarse, no asumirse.

CORS permite leer respuestas desde el origen configurado, **no impide que el servidor procese peticiones de otro origen ni sustituye una defensa CSRF**. El backend no tiene una comprobación general de `Origin` para operaciones mutables. Con `SameSite=None`, si el navegador admite la cookie en contexto de terceros, puede adjuntarla en peticiones entre sitios. No se debe confiar en el bloqueo de cookies de terceros como protección.

La exposición no se limita a JSON con preflight: logout admite POST sin cuerpo y las importaciones Excel usan `multipart/form-data`. Una petición simple puede alcanzar esas rutas aunque el navegador no permita leer su respuesta. Esto describe una exposición del diseño actual, no una importación maliciosa ejecutada contra datos existentes.

Una vez confirmada la topología, evaluar primero la solución sencilla: mismo origen, conservar `Secure`, considerar `SameSite=Lax` y comprobación de origen en operaciones mutables con cookie. El mismo origen o el proxy por sí solos no corrigen CSRF mientras se mantenga `SameSite=None`. Si se necesitan sitios distintos, acordar una defensa compatible antes de publicarlos. **No se cambia esa política ni se añade un mecanismo CSRF en esta preparación**, falta confirmar el escenario. Referencia: [alcance del middleware CORS](https://github.com/expressjs/cors).

## Cuentas y datos de demostración

La seed conserva cuentas iniciales con claves derivables del correo, útiles para reproducir un entorno local, no como credenciales para una red compartida. No se cambia ni se ejecuta la seed para preparar la publicación.

La medida mínima recomendada es gestionar credenciales no previsibles para las cuentas de demostración que realmente se usarán, mediante una operación separada y autorizada. Una restricción de red comprobada reduce la exposición, pero no vuelve secretas las claves conocidas dentro de esa red. Evitar una nueva plataforma de identidad para esta demostración.

Las credenciales administrativas compartidas previamente se consideran potencialmente expuestas. Deben rotarse en una operación autorizada independiente, no reproducirlas, probarlas ni guardarlas. Revisar también cuentas innecesarias y datos antes de exponer el entorno, sin asumir que una seed anterior o una prueba offline ya acreditó esa revisión.

## Comprobación y continuidad

Usar el [inventario local revisado](verificacion-local.md) y las [pruebas focales de identidad](seguridad-identidad.md#migración-y-límites-de-verificación). Antes de ejecutar, revisar efectos y permisos: Supertest puede abrir listeners implícitos que no están restringidos a loopback por defecto. Con autorización limitada a loopback, abrir un servidor en `127.0.0.1:0`, esperar el evento `listening` y pasar ese servidor a Supertest. Cerrar los listeners al terminar.

Las pruebas deben distinguir validación unitaria, HTTP sintético con repositorios simulados y navegador real. Ver `Set-Cookie` mediante HTTP local no acredita que un navegador almacene y envíe una cookie `Secure` en el servidor destino. Mantener fuera de esta preparación conexiones PostgreSQL, certificados, contenedores, cambios del equipo y datos existentes.

Para la adaptación al alojamiento se necesitan, sin incluir valores secretos:

- Confirmación de HTTPS, orígenes, servidor web/proxy y restricción de acceso efectiva.
- Variables de la tabla anterior, canal externo de secretos y responsable de las cuentas de demostración.
- Decisión de cookies/CSRF basada en esa topología, sin modificar permisos por rol o carrera.
- Revisión de datos y rotación de credenciales potencialmente expuestas con autorización propia.
- Procedimiento sin Docker adicional, arranque productivo y pruebas autorizadas de navegador y PostgreSQL en el destino.

La adaptación y el despliegue son una fase separada. No considerar estos cambios integrados hasta que el usuario haga commit, push, PR y merge, y se compruebe después `main` según las reglas del proyecto.
