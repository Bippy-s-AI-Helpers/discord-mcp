# Configuration templates

Hardened configuration templates for the upstream
[@pasympa/discord-mcp](https://www.npmjs.com/package/@pasympa/discord-mcp)
server (verified against version 2.2.0). Adapt one of these; do not hand-write
the environment block from memory: the discipline here (explicit toolset list,
guild allowlist, intent flags off) is the point of the kit.

## Files

| File | Use with |
| --- | --- |
| `opencode.jsonc.example` | opencode-style configuration (the `mcp` block of `~/.config/opencode/opencode.jsonc` and similar setups) |
| `generic-mcp.json` | Any MCP client using the common `mcpServers` JSON shape |
| `.env.example` (repo root) | The upstream server's own `.env` loading workflow (dotenv) |

## Placeholders to replace

| Placeholder | Meaning |
| --- | --- |
| `SECRETS_PATH_HERE` | Absolute path to a `0600` file holding only the raw bot token, inside a `0700` directory |
| `PASTE_YOUR_BOT_TOKEN_HERE` | Your bot token (only in configs that have no secret-injection mechanism; tighten file permissions and keep the config out of repositories) |
| `GUILD_ID_HERE` / `123456789012345678` | Your guild's snowflake ID (Discord: Settings, Advanced, Developer Mode, then right-click the server and Copy ID) |

## opencode style (`opencode.jsonc.example`)

Merge the `discord` entry into your existing `mcp` block. The `{file:...}`
pattern is an opencode load-time substitution: the config stays token-free,
and the token lives only in the referenced `0600` file. Restart opencode
after any change: MCP entries load at startup only.

## Generic clients (`generic-mcp.json`)

Drop into whichever file and shape your client documents. Prefer a secret
injection mechanism over an inline token when the client offers one.

VS Code family example (uses an `inputs` prompt instead of storing the
token; adapt the path/format to your client's documented schema):

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "discord-token",
      "description": "Discord Bot Token",
      "password": true
    }
  ],
  "servers": {
    "discord": {
      "command": "npx",
      "args": [ "-y", "@pasympa/discord-mcp@2.2.0" ],
      "env": {
        "DISCORD_TOKEN": "${input:discord-token}",
        "DISCORD_MCP_TOOLSETS": "discovery,messages",
        "DISCORD_ALLOWED_GUILDS": "123456789012345678",
        "DISCORD_MESSAGE_CONTENT": "false",
        "DISCORD_GUILD_MEMBERS": "false"
      }
    }
  }
}
```

## The `.env` workflow (`.env.example`)

The upstream server loads a `.env` file from its working directory
automatically (verified behavior of 2.2.0, via dotenv). Copy the kit's
`.env.example`, fill in the values, and make sure the resulting `.env` is
never committed (the kit's `.gitignore` excludes it). Two caveats: the file
must sit in the directory the MCP client spawns the server command from
(otherwise it is never read), and it holds a plaintext token, so give it
`0600` permissions too.

## After configuring: the mandatory restart

MCP server entries are read and launched when the MCP client starts. After
every configuration change (or token rotation), restart the client. Then run
the read-only verification pass described in the kit README:
`discord_list_guilds` and `discord_list_channels` first, an explicit check
that only the allowlisted guild is usable, and only then a first message to
a test channel.