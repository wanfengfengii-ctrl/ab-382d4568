# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# 零运行时依赖，无需 npm install；全部源码直接拷贝
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
COPY test ./test

# 非 root 运行；数据目录用于保存草稿与最近结论
RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/data \
  && chown -R app:app /app
USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
