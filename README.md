# 纸本文物水渍分布复原

修复前分析工具：根据透射成像得到的**行、列潮湿纤维计数**，在被污渍遮蔽的纸面网格上复原水渍分布，避免凭局部深色区域误判独立水渍团。

## 领域规则

- 网格 4–8 行 × 4–8 列；每行、每列填写非负精确潮湿计数。
- 每个单元可标为 **待定 / 已确认潮湿 / 已确认干燥**，确认单元在复原中不得改变。
- 设定水渍团数 1–3：全部潮湿单元按**共享边的四邻接**关系（斜角接触不连通）必须恰好形成该数量的连通团。
- 点击「复原」后，应用在本机联合枚举所有满足约束的网格，给出三种结论之一：
  - **无解**：不存在任何合法网格；
  - **唯一结论**：展示唯一方案；
  - **存在歧义**：同时展示**按行优先二进制序最小**的方案（第 0 行第 0 列为最高位、0 < 1）与一份**确有不同**的替代方案，并高亮两者差异单元。
- 修改草稿后旧结论立即失效并不再展示；草稿与最近结论保存在本机浏览器 `localStorage`。

## 快速开始（Docker Compose）

```bash
docker compose up --build web        # 启动 Web 应用
# 浏览器访问 http://localhost:8080

WEB_PORT=9000 docker compose up web  # 宿主机端口可配置 → http://localhost:9000
```

Web 服务带健康检查（`GET /health`，Compose `healthcheck` 每 10s 探测）。

## 一次性验证服务 verify

`verify` 服务自动执行 **代码测试 → 构建 → 领域求解冒烟**，以退出码报告结果后自行退出：

```bash
docker compose run --rm verify
# 或
docker compose up --build --exit-code-from verify verify
echo $?   # 0 = 全部通过
```

## 本地开发（Node ≥ 18，零依赖）

```bash
npm test          # 单元测试（含与暴力枚举的随机对拍）
npm run build     # 构建：语法校验 + 组装 dist/
npm run smoke     # 领域求解 + HTTP 冒烟
npm run verify    # 上述全部
npm start         # 启动服务，默认 PORT=8080
```

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回 `{"status":"ok"}` |
| POST | `/api/solve` | 求解，见下 |
| GET | `/*` | 前端静态资源 |

`POST /api/solve` 请求体：

```json
{
  "rows": 6, "cols": 6,
  "rowCounts": [2, 0, 3, 1, 2, 0],
  "colCounts": [1, 2, 0, 2, 1, 2],
  "cells": [[0, 1, 2, 0, 0, 0]],
  "components": 2
}
```

`cells` 取值：`0` 待定、`1` 已确认潮湿、`2` 已确认干燥。响应：

```json
{
  "status": "none | unique | ambiguous",
  "solutions": [ [[0,1,0,1]], [[0,1,1,0]] ],
  "meta": { "nodes": 1234, "elapsedMs": 5, "exhaustive": false }
}
```

`solutions` 至多两个：第一个恒为行优先二进制序最小方案；找到两个即判定歧义并停止枚举（唯一 / 无解结论均已穷举全部可能网格）。输入非法返回 `400` 及明细。

## 求解器实现要点（`solver.js`）

- 逐行深度优先枚举：每行预生成满足行计数与确认标注的全部位型，按行优先二进制序升序排列，保证首个解即序最小。
- 剪枝：列计数双向可行性；连通团数可达区间 `[closed + (开放团或剩余格存在 ? 1 : 0), closed + 开放团 + 剩余潮湿格数]`。
- 连通性：可回滚并查集随行放置增量合并（横向 + 纵向），叶子处再用 BFS 精确复核四邻接连通团数。
- 防御性节点预算（默认 1000 万），超出时接口返回 `503`。

## 目录结构

```
├── Dockerfile             # 多合一镜像：构建 dist/ 并以 node 用户运行
├── docker-compose.yml     # web（健康检查 + 可配置端口）与 verify（一次性）
├── package.json           # test / build / smoke / verify 脚本
├── server.js              # HTTP 服务：/health、/api/solve、静态资源
├── solver.js              # 领域求解器（纯函数，可独立测试）
├── public/                # 前端（原生 HTML/CSS/JS）
├── scripts/build.js       # 构建：语法校验 + 组装 dist/
├── scripts/smoke.js       # 领域求解 + HTTP 冒烟
└── test/                  # node:test 单元测试（含暴力求解对拍）
```
