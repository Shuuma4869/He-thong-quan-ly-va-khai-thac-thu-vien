FROM node:22.23.3-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_CORE_API_URL=http://localhost:8080/api/v1
ARG VITE_INSIGHT_API_URL=http://localhost:3000/api/v1
ENV VITE_CORE_API_URL=$VITE_CORE_API_URL
ENV VITE_INSIGHT_API_URL=$VITE_INSIGHT_API_URL
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
