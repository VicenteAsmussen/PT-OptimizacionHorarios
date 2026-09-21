FROM node:22-alpine

WORKDIR /app

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy package management files
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the rest of the application code
COPY . .

EXPOSE 3000

# Run in development mode with tsx
CMD ["./node_modules/.bin/tsx", "watch", "src/server.ts"]
