# Sistema Web para la Optimización de Horarios Académicos

> **Proyecto de Título** — Ingeniería Civil en Informática  
> *Universidad del Bío-Bío (UBB)*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-black?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45+-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-orange?logo=pnpm&logoColor=white)](https://pnpm.io/)

---

## 📌 Descripción del Proyecto

Aplicación web integral diseñada para apoyar la planificación de horarios semestrales en carreras universitarias, con enfoque aplicado al contexto de Ingeniería Civil en Informática de la UBB y su coordinación académica.

El sistema aborda un problema combinatorio de alta complejidad (*Timetabling Problem*) mediante un flujo que combina gestión académica, disponibilidad docente, exportación/importación Excel y, como objetivo del proyecto, un motor de optimización matemática que considere disponibilidad docente, capacidades de salas, topes de asignaturas y cargas horarias.

> Este repositorio corresponde a un prototipo de Proyecto de Título. No está pensado como plataforma institucional productiva general, sino como una implementación funcional y reproducible para el contexto académico definido.

---

## 🔄 Flujo Operativo Principal

```mermaid
flowchart TD
    A["1. Secretaría: Habilitación de Ramos y Carga Docente"] --> B["2. Docentes: Registro de Disponibilidad Horaria"]
    B --> C["3. Excel Pre-modelo: Horarios Externos de Ramos no Gestionados"]
    C --> D["4. Ejecución del Modelo: Generación de Propuesta (Sin Salas)"]
    D -->|Bloqueo automático de disponibilidad docente| E["5. Exportación Excel: Solicitud de Salas para Ramos Gestionados"]
    E --> F["6. Importación Excel: Asignación de Salas Aprobadas"]
    F --> G["7. Revisión Secretaría y Publicación Oficial (horario_publicado = true)"]
```

1. **Gestión Académica**: La secretaría/coordinación habilita la oferta de asignaturas del semestre y asigna la carga correspondiente a cada docente dentro del alcance de su carrera.
2. **Disponibilidad Docente**: Los profesores ingresan sus bloques de disponibilidad horaria mientras el semestre está en fase de recepción.
3. **Horarios Externos Pre-modelo**: La importación Excel crea ofertas y horarios de departamentos externos antes del modelo. Las salas del archivo se ignoran; los horarios quedan sin sala y sin publicar.
4. **Optimización Automática (Propuesta sin Sala)**: El sistema ejecuta el modelo matemático/solver que asigna bloques horarios minimizando choques de asignaturas y preferencias docentes. Los bloques se registran con `sala_id = null`. Al existir horarios generados para el semestre, la disponibilidad docente queda **bloqueada automáticamente**.
5. **Solicitud de Infraestructura (Exportación Excel)**: Se exporta la propuesta de horarios a formato Excel detallando necesidades de cupos, bloques y tipos de sala para enviarlo a la unidad universitaria encargada de la administración central de aulas.
6. **Carga de Salas Aprobadas (Importación Excel)**: Tras la respuesta de la unidad de salas, se importa la planilla para asociar cada bloque de clase con su `sala_id` definitiva.
7. **Ajuste y Publicación Oficial**: La secretaría realiza ajustes manuales de última hora si se requiere y activa la publicación oficial del horario (`horario_publicado = true`) para consulta de toda la comunidad universitaria.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Backend** | **Node.js + Express + TypeScript** | API REST estructurada con arquitectura limpia en capas y tipado estricto. |
| **Base de Datos** | **PostgreSQL** | Motor relacional robusto y ACID para persistencia de datos. |
| **ORM / DAL** | **Drizzle ORM + Drizzle Kit** | Tipado TypeScript nativo de extremo a extremo y control de migraciones. |
| **Validación** | **Zod** | Validación de esquemas y DTOs en tiempo de ejecución con mensajes en español. |
| **Frontend** | **React + TypeScript** *(en desarrollo)* | Interfaz moderna, reactiva e intuitiva para secretaría y docentes. |
| **Package Manager** | **pnpm** | Gestión estricta y eficiente de dependencias monorepo/multi-paquete. |

---

## 🏛️ Arquitectura del Backend

El backend sigue los principios de **Clean Architecture** con separación estricta de responsabilidades en capas:

```text
backend/src/
├── config/          # Variables de entorno validadas con Zod y cliente DB
├── controllers/     # Manejo de peticiones y respuestas HTTP
├── db/
│   ├── schema/      # Definición de tablas y relaciones con Drizzle ORM
│   ├── migrations/  # Migraciones SQL generadas por Drizzle Kit
│   ├── seeds/       # Datos base y módulos de carga del seed único no destructivo
│   └── seed.ts      # Entrypoint del seed: asegura catálogos, relaciones y usuarios iniciales
├── middlewares/     # Manejador global de errores y validación Zod
├── repositories/    # Capa de acceso a datos (consultas SQL y transacciones atómicas)
├── routes/          # Definición y mapeo de endpoints REST
├── services/        # Lógica de negocio, reglas de dominio y errores tipados
├── utils/           # Helpers puros, manejo de errores y constantes
└── validations/     # Esquemas Zod para validación de DTOs y parámetros con mensajes en español
```

---

## 🧭 Alcance por Carrera y Departamento

El sistema modela el alcance operativo de secretaría desde la carrera asociada al usuario:

```text
usuarios → secretarias.usuario_id → secretarias.carrera_id
```

La relación `carrera_departamento` indica que un departamento presta servicios a una carrera. Además, el campo `es_gestionado` distingue si ese departamento es gestionado operativamente por la carrera/secretaría.

| Concepto | Significado |
| :--- | :--- |
| Fila en `carrera_departamento` | El departamento presta servicios a la carrera. |
| `es_gestionado = true` | La secretaría/carrera gestiona operativamente ramos, profesores, disponibilidad y accesos de ese departamento. |
| `es_gestionado = false` | El departamento presta servicios, pero sus horarios deben coordinarse como externos y sus accesos no son administrados por la secretaría de la carrera. |

En reglas de dominio, **alcance** significa todos los departamentos relacionados con la carrera, mientras que **gestión** significa solo los departamentos con `es_gestionado=true`. Para profesores, los tipos válidos son `planta` y `part time`: secretaría puede crear profesores `part time` dentro de todo su alcance, incluidos departamentos externos cuando los necesita para horarios de la carrera, pero solo puede crear/editar/quitar acceso al sistema para profesores `part time` de departamentos gestionados. Si falta un profesor `planta`, debe ingresarlo previamente un administrador. Un profesor `part time` gestionado o externo solo se elimina si nunca participó en horarios; si ya tiene historial horario, se conserva el registro académico y solo se quita el acceso eliminando su usuario asociado. El nombre de `usuarios` se considera derivado y debe mantenerse sincronizado con el nombre de la entidad `profesores` o `secretarias`; los formularios de acceso solicitan correo y contraseña inicial, no nombre.

Diseño pendiente de frontend para `/app/profesores`: tarjeta superior con título, descripción, buscador, filtros por departamento, tipo y `Acceso al sistema`, además del botón `Crear profesor` arriba a la derecha. La tabla debe mostrar `Nombre`, `Departamento`, `Tipo`, `Acceso al sistema` y separar acciones de profesor (`Ver`, `Editar`, `Eliminar profesor`) de acciones de acceso (`Crear acceso`, `Editar acceso`, `Quitar acceso`). No se agrega columna `Gestión`, porque se infiere por el departamento.

Departamentos gestionados inicialmente para el prototipo:

- Sistemas de Información
- Economía y Finanzas
- Administración y Auditoría

Este diseño permite separar tres necesidades:

1. vistas y edición de secretaría limitadas a su carrera;
2. exportación Excel de salas para ramos gestionados;
3. importación Excel pre-modelo para horarios de ramos externos.

---

## 🌱 Seed del Proyecto

El proyecto mantiene un **seed único real**, no separado entre `base` y `dev`, porque el despliegue corresponde a un prototipo de tesis con datos controlados.

```bash
cd backend
pnpm run db:seed
```

El seed:

- conserva `backend/src/db/seed.ts` como entrypoint;
- organiza datos y carga en `backend/src/db/seeds/`;
- no ejecuta `TRUNCATE` ni borra datos existentes;
- asegura datos necesarios creando o actualizando registros;
- carga catálogos académicos, bloques horarios, salas y usuarios iniciales del prototipo.

Profesores de prueba en **Sistemas de Información**, departamento gestionado por la carrera de la secretaría inicial:

| Nombre | Correo | Tipo |
| :--- | :--- | :--- |
| Profesor Docente | `profesor@ubiobio.cl` | `planta` |
| Profesor Part Time | `profesor.parttime@ubiobio.cl` | `part time` |

Al repetir el seed, el profesor existente se reclasifica como `planta` conservando sus IDs y vínculos; el segundo perfil se asegura sin duplicarlo. Las contraseñas iniciales solo se asignan al crear usuarios: no se restablecen las existentes. Se mantienen las cuentas iniciales de administración y secretaría.

**Antes de ejecutar `pnpm run db:seed` desde `backend`, confirma que el destino sea la base de desarrollo prevista.** El comando escribe datos y también asegura los demás catálogos y bloques del prototipo; no es una carga exclusiva de profesores.

Los usuarios y contraseñas iniciales son parte del contexto del prototipo y no representan una política de seguridad productiva institucional.

---

## ⏳ Estado del Proyecto

### Implementado

- [x] **Backend Express + TypeScript + Drizzle ORM** con arquitectura limpia en capas.
- [x] **Control de Bloqueo de Disponibilidad Docente**: Regla de negocio implementada en `disponibilidad.service.ts` para congelar automáticamente la edición/sincronización de disponibilidad docente una vez generadas propuestas de horarios para el semestre.
- [x] **Publicación por Entrada de Horario**: `semestres_horarios` relaciona directamente `semestre_id` y `horario_asignatura_id`, con un único registro por entrada y `horario_publicado=false` por defecto. No existe una tabla agregada `horarios` ni un `horario_id` adicional en las entradas. La clave foránea compuesta garantiza que el semestre coincida con el de la entrada; las actualizaciones y eliminaciones de esta última se propagan por cascada. `sala_id` sigue siendo opcional/nullable, independientemente de la publicación.
  - **API existente**: `horarioPublicado` se lee y escribe en `/api/horarios-asignaturas`, no en la API de semestres ni en sus respuestas anidadas. Se conserva `semestreId`. Crear o actualizar una entrada gestiona su publicación en la misma transacción. No hay nuevos endpoints, versiones ni requisitos para publicar; crear un semestre vacío no genera entradas ficticias.
  - **Migración**: `0006_youthful_tigra.sql` copia el booleano original del semestre a cada entrada antes de retirar la columna antigua. No cambia IDs existentes ni salas. Si existe un semestre publicado sin entradas, aborta con una excepción antes de cambiar el esquema: ese estado no puede preservarse en una relación por entrada y requiere resolución explícita. Los semestres vacíos no publicados no generan relaciones. Aplicarla requiere respaldo y validación previa en PostgreSQL aislado y descartable.
- [x] **Excel de Asignación Externa de Salas**:
  - Exportación de propuesta de horarios a `.xlsx` con salas vacías para completar externamente.
  - Importación todo-o-nada del mismo formato para vincular salas aprobadas a `horarios_asignaturas`.
  - Nombre de archivo `Resumen Malla ({codigoSemestre}).xlsx` y hoja `Resumen Malla`.
  - Validaciones con errores corregibles por fila/columna.
- [x] **Alcance Carrera-Departamento**: `carrera_departamento.es_gestionado` diferencia departamentos que prestan servicios de departamentos gestionados por la secretaría/carrera.
- [x] **Seed Único No Destructivo**: `db:seed` asegura datos base del prototipo sin borrar datos existentes.

### Pendiente

- [ ] **Filtro transversal por secretaría/carrera**: limitar vistas y acciones de secretaría a ramos de su carrera mediante `secretarias.usuario_id → carrera_id` y `carrera_asignatura`.
- [ ] **Mejorar exportación Excel de salas por alcance**: exportar solo ramos de la carrera cuyo profesor pertenezca a un departamento marcado como `es_gestionado=true` para esa carrera.
### Excel estandarizado y pre-modelo externo

Ambos formatos usan `Código Asig.`, `Nombre Asignatura`, `Sección`, `Cupos`, `Profesor`, seguidos por cinco grupos `Tipo Hora N`, `Día N`, `Horario N`, `Sala N`. El formato anterior con `Sem` y horas agregadas ya no se acepta. Los horarios usan `HH:MM-HH:MM` y deben coincidir exactamente con bloques institucionales (incluida su pausa entre pares).

- **Salas**: `GET /api/horarios-asignaturas/excel/salas?semestreId=...` exporta sesiones existentes con salas vacías; `POST /api/horarios-asignaturas/excel/salas/importar?semestreId=...` actualiza sus salas, sin crear ofertas. Tipo Hora desambigua las sesiones. Se mantiene la exclusión de laboratorios de este flujo.
- **Externos, solo importación**: `POST /api/horarios-asignaturas/excel/externos/importar?semestreId=...&departamentoId=...`, multipart `archivo` (`.xlsx`, máximo 10 MB). No se guarda ni exporta el archivo. `Sala N` puede estar vacía o contener texto: se ignora siempre y se persiste `sala_id=null`, con publicación inicial desactivada.
- Secretaría requiere carrera vinculada a su usuario, asignaturas de esa carrera y departamento relacionado con `es_gestionado=false`. Admin no necesita perfil de secretaría: requiere semestre, departamento, asignatura y profesor existentes.
- Profesor se resuelve por nombre sin distinción de mayúsculas, acentos ni espacios repetidos, dentro del departamento indicado. Nombres ausentes o ambiguos son errores; nunca se crean profesores automáticamente.
- Tipos aceptan aliases `teorica/teórica/teo/t`, `practica/práctica/pract/pra/p` y `laboratorio/laboratory/lab/l`, resueltos contra el catálogo existente.
- Se rechazan ofertas existentes por semestre + código + sección, duplicados, sesiones inválidas y choques de profesor. Errores de validación devuelven HTTP 400 con `errores: [{fila, columna, mensaje}]` y no escriben nada. Las ofertas, horarios y relaciones de publicación se crean en una sola transacción; éxito externo devuelve HTTP 201 con contadores.
- `GET /api/profesores?departamentoId=...` permite filtrar profesores. Secretaría conserva lectura y creación de profesores `part time` dentro de su alcance; solo gestiona acceso en departamentos con `es_gestionado=true`. La eliminación de profesores `part time` se bloquea si ya participaron en horarios.

- [ ] **Integración del solver/modelo de optimización**: generar propuestas horarias desde el backend.
- [ ] **Frontend React**: construir la interfaz de secretaría y docentes sobre la API existente.

---

## 🚀 Puesta en Marcha (Backend)

### Requisitos Previos
* [Node.js](https://nodejs.org/) (v20 o superior; v22 recomendado)
* [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
* [Docker & Docker Compose](https://www.docker.com/)

### Instalación y Ejecución

1. **Iniciar Base de Datos con Docker**:
   ```bash
   docker compose up -d postgres pgadmin
   ```

2. **Instalar dependencias e iniciar desarrollo**:
   ```bash
   cd backend
   pnpm install
   pnpm dev
   ```

3. **Comandos de Base de Datos**:
   ```bash
   pnpm run db:generate   # Generar nuevas migraciones SQL
   pnpm run db:migrate    # Aplicar migraciones a PostgreSQL
   pnpm run db:seed       # Asegurar datos base del prototipo sin borrar datos existentes
   pnpm run db:studio     # Abrir visor web Drizzle Studio
   ```

### Verificación recomendada

```bash
cd backend
pnpm run build
pnpm exec tsc --noEmit
pnpm exec vitest run tests/schema-organization.test.ts
pnpm exec vitest run tests/semestres.test.ts tests/horarios.test.ts tests/semestres-horarios.test.ts
```

Los checks de esquema, migración y SQL son independientes de la base configurada. Las suites de integración que ejercitan comportamiento real de PostgreSQL requieren una base local disponible y aislada. No ejecutar la suite completa contra una base compartida o con datos importantes.
