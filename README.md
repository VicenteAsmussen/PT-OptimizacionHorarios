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
2. **Disponibilidad Docente**: Los profesores ingresan sus bloques de preferencia y disponibilidad horaria.
3. **Optimización Automática**: El sistema ejecuta el modelo matemático/solver que asigna bloques, salas y cursos minimizando conflictos.
4. **Ajuste y Flexibilidad**: La secretaría puede revisar los resultados y realizar modificaciones manuales finas sobre la matriz generada.

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
│   └── seed.ts      # Población inicial de catálogos base (bloques UBB, salas, deptos, carreras)
├── middlewares/     # Manejador global de errores y validación Zod
├── repositories/    # Capa de acceso a datos (consultas SQL y transacciones atómicas)
├── routes/          # Definición y mapeo de endpoints REST
├── services/        # Lógica de negocio, reglas de dominio y errores tipados
├── utils/           # Helpers puros, manejo de errores y constantes
└── validations/     # Esquemas Zod para validación de DTOs y parámetros con mensajes en español
```

---

## ⏳ Tareas Pendientes (Por Hacer)
- [ ] **Gestión de Archivos Excel**: Endpoints y lógica para importación masiva (catálogos, docentes, asignaturas) y exportación de matrices de horario y cargas académicas.
- [ ] **Control de Bloqueo de Disponibilidad Docente**: Regla y estado para congelar/bloquear la edición de disponibilidad docente una vez que se inicia o ejecuta la generación de horarios de prueba.
- [ ] **Versionado y Estados de Horarios**: Mecanismo para identificar y diferenciar un horario en estado *Borrador / Planificación* de un horario *Publicado / Final*.

---

## 🚀 Puesta en Marcha (Backend)

### Requisitos Previos
* [Node.js](https://nodejs.org/) (v20 o superior)
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
   pnpm run db:seed       # Poblar catálogos base (bloques UBB, salas, etc.)
   pnpm run db:studio     # Abrir visor web Drizzle Studio
   ```
