# Retro Pixel Cards - Guandan MVP

复古像素风掼蛋 MVP（Next.js + 规则引擎 + AI 对战 + LLM 复盘）。

## 功能覆盖

- 创建房间 / 房间码加入
- 4 座位 2v2，对局可由 AI 补位
- 服务端权威出牌校验（规则引擎）
- AI 出牌（easy/normal/hard 框架，首版默认 normal）
- 局后自动中文复盘（无 OpenAI Key 时走规则降级复盘）
- 像素风大厅、房间、牌桌、复盘页面

## Monorepo 结构

- `apps/web`: Web 前端 + API routes
- `packages/shared`: 共享类型、事件、错误码
- `packages/game-engine`: 发牌、牌型、合法出牌、回合推进、胜负判定
- `packages/ai-core`: AI 决策与关键回合提取
- `supabase/migrations`: 数据库表结构与 RLS
- `tests`: 规则引擎与 AI 测试

## 环境变量

复制 `.env.example` 并填写：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

## 本地运行

```bash
npm install
rm -rf apps/web/.next
npm run dev --workspace @retro/web
```

打开 `http://localhost:3000`。

### 本地调试建议（避免“UI 没变化”）

- 改了样式、组件结构、路由后，优先清理 `apps/web/.next` 再启动。
- 如果浏览器仍显示旧 UI，强制刷新（macOS: `Cmd + Shift + R`）。
- 若牌桌显示为观战态（看不到自己的明牌），通常是 `retro_seat_token` 会话丢失：返回房间重新加入即可恢复操作。

## 测试与检查

```bash
npm run typecheck
npm test
npm run build
```

## API 契约（首版）

- `POST /api/rooms` 创建房间
- `POST /api/rooms/join` 加入房间
- `POST /api/rooms/:roomId/start` 房主开局
- `GET /api/games/:gameId/state` 拉取对局状态
- `POST /api/games/:gameId/action` 出牌/过牌/托管切换
- `POST /api/games/:gameId/ai-move` 触发 AI 出牌
- `POST /api/games/:gameId/review` 生成复盘

## Supabase 迁移

```bash
# 已提供 SQL：supabase/migrations/202602100100_init.sql
# 在你的 Supabase 项目执行 migration 即可
```

## Vercel 部署

1. 将仓库连接到 Vercel。
2. 在 Vercel 配置上述环境变量。
3. 构建命令：`npm run build`。
4. 部署完成后即可通过网页访问。

## 当前实现说明

- Realtime 事件已统一封装（`apps/web/src/server/realtime.ts`），当前默认内存版日志输出；可直接替换为 Supabase broadcast。
- 房间/对局状态目前采用内存存储（`apps/web/src/server/store.ts`）保证 MVP 快速可跑；下一步可无缝切换为 Postgres 持久化。
