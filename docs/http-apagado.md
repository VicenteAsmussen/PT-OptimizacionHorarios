# Errores JSON y apagado del backend

El backend distingue los errores de entrada JSON de los fallos internos y espera el drenaje de las solicitudes HTTP antes de cerrar sus dependencias.

## Errores de entrada

| Situación | Estado HTTP | Mensaje |
| --- | --- | --- |
| JSON malformado | 400 | `El cuerpo contiene JSON no válido.` |
| Cuerpo superior al límite del parser | 413 | `El cuerpo de la solicitud es demasiado grande.` |

La respuesta mantiene la estructura `{ "status": "error", "statusCode": 400, "message": "..." }`, con el código que corresponda. El límite existente de `express.json()` no cambia: acepta hasta 102400 bytes. Una entrada rechazada no llega a la ruta ni se registra con su contenido.

El manejador identifica únicamente los errores confirmados del parser por su tipo y estado coherentes. Un error ajeno no adquiere estado 400 por incluir una propiedad `status`. Los errores de dominio conservan su contrato y los fallos internos siguen respondiendo 500 con `Internal server error`.

## Apagado por SIGINT o SIGTERM

1. Marca el servidor en cierre, deja de aceptar conexiones y detiene las nuevas comprobaciones periódicas de recuperación.
2. Espera las solicitudes HTTP ya admitidas y las recuperaciones en curso. Las solicitudes nuevas que lleguen por conexiones todavía abiertas reciben 503 con `Connection: close`.
3. Cierra los procesos Julia, espera el cierre de optimización y finalmente cierra SQL.
4. Termina con código 0 si todo finalizó correctamente, o 1 si alguna etapa falló. Las señales repetidas comparten el mismo cierre.

El límite total es de **30 segundos desde la primera señal**, no por cada recurso. Si vence, se cierran forzosamente las conexiones HTTP y el proceso termina con código 1. No se inicia después el cierre SQL bajo tareas que siguen pendientes. Ese límite evita una espera indefinida, no garantiza que se complete el trabajo interrumpido. El plazo de terminación del entorno de despliegue debe permitir el drenaje, una terminación forzada anterior lo impide.

## Comprobación

Desde `backend`, con los ejecutores instalados y temporales/caché aislados:

```text
node node_modules/vitest/vitest.mjs run tests/apagado-http.test.ts tests/errores-json.test.ts
```

Las pruebas del parser usan Express y HTTP locales reales. Las pruebas de apagado cubren solicitudes activas mediante TCP local, señales y dependencias con dobles. No ejecutan el optimizador ni conexiones SQL reales, tampoco sustituyen una comprobación de terminación en la topología productiva.

Este bloque no verifica cookies/CORS/CSRF, límites de login o XLSX, exposición de servicios, salud/readiness, respaldo/restauración, dependencias ni migraciones sobre datos heredados poblados. Consulte también [permisos, sesiones y configuración](seguridad-identidad.md).
