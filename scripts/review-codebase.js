// Codebase review script using OpenAI HTTP API
// Scans repository files, batches content, and writes a Markdown report.

import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ override: true });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. Add it to .env');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..'));
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'reports');
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  `openai-review-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
);

const MAX_FILE_SIZE_BYTES = 180 * 1024; // 180 KB per file cap
const MAX_CHUNK_CHARS = 12000; // per request
const INCLUDE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.html', '.css', '.sh', '.cjs'
]);
const EXCLUDE_DIRS = new Set([
  'node_modules', 'uploads', 'logs', '.git', '.cache'
]);
const EXCLUDE_FILES = new Set([
  'data/creata.db', 'data/creata.db-shm', 'data/creata.db-wal', 'database.sqlite'
]);

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith('.git')) continue;
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(REPO_ROOT, full);
    if (EXCLUDE_FILES.has(rel)) continue;
    if (e.isDirectory()) {
      files.push(...listFiles(full));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (INCLUDE_EXTS.has(ext)) files.push(full);
    }
  }
  return files;
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

async function callOpenAI(prompt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REVIEW_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {}
  };
}

function buildPrompt(fileRelPath, codeChunk) {
  return `You are reviewing a JavaScript/Node web app codebase. Analyze the code chunk and provide:
- Critical bugs or errors
- Security issues
- Performance problems
- Incomplete features or TODOs preventing tasks from completion
- Concrete, file-specific fixes with code suggestions

File: ${fileRelPath}
Code:
\`\`\`
${codeChunk}
\`\`\`
Return a concise, high-signal review with actionable edits.`;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = listFiles(REPO_ROOT)
    .filter(f => fs.statSync(f).size <= MAX_FILE_SIZE_BYTES);

  const report = [];
  report.push(`# OpenAI Codebase Review`);
  report.push(`Date: ${new Date().toISOString()}`);
  report.push('');

  let totalTokens = 0;
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    if (!content.trim()) continue;

    const chunks = chunkString(content, MAX_CHUNK_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      const prompt = buildPrompt(rel + (chunks.length > 1 ? ` (part ${i+1}/${chunks.length})` : ''), chunks[i]);
      try {
        const { content: review, usage } = await callOpenAI(prompt);
        totalTokens += (usage?.total_tokens || 0);
        report.push(`## ${rel}${chunks.length > 1 ? ` (part ${i+1}/${chunks.length})` : ''}`);
        report.push('');
        report.push(review.trim());
        report.push('');
      } catch (err) {
        report.push(`## ${rel}${chunks.length > 1 ? ` (part ${i+1}/${chunks.length})` : ''}`);
        report.push('');
        report.push(`Error: ${String(err.message).slice(0, 500)}`);
        report.push('');
      }
      await new Promise(r => setTimeout(r, 300)); // small pacing
    }
  }

  report.push('');
  report.push(`---`);
  report.push(`Estimated total tokens (approx): ${totalTokens}`);

  fs.writeFileSync(OUTPUT_FILE, report.join(os.EOL), 'utf8');
  console.log(`✅ Review complete: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Review failed:', err);
  process.exit(1);
});


