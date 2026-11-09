# Ejecutar y seguir el modelo de horarios

Administración y secretaría acceden a **Modelo de optimización** desde la navegación. El backend conserva la autoridad sobre permisos, entradas, exclusión de ejecuciones e incorporación de resultados. La integración no modifica la matemática ni publica horarios.

## Flujo

1. Revisar el período actual de la carrera. Secretaría solo puede usar ese período del catálogo autorizado por el backend, no puede elegir históricos mediante el selector ni la URL. Administración conserva la consulta de otros períodos. Si el catálogo no identifica una sola carrera y un único período actual para secretaría, la preparación queda bloqueada hasta revisar el acceso, no se infiere la carrera desde el código del período.
2. Confirmar la cantidad de salas por edificio, tipo y capacidad. Las sugerencias no garantizan disponibilidad, no pueden superar el catálogo acreditado.
3. Indicar la **cantidad de laboratorios**, inicialmente **6**, editable como entero entre 0 y 10000. La capacidad del modelo es fija en **60 estudiantes**. Es un supuesto confirmado para esta ejecución, no inventario físico ni disponibilidad garantizada. No se crean salas ni se ejecuta una seed, tampoco se reduce esta cantidad a la mitad.
4. Revisar las condiciones de ejecución, confirmar las cantidades e iniciar. Los bloqueos se presentan junto a los recursos, solo se puede ejecutar una planificación actual en Preparación. El seguimiento muestra el estado, el inicio y el término en hora local. Mientras el cálculo está activo, el término indica **En curso**. Al incorporar la propuesta aparece un único enlace **Ver horario generado**, sin publicar el horario. Los errores, bloqueos y faltantes permanecen visibles.
5. Una solución completa, válida y vigente pasa automáticamente a Propuesta. Si la persona sigue en la página del modelo para esa planificación, se abre Gestión del horario. Si navegó, recibe un aviso con acceso al resultado, sin cambiar su página.

## Recuperación y bloqueos

- Salir o recargar el navegador no cancela el cálculo. El layout autenticado consulta la última ejecución y sigue por ID las activas cada cinco segundos, sin solapar consultas ni iniciar nuevos cálculos.
- La clave de inicio y sus parámetros se conservan por cuenta y planificación en el almacenamiento de sesión. Si se pierde la respuesta, primero se consulta el estado. Solo una acción explícita reenvía la misma solicitud, sin cambiar su clave ni recursos. Una ejecución histórica con recursos iguales no confirma ese inicio.
- Un fallo de inicio registrado por el seguimiento se muestra solo allí, junto a su recuperación. No se repite junto a los recursos ni se convierte en un aviso transitorio. Las validaciones de cantidades y los fallos locales previos al envío permanecen junto al formulario.
- Consultar el último intento no fuerza navegación. Su resultado o diagnóstico sigue accesible al volver al modelo hasta que se acepta otro intento o se reinician los horarios gestionados. No se mantiene un historial de ejecuciones.
- Después de un reinicio gestionado, la consulta devuelve `null`, se retiran el resultado y su aviso, y se vuelve a consultar la preparación. Si el seguimiento conservaba un ID ya eliminado, consulta el intento actual del período, sin iniciar otro cálculo. La actualización automática puede tardar hasta el siguiente sondeo.
- Durante una ejecución conocida, ofertas, docentes, importación externa y mantenimiento administrativo involucrados muestran el bloqueo. La navegación, selección de contexto y lectura siguen disponibles. La consulta puede retrasarse o fallar, por eso cada escritura sigue sujeta a las guardas del backend.
- La disponibilidad propia del profesor informa `bloqueadaPorOptimizacion: true` y `editable: false` durante una ejecución activa de su planificación. No expone IDs ni detalles de la ejecución y no amplía los roles del endpoint de optimización. El formulario consulta ese permiso cada cinco segundos sin sustituir el borrador por los bloques guardados, al terminar vuelve a admitir edición según el estado vigente. Un fallo de consulta conserva el borrador y deshabilita el envío hasta recuperar el permiso.

## Interpretar el resultado

La sección **Recursos para esta ejecución** conserva cada categoría por edificio, tipo y capacidad, con su total de catálogo y una cantidad editable entre 0 y el menor de ese total y 10000. La sugerencia inicial llega del backend, corresponde a la mitad redondeada hacia arriba. Los laboratorios se configuran por separado con un único campo de cantidad. La ayuda de disponibilidad se comparte entre los campos y la confirmación no la repite. Los controles bloqueados conservan valores legibles y se distinguen por su fondo y borde discontinuo. En escritorio con puntero preciso, los campos de la tabla de salas tienen 28 px de altura mínima, dentro de filas de al menos 36 px para separarlos de los bordes. En pantallas pequeñas, táctiles o híbridas, el cuadro visible tiene 36 px y queda centrado dentro de una etiqueta de al menos 44 px, esa zona permite enfocar el campo sin agrandar su borde hasta los límites de la fila.

Antes de la primera ejecución, los recursos tienen prioridad sobre el estado vacío. Cuando existe una ejecución, su estado y diagnóstico aparecen primero, y el formulario se identifica como **Recursos para una nueva ejecución**. El aviso de inicio sin confirmar tiene prioridad y conserva el reenvío explícito con la misma solicitud. La explicación de que salir no cancela el cálculo se muestra mientras está activo, no después de terminar. El enlace al horario generado conserva el destino de Gestión del horario.

La vista operativa no muestra desplegables de detalles técnicos ni de preparación, IDs de ejecución, revisiones o versión del modelo. Esos datos se conservan en el registro de la ejecución, no se eliminan del contrato ni de la persistencia. El resumen no repite el mensaje de incorporación del servidor ni presenta hashes o fechas ISO. Los motivos que impiden iniciar permanecen visibles junto al formulario, aunque el envío esté deshabilitado. Los diagnósticos específicos pueden incluir detalles de fase y cota de prioridad.

Los laboratorios se envían siempre como una categoría abstracta `laboratorios-modelo`, de capacidad 60 y con la cantidad confirmada, incluso si es cero. La fuente declara expresamente el supuesto y la ausencia de inventario físico. La cantidad no se guarda como configuración, solo forma parte de los parámetros de la solicitud, incluida su recuperación idempotente. El contrato genérico del backend no cambia ni fuerza capacidad 60 para otros clientes.

El seguimiento distingue ejecución activa, incorporación, infactibilidad, carga incompleta, límite de tiempo, error, interrupción y datos desactualizados. La incorporación no demuestra optimalidad, un límite de tiempo puede producir una solución incorporable sin optimalidad demostrada.

Los faltantes se presentan como **Bloques pendientes**, por asignatura, sección y componente. La disponibilidad docente se ordena de menor a mayor después de reservas, no señala responsables ni garantiza que ampliarla resuelva el problema. Antes de ejecutar se muestra la **Disponibilidad docente de la preparación**. Durante el cálculo o con una propuesta incorporada, solo se presenta la **Disponibilidad considerada en la ejecución**, si el diagnóstico la contiene. Tras un intento no incorporado, cuando la preparación permite otro y tiene disponibilidad, esa consulta actual vuelve a ser la principal, la anterior se conserva como **Detalle de disponibilidad del intento anterior**. Los errores y bloques pendientes no se ocultan dentro de ese detalle.

Los nombres se resuelven con `GET /profesores`, mediante el cliente existente y el alcance de la cuenta. Solo se conservan identificador y nombre en el estado de presentación, no se cambian la entrada, los parámetros ni el diagnóstico persistido del modelo. Los nombres son los del catálogo actual, no una captura histórica. Mientras se consultan se indica la carga, si la consulta falla o un identificador no está en el catálogo autorizado, se muestra **Nombre no disponible · ID N** y se conservan los bloques. El fallo no impide preparar ni ejecutar. La actualización manual vuelve a consultar los nombres, y las respuestas pendientes se descartan al salir o cambiar de cuenta. Las categorías abstractas no equivalen a `salaId`, las salas físicas se gestionan en resultados.

Las tablas se pueden enfocar con teclado para desplazarlas horizontalmente en pantallas pequeñas. Los avisos globales muestran carrera y período cuando el catálogo está disponible, sin exponer identificadores internos de ejecución. Este ajuste visual no cambia los parámetros, permisos, validaciones, seguimiento, recuperación ni persistencia. **Actualizar preparación y seguimiento** mantiene su comportamiento previo, vuelve a consultar y repone las cantidades sugeridas, no conserva un borrador de recursos.

Si ya existen horarios gestionados, el administrador debe usar el mantenimiento existente para reiniciarlos y luego devolver la planificación a Preparación. El reinicio elimina también el registro de ejecución, pero conserva los horarios externos. Un fallo se mantiene visible hasta un nuevo intento aceptado o ese reinicio. Son operaciones separadas, no hay aplicación ni reemplazo manual del horario en el modelo.

## Requisitos del entorno

El backend que ejecuta el modelo necesita las migraciones `0018/0019` aplicadas y el runtime de Julia con sus dependencias disponibles según [el contrato del modelo](modelo-optimizacion.md). Compilar la aplicación o integrar los cambios en `main` no instala Julia ni aplica migraciones. El frontend puede compilar y sus pruebas pueden aprobar aunque ese requisito operativo siga pendiente.

## Verificación local

Desde `frontend`, con las dependencias ya disponibles:

```powershell
$pruebas = Get-ChildItem src -Recurse -Filter '*.test.mjs' | ForEach-Object { $_.FullName }
node --experimental-strip-types --experimental-transform-types --test $pruebas
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Las pruebas usan transporte simulado y ejecutan lógica, manejadores, efectos y renderizado de componentes sin navegador ni base de datos. No acreditan el aprovisionamiento de las migraciones `0018/0019`, Julia, ni una ejecución operativa. Esa validación requiere un destino aislado y autorización explícita antes de migrar, reiniciar servicios o ejecutar el modelo. No usar seeds, fixtures ni optimizador contra desarrollo.
