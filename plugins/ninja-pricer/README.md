# Ninja Pricer plugin

Claude Code plugin that bundles:

- **MCP server config** — points at the live Ninja Pricer deploy (`https://ninjapricer-production.up.railway.app/api/mcp`) with your personal API token.
- **`ninja-pricer` skill** — teaches Claude how to use the tool surface, when to prefer `compute_quote` vs `generate_quote`, how role-gating works, and how to translate MCP error codes.

## Install (first time)

1. **Get a token.** Sign in to `https://ninjapricer-production.up.railway.app`, visit `/settings/tokens`, click "New token". Copy the raw `np_live_...` value — it's shown exactly once.

2. **Export the token in your shell.** Add to `~/.zshrc` (or `~/.bashrc`):

   ```bash
   export NINJA_PRICER_TOKEN=np_live_YourTokenHere
   ```

   Reload: `source ~/.zshrc`.

3. **Add the marketplace.** One-time per machine:

   ```bash
   claude plugin marketplace add https://github.com/NinjaBoldry/NinjaPricer
   ```

4. **Install the plugin.**

   ```bash
   claude plugin install ninja-pricer
   ```

5. **Restart Claude Code.** The MCP server connects on the next session; the skill loads automatically when your conversation touches pricing.

## Verify

In a fresh Claude Code session:

```
> What products do we price?
```

Claude should invoke the skill, call `list_products`, and report back with the seeded products (Ninja Notes, Training & White-glove, Service).

If nothing happens:

- `claude mcp list` — confirm `ninja-pricer` is connected (not "Failed to connect")
- `echo $NINJA_PRICER_TOKEN` — confirm the env var is set in the shell that launched Claude Code
- Hit `/settings/tokens` on the deploy — confirm your token isn't revoked and you're still an active user

## Token rotation

Revoke + reissue any time via `/settings/tokens`. Update `NINJA_PRICER_TOKEN` in your shell, restart Claude Code. No plugin reinstall needed.

## Role inheritance

Your token inherits the role of the user who issued it. Admin in the web UI = admin via MCP (all 63 tools). Sales = sales (16 tools). If your role changes, the next MCP request reflects the new role — no token rotation required.
