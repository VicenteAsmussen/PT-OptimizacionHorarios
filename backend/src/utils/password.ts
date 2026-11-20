import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Deriva la representación de la clave que se persiste para autenticar una cuenta.
export async function hashPassword(plainText: string): Promise<string> {
  return await bcrypt.hash(plainText, SALT_ROUNDS);
}

// Comprueba la clave presentada contra su representación persistida sin devolverla al cliente.
export async function comparePassword(plainText: string, hashed: string): Promise<boolean> {
  return await bcrypt.compare(plainText, hashed);
}
