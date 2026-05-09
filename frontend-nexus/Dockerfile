FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
# NexusOS-main frontend might use pnpm, but npm install works since there's no lockfile here.
# Let's just do npm install.
RUN npm install

# Copy source
COPY . .

# Expose dev server port
EXPOSE 5174

# Run dev server (hot-reload)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]
