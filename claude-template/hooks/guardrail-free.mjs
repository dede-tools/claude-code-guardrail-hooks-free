#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  const input = await readStdinJson();
  const finding = analyze(input);

  if (finding) {
    deny(finding.title, finding.body);
  }

  process.exit(0);
}

export function analyze(payload) {
  const toolName = payload.tool_name || payload.toolName || "";
  const toolInput = payload.tool_input || payload.toolInput || {};

  if (toolName === "Bash") {
    const command = String(toolInput.command || "");
    return analyzeCommand(command);
  }

  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) {
    const text = collectText(toolInput);
    const secret = findSecret(text);
    if (secret) {
      return {
        title: "Secret-looking value detected",
        body: `This edit appears to include ${secret}. Move real credentials to a local secret store or .env file that is ignored by git.`
      };
    }
  }

  return null;
}

function analyzeCommand(command) {
  if (!command.trim()) return null;
  const normalized = command.replace(/\s+/g, " ").trim();
  const matchable = maskBenignQuotedEchoPrintf(normalized);

  const criticalPatterns = [
    /\brm\b(?=[^\n;]*\s(?:-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b))(?=[^\n;]*\s(?:-[a-zA-Z]*f[a-zA-Z]*\b|--force\b))[^\n;]*?(?:\s|["'])(?:\/|\~|\*|\$\{?HOME\}?|%USERPROFILE%|\.\.?(?=\s|$|["']|\/(?:\s|$|["'])))/i,
    /\brm\b[^\n;]*\s--no-preserve-root\b/i,
    /\b(?:del|erase)\b(?=[^\n;]*\s\/s\b)(?=[^\n;]*\s\/q\b)/i,
    /\b(?:rd|rmdir)\b(?=[^\n;]*\s\/s\b)(?=[^\n;]*\s\/q\b)/i,
    /\bRemove-Item\b(?=[^\n;]*\s-Recurse\b)(?=[^\n;]*\s-Force\b)/i,
    /\b(?:curl|wget)\b[^\n|;&]*\|\s*(?:sh|bash|zsh|powershell|pwsh|cmd)\b/i,
    /\b(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b[^\n|;&]*\|\s*(?:iex|Invoke-Expression)\b/i
  ];

  for (const pattern of criticalPatterns) {
    if (pattern.test(matchable)) {
      return {
        title: "Risky command blocked",
        body: `Claude Code attempted to run a command that matches a destructive or remote-code-execution pattern:\n\n${command}`
      };
    }
  }

  return null;
}

function maskBenignQuotedEchoPrintf(command) {
  return command.replace(/(^|[;&|]\s*)(echo|printf)\b([^;&|]*)/gi, (segment) =>
    segment.replace(/(["'])(.*?)(\1)/g, (quoted, quote, body, close) => {
      if (quote === '"' && (body.includes("$(") || body.includes("`"))) {
        return quoted;
      }
      return `${quote}__GUARDRAIL_QUOTED_TEXT__${close}`;
    })
  );
}

function collectText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectText).join("\n");
  if (typeof value === "object") return Object.values(value).map(collectText).join("\n");
  return String(value);
}

function findSecret(text) {
  const patterns = [
    ["OpenAI/Anthropic-style API key", /\b(?:sk-ant|sk-proj|sk)-[A-Za-z0-9_-]{20,}\b/],
    ["GitHub token", /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/],
    ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
    ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED |)?PRIVATE KEY-----/]
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) return label;
  }
  return null;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function deny(title, body) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `${title}\n\n${body}`
    }
  }));
  process.exit(0);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const argv = path.resolve(process.argv[1]);
    const meta = path.resolve(fileURLToPath(import.meta.url));
    if (process.platform === "win32") {
      return argv.toLowerCase() === meta.toLowerCase();
    }
    return argv === meta;
  } catch {
    return false;
  }
}
