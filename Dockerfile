# Build multi-étages : Vite construit dist/, nginx non-root le sert en 8080
# (compatible `runAsNonRoot` / securityContext restreint côté Kubernetes).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="HYPERNOVA" \
      org.opencontainers.image.description="Shoot'em up spatial 3D : vagues d'ennemis, boutique, campagnes hebdomadaires." \
      org.opencontainers.image.licenses="MIT"

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
