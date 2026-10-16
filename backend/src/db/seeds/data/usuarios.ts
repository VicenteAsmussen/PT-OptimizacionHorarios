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

export const datosProfesores = [
  { correo: "profesor@ubiobio.cl", tipo: "planta" },
  { correo: "profesor.parttime@ubiobio.cl", tipo: "part time" },
] as const;
