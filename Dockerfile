FROM node:22-alpine AS build
# ffmpeg cuts the audio clips for players with sound on their own device (also used by the dev container)
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build                  # shared → web → api

FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# apps/web/package.json is copied only so that npm ci sees every workspace from the lockfile;
# no web dependencies are installed in the runtime image.
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/api/public
EXPOSE 3000
# runs migrations at startup (comment on its own line: inline comments break the JSON exec form)
CMD ["node", "apps/api/dist/server.js"]
