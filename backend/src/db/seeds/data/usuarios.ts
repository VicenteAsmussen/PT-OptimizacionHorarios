export const claveInicial = "123456";

export const datosUsuarios = [
  {
    nombre: "Administrador del Sistema",
    correo: "admin@ubiobio.cl",
    rol: "admin" as const,
  },
  {
    nombre: "Secretaria de Carrera",
    correo: "secretaria@ubiobio.cl",
    rol: "secretaria" as const,
  },
  {
    nombre: "Profesor Docente",
    correo: "profesor@ubiobio.cl",
    rol: "profesor" as const,
  },
  {
    nombre: "Profesor Part Time",
    correo: "profesor.parttime@ubiobio.cl",
    rol: "profesor" as const,
  },
];

export const departamentoProfesoresIniciales = "Sistemas de Información";

// RUT sintéticos válidos, exclusivos de estos perfiles de demostración; no son un backfill.
export const datosProfesores = [
  { correo: "profesor@ubiobio.cl", tipo: "planta", rut: "90000000-6" },
  { correo: "profesor.parttime@ubiobio.cl", tipo: "part time", rut: "90000001-4" },
] as const;
