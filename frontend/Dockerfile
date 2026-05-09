FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Expose dev server port
EXPOSE 5173

# Run dev server (hot-reload)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
