FROM node:22-alpine

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy package management files
COPY package.json ./

# Install dependencies
RUN pnpm install

# Copy the rest of the application
COPY . .

EXPOSE 5173

# Start development server
CMD ["pnpm", "run", "dev"]
