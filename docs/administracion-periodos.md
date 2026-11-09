# Administrar los períodos de una carrera

Los administradores pueden abrir **Administración de períodos** desde la navegación de la aplicación. Hay que seleccionar una carrera y un período, los períodos de otras carreras nunca se incluyen aunque tengan el mismo código.

## Crear un período

En **Administración de períodos**, seleccione la carrera en la tarjeta del título. Debajo aparecen **Seleccionar período** y **Crear período**, uno junto al otro o apilados en pantallas pequeñas. Deje vacía la selección de período para ingresar un código como `2027-1` en **Crear período**. Al elegir un período existente, se borra de inmediato el código de creación, esa sección se atenúa y deshabilita, y debajo se muestran sus opciones de administración. Elija **Selecciona un período** para quitar la selección e ingresar un código nuevo. El catálogo incluye carreras que todavía no tienen períodos y no elige ninguna automáticamente. La ayuda aclara que el nuevo período se creará en Preparación y quedará como actual de la carrera. El botón solo se habilita con una carrera del catálogo y un código válido de exactamente seis caracteres ASCII. Al salir de un código inválido se muestra su formato junto al campo, sin enviar solicitudes ni notificaciones. Esta página es exclusiva para administradores.

El selector de carrera conserva el control nativo. En el selector personalizado de períodos, cada opción muestra su estado con una etiqueta gris y, solo para el período actual, otra etiqueta azul **Actual**. Las opciones pertenecen únicamente a la carrera seleccionada. Abra la lista con Enter, la barra espaciadora o una flecha, recórrala con las flechas, Inicio y Fin, y seleccione con Enter o la barra espaciadora. Escape, Tab y los clics fuera cierran la lista sin seleccionar. El foco permanece en el selector durante la navegación, pero Tab y los clics fuera permiten moverlo con normalidad. La lista desplazable mantiene visible la opción activa. La selección queda deshabilitada mientras se guardan cambios y se actualizan sus datos.

Mientras se crea un período, se bloquean la selección, los cambios de estado y los reinicios de datos. Del mismo modo, una operación de mantenimiento en curso bloquea la creación. Al completarse, la página vuelve a consultar los períodos, quita la marca de actual del anterior y selecciona el nuevo. Si falla esa consulta, el período creado permanece seleccionado, con un aviso de éxito y otro error separado para la actualización. **Actualizar períodos** repite solo la consulta, nunca la creación. Los errores de creación conservan el código ingresado y la carrera seleccionada, no se reintenta automáticamente el POST.

La creación, la marca de actual, la eliminación, los cambios de estado y los reinicios muestran un solo aviso de éxito o error mediante el adaptador compartido de notificaciones, sin repetirlo en un mensaje dentro de la página. Los avisos compartidos de éxito, error y advertencia desaparecen a los cinco segundos, conservan el botón de cierre y permiten cerrarlos explícitamente. Seleccionar, intentar acciones deshabilitadas o no permitidas y detener un envío por validación no genera notificaciones. Los fallos de lectura inicial o en segundo plano se muestran en la página con una opción para reintentar, sin notificaciones. Si una lectura falla después de confirmar un cambio, no convierte ese éxito en un error de la operación. Cuando no se confirma el resultado de un mantenimiento, se advierte que hay que revisar los datos actualizados antes de reintentar.

Para una prueba manual, se pueden considerar los códigos hipotéticos `2098-1`, `2098-2` y `2099-1` para cualquiera de las carreras. `2098-3` no es válido. Son sugerencias, no datos de prueba ya creados ni códigos cuya disponibilidad se haya comprobado en la base. Un código puede repetirse entre carreras, pero no dentro de una misma carrera.

Solo los administradores pueden crear períodos mediante `POST /api/planificaciones-semestres`:

```json
{ "carreraId": 1, "codigo": "2027-1" }
```

`codigo` debe tener el formato `AAAA-1` o `AAAA-2`, con cuatro dígitos ASCII. El código es único dentro de cada carrera, distintas carreras pueden usar el mismo. El servidor siempre crea el período con `actual: true` y `estadoPlanificacion: "preparacion"`, devuelve 201 y entrega la nueva planificación en `data`. Por compatibilidad se acepta enviar `actual: true` explícitamente. Se rechazan con 400 `actual: false`, los campos de estado y las propiedades desconocidas.

La transacción bloquea la carrera seleccionada y comprueba si la combinación de carrera y código ya existe antes de escribir. Un duplicado devuelve 409 con `Período existente`, que se muestra una sola vez mediante la notificación de la acción. Las marcas de actual, los estados y los datos dependientes quedan intactos. Esta comprobación no depende del nombre de una restricción del driver ni de cómo se encapsule su error. Se conserva la traducción del error de la restricción conocida de carrera y código como protección ante inserciones simultáneas. Los errores de almacenamiento ajenos a esa restricción siguen devolviendo 500, nunca un mensaje de duplicado.

Si no hay duplicado, la creación quita la marca de actual del período anterior de esa carrera e inserta el nuevo. Conserva los estados anteriores, las ofertas, las asignaciones, la disponibilidad y los horarios, no copia datos. Las otras carreras no se modifican y pueden usar el mismo código. Si falla la inserción, se revierte el cambio de la marca de actual. Si la carrera no existe, se devuelve 404.

El `PATCH /api/planificaciones-semestres/:id` general también es exclusivo para administradores. Se permiten cambios solo de la marca de actual (`actual: true` o `false`) en cualquier estado. Cambiar el código sigue limitado a preparación, incluso si se envía junto con `actual`. No se aceptan cambios de estado ni transferencias entre carreras. El acceso de lectura de secretaría conserva el alcance de su carrera. Los futuros cambios de estado de secretaría mediante el optimizador pertenecen a otro flujo, no otorgan permiso para crear períodos ni usar las operaciones de mantenimiento del administrador.

El optimizador y su futuro flujo de cambios de estado para secretaría quedan fuera de esta funcionalidad.

## Marcar como actual o eliminar un período vacío

Seleccione un período existente. Su contexto reúne el código, la carrera, el estado de planificación y la marca **Actual**, que no depende del estado ni cambia al seleccionar otro período. Cuando no es el actual, aparece **Marcar como actual** como acción secundaria, con una ayuda sobre su efecto. Si ya es actual, se muestra la etiqueta sin un botón redundante. **Cambiar estado** tiene su propia sección y **Eliminar período** aparece al final, separado del mantenimiento y con estilo destructivo. La marca de actual funciona en Preparación, Propuesta y Publicado sin cambiar el estado ni los datos dependientes. La transacción bloquea primero la carrera y luego el período, y quita la marca de actual solo a los otros períodos de esa carrera. Todas las etiquetas de actual se actualizan y se conserva el período seleccionado. La edición habitual de ofertas, disponibilidad y horarios sigue requiriendo un período actual en preparación.

**Eliminar período** requiere el estado Preparación y ninguna oferta en **todos** los departamentos, incluidos los externos y los que no tienen relación con la carrera. La disponibilidad docente no bloquea la eliminación, la clave foránea existente la elimina en cascada. No se borran ofertas ni horarios para permitir la eliminación, los horarios requieren una oferta del mismo período. Escriba exactamente el código mostrado y pulse **Confirmar eliminación**. El servidor vuelve a validar el código, la identidad, el estado y la ausencia de ofertas con el mismo orden de bloqueo que las demás escrituras, primero carrera y luego período. Un código desactualizado o un período que no cumple las condiciones devuelve 409 sin cambios. Si el destino no existe, devuelve 404.

La eliminación es irreversible. Eliminar el período actual **no** marca otro como reemplazo. El período eliminado se retira de la lista local, se limpia su selección y se mantiene la carrera seleccionada, sin cambiar las otras marcas de actual. Si falla la actualización después de confirmar una eliminación o una marca de actual, se ofrece **Actualizar períodos**, que repite solo el GET, nunca la operación de escritura. Todas las escrituras y sus actualizaciones comparten un bloqueo síncrono, que se libera aunque la eliminación desmonte el panel de administración. Las operaciones nuevas invalidan los resúmenes y las confirmaciones anteriores.

## Reiniciar datos

Después del contexto y del estado de planificación aparece **Reiniciar datos**. Las acciones se agrupan en **Gestionadas** y **Externas**, en dos columnas o apiladas en pantallas pequeñas. Cada grupo presenta primero horarios y luego ofertas. No hay otro selector de alcance. La guía **1. Reiniciar horarios → 2. Reiniciar ofertas** explica el orden para un mismo grupo. Las ayudas muestran cantidades disponibles o el motivo del bloqueo, como la ausencia de datos o los horarios pendientes de reiniciar. La eliminación del período queda separada al final. Las confirmaciones de reinicio y eliminación siguen en línea, conservan el código exacto y detallan sus consecuencias:

| Operación | Se elimina | Se conserva |
| --- | --- | --- |
| Reiniciar horarios gestionados | Bloques de horarios gestionados, sus asociaciones de salas y registros de ejecución del modelo de esa planificación | Todas las secciones, las asignaciones docentes y los horarios externos |
| Reiniciar horarios externos | Bloques de horarios externos y sus asociaciones de salas | Todas las secciones, las asignaciones docentes y los horarios gestionados |
| Reiniciar ofertas gestionadas | Secciones y asignaciones docentes gestionadas, solo después de reiniciar sus horarios | Ofertas y horarios externos, período, catálogos y disponibilidad docente |
| Reiniciar ofertas externas | Secciones y asignaciones docentes externas, solo después de reiniciar sus horarios | Ofertas y horarios gestionados, período, catálogos y disponibilidad docente |

El alcance gestionado corresponde a `carrera_departamento.es_gestionado=true` para la carrera seleccionada. El alcance externo exige una relación explícita con valor `false`, los departamentos sin relación no se consideran externos de forma implícita. Ninguna clasificación usa prefijos del código de asignatura. También se pueden seleccionar períodos que no sean actuales. Los reinicios nunca cambian el estado del período ni cuál es el actual.

Reinicie siempre los horarios **antes** de reiniciar sus ofertas. La página deshabilita el reinicio de ofertas mientras queden horarios en ese alcance. La API vuelve a comprobarlo bajo bloqueo y devuelve 409 sin eliminar nada. Los horarios del otro alcance no impiden el reinicio. Después de reiniciar horarios, actualice el resumen y confirme la nueva vista de los datos.

El reinicio gestionado elimina los bloques y los registros de ejecución en una misma transacción. La vista previa cuenta esos registros en `ejecuciones` y los incluye en la confirmación, también permite limpiar un intento fallido sin bloques. Se conservan los externos y las demás planificaciones. Un reinicio solo de horarios externos no elimina la ejecución del modelo. Mientras el modelo calcula, el reinicio permanece bloqueado. Al volver al modelo ya no aparece el resultado eliminado, la nueva ejecución crea otro registro, sin historial de intentos.

Escriba el código exacto del período para confirmar la operación mostrada. La aplicación no permite recuperar lo eliminado, haga un respaldo adecuado antes de operar sobre datos importantes. La huella del resumen se vuelve a validar dentro de la transacción. Si cambian los datos o el alcance, se exige una nueva vista previa y confirmación. Si se pierde una respuesta, revise el resumen actualizado antes de considerar otra operación. Las escrituras no se reintentan automáticamente.

## Cambiar estado

Seleccione **Preparación**, **Propuesta** o **Publicado** y pulse **Cambiar estado**. Para volver a **Preparación**, no deben quedar bloques de horarios **gestionados** en el período de la carrera seleccionada. Puede haber horarios externos, que se conservan. Dentro de la transacción que bloquea carrera y período, la API usa la misma clasificación de departamentos gestionados que las vistas previas de reinicio. Si quedan horarios gestionados, devuelve 409 sin modificar datos. Los horarios de otros períodos o carreras no bloquean el cambio. El estado se aplica siempre a toda la planificación seleccionada.

El flujo del administrador se basa en los **horarios gestionados**, no en la cantidad de ofertas ni solo en los horarios externos:

| Datos del período seleccionado | Estados disponibles |
| --- | --- |
| Vacío, solo ofertas o únicamente ofertas y horarios externos | Preparación |
| Al menos un horario gestionado | Propuesta y Publicado, el administrador puede alternar libremente entre ambos |

Se rechazan con 409 tanto **Propuesta** como **Publicado** si la combinación seleccionada de carrera y período no tiene horarios gestionados. Los de otras carreras o períodos no cumplen ese requisito. La API vuelve a calcularlo con los mismos bloqueos de carrera y período usados en los reinicios, las cantidades de la vista previa son informativas. Las ofertas y los horarios externos existentes se conservan durante todos los cambios de estado.

Esta página de administración **no** exige cubrir toda la carga docente ni tener salas asignadas antes de publicar. Una página futura e independiente para secretaría puede exigir salas para clases teóricas y prácticas. Ese flujo no está implementado aquí y no concede a secretaría acceso a estas operaciones de mantenimiento.

Los cambios de estado no generan ni eliminan horarios, no eligen el período actual y no modifican las importaciones externas. Los reinicios tampoco cambian el estado de forma implícita, después de vaciar los horarios gestionados, seleccione Preparación. La edición habitual sigue requiriendo un período actual en preparación. Al volver a preparación, los docentes asignados aún pueden seleccionar el período, pero su calendario se reemplaza por un aviso de preparación y se deniega la lectura de horarios. En propuesta y publicado, cada docente puede consultar su horario según las reglas de acceso existentes.

## API

Todos los endpoints de mantenimiento y los POST, PATCH y DELETE generales de planificación requieren autenticación y el rol `admin`. Las escrituras de secretaría y docentes se rechazan antes de ejecutar el repositorio. Los GET generales de planificación conservan sus reglas de acceso por rol y carrera.

| Método | Endpoint | Entrada |
| --- | --- | --- |
| GET | `/api/administracion-periodos/:id/resumen` | Consulta con `alcance=gestionadas`, `alcance=externas` o `alcance=todas`, devuelve la planificación seleccionada, cantidades y `huella` con `Cache-Control: no-store` |
| POST | `/api/administracion-periodos/:id/reiniciar` | `{ "alcance": "gestionadas", "objetivo": "ofertas", "confirmacion": "2026-2", "huella": "<summary SHA-256>" }`, `objetivo` también acepta `horarios` |
| PATCH | `/api/administracion-periodos/:id/estado` | `{ "estadoAnterior": "publicado", "estadoPlanificacion": "preparacion" }` |
| PATCH | `/api/planificaciones-semestres/:id` | `{ "actual": true }` marca como actual sin cambiar el estado, los cambios de código siguen limitados a preparación |
| DELETE | `/api/planificaciones-semestres/:id` | `{ "confirmacion": "2026-2" }`, devuelve 200 con la planificación eliminada en `data`, solo en preparación y sin ofertas |

La API conserva `todas` por compatibilidad y para contar los horarios de todo el período. La página muestra solo las cuatro acciones para los alcances gestionado y externo. El POST acepta los mismos tres valores de alcance que el GET.

`:id` identifica una planificación de una sola carrera, no un código de período compartido. Las entradas inválidas devuelven 400, la falta de autenticación 401, los roles no autorizados 403, una planificación inexistente 404 y una confirmación o estado desactualizado 409. Las operaciones exitosas devuelven 200 con los datos resultantes o las cantidades eliminadas. Las eliminaciones son atómicas y siguen el orden de dependencias. Los bloqueos de carrera y luego planificación las coordinan con las escrituras habituales.

## Verificación

Para comprobar HTTP, la estructura de las consultas SQL y las transacciones simuladas sin conexión, ejecute desde `backend`: `node node_modules/vitest/vitest.mjs run tests/semestres.test.ts tests/semestres-horarios.test.ts tests/planificacion-escritura.test.ts`. Las pruebas cubren valores iniciales y validación de creación, duplicados almacenados mediante la ruta real de HTTP, servicio y repositorio con almacenamiento simulado, mensajes exactos de duplicado, lecturas posteriores al bloqueo y anteriores a la escritura, y tratamiento acotado de errores anidados o cíclicos del driver. También comprueban fallos 500 ajenos a duplicados, permisos por rol, cambios solo de actual en todos los estados, metadatos solo en preparación, aislamiento por carrera, eliminación sin ofertas, revalidación de confirmación y estado de la fila bloqueada, y reversión simulada. La eliminación en cascada de disponibilidad se modela a partir de la clave foránea existente, no se ejecuta en una base de datos. Estas pruebas no determinan la causa de un error 500 reportado en ejecución ni demuestran concurrencia o reversión real de PostgreSQL.

Para comprobar el frontend, ejecute desde `frontend`: `node ../backend/node_modules/tsx/dist/cli.mjs --test src/features/administracion-periodos/administracion-periodos.test.mjs src/features/administracion-periodos/creacion-periodos.test.mjs src/features/administracion-periodos/vista-periodo.test.mjs src/features/administracion-periodos/selector-periodo.test.mjs src/lib/notificaciones.test.mjs src/features/profesores/notificaciones.test.mjs`. Las pruebas ejercitan manejadores de elementos con hooks y efectos simulados, SSR y eventos de documento simulados, no un DOM montado en el navegador. Incluyen listas de planificación de carreras vacías, estructura y CSS de las tarjetas separadas, etiquetas por opción, navegación y selección por teclado, cierre de la lista, llamadas de foco y desplazamiento, bloqueos de selección, limpieza del código, confirmación exacta de eliminación, envíos duplicados y una sola notificación por acción. También cubren lecturas y validaciones sin avisos, bloqueos compartidos durante actualización y desmontaje, y recuperación solo mediante GET después de escrituras exitosas. Las pruebas de notificación inspeccionan las opciones reales de duración finita enviadas a Sonner, no el tiempo transcurrido en el navegador. Las pruebas de renderizado existentes conservan las cuatro acciones de reinicio y sus restricciones de cambio de estado. La accesibilidad, el foco, la distribución visual y la desaparición automática de avisos en el navegador requieren comprobaciones aparte.

La verificación completa del frontend también requiere los ejecutores instalados `node node_modules/typescript/bin/tsc` y `node node_modules/vite/bin/vite.js build`. Las pruebas focalizadas no sustituyen la compilación completa ni la revisión visual, tampoco autorizan instalar o reparar dependencias.

Las pruebas PostgreSQL usan **únicamente** la base dedicada `horarios_test` y el rol `pruebas_horarios`. La prueba valida el entorno original antes de abrir conexiones, comprueba la identidad de base y usuario, obtiene el bloqueo asesor compartido de la infraestructura de pruebas y reinicia solo datos sintéticos. Nunca debe apuntar a datos de desarrollo o producción.

Desde la raíz del repositorio en PowerShell, prepare la infraestructura aislada existente y luego ejecute:

```powershell
powershell -NoProfile -File scripts/preparar-base-pruebas.ps1
if ($LASTEXITCODE -eq 0) {
  docker compose run --rm --no-deps `
    -e NODE_ENV=test -e BASE_PRUEBAS_REINICIABLE=yes `
    -e DATABASE_URL=postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test `
    backend pnpm exec vitest run tests/integracion/administracion-periodos.postgres.test.ts
}
```

La suite de integración cubre todos los alcances de la API, ambas operaciones de reinicio, cambios de estado con y sin horarios, permisos reales por rol, confirmaciones desactualizadas, conservación entre carreras y períodos, reinicios simultáneos y reversión de la transacción ante un fallo tardío de eliminación. Las pruebas de renderizado del frontend cubren las cuatro acciones explícitas y la confirmación del código del período. La revisión manual en navegador sigue siendo una comprobación independiente.
