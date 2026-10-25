# Plain Price Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 四位价格完整显示，五位价格保留万、千、百、十位，交付本地验收用 dist。

**Architecture:** 修改现有纯格式化函数与角标悬停说明，沿用 React 弹窗、行情引擎和 Chrome 原生角标。

**Tech Stack:** TypeScript、Vite、Vitest、Playwright；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-25-plain-price-badge-design.md`

## Global Constraints

- 从最新 main 创建独立分支；不用 worktree。
- 最多四字符，普通价格截断不进位、不补前导零；小于 1 和六位以上价格保留已有处理。
- 版本同步为 0.2.5；只构建 dist，供用户本地验收。

## Review Focus

- 四位整数不能再变成 k 缩写。
- 五位价格不能因舍入导致错误高位或跨数量级。
- 字符串小数接近进位边界时仍保留真实整数位。
- 现货、永续、轮播与离线缓存使用相同显示规则；完整价格必须保留。
- 取消固定、小额价、科学记数法与涨跌幅模式保持可用。

## Task 1: 格式化、提示与交付

**Files:** `src/shared/format.ts`、`src/background/badge.ts`、`tests/shared.test.ts`、`tests/background.test.ts`、`tests/e2e/extension.spec.ts`、版本元数据、README、验证记录。

**Interfaces:** 保留 `formatBadgePrice(price: string): string` 和 `createBadge` 的现有签名。

- [x] 先更新回归测试：断言 `2428.76 → 2428`、`68754.32 → 6875`、`99999.90 → 9999`、不补前导零，并检查悬停保留完整价、五位提示与真实 Chrome 角标。
- [x] 运行 `npm test -- tests/shared.test.ts tests/background.test.ts`，确认旧实现因 k 缩写等预期不符而失败。
- [x] 以十进制字符串截取实现已确认规则，更新五位价悬停说明与相关版本、文档。
- [x] 运行 `npm run check`、`npm run test:e2e`；101 项测试和 5 项浏览器测试通过，dist 版本为 0.2.5。
- [x] 审查 diff，提交到本地功能分支，保留该分支和 dist 供用户验收。
