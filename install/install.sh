#!/bin/sh
#
# Optional helper for the discord-mcp hardened install kit.
#
# POSIX sh. Idempotent. Never edits an MCP client configuration, never installs
# anything globally, and never prints a token. Writes files ONLY for the "init"
# command and ONLY when you pass --yes on the command line.
#
# Commands:
#   check         Verify prerequisites and report the upstream package facts
#                 read from the npm registry (default command).
#   init          Create the secrets directory and a 0600 token file. Prompts
#                 for the token with input hidden. Refuses to overwrite an
#                 existing file. Requires --yes.
#   print-config  Print a ready-to-adapt generic mcpServers JSON template.
#                 Nothing is written.
#   help          Show this help.
#
# Options:
#   --yes         Confirm file writes (required for init). Without it, every
#                 command only reads, checks, or prints.
#
# Environment knobs (all optional):
#   SECRETS_DIR   Secrets directory. Default: "$HOME/.config/secrets"
#   TOKEN_FILE    Token file path. Default: "$SECRETS_DIR/DISCORD_BOT_TOKEN"
#   TOOLSETS      Toolset list for print-config. Default: "discovery,messages"
#   GUILD_ID      Guild ID for print-config; a placeholder is printed if unset.
#
# Verified against: @pasympa/discord-mcp 2.2.0 (MIT, github.com/PaSympa/discord-mcp)

set -eu

PKG="@pasympa/discord-mcp"
PIN="2.2.0"

YES=0
CMD="check"

SECRETS_DIR="${SECRETS_DIR:-${HOME}/.config/secrets}"
TOKEN_FILE="${TOKEN_FILE:-${SECRETS_DIR}/DISCORD_BOT_TOKEN}"
TOOLSETS="${TOOLSETS:-discovery,messages}"

warn() { printf 'warn: %s\n' "$1" >&2; }
die()  { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------- argument pass
args=""
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    -h|--help) CMD="help" ;;
    -*) die "unknown option: $a (try: $0 help)" ;;
    *) args="$args $a" ;;
  esac
done
set -- $args
[ $# -le 1 ] || die "at most one command expected (check, init, print-config, help)"
[ $# -eq 1 ] && CMD="$1"

# -------------------------------------------------------------------- helpers
command_exists() { command -v "$1" >/dev/null 2>&1; }

file_mode() {
  if stat -c '%a' "$1" 2>/dev/null; then return 0; fi
  if stat -f '%Lp' "$1" 2>/dev/null; then return 0; fi
  echo "unknown"
}

# Timeout wrapper when a timeout(1) utility exists, so the registry probe
# cannot hang the check on a dead network.
npm_view() {
  if command_exists timeout; then
    timeout 20 npm view "$1" "$2" 2>/dev/null || return 1
  else
    npm view "$1" "$2" 2>/dev/null || return 1
  fi
}

# ------------------------------------------------------------------- check run
do_check() {
  fails=0

  printf 'kit: hardened install check for %s@%s\n\n' "$PKG" "$PIN"

  if command_exists node; then
    v="$(node -v 2>/dev/null || true)"
    case "$v" in
      v*) major="$(printf '%s' "$v" | sed 's/^v>//; s/^v//; s/\..*$//')" ;;
      *)  major="$(printf '%s' "$v" | sed 's/\..*$//')" ;;
    esac
    case "$major" in
      ''|*[!0-9]*) warn "could not parse node version: ${v:-none}"; fails=$((fails+1)) ;;
      *)  if [ "$major" -ge 22 ]; then
            printf 'ok   node %s (upstream requires >= 22)\n' "$v"
          else
            warn "node ${v} is older than the upstream engines requirement (>= 22.0.0)"
            fails=$((fails+1))
          fi ;;
    esac
  else
    warn "node not found on PATH"
    fails=$((fails+1))
  fi

  if command_exists npm; then
    printf 'ok   npm %s\n' "$(npm --version 2>/dev/null || echo '?')"
  else
    warn "npm not found on PATH (bundled with Node.js, and npx needs it)"
    fails=$((fails+1))
  fi

  if command_exists npx; then
    printf 'ok   npx found (the launch command resolves the package through it)\n'
  else
    warn "npx not found on PATH"
    fails=$((fails+1))
  fi

  printf '\n'
  if command_exists npm; then
    if lv="$(npm_view "$PKG@$PIN" version)"; then
      printf 'ok   npm registry: %s@%s resolves (latest published line seen by registry: %s)\n' "$PKG" "$PIN" "$lv"
    else
      warn "could not read $PKG@$PIN from the npm registry (offline? private network?)"
      warn "the npx launch will still work once a registry is reachable"
    fi
    if lic="$(npm_view "$PKG@$PIN" license)"; then
      printf 'ok   upstream license reported as: %s\n' "$lic"
    fi
    if rep="$(npm_view "$PKG@$PIN" repository.url)"; then
      printf 'ok   upstream repository reported as: %s\n' "$rep"
    fi
  fi

  printf '\n'
  if [ -e "$TOKEN_FILE" ]; then
    printf 'ok   token file exists: %s\n' "$TOKEN_FILE"
    m="$(file_mode "$TOKEN_FILE")"
    if [ "$m" = "600" ] || [ "$m" = "unknown" ]; then
      printf 'ok   token file mode: %s\n' "$m"
    else
      warn "token file mode is %s, expected 600 (run: chmod 600 '%s')" "$m" "$TOKEN_FILE"
      fails=$((fails+1))
    fi
    dir="$(dirname "$TOKEN_FILE")"
    dm="$(file_mode "$dir")"
    if [ "$dm" = "700" ] || [ "$dm" = "unknown" ]; then
      printf 'ok   secrets directory mode: %s\n' "$dm"
    else
      warn "secrets directory mode is %s, expected 700 (run: chmod 700 '%s')" "$dm" "$dir"
      fails=$((fails+1))
    fi
  else
    warn "token file does not exist yet: $TOKEN_FILE"
    warn "create it with: $0 --yes init   (or place a 0600 file there yourself)"
  fi

  if [ -n "${DISCORD_TOKEN:-}" ]; then
    warn "DISCORD_TOKEN is set in this shell's environment: tokens in plain env vars leak into logs and process listings; prefer the 0600 file with a client-side {file:...} reference"
  fi

  printf '\n'
  if [ "$fails" -eq 0 ]; then
    printf 'result: PASS (prerequisites present; address any warn lines before connecting)\n'
  else
    printf 'result: FAIL (%s blocking issue(s) above)\n' "$fails"
    return 1
  fi
}

# -------------------------------------------------------------------- init run
do_init() {
  [ "$YES" -eq 1 ] || {
    printf 'init would:\n'
    printf '  1. create directory %s (mode 700) if absent\n' "$SECRETS_DIR"
    printf '  2. create token file %s (mode 600) after a hidden prompt\n' "$TOKEN_FILE"
    printf '  3. refuse to touch an existing token file\n'
    printf 'nothing was written. re-run with --yes to proceed:\n'
    printf '  %s --yes init\n' "$0"
    return 0
  }

  if [ -e "$TOKEN_FILE" ]; then
    die "token file already exists: $TOKEN_FILE (never overwrite; if rotation is needed, reset the token in the Discord Developer Portal, then replace the file by hand: rm, recreate, chmod 600)"
  fi

  if ! ( : < /dev/tty ) 2>/dev/null; then
    die "no usable terminal for hidden input; write the file by hand instead: mkdir -p '$SECRETS_DIR' && chmod 700 '$SECRETS_DIR' && umask 077 && printf '%%s' 'YOUR_TOKEN' > '$TOKEN_FILE' && chmod 600 '$TOKEN_FILE'"
  fi

  printf 'paste the Discord bot token (input is hidden), then press enter: ' >&2
  old_stty="$(stty -g < /dev/tty 2>/dev/null || true)"
  stty -echo < /dev/tty 2>/dev/null || true
  TOKEN=""
  IFS= read -r TOKEN < /dev/tty || TOKEN=""
  [ -n "$old_stty" ] && stty "$old_stty" < /dev/tty 2>/dev/null || true
  printf '\n' >&2

  TOKEN="$(printf '%s' "$TOKEN" | tr -d '\r\n')"
  [ -n "$TOKEN" ] || die "empty token; nothing written"
  case "$TOKEN" in
    *[[:space:]]*) die "token must not contain whitespace; nothing written" ;;
  esac
  [ "${#TOKEN}" -ge 50 ] || die "token is suspiciously short (${#TOKEN} characters); Discord bot tokens are longer; nothing written (was the whole token pasted?)"

  umask 077
  mkdir -p "$SECRETS_DIR"
  chmod 700 "$SECRETS_DIR"
  printf '%s' "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  m="$(file_mode "$TOKEN_FILE")"

  printf 'ok   token file created: %s (mode %s)\n' "$TOKEN_FILE" "$m"
  printf 'next steps:\n'
  printf '  1. reference it from your MCP client config as a file reference, e.g. {file:%s}\n' "$TOKEN_FILE"
  printf '     (opencode style) or hand the path to a secret-injection mechanism\n'
  printf '  2. restart the MCP client: it reads MCP configuration at startup only\n'
  printf '  3. never echo, log, commit, or paste the token anywhere else\n'
}

# --------------------------------------------------------------- print-config
do_print_config() {
  g="${GUILD_ID:-123456789012345678}"
  if [ -z "${GUILD_ID:-}" ]; then
    warn "GUILD_ID is unset: printing the placeholder 123456789012345678, replace it with your real guild ID before use"
  fi
  warn "the template below inlines a token placeholder; prefer a {file:...} reference (opencode style) or a client secret-injection mechanism"
  cat <<EOF
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": [ "-y", "${PKG}@${PIN}" ],
      "env": {
        "DISCORD_TOKEN": "PASTE_YOUR_BOT_TOKEN_HERE",
        "DISCORD_MCP_TOOLSETS": "${TOOLSETS}",
        "DISCORD_ALLOWED_GUILDS": "${g}",
        "DISCORD_MESSAGE_CONTENT": "false",
        "DISCORD_GUILD_MEMBERS": "false"
      }
    }
  }
}
EOF
}

# ---------------------------------------------------------------------- switch
case "$CMD" in
  check)        do_check ;;
  init)         do_init ;;
  print-config) do_print_config ;;
  help)         usage ;;
  *)            usage; die "unknown command: $CMD" ;;
esac