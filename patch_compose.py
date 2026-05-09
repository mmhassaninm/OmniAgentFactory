with open('docker-compose.yml', 'r') as f:
    config = f.read()

new_service = """
  frontend-nexus:
    build:
      context: ./frontend-nexus
      dockerfile: Dockerfile
    container_name: omnibot-frontend-nexus
    restart: unless-stopped
    mem_limit: 256m
    ports:
      - "5174:5174"
    volumes:
      - ./frontend-nexus/src:/app/src
      - ./frontend-nexus/public:/app/public
      - ./frontend-nexus/index.html:/app/index.html
      - ./frontend-nexus/vite.config.js:/app/vite.config.js
    depends_on:
      backend:
        condition: service_healthy
    environment:
      - VITE_API_URL=http://backend:3001
      - VITE_WS_URL=ws://backend:3001
"""

config = config.replace("\nvolumes:", new_service + "\nvolumes:")

with open('docker-compose.yml', 'w') as f:
    f.write(config)

print("Updated docker-compose.yml without yaml lib")
