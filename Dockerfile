# Stage 1: Build & Production Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

# Copy package descriptors
COPY package*.json ./

# Install npm dependencies
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Build frontend production bundle (outputs to dist/)
RUN npm run build

# Remove development dependencies to slim down container image
RUN npm prune --production

# Expose server port (default 3000)
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Start unified Node.js + Express server
CMD ["node", "server/server.js"]
