# Contributing

Thanks for considering a contribution.

## Development workflow
1. Fork and create a branch from `main`.
2. Install dependencies with `npm install`.
3. Install local hooks with `npm run prepare` (or re-run after cloning if hooks are missing).
4. Run checks before opening a PR:
   - `npm run secrets:scan`
   - `npm run test`
   - `npm run verify`
   - `npm run build`
5. Open a PR with clear context, validation evidence, and migration notes if behavior changes.

## Pull request guidelines
- Keep commits focused and reversible.
- Add tests for behavioral changes.
- Preserve MCP response contracts unless explicitly versioned.
- Avoid unrelated formatting churn.
- Follow `docs/release_checklist.md` for release-affecting changes.

## Reporting issues
Please include:
- Expected vs actual behavior
- Reproduction steps
- Logs/errors (redacted)
- Environment details (Node version, OS)
