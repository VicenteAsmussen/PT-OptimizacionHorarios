export const claveInicial = "123456";

// Synthetic RUTs for development fixtures, not institutional identities.
function crearRut(indice: number) {
  const cuerpo = String(90000000 + indice);
  const suma = [...cuerpo].reverse().reduce((total, digito, posicion) => total + Number(digito) * (2 + posicion % 6), 0);
  const resto = 11 - suma % 11;
  return `${cuerpo}-${resto === 11 ? "0" : resto === 10 ? "K" : resto}`;
}

// Named professors from Requerimientos + Profesores; affiliations confirmed by the user.
// Keep stable RUT indices independent of array position; retired index 21 stays reserved.
const profesoresBase: [indiceRut: number, nombre: string, correo: string, departamento: string, tipo?: string][] = [
  [0, "Christian Lautaro Vidal Castro", "cvidal", "Sistemas de Información"],
  [1, "Sting Adams Natanael Parra Silva", "sparra", "Sistemas de Información"],
  [2, "Clemente Rubio Manzano", "crubio", "Sistemas de Información"],
  [3, "Jazna Patricia Meza Hidalgo", "jmeza", "Sistemas de Información"],
  [4, "Karina Pilar Rojas Contreras", "krojas", "Sistemas de Información"],
  [5, "Oscar San Martin", "osanmartin", "Sistemas de Información"],
  [6, "Dayan Ricardo Suarez Muñoz", "dsuarez", "Matemática"],
  [7, "Efraín Gabriel Nova Hernández", "enova", "Matemática"],
  [8, "Patricia Ximena D Amico Davagnino", "pdamico", "Matemática"],
  [9, "Brayan Rodrigo Sandoval León", "bsandoval", "Matemática"],
  [10, "Orlando Edgardo Sigisfredo Parra Díaz", "oparra", "Química"],
  [11, "Beatriz Oriana Ruf Acevedo", "bruf", "Química"],
  [12, "Ramon Esteban Ahumada Rudolph", "rahumada", "Química"],
  [13, "Antonio Enrique Maureira Navarrete", "amaureira", "Química"],
  [14, "Daniel Alejandro Parra Vogel", "dparra", "Matemática"],
  [15, "Judith Ximena Campana Sevilla", "jcampana", "Matemática"],
  [16, "Hugo Sebastián Díaz Norambuena", "hdiaz", "Matemática"],
  [17, "Evelyn Bernarda Riveros Sepúlveda", "eriveros", "Física"],
  [18, "Jaime Eduardo Andrade Bustos", "jandrade", "Matemática"],
  [19, "Nikolas Fernando Jara Cádiz", "njara", "Matemática"],
  [20, "Jania Valeria Bastías Delgado", "jbastias", "Estudios Generales"],
  [22, "Claudio Orlando Gutiérrez Soto", "cgutierrez", "Sistemas de Información"],
  [23, "Mónica Alejandra Caniupán Marileo", "mcaniupan", "Sistemas de Información"],
  [24, "Valeria Soledad Beratto Ulloa", "vberatto", "Sistemas de Información"],
  [25, "Sergio Araya", "saraya", "Sistemas de Información"],
  [26, "Alejandro Valdes", "avaldes", "Sistemas de Información"],
  [27, "Mauricio Fuenzalida", "mfuenzalida", "Sistemas de Información"],
  [28, "Alejandra Segura", "asegura", "Sistemas de Información"],
  [29, "Sebastian Espinoza", "sespinoza", "Sistemas de Información"],
  [30, "Tatiana Gutierrez", "tgutierrez", "Sistemas de Información"],
  [31, "Ariel Andia", "aandia", "Sistemas de Información"],
  [32, "Juan Carlos Parra", "jparra", "Sistemas de Información"],
  [33, "Cuauhtémoc Trejo Cruz", "ctrejo", "Física"],
  [34, "Juan Guillermo Rodríguez Santos", "jrodriguez", "Estadística"],
  [35, "Valentina Duque Paz", "vduque", "Estadística"],
  [36, "Gabriel Alexandro Cabezas Rivera", "gcabezas", "Estudios Generales"],
  [37, "Mauricio Andre Leiva del Campo", "mleiva", "Economía y Finanzas"],
  [38, "Erick Contreras", "econtreras", "Administración y Auditoría", "part time"],
  [39, "Freddy Banda", "fbanda", "Economía y Finanzas", "part time"],
  [40, "Cristian Pinto", "cpinto", "Economía y Finanzas"],
  [41, "Luis Emilio Cabrera Crot", "lcabrera", "Sistemas de Información"],
  [42, "Gabriel Rodolfo Lagos Aguayo", "glagos", "Ingeniería Eléctrica y Electrónica"],
  [43, "Morin Antonia Órdenes Escobar", "mordenes", "Física"],
];

export const datosProfesores = profesoresBase.map(([indiceRut, nombre, correo, departamento, tipo = "planta"]) => ({
  nombre: nombre!, correo: `${correo}@ubb.cl`, departamento: `Departamento de ${departamento}`,
  tipo, rut: crearRut(indiceRut),
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
