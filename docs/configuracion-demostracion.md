# Configuración del proyecto por HTTP

HTTP es el transporte normal y definitivo del proyecto de tesis, no un modo temporal de demostración. No se prevé publicación en Internet ni se exige HTTPS para este alcance. Se mantiene `NODE_ENV=production` con backend y frontend compilados. Esta guía no autoriza acceso remoto, despliegue, modificación de cuentas, migraciones ni seeds.

**HTTP no ofrece cifrado:** credenciales, cookies y datos pueden ser observados o alterados durante el tránsito. HttpOnly, SameSite y CSRF no corrigen ese límite. No se ha comprobado una restricción de red, debe verificarse por separado antes de habilitar acceso en un entorno real.

## Ejecución compilada y mismo origen

1. Compilar con `pnpm --dir frontend build` y `pnpm --dir backend build`. Omitir `VITE_API_URL` o usar `/api` al compilar, no incluir secretos en variables `VITE_*`.
2. Configurar externamente las variables productivas de la tabla siguiente. `backend/.env.example` es una plantilla sin secretos utilizables, no copiar el `.env` local al servidor.
3. Desde `backend`, ejecutar `pnpm start` con `NODE_ENV=production` ya definido en el entorno del proceso.
4. Abrir el origen configurado, por ejemplo `http://localhost:3000/login` para una ejecución local. Express sirve `frontend/dist` y `/api` en el mismo puerto, sin Vite ni proxy adicional. Se conserva la estructura de directorios del repositorio, la ubicación de los archivos compilados no depende del directorio desde el que se inicie Node.

El arranque productivo rechaza la ausencia de `frontend/dist/index.html`. Las rutas de navegación devuelven el HTML de la SPA, `/api` conserva sus respuestas JSON y los archivos ausentes no se convierten en HTML. `CLIENT_URL` debe coincidir con el origen que realmente abre el navegador, incluido el puerto. Usar otro host o puerto requiere corregir esa configuración, no ampliar CORS con comodines.

## Condiciones del entorno que siguen pendientes

| Tema | Estado y condición necesaria |
| --- | --- |
| Transporte | HTTP está decidido e implementado localmente, la exposición efectiva del entorno no queda acreditada por las pruebas locales |
| Origen de acceso | Confirmar host y puerto HTTP, usar ese mismo origen para frontend y API |
| Proceso | Express sirve ambos compilados, el supervisor y la persistencia del alojamiento deben verificarse en una operación separada |
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
| `CLIENT_URL` | Obligatorio en producción. Origen exacto del navegador, sin barra final, ruta, consulta, fragmento ni credenciales, por ejemplo `http://localhost:3000` para ejecución local |
| `JWT_SECRET` | Secreto aleatorio exclusivo del entorno, distinto del predeterminado y de al menos 32 bytes UTF-8 sin espacios exteriores para el cómputo. La firma usa el valor original. La longitud no prueba aleatoriedad |
| `JWT_EXPIRES_IN` | Predeterminado `8h`, mantener ocho horas para la demostración. Admite la sintaxis válida de `jsonwebtoken`, rechaza duraciones inválidas o menores de un segundo completo |
| `VITE_API_URL` | Configuración de compilación del frontend, no un secreto. Omitirla conserva `/api`, que es la configuración normal de mismo origen. Sitios distintos no forman parte de esta topología |

Las validaciones fallan al cargar la configuración, antes de atender login, con nombres de campos y mensajes, sin imprimir sus valores. No generan secretos ni alteran archivos de entorno. Una cadena como `JWT_EXPIRES_IN=120` significa 120 milisegundos, no 120 segundos, y se rechaza. Preferir siempre unidades explícitas.

El mínimo de longitud del secreto se fundamenta en [RFC 7518, sección 3.2](https://www.rfc-editor.org/rfc/rfc7518#section-3.2), HS256 requiere una clave de al menos 256 bits. Un texto repetido puede superar la validación de longitud sin ser un secreto adecuado. La sintaxis de duración se conserva mediante la API pública de [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken#token-expiration-exp-claim), sin añadir dependencias.

## Cookies y protección CSRF

`auth_token` usa HttpOnly, `Secure=false`, `SameSite=Lax` y `Path=/`, tanto al emitir como al borrar la cookie, independientemente de `NODE_ENV`. El JWT dura ocho horas por defecto, los cambios relevantes de cuenta lo invalidan mediante su versión. Logout borra la cookie, no revoca copias del JWT. No hay tokens en localStorage, sesiones persistidas, Redis ni SSO.

La API exige `X-CSRF-Protection: 1` en todos los métodos salvo `GET`, `HEAD` y `OPTIONS`, incluidos login, logout y las tres importaciones Excel. El cliente común añade la cabecera también a `FormData`, sin fijar su `Content-Type` ni romper el delimitador multipart. Un formulario HTML simple no puede añadir esta cabecera.

Además, el middleware contrasta `Origin`, cuando está presente, con `CLIENT_URL` exacto. Rechaza otros puertos, subdominios, orígenes `null` o malformados, sin derivar confianza de `Host` ni `X-Forwarded-*`. Rechaza `Sec-Fetch-Site: cross-site` cuando aparece, pero no depende de Fetch Metadata, que puede faltar sobre HTTP. Todo rechazo CSRF devuelve JSON 403 antes de interpretar JSON, cargar Excel o ejecutar controladores, sin borrar la cookie.

Los clientes no navegador también deben enviar la cabecera explícita. Se acepta la ausencia de `Origin` únicamente con esa cabecera, para conservar su uso sin inventar un origen. Un navegador de otro origen no puede adjuntarla sin preflight, CORS solo permite el origen exacto configurado y el middleware rechaza un origen ajeno aunque el cliente logre enviar la petición. No se permite usar cuerpo, consulta ni cookie como sustituto de la cabecera. Los permisos por rol y carrera siguen en sus capas actuales.

No se confía únicamente en CORS ni en SameSite. La cabecera es una prueba de solicitud no simple, no un token de sesión ni un secreto. Referencias: [OWASP, cabeceras personalizadas y validación de origen](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi), [alcance de CORS](https://github.com/expressjs/cors). Estas defensas no evitan XSS ni la interceptación o alteración del tráfico HTTP.

## Cuentas y datos de demostración

La seed conserva cuentas iniciales con claves derivables del correo, útiles para reproducir un entorno local, no como credenciales para una red compartida. No se cambia ni se ejecuta la seed para preparar la publicación.

La medida mínima recomendada es gestionar credenciales no previsibles para las cuentas de demostración que realmente se usarán, mediante una operación separada y autorizada. Una restricción de red comprobada reduce la exposición, pero no vuelve secretas las claves conocidas dentro de esa red. Evitar una nueva plataforma de identidad para esta demostración.

Las credenciales administrativas compartidas previamente se consideran potencialmente expuestas. Deben rotarse en una operación autorizada independiente, no reproducirlas, probarlas ni guardarlas. Revisar también cuentas innecesarias y datos antes de exponer el entorno, sin asumir que una seed anterior o una prueba offline ya acreditó esa revisión.

## Comprobación y continuidad

Usar el [inventario local revisado](verificacion-local.md) y las [pruebas focales de identidad](seguridad-identidad.md#migración-y-límites-de-verificación). Antes de ejecutar, revisar efectos y permisos: Supertest puede abrir listeners implícitos que no están restringidos a loopback por defecto. Con autorización limitada a loopback, abrir un servidor en `127.0.0.1:0`, esperar el evento `listening` y pasar ese servidor a Supertest. Cerrar los listeners al terminar.

Las pruebas distinguen validación unitaria, HTTP local con repositorios simulados y navegador real. `tests/transporte-http.test.ts` comprueba login, continuidad de cookie HTTP y logout con un agente HTTP, además de CSRF y rechazos sin efectos. `tests/frontend-compilado.test.ts` comprueba archivos y navegación del frontend. Esto no equivale a una prueba de navegador real ni del alojamiento. Mantener fuera de esta adaptación conexiones PostgreSQL, contenedores, migraciones, seeds y cambios de datos existentes.

Para la adaptación al alojamiento se necesitan, sin incluir valores secretos:

- Confirmación del origen HTTP, arranque compilado y restricción de acceso efectiva.
- Variables de la tabla anterior, canal externo de secretos y responsable de las cuentas de demostración.
- Comprobación en navegador de la política HTTP ya implementada y de las operaciones protegidas, sin modificar permisos por rol o carrera.
- Revisión de datos y rotación de credenciales potencialmente expuestas con autorización propia.
- Procedimiento sin Docker adicional, arranque productivo y pruebas autorizadas de navegador y PostgreSQL en el destino.

La adaptación local no autoriza el despliegue ni acredita su funcionamiento remoto. No considerar estos cambios integrados hasta que el usuario haga commit, push, PR y merge, y se compruebe después `main` según las reglas del proyecto.
