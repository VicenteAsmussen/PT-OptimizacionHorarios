FROM julia:1.11.5-bookworm AS julia
FROM node:22-bookworm-slim

# Julia y Node comparten la base glibc. No se agrega un servicio independiente.
COPY --from=julia /usr/local/julia /usr/local/julia
ENV PATH="/usr/local/julia/bin:${PATH}"
ENV JULIA_DEPOT_PATH="/opt/julia-depot:"

WORKDIR /app

# Preparar pnpm con la versión del proyecto.
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Instalar las dependencias Node.
COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# El depósito queda fuera de /app, que Compose monta desde la máquina local.
RUN julia --startup-file=no --project=/app/optimizacion/julia -e 'using Pkg; Pkg.instantiate(); Pkg.precompile()'

EXPOSE 3000

# El proceso hijo solo recibe el snapshot validado por el backend.
CMD ["./node_modules/.bin/tsx", "watch", "src/server.ts"]
