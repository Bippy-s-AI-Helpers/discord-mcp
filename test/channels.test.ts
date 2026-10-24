import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import { discord } from "../src/client.js";
import channels from "../src/tools/channels.js";

const GUILD = "111111111111111111";
const CATEGORY = "444444444444444444";
const CHANNEL = "333333333333333333";
const CREATED = "555555555555555555";

// Env for the login-path import order; no tool here connects.
process.env.DISCORD_TOKEN ??= "test-token-login-is-stubbed";

afterEach(() => mock.restoreAll());

function fakeGuild(createCalls: unknown[]) {
  return {
    channels: {
      create: async (...args: unknown[]) => {
        createCalls.push(args);
        return {
          id: CREATED,
          name: "probe",
          type: ChannelType.GuildText,
          parentId: null,
          topic: "hello",
        };
      },
    },
  };
}

test("create_channel: passes mapped type, parent, topic, and optional fields; returns structured fields", async () => {
  const createCalls: unknown[] = [];
  mock.method(discord.guilds, "fetch", async () => fakeGuild(createCalls) as never);
  const handler = channels.handlers.get("discord_create_channel")!;

  await handler({
    guild_id: GUILD,
    name: "probe",
    type: "announcement",
    topic: "hello",
    category_id: CATEGORY,
    position: 3,
    nsfw: true,
    rate_limit_per_second: 60,
  });

  const options = createCalls[0][0] as Record<string, unknown>;
  assert.deepEqual(options, {
    name: "probe",
    type: ChannelType.GuildAnnouncement,
    topic: "hello",
    parent: CATEGORY,
    position: 3,
    nsfw: true,
    rateLimitPerUser: 60,
  });
});

test("create_channel: defaults to text, maps structured type, drops topic on voice", async () => {
  const createCalls: unknown[] = [];
  const guild = fakeGuild(createCalls);
  guild.channels.create = async (...args: unknown[]) => {
    createCalls.push(args);
    return {
      id: CREATED,
      name: "probe",
      type: ChannelType.GuildVoice,
      parentId: CATEGORY,
    };
  };
  mock.method(discord.guilds, "fetch", async () => guild as never);
  const handler = channels.handlers.get("discord_create_channel")!;

  const res = await handler({
    guild_id: GUILD,
    name: "probe",
    type: "voice",
    topic: "ignored",
    category_id: CATEGORY,
  });

  const options = createCalls[0][0] as Record<string, unknown>;
  assert.equal(options.type, ChannelType.GuildVoice);
  assert.equal(options.topic, undefined, "topic must not be sent for voice channels");
  assert.equal(options.parent, CATEGORY);
  const structuredOut = res.structuredContent as Record<string, unknown>;
  assert.deepEqual(structuredOut, {
    id: CREATED,
    name: "probe",
    type: "voice",
    parent_id: CATEGORY,
    topic: null,
  });
});

test("create_channel: rejects bad type, over-limit topic, and out-of-range slowmode at parse time", async () => {
  const createCalls: unknown[] = [];
  mock.method(discord.guilds, "fetch", async () => fakeGuild(createCalls) as never);
  const handler = channels.handlers.get("discord_create_channel")!;

  await assert.rejects(() => handler({ guild_id: GUILD, name: "x", type: "stage" }));
  await assert.rejects(
    () => handler({ guild_id: GUILD, name: "x", topic: "a".repeat(1025) }),
    /1024/,
  );
  await assert.rejects(
    () => handler({ guild_id: GUILD, name: "x", rate_limit_per_second: 30000 }),
    /21600/,
  );
  await assert.rejects(() => handler({ guild_id: GUILD, name: "" }));
  assert.equal(createCalls.length, 0, "no Discord call may run for rejected args");
});

test("create_channel: guild_id outside the allow-list is rejected before any Discord call", async () => {
  const createCalls: unknown[] = [];
  mock.method(discord.guilds, "fetch", async () => fakeGuild(createCalls) as never);
  const handler = channels.handlers.get("discord_create_channel")!;
  process.env.DISCORD_ALLOWED_GUILDS = "999999999999999999";
  try {
    await assert.rejects(() => handler({ guild_id: GUILD, name: "x" }), /allow-list/);
    assert.equal(createCalls.length, 0, "rejected guild must not reach Discord");
  } finally {
    delete process.env.DISCORD_ALLOWED_GUILDS;
  }
});

test("delete_channel: refuses DM channels (even in dry run)", async () => {
  const deletions: unknown[] = [];
  const fake = {
    name: "a-dm",
    isDMBased: () => true,
    delete: async (reason: unknown) => void deletions.push(reason),
  };
  mock.method(discord.channels, "fetch", async () => fake as never);
  const handler = channels.handlers.get("discord_delete_channel")!;

  await assert.rejects(() => handler({ channel_id: CHANNEL }), /DM channel/);
  await assert.rejects(() => handler({ channel_id: CHANNEL, dry_run: false }), /DM channel/);
  assert.equal(deletions.length, 0, "a refused channel must never be deleted");
});

test("edit_channel: refuses threads and other non-guild channels with a clear error", async () => {
  const threadLike = { id: CHANNEL, name: "thread" };
  mock.method(discord.channels, "fetch", async () => threadLike as never);
  const handler = channels.handlers.get("discord_edit_channel")!;
  await assert.rejects(() => handler({ channel_id: CHANNEL, name: "new" }), /not a guild channel/);
});
