# Teaching assignments by section and hour type

Each offer identifies a course section in a semester plan. Teachers are assigned through `oferta_tipo_hora`, not directly on `ofertas_asignaturas`.

## Section editing

In **Asignaturas → Secciones**, select a teacher separately for each curriculum hour type. The same teacher may cover multiple types and sections. A section can be saved without all teachers; the list identifies the hour types still awaiting assignment.

The editor shows compact rows for hour type, hours and teacher. Type a name or RUT directly into a teacher field; suggestions show the name, RUT and department. Selecting a suggestion fills the field. Clearing or rewriting a selected field makes that type pending until another suggestion is selected; unmatched text never identifies a teacher. Suggestions also support arrow keys, Enter and Escape.

Selecting a teacher for the first displayed type fills only the other types that have no teacher. Existing assignments are never overwritten. Each lower field can then be cleared and assigned independently. There is no separate multiple-assignment control; changes are persisted only by **Guardar sección**.

**Editar asignatura** displays the curriculum hour breakdown as read-only information. Editing the subject's other fields does not modify that breakdown.

Only current plans in `preparacion` can be edited. Existing career scope and the global teacher-selection catalog are unchanged.

## API contract

Offer creation and updates use `asignaciones` instead of the former singular `profesorId`:

```json
{
  "asignaturaCodigo": "INF100",
  "planificacionSemestreId": 3,
  "seccion": 1,
  "cupos": 30,
  "asignaciones": [
    { "tipoHoraId": 1, "profesorId": 7 },
    { "tipoHoraId": 2, "profesorId": 8 }
  ]
}
```

- Creation without `asignaciones` creates an incomplete section.
- On update, omitted `asignaciones` preserves existing assignments; a supplied array replaces the set. `[]` removes all assignments only when no schedules depend on them.
- Each `(ofertaId, tipoHoraId)` admits exactly one teacher. Manual assignments must use hour types defined for that course.
- A scheduled type must have an assignment. Removing its assignment is rejected while schedules exist; reassigning its teacher is rejected if it creates a schedule conflict.
- Offer responses include `asignaciones` with their hour type and teacher. Schedule responses include `asignacion`; teacher schedule filters match both offer and hour type.
- Nested teacher projections continue to exclude RUT. Professor management returns typed `asignaciones` rather than singular-teacher `ofertas`.

## Existing Excel files

The [external department Excel format](horarios-externos.md) does not change. Each accepted row supplies one teacher and typed sessions. Import creates one assignment per distinct session type using that teacher, then stores its schedule blocks. Reimport replaces both the section's assignments and schedules within the existing transaction.

Existing duplicate-section rejection, coverage, scope, all-or-nothing behavior, diagnostics and counters remain unchanged. This format cannot represent different teachers for different types within one section. Room export/import retains its visible format and resolves the teacher from each scheduled type.

## Migration and verification

Migration `0015_asignacion_docente_por_tipo_hora.sql` creates the assignment table, copies the legacy teacher for existing scheduled types, links schedules to their assignment, and removes the old offer column. Offers without schedules remain incomplete; assignments for unscheduled types must be reviewed manually. No automatic database reset is required.

Apply the migration only to the intended environment after reviewing the change. Existing data permission does not require resetting the development database. Run the documented [isolated PostgreSQL checks](pruebas-excel-externos.md) before applying it to a working database.

Availability entry and workload-to-block conversion are outside this change.
