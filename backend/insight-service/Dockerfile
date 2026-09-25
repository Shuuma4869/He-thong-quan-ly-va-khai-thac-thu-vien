FROM node:22.23.3-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src src
RUN npm run build

FROM node:22.23.3-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/dist dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
