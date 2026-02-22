import fs from "fs";
import path from "path";

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");

const excludedDirs = [
    "node_modules/",
    "dist/",
    "coverage/",
    ".git/",
];

const excludedFiles = new Set([
    ".env.example",
]);

const detectors = [
    { name: "OpenAI key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
    { name: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
    { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
    { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
];

function isExcluded(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    if (excludedFiles.has(path.basename(normalized))) return true;
    return excludedDirs.some((dir) => normalized.startsWith(dir));
}

function walkFiles(dirPath, output) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        const relative = path.relative(process.cwd(), full).replace(/\\/g, "/");
        if (isExcluded(relative)) continue;
        if (entry.isDirectory()) {
            walkFiles(full, output);
            continue;
        }
        if (entry.isFile()) {
            output.push(relative);
        }
    }
}

function listFiles() {
    const files = [];
    walkFiles(process.cwd(), files);
    return files;
}

function scanFile(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const hits = [];
    for (const detector of detectors) {
        const matches = text.match(detector.pattern);
        if (matches && matches.length > 0) {
            hits.push({ detector: detector.name, count: matches.length });
        }
    }
    return hits;
}

const problems = [];
for (const file of listFiles()) {
    if (!fs.existsSync(file)) continue;
    const stats = fs.statSync(file);
    if (!stats.isFile()) continue;
    const hits = scanFile(file);
    if (hits.length > 0) {
        problems.push({ file, hits });
    }
}

if (problems.length > 0) {
    console.error("Secret scan failed. Potential secrets detected:");
    for (const problem of problems) {
        const summary = problem.hits.map((h) => `${h.detector} x${h.count}`).join(", ");
        console.error(`- ${problem.file}: ${summary}`);
    }
    process.exit(1);
}

console.log(`Secret scan passed (${stagedOnly ? "requested staged-only" : "full workspace"} mode).`);
