# syntax=docker/dockerfile:1
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# 零运行时依赖：无需 npm install，构建不依赖外网
COPY package.json ./
COPY solver.js server.js ./
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY test/ ./test/

# 构建（语法校验 + 组装 dist/）；chown 使 verify 服务能以 node 用户重复构建
RUN npm run build && chown -R node:node /app

EXPOSE 8080
USER node

CMD ["node", "dist/server.js"]
