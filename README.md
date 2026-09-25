# 纸本文物水渍分布复原

分析员在浏览器中根据透射成像得到的**行、列潮湿纤维计数**，复原被污渍遮蔽的水渍分布，
避免凭局部深色区域误判独立水渍团。应用在本机联合枚举所有可能网格，并给出
**无解 / 唯一结论 / 存在歧义** 三种结论之一。

## 规则

- 网格 4–8 行、4–8 列；每行、每列填写**非负精确计数**，网格中该行（列）的潮湿数须与之精确相等；
- 每个单元可标为 **已确认潮湿 / 已确认干燥 / 待定**，已确认单元在复原中不得改变；
- 全部潮湿单元按**共享边四邻接**关系（斜角接触不得连通）恰形成 **1–3** 个水渍团；
- 歧义时同时展示：
  - **按行优先二进制序最小的方案**——网格按行优先展开、潮湿记 1 干燥记 0、
    首单元为最高位所得二进制数最小者；
  - **一份确有不同的替代方案**（枚举次序中的次小者）；
- 修改草稿后旧结论立即失效、不再显示；草稿与最近结论自动保存在本机
  （服务器 `data/state.json` + 浏览器 localStorage 双写）。

## 运行（Docker Compose）

```bash
docker compose up -d web          # 启动 Web 应用
docker compose ps                 # 查看健康检查状态（/health）
```

宿主机端口可通过环境变量配置（默认 8080）：

```bash
APP_PORT=9000 docker compose up -d web
# 或在 .env 中写入 APP_PORT=9000
```

访问 <http://localhost:8080>（或所配端口）。健康检查端点：`GET /health`。

## 一次性校验（verify 服务）

`verify` 服务自动执行**代码测试 → 构建 → 领域求解冒烟**，以退出码报告结果后自行退出：

```bash
docker compose build                 # 首次先构建镜像
docker compose run --rm verify       # 退出码即校验结果
# 或一条命令（up 会自动构建缺失的镜像）：
docker compose up --exit-code-from verify verify
```

## 本地开发（Node ≥ 20，零依赖）

```bash
npm test          # 求解器单元测试（含 200 例暴力枚举交叉验证）
npm run build     # 语法检查 + 资源校验 + 产出 dist/
npm run smoke     # 领域求解冒烟 + 真实服务器 /health 检查
npm run verify    # 上述三者串联
npm start         # 启动应用（PORT 环境变量可改端口，默认 8080）
```

## 结构

```
server.js            零依赖静态服务器：/health、/api/state（草稿与结论持久化）
public/index.html    单页应用
public/app.js        交互：三态单元、行列计数、结论渲染、本地保存
public/solver.js     领域核心：逐行 DFS 枚举 + 可回滚并查集连通团剪枝（浏览器与 Node 共用）
test/solver.test.js  单元测试（与暴力枚举交叉对照）
scripts/build.js     构建（语法检查、资源校验、dist 产出）
scripts/smoke.js     领域求解冒烟 + 健康检查
Dockerfile           单阶段镜像（node:22-alpine，非 root，HEALTHCHECK）
docker-compose.yml   web（端口可配置、健康检查、数据卷）+ verify（一次性校验）
```
