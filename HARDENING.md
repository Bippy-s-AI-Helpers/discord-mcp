# discord-mcp

A curated, hardened install and configuration kit for the
[@pasympa/discord-mcp](https://www.npmjs.com/package/@pasympa/discord-mcp)
MCP server.

This repository ships documentation and configuration only. It does not
contain, vendor, or redistribute any upstream code. It exists to make a safe,
minimal, auditable setup of the upstream Discord MCP server easy to repeat:

- a hardened default configuration (narrow toolsets, guild allowlist,
  privileged intents off, exact version pin)
- ready-to-adapt MCP client configuration templates
- an optional idempotent install helper script
- a verification checklist and troubleshooting table

| Resource | Link |
| --- | --- |
| Upstream repository | https://github.com/PaSympa/discord-mcp |
| Upstream npm package | https://www.npmjs.com/package/@pasympa/discord-mcp |
| This kit scope | install + configure + harden the upstream server only |

## Verification basis

Every behavior documented here was checked against the upstream package
(its npm page, repository README, and source) for the version below. When you
upgrade the pin, re-read the upstream README: this kit only claims accuracy
for the version it was verified against.

| Fact | Value (verified 2026-10-20 against the npm registry) |
| --- | --- |
| Package | `@pasympa/discord-mcp` |
| Version verified | `2.2.0` (npm `latest` dist-tag at time of writing) |
| Upstream license | MIT (upstream `LICENSE`, (c) Léandre Moreau) |
| Upstream repository | https://github.com/PaSympa/discord-mcp |
| Runtime requirement | Node.js >= 22, npm installed; the server runs via `npx` |
| Client library | discord.js v14, official MCP SDK |
| Tool exposure | 14 selectable toolsets, 99 tools when everything is enabled |

## About the upstream server

The upstream server (quoted from its npm description) is "a lightweight,
multi-guild Discord MCP server with 95+ tools". Key properties relevant to
installation (all verified in the 2.2.0 README and source):

- Runs as a local stdio MCP server through `npx`; the first start downloads
  the package, later starts reuse the npm cache.
- Discovers its token from the `DISCORD_TOKEN` environment variable or from a
  `.env` file in its working directory (loaded automatically via `dotenv`).
- Logs in lazily: the gateway connection happens on the first tool call, and
  the wait for a gateway READY state is capped at 30 seconds.
- Message data is fetched over the REST API; nothing subscribes to message
  events.
- Tool exposure is controlled at startup by `DISCORD_MCP_TOOLSETS`; unknown
  toolset names make the server fail to start by design (a typo must not
  silently expose the full destructive surface).

## Security posture at a glance

This kit's defaults, each justified in the
[Security and hardening](#security-and-hardening) section:

1. Exact version pin in the launch command (`@pasympa/discord-mcp@2.2.0`);
   upgrades are deliberate, never floating.
2. Toolsets pinned to `discovery,messages`: enough for read navigation and
   report posting, nothing destructive beyond what `messages` requires.
3. The `dm` toolset is never enabled: DM conversations are outside any guild,
   so the guild allowlist cannot bound them (verified at source level).
4. `DISCORD_ALLOWED_GUILDS` set to an explicit allowlist; unset accepts every
   guild the bot can see, which is not an acceptable default here.
5. Both privileged intent flags kept `false`
   (`DISCORD_MESSAGE_CONTENT=false`, `DISCORD_GUILD_MEMBERS=false`).
6. The bot token lives in a `0600`-permission file (or an injected secret),
   never in a versioned config, never echoed, never committed.
7. A read-only verification pass (guild listing, channel listing) runs before
   the first message is ever posted.

## Prerequisites

### Node.js and npm

```sh
node --version   # must print v22.x or newer (upstream engines: >= 22.0.0)
npm --version
```

Any Node.js 22 LTS or newer line works. No global install of the package is
needed: the launch command uses `npx`, which resolves and caches it.

### A Discord application and bot

1. Open https://discord.com/developers/applications and sign in.
2. New Application, give it a neutral name, and open its **Bot** tab.
3. Use **Reset Token** and copy the token immediately: the portal shows it
   once. Treat it like a root password.
4. Store the token straight into your secrets file (next section). Do not put
   it in chat, email, screenshots, notes, or any file that could end up in a
   repository.
5. To invite the bot into your server (guild): **OAuth2 > URL Generator**,
   scope `bot`, tick the permissions you want (see the least-privilege table
   below), open the generated URL in a browser, and pick the guild. Adding a
   bot to a guild requires the Manage Server permission there.

The bot does nothing until an MCP client starts it with a token, so the
portal steps can be done days in advance.

### Privileged gateway intents (read this once)

Discord gates two "privileged" gateway intents behind checkboxes in the
Developer Portal (Server Members Intent, Message Content Intent). The
upstream server requests both by default, controlled by two environment
flags (`DISCORD_MESSAGE_CONTENT`, `DISCORD_GUILD_MEMBERS`). The interactions,
verified against the 2.2.0 README and source:

- If the server requests a privileged intent that is disabled in the portal,
  the gateway closes the connection with close code `4014` and the first tool
  call fails. Remediation is either enabling the portal toggle or setting the
  matching flag to `false` and connecting without the intent.
- The flags only control what the server requests at connect time. Actual
  data availability (message bodies of other people's messages, member
  listings) is governed by the portal toggles, not by these flags: message
  data comes over REST, which Discord gates on the portal setting alone.
- Therefore the strongest configuration for a report-posting bot is: **portal
  toggles left OFF and both flags set to `false`**. The bot connects without
  any privileged intent and loses nothing a report bot needs.
- If you later deliberately need message content or member data: enable the
  relevant portal toggle, and you can still keep the flag `false` (verified
  nuance: with the portal toggle on, setting the flag to `false` loses
  nothing; the REST data arrives regardless).

This kit's templates ship with both flags set to `false`.

### Bot permissions (least privilege)

For the `discovery,messages` toolset profile this kit installs, grant the bot
only what report posting needs:

| Permission | Why |
| --- | --- |
| View Channels | discovery: list and read channel names |
| Send Messages | deliver messages and replies |
| Embed Links | render rich embeds (the report format this kit recommends) |
| Read Message History | read recent messages and pinned items |

Optional, only if you consciously want the behavior: Add Reactions, Pin
Messages, Attach Files. Everything else (moderation, channel management,
role management, webhook management, invites) stays ungranted: the upstream
README suggests a much wider set for full-surface use, which is appropriate
only when you deliberately enable those toolsets and accept their destructive
surface. With `messages` enabled, remember the toolset ships its whole
module: it includes bulk delete (a dry-run-gated destructive tool), so the
bot's grant of Manage Messages would put deletion within reach. If you do
not need deletion, do not grant Manage Messages.

Two-layer defense: the MCP configuration bounds which tools exist, and the
bot's Discord role plus channel permission overwrites bound what the bot may
touch even if the MCP configuration ever regresses. Prefer a dedicated bot
role and deny View/Send outside the channels the bot should work in.

## Installation (human)

### Step 0: pick how the token reaches the server

Three supported patterns, in preference order:

1. Secret file plus client-side file interpolation. Clients whose config
   supports `{file:PATH}` substitution (the opencode configuration format
   does) read the token from a file at load time, so the raw token never
   appears in any config file. Create the file with `0600` permissions inside
   a `0700` directory, containing only the raw token:

   ```sh
   mkdir -p ~/.config/secrets
   chmod 700 ~/.config/secrets
   umask 077
   # paste the token when prompted, or redirect it from a trusted source
   printf '%s' "your-token-goes-here" > ~/.config/secrets/DISCORD_BOT_TOKEN
   chmod 600 ~/.config/secrets/DISCORD_BOT_TOKEN
   ```

   The optional `install/install.sh --yes init` helper does this for you.

2. Plain environment value in the client config. Works in any MCP client,
   but the token lands in a plaintext config file on disk. If you accept
   that tradeoff, tighten the config file's permissions and keep it out of
   any sync or backup that leaves the machine.

3. A `.env` file next to wherever the server command runs. The upstream
   server loads `.env` from its working directory automatically (`dotenv`).
   Ensure that file is excluded from version control (see `.gitignore` in
   this kit for the pattern) and is never inside a repository.

### Step 1: opencode-style client config

Merge the `discord` entry into the `mcp` block of your opencode
configuration (commonly `~/.config/opencode/opencode.jsonc`). A ready
template lives at
[`examples/opencode.jsonc.example`](examples/opencode.jsonc.example):

```jsonc
"discord": {
  "type": "local",
  "command": [ "npx", "-y", "@pasympa/discord-mcp@2.2.0" ],
  "enabled": true,
  "timeout": 30000,
  "environment": {
    "DISCORD_TOKEN": "{file:/home/you/.config/secrets/DISCORD_BOT_TOKEN}",
    "DISCORD_MCP_TOOLSETS": "discovery,messages",
    "DISCORD_ALLOWED_GUILDS": "123456789012345678",
    "DISCORD_MESSAGE_CONTENT": "false",
    "DISCORD_GUILD_MEMBERS": "false"
  }
}
```

Replace `/home/you/.config/secrets/DISCORD_BOT_TOKEN` with the absolute path
to your `0600` token file, and `123456789012345678` with your guild's
snowflake ID. The `timeout` value is the client's startup timeout for the
server process: the upstream server itself allows up to 30 seconds for the
gateway to reach READY on first use, so a client timeout of about 30 seconds
(`30000`) is a sensible match.

### Step 2: generic JSON MCP client config

Clients that use the common `mcpServers` shape (several desktop clients do;
check your client's docs for the exact file location) can start from
[`examples/generic-mcp.json`](examples/generic-mcp.json):

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": [ "-y", "@pasympa/discord-mcp@2.2.0" ],
      "env": {
        "DISCORD_TOKEN": "PASTE_YOUR_BOT_TOKEN_HERE",
        "DISCORD_MCP_TOOLSETS": "discovery,messages",
        "DISCORD_ALLOWED_GUILDS": "123456789012345678",
        "DISCORD_MESSAGE_CONTENT": "false",
        "DISCORD_GUILD_MEMBERS": "false"
      }
    }
  }
}
```

If your client supports a secret-file injection or an `${input:}` /
promptString mechanism (the VS Code family does), prefer that over pasting
the token literal; an example is in
[`examples/README.md`](examples/README.md).

### Step 3: restart the MCP client

MCP server entries are read and launched at client startup, not per message.
After any change to the MCP configuration (toolsets, allowlist, timeout,
token path) you must restart the MCP client. For opencode specifically: the
configuration is parsed once at startup, so the entry loads on the next
opencode start.

### Environment variables

All verified against the upstream 2.2.0 README and source:

| Variable | Default | What it controls | This kit's value |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | none (required) | The bot token. Without it the login step fails. | `0600` file referenced by `{file:...}`, or a client-injected value |
| `DISCORD_MCP_TOOLSETS` | unset means all | Comma-separated toolsets to expose. `all` (or unset, or empty) exposes everything; unknown names fail startup. | `discovery,messages` |
| `DISCORD_ALLOWED_GUILDS` | unset means all guilds | Comma-separated guild IDs the server may act on. When set, tool calls targeting any other guild are rejected, whether addressed by guild ID, channel ID, thread ID, webhook, or invite code. | exactly your guild ID(s) |
| `DISCORD_MESSAGE_CONTENT` | `true` | Whether the server requests the Message Content privileged intent at connect. | `false` |
| `DISCORD_GUILD_MEMBERS` | `true` | Whether the server requests the Server Members privileged intent at connect. | `false` |

Details worth knowing (verified):

- The boolean flags accept `false`, `0`, `no`, or `off` (case-insensitive)
  to disable; anything present otherwise, including an empty string, counts
  as enabled.
- An empty `DISCORD_MCP_TOOLSETS` counts as unset, which means every tool is
  exposed. There is no way to express "all except dm": you must enumerate
  the toolsets you allow.
- Toolset names, exactly as the server knows them: `discovery`, `messages`,
  `channels`, `permissions`, `members`, `roles`, `moderation`, `screening`,
  `stats`, `forums`, `webhooks`, `scheduled_events`, `invites`, `dm`.
- The server fails to start with a clear
  `Invalid DISCORD_MCP_TOOLSETS: unknown toolset(s) ...` error on a
  misspelled name: fail closed by design.

## Installation (agentic)

For a build agent operating on a user's machine. Follow in order; the
`STOP` markers are hard breakpoints that require human input before
continuing.

1. Check the runtime: `node --version` must be v22 or newer and `npm` must
   exist. If not, install Node.js 22+ with the platform's package manager
   and stop until done.
2. Run the kit's checker: `sh install/install.sh` (uses no network except one
   npm registry metadata read; safe to run any number of times).
3. Create the token store: run `sh install/install.sh --yes init` (prompts
   for the token with input hidden, writes a `0600` file into a `0700`
   directory, refuses to overwrite an existing file).
   - **STOP:** if the bot token is not already known, do not generate one,
     guess one, or reuse anything from elsewhere. Ask the user for the token
     and for their guild ID. Never echo the token back, never write it into
     logs, reports, or any file other than the `0600` token file.
4. Stage the MCP client configuration using
   `examples/opencode.jsonc.example` (opencode-style) or
   `examples/generic-mcp.json` (generic clients). Replace the guild
   placeholder with the user's guild ID (ask if unknown). Keep the token
   out of the managed config body: reference it via `{file:...}` (opencode
   style) or an injection mechanism; never inline it.
5. **STOP (portal breakpoint):** do not create or modify the user's Discord
   application, do not reset or copy tokens in the Developer Portal, and do
   not generate or open invite URLs. If the bot does not exist yet or
   permissions need changing, produce the exact portal steps and required
   permission list for the user and stop there.
6. **STOP (restart breakpoint):** MCP configurations load at client startup
   only. State clearly that an opencode restart (or a restart of whichever
   MCP client holds the config) is required, then stop. No verification
   against the live server is possible before that restart.
7. After the restart, run the read-only verification pass (next section)
   before any post, then a single test message in a designated low-traffic
   test channel, and confirm receipt.
8. Record the configured facts (pinned version, toolsets, allowlist, file
   path of the token reference) in the operator's own notes; never the token.

## Security and hardening

### Minimize the toolset

The upstream server ships 14 toolsets and a toolset exposes its whole
module: `messages` includes bulk delete, `members` includes kick and ban,
`channels` includes delete channel, and so on. Every extra toolset is extra
blast radius for every future prompt, and there is no per-tool disable.
`discovery,messages` is the minimum for a bot that reads its surroundings
and posts reports: channel discovery tools (list guilds, list channels,
find channel by name) plus message tools (read, send, reply, edit, embed).
Add a toolset only when a real, stated need exists, and re-run the
verification pass after the change.

### Never enable the dm toolset

Verified at source level against 2.2.0 (`src/tools/dm.ts`, `src/client.ts`):

- The DM tools address a recipient by raw user ID. They never resolve a
  guild and never pass through the guild allowlist checks, which reject a
  call only when its target resolves to a guild outside
  `DISCORD_ALLOWED_GUILDS`.
- A DM conversation therefore sits outside every boundary this kit configures:
  outside the guilds on the allowlist, and visible to nobody on your server's
  audit trail. Once sent, a DM is egress to a location the allowlist was
  never consulted about.
- No environment flag scopes DMs the way the allowlist scopes guilds. The
  only reliable control is to not load the toolset at all: exclude `dm` from
  `DISCORD_MCP_TOOLSETS`.

Because unset, empty, and `all` all include `dm`, the allowlist of toolsets
must always be explicit. That is why this kit's templates never rely on the
default.

### Keep both privileged-intent flags false

Reasoning collapsed from the verified intent model: the flags decide which
privileged intents are requested at connect; the portal toggles decide what
data exists; requesting a disabled privileged intent breaks the connection
(close code `4014`); and with the portal toggles off, message bodies of
other users come back empty and member listings fail no matter what the
flags say. Keeping both flags `false` makes the bot independent of portal
toggle state, avoids the `4014` class of failure entirely, and grants the
least identity surface a bot can have. Report posting needs none of that
data.

### Guild allowlist is a hard boundary

Set `DISCORD_ALLOWED_GUILDS` to exactly the guild IDs you intend, never
leave it unset. Verified semantics: once set, tool calls targeting any other
guild are rejected whether the target is addressed by guild ID, channel ID,
thread ID, webhook, or invite code, so a wrong ID in a prompt cannot reach
another server the bot happens to be in. Keep the list short; extend it only
deliberately; remember changes need a client restart; confirm the boundary
after each restart with `discord_list_guilds` (only the allowlisted guilds
should ever be usable).

### The second wall: Discord-side permissions

Assume the MCP configuration can regress (a template pasted too broadly, a
toolset re-added). The bot's Discord role is the independent control: keep
the bot's granted permissions to the report-posting set above, and use
channel permission overwrites to deny View/Send everywhere the bot has no
business. A tool call that exists in MCP but violates Discord permissions
still fails at Discord's permission layer.

### Read-only verification pass before the first post

Before the first message ever goes out, and after every change to
toolsets, allowlist, version bump, or bot permissions:

1. Call the discovery tools only: `discord_list_guilds`, then
   `discord_list_channels` (and `discord_get_guild_info` if useful).
2. Confirm the guild list matches the allowlist exactly. Any surprise guild
   means: stop, fix the allowlist, restart, repeat.
3. Confirm the channel map matches what you documented (names and IDs).
4. Only then send one message to a designated test channel and confirm
   receipt visually.
5. Then proceed to the real report channel.

This pass costs nothing (all read-only tools) and would have caught every
misconfiguration class this kit worries about: wrong token, wrong bot,
missing allowlist, unexpected guild, wrong channel.

### Posting discipline for automated content

For anything posted on a schedule or by an assistant on your behalf:

- Use embeds, sent via `discord_send_embed` (keys: `title`, `description`,
  `fields`, `footer`, `color`, `timestamp`). Embeds render consistently and
  keep structure out of markdown ambiguity.
- No markdown tables, anywhere, ever: Discord does not render markdown
  tables. Use short embed fields (one per metric or topic) instead.
- Keep the total visible characters of a message under 2000. Discord
  rejects plain messages above 2000 characters and caps embed sizes
  separately; staying under 2000 total keeps everything safely inside every
  limit and readable on mobile.
- Keep automated embeds text-only by default: no URLs, no images, no
  thumbnails, no author fields, unless you deliberately decided otherwise
  for that message.
- Never post secret material: tokens, API keys, passwords, connection
  strings, cookies, unredacted logs. Redact before composing; assume the
  channel's full member list can read anything posted there, forever.
- Keep content audience-appropriate for where it lands: no internal
  identifiers, machine names, or operational details beyond what that
  channel's audience should see. For public channels, keep it neutral.
- Prefer a dedicated, permission-restricted report channel as the only
  posting target, and verify it is in the channel map from the read-only
  pass.

### If something goes wrong

- Stop the MCP client first: it disconnects the bot process entirely.
- If a token may have been exposed, use **Reset Token** in the Developer
  Portal immediately (this invalidates the old token), then update the
  token file and restart the client.
- Review the bot's actions in the guild's Audit Log, and check whether any
  webhooks or invites were created (tools that can do that should not have
  been enabled in the first place).
- Tighten (allowlist, toolsets, permissions), restart, re-verify, and only
  then resume.

## Verification checklist

- [ ] `node --version` shows v22 or newer
- [ ] Token stored in a `0600` file inside a `0700` directory (raw value only)
- [ ] Token does not appear in any config file, log, or repository
- [ ] Launch command pins the exact version (`@pasympa/discord-mcp@2.2.0`)
- [ ] `DISCORD_MCP_TOOLSETS` is exactly `discovery,messages` (`dm` absent)
- [ ] `DISCORD_ALLOWED_GUILDS` lists only intended guild IDs
- [ ] `DISCORD_MESSAGE_CONTENT=false` and `DISCORD_GUILD_MEMBERS=false`
- [ ] MCP client restarted after the last configuration change
- [ ] Read-only pass done: `discord_list_guilds` shows only allowlisted guilds
- [ ] Channel map confirmed with `discord_list_channels`
- [ ] First post went to a test channel and was received
- [ ] `.gitignore` covers `.env`, `secrets/`, and token-like files

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| First tool call fails; gateway close code `4014` | A privileged intent was requested but disabled in the Developer Portal | Set `DISCORD_MESSAGE_CONTENT=false` / `DISCORD_GUILD_MEMBERS=false` (or enable the portal toggles deliberately) and restart |
| Login to READY times out (~30 s) | Wrong token, or the intent situation above | Fix the token file; apply the `4014` fix; restart |
| Error at startup: `Invalid DISCORD_MCP_TOOLSETS: unknown toolset(s) ...` | Misspelled toolset name (fails closed by design) | Check spelling against the 14-name list in this README |
| Every tool is visible despite `DISCORD_MCP_TOOLSETS` | The value was empty (counts as unset) or contained `all` | Set the explicit list `discovery,messages` and restart |
| A DM appears as a reachable target | The `dm` toolset is enabled via `all`, empty value, or omission | Remove `dm` from `DISCORD_MCP_TOOLSETS` immediately (unset or empty means all) |
| Tool call rejected mentioning `DISCORD_ALLOWED_GUILDS` | The call targeted a guild outside the allowlist (working as intended) | If unintended, fix the channel/guild ID in the prompt; do not loosen the allowlist casually |
| `Channel ... is not a message-capable guild channel` | A DM channel or non-text channel ID was passed to a guild message tool | Use a text/announcement channel ID from `discord_list_channels` |
| Messages from other people read as empty content | The portal's Message Content toggle is off (data access is portal-gated, not flag-gated) | Enable the portal toggle if you genuinely need it, or work without message bodies |
| Member listing fails | The portal's Server Members toggle is off | Same decision as above; report bots usually do not need it |
| Configuration changes do nothing | MCP config loads at client startup only | Restart the MCP client, then re-run the read-only pass |
| First start is slow or the client times out | `npx` is downloading the package on first use | Pre-warm the cache with `npm view @pasympa/discord-mcp@2.2.0` or raise the client's MCP startup timeout |
| `.env` values not picked up | The `.env` file is not in the working directory the client spawns the server from | Prefer the `{file:...}` / injected-secret pattern, or place `.env` beside the server's run directory |

## Version pinning and upgrades

The upstream quick start uses an unversioned `npx` pull, which silently
floats. This kit pins the exact version instead:

- The version is in the launch command (`@pasympa/discord-mcp@2.2.0`), so
  every restart runs exactly what was audited.
- Upgrades are a ritual, not a reflex: read the upstream release notes and
  CHANGELOG between the pinned version and the candidate; diff the upstream
  README's environment variable table and toolset list against what this kit
  documents; check the npm provenance attestation on the new release; then
  bump the pin in your config, restart the client, and re-run the read-only
  verification pass before resuming posts.
- Keep this kit's stated verification basis honest: when you adopt a new
  version, re-state what you verified against. Unverified version bumps are
  the most common way hardened setups quietly rot.

## Repository contents

| Path | What it is |
| --- | --- |
| `README.md` | This document |
| `examples/opencode.jsonc.example` | Hardened MCP entry, opencode configuration style |
| `examples/generic-mcp.json` | Same profile for generic `mcpServers` clients |
| `examples/README.md` | How to adapt the templates, plus a VS Code style variant |
| `.env.example` | Placeholder-only environment file for the `.env` workflow |
| `install/install.sh` | Optional POSIX helper: prerequisite checks, token store bootstrap (nothing written without `--yes`), template printer |
| `SECURITY.md` | Security policy for this kit and how to report issues |
| `CHANGELOG.md` | Kit version history |
| `LICENSE` | MIT license for this kit (the upstream package keeps its own MIT license) |
| `.gitignore` | Keeps `.env`, secrets, and logs out of version control |

## Attribution and scope

- The upstream server is `@pasympa/discord-mcp` by PaSympa
  (https://github.com/PaSympa/discord-mcp), released under the MIT license
  (upstream `LICENSE`, (c) Léandre Moreau). This kit is an independent set
  of documentation and configuration; no upstream code is included, and
  nothing in this kit implies affiliation with or endorsement by the
  upstream author.
- This kit installs and configures only the npm package
  `@pasympa/discord-mcp`. It does not reference or install any other
  project.
- Report upstream bugs and vulnerabilities to the upstream project; this
  repo's `SECURITY.md` explains the split.

## License

This kit (documentation, templates, scripts) is MIT licensed,
(c) 2026 Bippy's AI Helpers: see [LICENSE](LICENSE). The upstream package
remains under its own MIT license with its own copyright holder, and is a
runtime dependency you install from npm, not a redistribution in this
repository.

---

Verified against `@pasympa/discord-mcp` `2.2.0` (npm `latest` dist-tag,
MIT, https://github.com/PaSympa/discord-mcp) on 2026-10-20.