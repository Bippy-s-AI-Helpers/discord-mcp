import { BaseGuildTextChannel, ChannelType, NewsChannel, ThreadOnlyChannel } from "discord.js";
import { z } from "zod";
import { discord, getGuildChannel, fetchChannelChecked } from "../client.js";
import { defineTool, defineModule, snowflake, guildId, intIn, structured } from "./define.js";

/** Tool definitions for guild channels: lifecycle, layout, following, and permission sync. */
const tools = [
  defineTool({
    name: "discord_create_channel",
    description:
      "Create a text, voice, announcement, forum, or category channel in a server, optionally nested under a category (category_id must be a category channel). Topic applies to text, announcement, and forum channels; slowmode, NSFW flag, and display position apply where Discord supports them. For forum channels with tags and layout options use discord_create_forum_channel instead. Requires the Manage Channels permission. Returns the created channel's id, name, type, parent_id, and topic.",
    annotations: {
      title: "Create channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId.describe("Discord server (guild) ID (snowflake) to create the channel in."),
      name: z.string().min(1).max(100).describe("Name of the new channel (1-100 characters)."),
      type: z
        .enum(["text", "voice", "announcement", "forum", "category"])
        .optional()
        .describe("Channel type to create. Defaults to 'text'."),
      topic: z
        .string()
        .max(1024)
        .optional()
        .describe(
          "Optional channel topic/description (max 1024 characters). Applies to text, announcement, and forum channels only.",
        ),
      category_id: snowflake
        .optional()
        .describe(
          "Optional category channel (snowflake) to nest the new channel under. Must be a category; passing any other channel is rejected by Discord.",
        ),
      position: z
        .int()
        .min(0)
        .optional()
        .describe("Optional zero-based display position of the new channel in its category."),
      nsfw: z
        .boolean()
        .optional()
        .describe("Mark (true) or not mark (false) the new channel as age-restricted (NSFW)."),
      rate_limit_per_second: intIn(0, 21600)
        .optional()
        .describe(
          "Optional per-user message cooldown in seconds, 0-21600 (slowmode). Text and forum channels only.",
        ),
    }),
    outputSchema: z.object({
      id: snowflake,
      name: z.string(),
      type: z.enum(["text", "voice", "announcement", "forum", "category"]),
      parent_id: z.string().nullable(),
      topic: z.string().nullable(),
    }),
    handle: async ({
      guild_id,
      name,
      type,
      topic,
      category_id,
      position,
      nsfw,
      rate_limit_per_second,
    }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const typeMap: Record<string, ChannelType> = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        announcement: ChannelType.GuildAnnouncement,
        forum: ChannelType.GuildForum,
        category: ChannelType.GuildCategory,
      };
      const channelType = typeMap[type ?? "text"];
      // Topic is accepted by Discord for text, announcement, and forum channels only.
      const topicApplies =
        channelType === ChannelType.GuildText ||
        channelType === ChannelType.GuildAnnouncement ||
        channelType === ChannelType.GuildForum;
      const created = await guild.channels.create({
        name,
        type: channelType as
          | ChannelType.GuildText
          | ChannelType.GuildVoice
          | ChannelType.GuildAnnouncement
          | ChannelType.GuildForum
          | ChannelType.GuildCategory,
        topic: topicApplies ? topic : undefined,
        parent: category_id,
        position,
        nsfw,
        rateLimitPerUser: rate_limit_per_second,
      });
      const createdTypeNames: Partial<Record<ChannelType, string>> = {
        [ChannelType.GuildText]: "text",
        [ChannelType.GuildVoice]: "voice",
        [ChannelType.GuildAnnouncement]: "announcement",
        [ChannelType.GuildForum]: "forum",
        [ChannelType.GuildCategory]: "category",
      };
      return structured({
        id: created.id,
        name: created.name,
        type: createdTypeNames[created.type] ?? String(created.type),
        parent_id: created.parentId ?? null,
        topic: "topic" in created ? (created.topic ?? null) : null,
      });
    },
  }),
  defineTool({
    name: "discord_delete_channel",
    description:
      "Permanently delete a guild channel and all of its messages. IRREVERSIBLE. SAFE BY DEFAULT: dry_run is true unless explicitly set to false, so call it first to preview, then re-call with dry_run:false to actually delete. Requires the Manage Channels permission. DM channels are refused: only guild channels can be deleted with this tool. An optional reason is recorded in the audit log.",
    annotations: {
      title: "Delete channel",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to delete."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
      dry_run: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), only reports which channel would be deleted without deleting it. Set false to actually delete.",
        ),
    }),
    handle: async ({ channel_id, reason, dry_run }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel) throw new Error("Channel not found.");
      const channelName = "name" in channel ? channel.name : channel.id;
      if (channel.isDMBased())
        throw new Error(
          "Channel is a DM channel. Only guild channels can be deleted with this tool (DMs cannot be deleted by bots).",
        );
      if (dry_run) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 Dry run: channel #${channelName} would be deleted. Re-call with dry_run:false to delete.`,
            },
          ],
        };
      }
      await channel.delete(reason);
      return { content: [{ type: "text", text: `✅ Channel #${channelName} deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_edit_channel",
    description:
      "Update a guild channel's name, topic, slowmode, or NSFW flag and return the channel's updated fields (id, name, topic, rate_limit_per_second, nsfw, position, parent_id). Only provided fields change; topic and slowmode apply to text channels only. Threads and DM channels are refused: they are not guild channels, so thread edits belong to the thread/message tools. To move the channel between categories use discord_move_channel; to reorder it within a category use discord_set_channel_position. Requires the Manage Channels permission.",
    annotations: {
      title: "Edit channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to edit."),
      name: z.string().min(1).max(100).optional().describe("New channel name (1-100 characters)."),
      topic: z
        .string()
        .max(1024)
        .optional()
        .describe("New topic/description (max 1024 characters; text channels only)."),
      slowmode: intIn(0, 21600)
        .optional()
        .describe("Per-user message cooldown in seconds, 0-21600. 0 disables slowmode."),
      nsfw: z
        .boolean()
        .optional()
        .describe("Mark (true) or unmark (false) the channel as age-restricted (NSFW)."),
    }),
    outputSchema: z.object({
      id: snowflake,
      name: z.string(),
      topic: z.string().nullable(),
      rate_limit_per_second: z.number().nullable(),
      nsfw: z.boolean().nullable(),
      position: z.number().nullable(),
      parent_id: z.string().nullable(),
    }),
    handle: async ({ channel_id, name, topic, slowmode, nsfw }) => {
      const channel = await getGuildChannel(channel_id);
      const editOptions: Record<string, unknown> = {};
      if (name !== undefined) editOptions.name = name;
      if (topic !== undefined && channel.type === ChannelType.GuildText) editOptions.topic = topic;
      if (slowmode !== undefined && channel.type === ChannelType.GuildText)
        editOptions.rateLimitPerUser = slowmode;
      if (nsfw !== undefined) editOptions.nsfw = nsfw;
      await channel.edit(editOptions);
      const state: Record<string, unknown> = {
        id: channel.id,
        name: channel.name,
        position: channel.position,
        parent_id: channel.parentId ?? null,
      };
      // Text and announcement channels (BaseGuildTextChannel) and forum/media
      // channels (ThreadOnlyChannel) expose topic, slowmode, and NSFW; categories
      // and voice/stage channels do not, so they report null.
      if (channel instanceof BaseGuildTextChannel || channel instanceof ThreadOnlyChannel) {
        state.topic = channel.topic ?? null;
        state.rate_limit_per_second = channel.rateLimitPerUser ?? null;
        state.nsfw = channel.nsfw;
      } else {
        state.topic = null;
        state.rate_limit_per_second = null;
        state.nsfw = null;
      }
      return structured(state);
    },
  }),
  defineTool({
    name: "discord_move_channel",
    description:
      "Move a channel into a category, or remove it from its category when category_id is omitted. Requires the Manage Channels permission. Use discord_set_channel_position to reorder within a category. Returns a confirmation.",
    annotations: {
      title: "Move channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to move."),
      category_id: snowflake
        .optional()
        .describe("Target category (snowflake). Omit to move the channel out of any category."),
    }),
    handle: async ({ channel_id, category_id }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.edit({ parent: category_id ?? null });
      return { content: [{ type: "text", text: `✅ Channel #${channel.name} moved.` }] };
    },
  }),
  defineTool({
    name: "discord_clone_channel",
    description:
      "Create a copy of a channel, including its name, topic, and permission overwrites (but not its messages). Requires the Manage Channels permission. Returns the cloned channel's name and ID.",
    annotations: {
      title: "Clone channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to clone."),
      new_name: z
        .string()
        .optional()
        .describe("Optional name for the clone. Defaults to the source channel's name."),
    }),
    handle: async ({ channel_id, new_name }) => {
      const channel = await getGuildChannel(channel_id);
      const cloned = await channel.clone({ name: new_name });
      return {
        content: [
          { type: "text", text: `✅ Channel cloned as #${cloned.name} (id: ${cloned.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_set_channel_position",
    description:
      "Set a channel's display order within its category. Use discord_move_channel to change which category it belongs to. Requires the Manage Channels permission. Returns a confirmation.",
    annotations: {
      title: "Set channel position",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to reposition."),
      position: z.int().min(0).describe("Zero-based position within the category (0 = top)."),
    }),
    handle: async ({ channel_id, position }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.setPosition(position);
      return {
        content: [
          { type: "text", text: `✅ Channel #${channel.name} moved to position ${position}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_follow_announcement_channel",
    description:
      "Subscribe a target channel to an announcement (news) channel, so the source's published messages are reposted into the target. The source must be an announcement channel. Requires the Manage Webhooks permission in the target. Returns a confirmation.",
    annotations: {
      title: "Follow announcement channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      source_channel_id: snowflake.describe(
        "ID (snowflake) of the announcement channel to follow.",
      ),
      target_channel_id: snowflake.describe(
        "ID (snowflake) of the channel that will receive published messages.",
      ),
    }),
    handle: async ({ source_channel_id, target_channel_id }) => {
      const source = await fetchChannelChecked(source_channel_id);
      if (!source || !(source instanceof NewsChannel))
        throw new Error("Source channel is not an announcement channel.");
      await fetchChannelChecked(target_channel_id);
      await source.addFollower(target_channel_id);
      return {
        content: [
          { type: "text", text: `✅ Now following announcement channel in target channel.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_lock_channel_permissions",
    description:
      "Reset a channel's permission overwrites to exactly match its parent category (Discord's 'sync permissions'). The channel must be inside a category. Requires the Manage Roles permission. Returns a confirmation.",
    annotations: {
      title: "Sync channel permissions",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the channel to sync with its parent category.",
      ),
    }),
    handle: async ({ channel_id }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.lockPermissions();
      return {
        content: [
          {
            type: "text",
            text: `✅ Channel #${channel.name} permissions synced with parent category.`,
          },
        ],
      };
    },
  }),
];

export default defineModule(tools);
