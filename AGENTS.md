<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

--- 

## Tech Stack and Runtime
- **Runtime & Package Manager**: [Bun](https://bun.sh) (`v1.3+`). Always use `bun <cmd>` (e.g., `bun install`, `bun test`, `bun run dev`) instead of `npm` or `pnpm`, or `yarn`
- **Frameworks**: Next.js App Router (`/app`), React, Tailwind CSS.
- **Language**: TypeScript (`v6.0+`) with strict mode enabled.
- **Database**: Drizzle ORM with SQLite

---

## Code style & architecture rules

### 1. Functional & Modular Core Design
- **Strategy Decoupling**: Pure core trading logic must reside in `src/core/`. Core strategies must never import Next.js modules, web APIs, or external HTTP adapters.
- **Strict Interfaces**: All strategies must explicitly implement `SignalStrategy` (`src/core/types.ts`).
- **Immutability**: Treat market time-series arrays (`Candle[]`) as read-only. Avoid modifying input candles in place; return fresh objects or calculations.

### 2. TypeScript Conventions
- **Explicit Types**: Always define explicit return types on public methods, exports, and core engine interfaces. Avoid `any` at all costs.
- **Types over Interfaces for Unions**: Use `interface` for object schemas (e.g., `Candle`, `PortfolioConfig`) and `type` for unions/discriminated types (e.g., `SignalType = 'BUY' | 'SELL' | 'HOLD'`).
- **File Naming**:
    - Core components/strategies: `klinger.strategy.ts`, `backtest.ts`, `yahoo.provider.ts`.
    - Next.js API Routes: `app/api/<route>/route.ts`.
    - UI Components: PascalCase (`BacktestCard.tsx`, `PortfolioTable.tsx`).
- **Prefer functional typescript over Object Oriented programming**: Except for Strategies which must implement an interface and Drizzle ORM related data types.

### 3. Code hygiene
- **Ensure ESLint passes**
- **Enforce code styles with Prettier**
- **Use conventional commits**

---

## Common Commands Reference

```bash
# Run development server
bun dev

# Run all tests
bun test

# Run tests with coverage reporting
bun test --coverage

# Linting codebase
bun run lint