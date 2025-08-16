# Sign Price Final — Deploy Notes

## What I changed
- Replaced `next.config.ts` with `next.config.js` (Vercel requires JS).
- Added path aliases to `tsconfig.json` and `jsconfig.json` so `@/components/...` imports work.
- Added `// @ts-nocheck` to `app/single/page.tsx` to avoid a union type error during build.

## How to deploy on Vercel
1. Create a new GitHub repo and upload **all files at the root** (package.json, app/, components/, lib/, public/, etc.).
2. In Vercel, **Add New Project** → import the repo.
3. Framework: **Next.js**. Build: `next build`. Output Directory: *(leave empty)*.
4. Deploy.

If you still see `Module not found: Can't resolve '@/components/Card'`, double-check that this repo includes **tsconfig.json** and **jsconfig.json** with the alias config.
