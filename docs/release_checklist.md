# Release Checklist

Use this checklist for each tagged release.

## Quality Gates
- [ ] `npm run lint` passes.
- [ ] `npm run verify` passes.
- [ ] `npm run build` passes.
- [ ] Coverage thresholds remain green in CI.

## Contract Stability
- [ ] Any tool schema change is documented in `CHANGELOG.md`.
- [ ] Any breaking change includes migration notes.
- [ ] MCP tool names remain stable or are explicitly versioned/deprecated.

## Documentation
- [ ] `README.md` quickstart remains accurate.
- [ ] `docs/setup_guide.md` command paths/scripts are still valid.
- [ ] New operational behavior is reflected in docs.

## Release Hygiene
- [ ] Version updated in `package.json` if applicable.
- [ ] Release notes drafted from merged changes.
- [ ] Security-sensitive notes reviewed before publishing.
