# --- Frontend ---
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build --prefix apps/web

# --- PocketBase ---
FROM alpine:3.20
ARG TARGETARCH=amd64
WORKDIR /pb
RUN apk add --no-cache ca-certificates curl unzip tzdata
COPY apps/pocketbase/.pocketbase-version ./
RUN PB_VERSION=$(cat .pocketbase-version) \
 && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -o pb.zip \
 && unzip pb.zip pocketbase && rm pb.zip
COPY apps/pocketbase/pb_migrations ./pb_migrations
COPY apps/pocketbase/pb_hooks ./pb_hooks
COPY --from=web /app/apps/pocketbase/pb_public ./pb_public
ENV TZ=Europe/Madrid
EXPOSE 8090
VOLUME /pb/pb_data
# PORT lo fijan algunos hostings (Railway, Render...); por defecto, 8090.
CMD ["sh", "-c", "exec /pb/pocketbase serve --http=0.0.0.0:${PORT:-8090}"]
