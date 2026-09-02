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

Aplicación web integral diseñada para automatizar y optimizar la planificación de horarios semestrales en carreras universitarias (con enfoque aplicado al departamento de Ingeniería Civil en Informática de la UBB).

El sistema resuelve un problema combinatorio de alta complejidad (*Timetabling Problem*) mediante un motor de optimización matemática que considera disponibilidad docente, capacidades de salas, topes de asignaturas y cargas horarias.

---

## 🔄 Flujo Operativo Principal

```mermaid
flowchart LR
    A[Secretaría: Habilitación de Ramos y Carga] --> B[Docentes: Registro de Disponibilidad]
    B --> C[Ejecución del Modelo de Optimización]
    C --> D[Visualización de Horarios Generados]
    D --> E[Ajustes Manuales y Publicación Final]
```

1. **Gestión Académica**: La secretaría/coordinación habilita la oferta de asignaturas del semestre y asigna la carga correspondiente a cada docente.
2. **Disponibilidad Docente**: Los profesores ingresan sus bloques de preferencia y disponibilidad horaria (superiores a su carga horaria asignada).
3. **Optimización Automática**: El sistema ejecuta el modelo matemático/solver que asigna bloques, salas y cursos minimizando conflictos.
4. **Ajuste y Flexibilidad**: La secretaría puede revisar los resultados y realizar modificaciones manuales finas sobre la matriz generada.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Backend** | **Node.js + Express + TypeScript** | API REST estructurada con arquitectura en capas y tipado estricto. |
| **Base de Datos** | **PostgreSQL** | Motor relacional robusto y ACID para persistencia de datos. |
| **ORM / DAL** | **Drizzle ORM + Drizzle Kit** | Tipado TypeScript nativo de extremo a extremo y control de migraciones. |
| **Validación** | **Zod** | Validación de esquemas y DTOs en tiempo de ejecución. |
| **Frontend** | **React + TypeScript** *(en desarrollo)* | Interfaz moderna, reactiva e intuitiva para secretaría y docentes. |
| **Package Manager** | **pnpm** | Gestión estricta y eficiente de dependencias monorepo/multi-paquete. |

---

## 🏛️ Arquitectura del Backend

El backend sigue los principios de **Clean Architecture** con separación estricta de responsabilidades en 9 capas:

```text
backend/src/
├── config/          # Variables de entorno validadas con Zod y cliente DB
├── controllers/     # Manejo de peticiones y respuestas HTTP
├── db/
│   ├── schema/      # Definición de tablas y relaciones con Drizzle ORM
│   └── migrations/  # Migraciones SQL generadas por Drizzle Kit
├── middlewares/     # Manejador global de errores, autenticación y validación
├── repositories/    # Capa de acceso a datos (consultas SQL y transacciones)
├── routes/          # Definición y mapeo de endpoints REST
├── schemas/         # Esquemas Zod para validación de DTOs y parámetros
├── services/        # Lógica de negocio, reglas de dominio y orquestación del solver
└── utils/           # Helpers puros, manejo de bloques horarios y clases de error
```

---

## 🚀 Puesta en Marcha (Backend)

### Requisitos Previos
* [Node.js](https://nodejs.org/) (v20 o superior)
* [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
* [PostgreSQL](https://www.postgresql.org/)

### Instalación y Ejecución

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/VicenteAsmussen/PT-OptimizacionHorarios.git
   cd PT-OptimizacionHorarios/backend
   ```

2. **Instalar dependencias**:
   ```bash
   pnpm install
   ```

3. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   # Configura tu DATABASE_URL y PORT en el archivo .env
   ```

4. **Ejecutar en modo desarrollo**:
   ```bash
   pnpm dev
   ```

5. **Comandos de Base de Datos (Drizzle)**:
   ```bash
   pnpm run db:generate   # Generar nuevas migraciones
   pnpm run db:migrate    # Aplicar migraciones a PostgreSQL
   pnpm run db:studio     # Abrir interfaz visual Drizzle Studio
   ```
