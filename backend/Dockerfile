FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Ignore postinstall (prisma generate) — schema is not in this stage yet
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Rebuild native modules (bcrypt) after ignore-scripts install
RUN npm rebuild bcrypt \
  && npx prisma generate \
  && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && mkdir -p /app/storage

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
