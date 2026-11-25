# Juego (cliente Phaser/Vite): se compila y se sirve en el puerto 8000.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8000
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8000", "--strictPort"]
