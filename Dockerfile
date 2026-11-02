FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine
# Ghostscript cleans PDFs, Poppler renders previews, LibreOffice converts Word and Excel.
# Build with --build-arg OFFICE=false to leave LibreOffice out (about 500 MB smaller).
ARG OFFICE=true
RUN apk add --no-cache ghostscript poppler-utils font-dejavu \
	&& if [ "$OFFICE" = "true" ]; then apk add --no-cache libreoffice-writer libreoffice-calc libreoffice-impress font-noto; fi
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data BODY_SIZE_LIMIT=52M
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# The volume MUST belong to the user the app runs as, or uploads fail with EACCES.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "build"]
