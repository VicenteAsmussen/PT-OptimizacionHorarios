FROM node:22-alpine

WORKDIR /app

# Habilita corepack e instala pnpm.
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copia los archivos de gestión de paquetes.
COPY package.json ./

# Instala las dependencias.
RUN pnpm install

# Copia el resto de la aplicación.
COPY . .

EXPOSE 5173

# Inicia el servidor de desarrollo.
CMD ["pnpm", "run", "dev"]
