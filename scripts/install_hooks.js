import fs from "fs";
import path from "path";

const gitDir = path.resolve(".git");
const hooksDir = path.join(gitDir, "hooks");
const hookPath = path.join(hooksDir, "pre-commit");

if (!fs.existsSync(gitDir)) {
    console.log("Skipping hook install: .git directory not found.");
    process.exit(0);
}

if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
}

const hook = `#!/bin/sh
set -e
npm run secrets:scan:staged
`;

try {
    fs.writeFileSync(hookPath, hook, "utf8");
    try {
        fs.chmodSync(hookPath, 0o755);
    } catch {
        // Best-effort on platforms with limited chmod support.
    }
    console.log("Installed .git/hooks/pre-commit");
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping hook install: ${message}`);
}
