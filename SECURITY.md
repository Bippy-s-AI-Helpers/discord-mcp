# Security Policy

This repository is a documentation and configuration kit for the upstream
`@pasympa/discord-mcp` server (verified against 2.2.0). It deliberately does
not vendor any code, so its own attack surface is small: the guidance, the
configuration templates, and one shell helper script.

## The real security surface: your token and your bot

The most valuable secret in a typical setup is the Discord bot token. The
behavior of this kit assumes a few non-negotiables:

- The token lives in a `0600` file inside a `0700` directory (or reaches the
  server through a client-side secret-injection mechanism). It never appears
  in a committed file, a log, a screenshot, a chat message, or a ticket.
- The configuration templates reference the token by file path; the raw token
  does not live in repositories, gists, issue reports, or example configs.
- If a token is ever exposed: reset it immediately in the Discord Developer
  Portal (Bot tab, Reset Token). That invalidates the old value. Update the
  token file, restart the MCP client, and review the guild's audit log and
  the bot's own DM conversations for anything it did not intend.
- Bots should carry least-privilege Discord permissions. See the "Bot
  permissions (least privilege)" section of the README for the report-posting
  baseline.

## Reporting a vulnerability in this kit

- If you find a problem in this repository (a template that weakens security,
  a bug in `install/install.sh`, an incorrect documented behavior), open a
  GitHub security advisory against this repository if the issue is sensitive,
  or a plain issue if it is documentation-level.
- This repository never handles anyone's real token: please do not paste
  token material into issues under any circumstances.

## Reporting a vulnerability in the upstream server

Bugs and vulnerabilities in `@pasympa/discord-mcp` itself belong to the
upstream project, not here:

- Do not open a public upstream issue for a vulnerability.
- Use the upstream security advisory process:
  https://github.com/PaSympa/discord-mcp/security/advisories/new
  (the upstream SECURITY.md documents their handling).

## Supply-chain notes for operators

- The launch command in this kit pins the exact version
  (`@pasympa/discord-mcp@2.2.0`) so client restarts never silently adopt a
  newer upstream release.
- On each deliberate upgrade, check the npm provenance attestation of the
  target release on its npm page, diff the upstream README's environment
  table and toolset list against this kit, and re-run the read-only
  verification pass before resuming any posting.
- The `install/install.sh` helper only reads from the npm registry (one
  metadata query) and only writes with `--yes`; it never executes downloaded
  code and never installs globally.