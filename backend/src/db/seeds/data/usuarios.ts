export const claveInicial = "123456";

// Synthetic RUTs for development fixtures, not institutional identities.
function crearRut(indice: number) {
  const cuerpo = String(90000000 + indice);
  const suma = [...cuerpo].reverse().reduce((total, digito, posicion) => total + Number(digito) * (2 + posicion % 6), 0);
  const resto = 11 - suma % 11;
  return `${cuerpo}-${resto === 11 ? "0" : resto === 10 ? "K" : resto}`;
}

// Named professors from Requerimientos + Profesores; affiliations confirmed by the user.
export const datosProfesores = [
  ["Christian Lautaro Vidal Castro", "cvidal", "Sistemas de Información"],
  ["Sting Adams Natanael Parra Silva", "sparra", "Sistemas de Información"],
  ["Clemente Rubio Manzano", "crubio", "Sistemas de Información"],
  ["Jazna Patricia Meza Hidalgo", "jmeza", "Sistemas de Información"],
  ["Karina Pilar Rojas Contreras", "krojas", "Sistemas de Información"],
  ["Oscar San Martin", "osanmartin", "Sistemas de Información"],
  ["Dayan Ricardo Suarez Muñoz", "dsuarez", "Matemática"],
  ["Efraín Gabriel Nova Hernández", "enova", "Matemática"],
  ["Patricia Ximena D Amico Davagnino", "pdamico", "Matemática"],
  ["Brayan Rodrigo Sandoval León", "bsandoval", "Matemática"],
  ["Orlando Edgardo Sigisfredo Parra Díaz", "oparra", "Química"],
  ["Beatriz Oriana Ruf Acevedo", "bruf", "Química"],
  ["Ramon Esteban Ahumada Rudolph", "rahumada", "Química"],
  ["Antonio Enrique Maureira Navarrete", "amaureira", "Química"],
  ["Daniel Alejandro Parra Vogel", "dparra", "Matemática"],
  ["Judith Ximena Campana Sevilla", "jcampana", "Matemática"],
  ["Hugo Sebastián Díaz Norambuena", "hdiaz", "Matemática"],
  ["Evelyn Bernarda Riveros Sepúlveda", "eriveros", "Física"],
  ["Jaime Eduardo Andrade Bustos", "jandrade", "Matemática"],
  ["Nikolas Fernando Jara Cádiz", "njara", "Matemática"],
  ["Jania Valeria Bastías Delgado", "jbastias", "Estudios Generales"],
  ["Jorge Ruiz", "jruiz", "Estudios Generales"],
].map(([nombre, correo, departamento], indice) => ({
  nombre: nombre!, correo: `${correo}@ubb.cl`, departamento: `Departamento de ${departamento}`,
  tipo: "planta", rut: crearRut(indice),
}));

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
  ...datosProfesores.map(({ nombre, correo }) => ({ nombre, correo, rol: "profesor" as const })),
];
