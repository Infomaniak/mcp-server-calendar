FROM node:22.12-alpine AS builder

# Must be entire project because `prepare` script is run during `npm install` and requires all files.
COPY . /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM node:22-alpine AS release

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=4500

WORKDIR /app

RUN npm ci --ignore-scripts --omit-dev

EXPOSE 4500

# TCP connect to the configured port. Catches a bad bind (an .env pinning
# 127.0.0.1 over the image's 0.0.0.0): container shows Up, published port dead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "require('net').connect(+process.env.MCP_HTTP_PORT||4500,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

USER node

ENTRYPOINT ["node", "dist/http.js"]
