# Changelog

All notable changes to this kit (documentation and configuration; the
upstream server is a separate npm package with its own history) are documented
here.

The format loosely follows Keep a Changelog, and versions follow semantic
versioning for the kit itself.

## [1.0.0] - 2026-10-20

### Added

- Initial public release of the hardened install and configuration kit.
- Upstream verification basis recorded: `@pasympa/discord-mcp` `2.2.0`
  (npm `latest` at the time, MIT), verified against the npm registry, the
  upstream README, and upstream source (`src/client.ts`, `src/tools/index.ts`,
  `src/tools/dm.ts`).
- Hardened baseline configuration: exact version pin, toolsets pinned to
  `discovery,messages`, mandatory guild allowlist, both privileged-intent
  flags disabled.
- Documented, source-verified rationale for never loading the `dm` toolset
  (DM tools address users directly and do not pass through the guild
  allowlist).
- Configuration templates: `examples/opencode.jsonc.example` and
  `examples/generic-mcp.json`, plus a placeholder-only `.env.example`.
- Optional POSIX helper `install/install.sh` (idempotent; `check`, `init`,
  `print-config`; writes nothing without `--yes`).
- Read-only verification pass procedure (guild and channel listing before
  the first post) and a posting-discipline section (embeds, no markdown
  tables, under 2000 characters, no secret material).

[1.0.0]: https://github.com/Bippy-s-AI-Helpers/discord-mcp/releases/tag/1.0.0