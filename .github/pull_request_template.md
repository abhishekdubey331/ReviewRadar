# Summary
- What changed:
- Why this change is needed:
- Scope:

# Type Of Change
- [ ] Bug fix
- [ ] Refactor (no behavior change)
- [ ] Performance improvement
- [ ] Feature
- [ ] Documentation only
- [ ] CI/Tooling
- [ ] Breaking change

# Validation Evidence
## Commands Run
- [ ] `npm run secrets:scan`
- [ ] `npm run test`
- [ ] `npm run verify`
- [ ] `npm run build`

## Results
- Paste key output lines or summarize pass/fail:

## Manual Verification
- Steps executed:
- Expected behavior observed:

# Risk And Rollback
- Risk level: `low` | `medium` | `high`
- Main failure modes:
- Rollback plan (specific command/commit strategy):

# Contract And Compatibility
- [ ] MCP tool names unchanged
- [ ] Input/output schema unchanged or documented
- [ ] Breaking changes documented in `CHANGELOG.md`
- [ ] Migration notes included (if applicable)

# Security And Privacy
- [ ] No secrets committed
- [ ] No raw sensitive data added to logs
- [ ] New dependency risk reviewed (if dependencies changed)

# Architecture And Maintainability
- [ ] Clear module boundaries preserved/improved
- [ ] Dependency direction preserved (`app -> domain -> ports`, infra behind ports)
- [ ] New code is covered by tests
- [ ] Avoided unnecessary comments; naming/structure carries intent

# Documentation
- [ ] `README.md` updated (if user-facing behavior changed)
- [ ] `docs/` updated (if architecture/runtime behavior changed)
- [ ] `CONTRIBUTING.md`/`SECURITY.md` updated (if process/security changed)

# Checklist
- [ ] PR is focused and reversible
- [ ] No unrelated churn
- [ ] Linked issue/task (if available)
