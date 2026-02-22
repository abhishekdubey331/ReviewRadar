import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const TARGETS = ["README.md", "docs", "CODE_REVIEW_AND_REFACTOR_PLAN_DOC.md"];
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function collectMarkdownFiles(targetPath, output) {
    const absolute = path.resolve(ROOT, targetPath);
    if (!fs.existsSync(absolute)) return;

    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
        if (absolute.toLowerCase().endsWith(".md")) output.push(absolute);
        return;
    }

    if (!stat.isDirectory()) return;

    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            collectMarkdownFiles(path.join(absolute, entry.name), output);
            continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
            output.push(path.join(absolute, entry.name));
        }
    }
}

function lintFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        if (/\t/.test(line)) {
            issues.push(`${filePath}:${lineNo} contains tab character`);
        }
        const isWhitespaceOnly = /^[ \t]+$/.test(line);
        const hasMarkdownHardBreak = /  $/.test(line);
        if (!isWhitespaceOnly && !hasMarkdownHardBreak && /[ \t]+$/.test(line)) {
            issues.push(`${filePath}:${lineNo} has trailing whitespace`);
        }
    }

    return issues;
}

const files = [];
for (const target of TARGETS) {
    collectMarkdownFiles(target, files);
}

const uniqueFiles = [...new Set(files)];
const allIssues = uniqueFiles.flatMap(lintFile);

if (allIssues.length > 0) {
    console.error("Markdown lint failed:");
    for (const issue of allIssues) console.error(`- ${issue}`);
    process.exit(1);
}

console.log(`Markdown lint passed (${uniqueFiles.length} files checked).`);
