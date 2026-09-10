FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json registry.seed.json processed.seed.json ./
COPY lib ./lib
COPY server ./server
COPY worker ./worker
COPY web ./web

RUN npm run web:build

ENV NODE_ENV=production

EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
