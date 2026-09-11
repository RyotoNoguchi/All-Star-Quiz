# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an All Star Quiz application - a survival quiz game inspired by Japanese variety shows like "All Star Thanksgiving Festival." The app supports real-time multiplayer quiz gameplay where participants compete in elimination-style questions until only one winner remains.

### Key Game Mechanics

- 10-second time limit per question
- Multiple choice questions (A, B, C, D)
- Players eliminated for wrong answers or timeout
- Among correct answers, slowest responder is eliminated (normal questions)
- Among correct answers, fastest responder wins (final question)
- Final question indicated by bell sound

### System Architecture

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui components
- **Future Backend**: Next.js API Routes + Socket.io + Prisma + PostgreSQL
- **Testing**: Vitest + Testing Library
- **Deployment Target**: Vercel

## Development Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run build           # Production build
npm run start           # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint errors automatically
npm run format          # Format code with Prettier
npm run format:check    # Check formatting without changes
npm run type-check      # TypeScript type checking

# Testing
npm run test            # Run tests in watch mode
npm run test:run        # Run tests once
npm run test:coverage   # Run tests with coverage report
```

## Component Architecture

### Layout System

- `MainLayout`: Basic page wrapper with gradient background
- `GameLayout`: Quiz-specific layout with game styling and optional header

### Game Components

- `QuizButton`: Multi-choice button (A/B/C/D) with selection states and result feedback
- `CountdownTimer`: 10-second countdown with progress bar and urgent state styling

### UI Components

Located in `src/components/ui/` - shadcn/ui components with customized styling for the quiz theme.

## Key Technical Details

### TypeScript Configuration

- Strict mode enabled with additional safety checks
- Path alias `@/*` maps to `src/*`
- Enhanced type checking with `noUnusedLocals`, `exactOptionalPropertyTypes`, etc.

### Styling System

- Tailwind CSS v4 with custom CSS variables
- Custom animations: `quiz-pulse`, `quiz-shake`, `quiz-bounce`
- Gradient text utility for All Star Quiz branding
- Game-specific color scheme with transparency effects

### Testing Setup

- Vitest configured with jsdom environment
- Testing Library for React component testing
- Global test utilities and jest-dom matchers
- Path aliases work in tests via vitest.config.ts

## Planned Development Phases

Based on `.kiro/specs/` documentation:

1. **✅ Project Foundation** - Next.js 15 + TypeScript + UI components
2. **Next: Database & Backend** - Prisma schema + tRPC + NextAuth.js
3. **Real-time Communication** - Socket.io integration
4. **Game Logic** - Question management + elimination logic
5. **Admin Panel** - Game control interface
6. **Audio & Effects** - Sound system + animations

## Coding Standards

### React Component Rules

- **Arrow Functions**: ALL React components must be implemented as arrow functions (not function declarations)
  - This applies to: `src/components/`, `src/components/ui/`, `src/components/layout/`, `src/components/game/`, `src/app/` and all subdirectories
  - No exceptions: Every React component must use arrow function syntax
- **Utility Functions**: ALL utility functions must also use arrow function syntax
  - This applies to: `src/lib/`, `src/utils/`, `src/helpers/` and similar directories
  - ✅ Good: `export const functionName = (...args) => { ... }`
  - ❌ Bad: `export function functionName(...args) { ... }`
- **Props Type Definition**: Always define props as `Props` type with React.FC
- **One Component Per File**: Each file must contain exactly ONE React component
  - If multiple components are needed, create appropriate directory structure and separate files
  - **Exception**: `src/components/ui/` (shadcn/ui library) - Related UI components may be grouped in single files
- **Named Export Style**: Use direct export syntax (not separate export statement)
  - ✅ Good: `export const Component: FC = () => { return <div>Component</div>; };`
  - ✅ Good: `export const helperFunction = cva(...);` (for helper functions)
  - ❌ Bad: `const Component = () => {...}; export { Component };`
  - ❌ Bad: `const helperFunction = cva(...); export { helperFunction };`
  - **Rule**: ALL exports (components, helpers, utilities) must use `export const` directly
- **Component Structure**:
  - For page components: `const ComponentName: FC<Props> = (props) => { ... }; export default ComponentName;`
  - For regular components: `export const ComponentName: FC<Props> = (props) => { ... };`

### TypeScript Rules

- **Type Definitions**: Always use `type` instead of `interface` for type definitions
- **Variable Declarations**: Use `const` whenever possible, avoid `let`
- **Props Type Name**: Always name component props type as `Props`
- **React Import**: Don't import React in React 18+ code (not needed for JSX)
- **Type-only Imports**: Use `import type` for imports used only as types

```tsx
// Component example (for src/components/)
import { useState, type ReactNode, type FC } from 'react';

type Props = {
  name: string;
  age: number;
  children: ReactNode;
};

export const Component: FC<Props> = (props) => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>{props.name}</p>
      <p>{props.age}</p>
      {props.children}
    </div>
  );
};

// Page component example (for src/app/)
const HomePage: FC = () => {
  const [count, setCount] = useState(0);

  return <div>Home Page</div>;
};

export default HomePage;
```

## Development Notes

### Component Testing

Test files are located in `src/components/__tests__/`. Focus on:

- User interactions (button clicks, timer events)
- Visual state changes (selection, results, disabled states)
- Props validation and edge cases

### File Organization

- `src/components/layout/` - Layout components
- `src/components/game/` - Quiz-specific components
- `src/components/admin/` - Admin interface components (future)
- `src/components/ui/` - shadcn/ui base components

### Environment Variables

See `.env.example` for required environment variables when implementing backend features (database, auth, Redis, etc.).

## Gemini CLI 連携ガイド

### 目的

ユーザーが **「Geminiと相談しながら進めて」** （または類似表現）と指示した場合、
Claude は **Gemini CLI** を随時呼び出しながら、複数ターンにわたる協業を行う。

---

### トリガー

- 正規表現: `/(Gemini|ジェミニ).*(相談|協力|協業).*(しながら|して)/`
- 一度トリガーした後は、ユーザーが明示的に終了を指示するまで **協業モード** を維持する。

---

### 協業ワークフロー (ループ可)

| #   | 処理                | 詳細                                                                                                                       |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PROMPT 準備**     | 最新のユーザー要件 + これまでの議論要約を `$PROMPT` に格納                                                                 |
| 2   | **Gemini 呼び出し** | `bash`<br>`gemini <<EOF`<br>`$PROMPT`<br>`EOF`<br>必要に応じ `--max_output_tokens` 等を追加                                |
| 3   | **出力貼り付け**    | `Gemini ➜` セクションに全文、長い場合は要約＋原文リンク                                                                    |
| 4   | **Claude コメント** | `Claude ➜` セクションで Gemini の提案を分析・統合し、次アクションを提示                                                    |
| 5   | **継続判定**        | ユーザー入力 or プラン継続で 1〜4 を繰り返す。<br>「Geminiコラボ終了」「協業終了」「ここまででOK」等の指示で通常モード復帰 |

---

### 形式テンプレート

```md
**Gemini ➜**
<Gemini からの応答>
**Claude ➜**
<統合コメント & 次アクション>
```
