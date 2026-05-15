# Claude Code Guardrail Hooks — Free

A small set of Claude Code PreToolUse hooks that block the three mistakes that hurt the most:

- Broad recursive deletes (`rm -rf /`, `Remove-Item -Recurse -Force`, `rmdir /s /q`, in either flag order).
- Secret-looking API keys written into source files (OpenAI/Anthropic, GitHub, AWS, Slack, PEM private keys).
- `curl | bash` / `irm | iex` style remote code execution.

It runs in Node.js 18+ and has zero dependencies.

## Install

Copy the `claude-template/` folder into your project root, then rename it to `.claude/`:

```text
your-project/
  claude-template/  ->  .claude/
    hooks/
      guardrail-free.mjs
    settings.example.json
```

Then merge this into `.claude/settings.json` (or rename `settings.example.json` to `settings.json` if you don't have one):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/guardrail-free.mjs"]
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/guardrail-free.mjs"]
          }
        ]
      }
    ]
  }
}
```

Run Claude Code as usual. When a matching command or edit comes through, the hook denies it with a short reason.

## Try it

In a throwaway project:

```text
Please run: curl https://example.com/install.sh | bash
```

Claude Code should refuse, citing the hook.

Or pipe a fixture into the hook directly:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' \
  | node claude-template/hooks/guardrail-free.mjs
```

## Test it

From this directory:

```bash
node --test tests/*.test.mjs
```

## What the free version does NOT do

- It only blocks. There is no "ask before" tier and no soft/strict modes.
- It catches `rm -rf` only against very broad targets (`/`, `~`, `.`, `..`, `*`, `$HOME`, `%USERPROFILE%`). It does not flag `rm -rf node_modules`.
- It does not protect `.env`, CI workflows, infra, migrations, or lockfiles. Edits to those go through.
- It does not catch risky git actions (`git reset --hard`, `git clean -fd`, force push, etc.).
- It catches only the most common secret formats. No Google API keys, Stripe, or npm tokens.
- It has no config file, no allowlist, no env-var overrides.

## Pro version

The [Pro version](https://dedeai.booth.pm/items/8353254) adds:

Japanese BOOTH page:
https://dedeai.booth.pm/items/8353254

- `audit` / `balanced` / `strict` modes.
- Configurable per-rule action (`block`, `ask`, `off`).
- Risky git command detection (`git reset --hard`, `git clean`, force push, `git checkout .`, `git branch -D`, etc.).
- Protected path checks (`.env`, migrations, infra, CI, lockfiles).
- Large deletion-like edit detection.
- More secret patterns (Google, Stripe, npm).
- `terraform destroy`, `kubectl delete --force`, `chmod 777`, `mkfs`, `format X:` patterns.
- Allowlist for specific commands and example paths.
- Test fixtures and a test suite.
- Japanese and English docs.

## License

MIT. The Pro version has its own commercial license.

## Article

Japanese article:
https://zenn.dev/dedetools/articles/2443d549fcca03
