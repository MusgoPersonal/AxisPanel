# AxisPanel Constitution

## Core Principles

1. **Quality First**: All code must be maintainable, tested, and follow established patterns.
2. **User-Centric**: Every feature must solve a real user problem. Prioritize UX.
3. **Progressive Enhancement**: Start simple, iterate. Avoid over-engineering.
4. **Separation of Concerns**: Keep backend (Express + SQLite) and frontend (Svelte) clearly separated.

## Technology Stack

- **Backend**: Node.js + Express + better-sqlite3
- **Frontend**: Svelte + Vite
- **Auth**: Firebase Admin
- **Database**: SQLite (via better-sqlite3)
- **Navigation**: macOS Dock-style floating menu

## Development Guidelines

1. Use existing patterns from the codebase before introducing new ones.
2. All new features must include documentation in CONTEXT.md.
3. Follow RESTful conventions for API endpoints.
4. Error handling must be consistent (try/catch, meaningful error messages).
5. Keep secrets and API keys in environment variables only.
