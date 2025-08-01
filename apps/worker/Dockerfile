# Stage 1: Base with Node.js
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update -yq && apt-get install -yqq curl

WORKDIR /app

# Stage 2: Install dependencies
FROM base AS deps
# Copy root and workspace files
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./

# Copy necessary package.json files for all apps and packages
# This is a bit of a shotgun approach, but ensures all workspace dependencies are recognized by pnpm
# A more optimized approach would be to use `pnpm list -r --depth -1 --json` to get the dependency tree
# and copy only the necessary package.json files.
COPY apps/worker/package.json ./apps/worker/

COPY packages/audit/package.json ./packages/audit/
COPY packages/audit-db/package.json ./packages/audit-db/
COPY packages/redis-client/package.json ./packages/redis-client/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

# Install all dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --strict-peer

# Stage 3: Build the application
FROM base AS build
COPY --from=deps /app /app

# Copy the source code for the audit app and its direct dependencies
# This assumes that @repo/audit is a local workspace package
COPY apps/worker ./apps/worker
COPY packages/audit ./packages/audit
COPY packages/audit-db ./packages/audit-db
COPY packages/redis-client ./packages/redis-client
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config

# If there are other @repo dependencies for audit-worker, they need to be copied too.
# For example, if @repo/tools or @repo/eslint-config were runtime dependencies (they are devDeps here).

# Set the working directory for the build
WORKDIR /app/apps/worker

# Build the audit worker
# We need to ensure that the build command also builds any local workspace dependencies if they haven't been built.
# Turborepo handles this, so `pnpm build` within the app's context should be fine if turbo is set up correctly.
# Alternatively, filter the build at the root: `pnpm --filter audit-worker build`
RUN pnpm build

# Stage 4: Development server
FROM base AS dev
WORKDIR /app

# Copy built artifacts and necessary files
COPY --from=build /app /app
# Copy the source code again for nodemon to pick up changes
COPY apps/worker/src ./apps/worker/src

# Set the working directory for the app
WORKDIR /app/apps/worker

# Expose ports for healthcheck
EXPOSE 5600

# Set environment variables
ENV NODE_ENV=development

# Command to run the development server
# This assumes that `npm run dev` in `apps/audit/package.json` handles TypeScript compilation and restarts.
# `concurrently "tsc -w" "nodemon dist/index.js"`
CMD ["npm", "run", "dev"]
