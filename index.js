
try {
    player.extractors.loadDefault();
} catch (e) {
    console.log("Extractor load skipped");
}

// index.js
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { Riffy } = require('riffy');
const config = require('./config.js');
const express = require('express');
require('dotenv').config();
const fs = require('fs');

const PLAYLIST_FILE = './playlists.json';

function loadPlaylists() {
  if (!fs.existsSync(PLAYLIST_FILE)) {
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
}

function savePlaylists(data) {
  fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2));
}

// Function to start Express server
function startExpressServer() {
  if (config.express?.enabled) {
    const app = express();

    app.get('/', (req, res) => {
      res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'Starting...',
        servers: client.guilds.cache ? client.guilds.cache.size : 0,
        uptime: process.uptime(),
        lavalink: isLavalinkConnected ? 'connected' : 'disconnected'
      });
    });

    app.get('/stats', (req, res) => {
      res.json({
        guilds: client.guilds.cache ? client.guilds.cache.size : 0,
        users: client.guilds.cache ? client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0,
        players: riffy.players ? riffy.players.size : 0,
        uptime: process.uptime(),
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        ping: client.ws ? client.ws.ping : 0,
        lavalink: isLavalinkConnected
      });
    });

    app.listen(config.express.port, '0.0.0.0', () => {
      console.log(`🌐 Express server running on port ${config.express.port}`);
    });
  }
}

// Start Express server before bot
startExpressServer();

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages
];

if (config.enablePrefix) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

let isLavalinkConnected = false;

const riffy = new Riffy(client, config.lavalink.nodes, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) guild.shard.send(payload);
  },
  defaultSearchPlatform: "ytmsearch",
  restVersion: "v4"
});


client.on("raw", (d) => {
  if (["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(d.t)) {
    riffy.updateVoiceState(d);
  }
});


// Fix Riffy Node initialization error by overriding the broken defineProperty call
// This is a workaround for the riffy package bug mentioned in the error
const { Node } = require('riffy/build/structures/Node');
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
    if (obj instanceof Node && (prop === 'host' || prop === 'port' || prop === 'password' || prop === 'secure' || prop === 'identifier')) {
        return originalDefineProperty(obj, prop, {
            value: descriptor.value,
            writable: true,
            enumerable: true,
            configurable: true
        });
    }
    try {
        return originalDefineProperty(obj, prop, descriptor);
    } catch (e) {
        // If it fails with the specific error, try a fallback
        if (e instanceof TypeError && e.message.includes('Invalid property descriptor')) {
            return originalDefineProperty(obj, prop, {
                value: descriptor.value,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }
        throw e;
    }
};

const queue247 = new Set();

// ===== SERIOUS STOP SYSTEM =====
const seriousStopGuilds = new Set();

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const msg = message.content.toLowerCase().trim();

  if (msg === "serious stop") {
    seriousStopGuilds.add(message.guild.id);
    const reply = await message.reply("🔒 Serious Stop Enabled. Nobody can stop music.");
    setTimeout(() => reply.delete().catch(() => {}), 3000);
    return;
  }

  if (msg === "serious unstop") {
    seriousStopGuilds.delete(message.guild.id);
    const player = riffy.players.get(message.guild.id);
    if (player) player.destroy();
    const reply = await message.reply("🔓 Serious Stop Disabled. Player stopped.");
    setTimeout(() => reply.delete().catch(() => {}), 3000);
    return;
  }
});


client.on('ready', async () => {
  console.log(`${config.emojis.success} Logged in as ${client.user.tag}`);
  console.log(`🔧 Current Prefix: ${config.prefix}`);

  try {
    riffy.init(client.user.id);
  } catch (error) {
    console.error(`${config.emojis.error} Failed to initialize Riffy:`, error);
  }

  const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'LISTENING': ActivityType.Listening,
    'WATCHING': ActivityType.Watching,
    'STREAMING': ActivityType.Streaming,
    'COMPETING': ActivityType.Competing
  };

  const activityType = activityTypes[config.activity.type] || ActivityType.Listening;
  client.user.setActivity(config.activity.name, { type: activityType });
  console.log(`${config.emojis.success} Activity set: ${config.activity.type} ${config.activity.name}`);

  const commands = [
    { name: 'play', description: 'Play a song', options: [{ name: 'query', description: 'Song name or URL', type: 3, required: true }] },
    { name: 'pause', description: 'Pause the current song' },
    { name: 'resume', description: 'Resume the paused song' },
    { name: 'skip', description: 'Skip the current song' },
    { name: 'stop', description: 'Stop the player and clear queue' },
    { name: 'volume', description: 'Set volume', options: [{ name: 'level', description: 'Volume level (1-200)', type: 4, required: true, min_value: 1, max_value: 200 }] },
    { name: 'queue', description: 'Show the current queue' },
    { name: 'nowplaying', description: 'Show currently playing song' },
    { name: 'shuffle', description: 'Shuffle the queue' },
    { name: 'loop', description: 'Toggle loop mode', options: [{ name: 'mode', description: 'Loop mode', type: 3, required: true, choices: [{ name: 'Off', value: 'none' }, { name: 'Track', value: 'track' }, { name: 'Queue', value: 'queue' }] }] },
    { name: 'remove', description: 'Remove a song from queue', options: [{ name: 'position', description: 'Position in queue', type: 4, required: true, min_value: 1 }] },
    { name: 'move', description: 'Move a song in queue', options: [{ name: 'from', description: 'From position', type: 4, required: true, min_value: 1 }, { name: 'to', description: 'To position', type: 4, required: true, min_value: 1 }] },
    { name: 'clearqueue', description: 'Clear the queue' },
    { name: '247', description: 'Toggle 24/7 mode' },
    { name: 'stats', description: 'Show bot statistics' },
    { name: 'ping', description: 'Show bot latency' },
    { name: 'invite', description: 'Get bot invite link' },
    { name: 'support', description: 'Get support server link' },
    { name: 'help', description: 'Show all commands' },
    { 
      name: 'playlist', 
      description: 'Playlist commands',
      options: [
        {
          name: 'create',
          description: 'Create playlist',
          type: 1,
          options: [
            {
              name: 'name',
              description: 'Playlist name',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'add',
          description: 'Add current song',
          type: 1,
          options: [
            {
              name: 'name',
              description: 'Playlist name',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'play',
          description: 'Play playlist',
          type: 1,
          options: [
            {
              name: 'name',
              description: 'Playlist name',
              type: 3,
              required: true
            }
          ]
        },
        {
          name: 'remove',
          description: 'Remove song from playlist',
          type: 1,
          options: [
            {
              name: 'name',
              description: 'Playlist name',
              type: 3,
              required: true
            },
            {
              name: 'position',
              description: 'Song position',
              type: 4,
              required: true
            }
          ]
        },
        {
          name: 'list',
          description: 'Show playlists',
          type: 1
        }
      ]
    },
    {
      name: 'vc',
      description: 'Voice moderation commands',
      options: [
        { name: 'mute', description: 'Mute a user', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }] },
        { name: 'unmute', description: 'Unmute a user', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }] },
        { name: 'muteall', description: 'Mute everyone in your VC', type: 1 },
        { name: 'unmuteall', description: 'Unmute everyone in your VC', type: 1 },
        { name: 'kick', description: 'Kick user from VC', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }] },
        { name: 'kickall', description: 'Kick everyone from VC', type: 1 },
        { name: 'deafen', description: 'Deafen a user', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }] },
        { name: 'undeafen', description: 'Undeafen a user', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }] },
        { name: 'deafenall', description: 'Deafen everyone in your VC', type: 1 },
        { name: 'undeafenall', description: 'Undeafen everyone in your VC', type: 1 },
        { name: 'move', description: 'Move user to VC', type: 1, options: [{ name: 'user', description: 'Target user', type: 6, required: true }, { name: 'channel', description: 'Target VC', type: 7, channel_types: [2], required: true }] },
        { name: 'moveall', description: 'Move all users', type: 1, options: [{ name: 'target_vc', description: 'Target VC', type: 7, channel_types: [2], required: true }] }
      ]
    },
    { name: 'setprefix', description: 'Change bot prefix', options: [{ name: 'prefix', description: 'New prefix', type: 3, required: true }] }
  ];

  await client.application.commands.set(commands);
  console.log(`${config.emojis.success} Slash commands registered globally`);
});

client.on('raw', (d) => riffy.updateVoiceState(d));

riffy.on('nodeConnect', (node) => {
  console.log(`${config.emojis.success} Node ${node.name} connected`);
  isLavalinkConnected = true;
});

riffy.on('nodeError', (node, error) => {
  console.error(`${config.emojis.error} Node ${node.name} error:`, error);
  isLavalinkConnected = false;
});

riffy.on('nodeDisconnect', (node) => {
  console.log(`${config.emojis.error} Node ${node.name} disconnected`);
  isLavalinkConnected = false;
});

const nowPlayingMessages = new Map();

function getVoiceTarget(message, args) {
  return message.mentions.members.first() || message.guild.members.cache.get(args[1]) || (message.reference ? null : null);
}


function formatTime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createNowPlayingContainer(player, track, disabled = false) {
  const queuedInfo = track.info ?? {};
  const currentInfo = player.current?.info ?? queuedInfo;

  let thumbnail =
    queuedInfo.artworkUrl ||
    queuedInfo.thumbnail ||
    currentInfo.artworkUrl ||
    currentInfo.thumbnail ||
    "https://i.imgur.com/QYJfXQv.png";

  if (!thumbnail && queuedInfo.uri?.includes("youtube.com")) {
    const id = queuedInfo.uri.split("v=")[1]?.split("&")[0];
    if (id) {
      thumbnail = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
    }
  }

  const isQueuedSong =
    player.current &&
    currentInfo.title !== queuedInfo.title;

  if (isQueuedSong) {
    return new ContainerBuilder()
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
`## Track Queued

> <:emoji_3:1504320257412562985> **[${queuedInfo.title || 'Unknown Title'}](${queuedInfo.uri || 'https://youtube.com'})** added to queue.
> Artist: \`${queuedInfo.author || 'Unknown Artist'}\``
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(thumbnail)
              .setDescription("Song Thumbnail")
          )
      );
  }

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`## Track Queued

> <:emoji_3:1504320257412562985> **[${queuedInfo.title || 'Unknown Title'}](${queuedInfo.uri || 'https://youtube.com'})** added to queue.
> Artist: \`${queuedInfo.author || 'Unknown Artist'}\`

## <a:1000024720:1504251449515704370> Now Playing

> **[${currentInfo.title || 'Unknown Title'}](${currentInfo.uri || 'https://youtube.com'})** - \`${currentInfo.author || 'Unknown Artist'}\`
> Duration: \`${formatTime(currentInfo.length || 0)}\`
> Requested by <@${track.info.requester}>`
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnail)
            .setDescription("Song Thumbnail")
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("pause")
          .setLabel("Pause")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || player.paused),

        new ButtonBuilder()
          .setCustomId("resume")
          .setLabel("Resume")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || !player.paused),

        new ButtonBuilder()
          .setCustomId("skip")
          .setLabel("Skip")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),

        new ButtonBuilder()
          .setCustomId("stop")
          .setLabel("Stop")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),

        new ButtonBuilder()
          .setCustomId("loop")
          .setLabel("Loop")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("shuffle")
          .setLabel("Shuffle")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      )
    );
}
function createSimpleContainer(title, description, emoji = config.emojis.info) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${emoji} ${title}\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription(title)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createSimpleContainerNoButtons(title, description, emoji = config.emojis.info) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${emoji} ${title}\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription(title)
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createQueueContainer(player, guild, user) {
  const queue = player.queue ?? [];
  const current = player.current;
  let description = '';

  if (current?.info) {
    description += `**Now Playing:**\n**[${current.info.title}](${current.info.uri})**\n${current.info.author || 'Unknown'} • ${formatTime(current.info.length)} • <@${current.info.requester}>\n\n`;
  }

  if (queue.length > 0) {
    description += `**Up Next:**\n`;
    const upcoming = queue.slice(0, 10);
    upcoming.forEach((t, i) => {
      const inf = t.info || {};
      description += `\`${i + 1}.\` **[${inf.title}](${inf.uri})**\n${inf.author || 'Unknown'} • ${formatTime(inf.length || 0)} • <@${t.info.requester}>\n`;
    });
    if (queue.length > 10) {
      description += `\n*...and ${queue.length - 10} more track(s)*`;
    }
  } else if (!current) {
    description = 'The queue is currently empty.';
  }

  description += `\n\n**Loop:** ${(!player.loop || player.loop === 'none') ? 'off' : player.loop} | **Total:** ${player.queue.length + 1} tracks`;

  let thumbnail = client.user.displayAvatarURL({ size: 1024 });

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${config.emojis.queue} Queue\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnail)
            .setDescription('Queue')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createStatsContainer() {
  const uptime = formatTime(client.uptime);
  const players = riffy.players.size;
  const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  const description = `**Servers:** ${client.guilds.cache.size}\n**Users:** ${totalUsers}\n**Players:** ${players}\n**Uptime:** ${uptime}\n**Ping:** ${client.ws.ping}ms\n**Memory:** ${memory} MB`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${config.emojis.info} Bot Statistics\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription('Bot Avatar')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
}

function createHelpContainer() {
  const lavalinkStatus = isLavalinkConnected ? '🟢 Connected' : '🔴 Not Connected';

  const description = `A powerful music bot with high quality audio\n\n**Total Commands:** 17\n**Prefix:** \`${config.prefix}\`\n**Lavalink:** ${lavalinkStatus}\nMade by **Unknownz**\n\n**${config.emojis.music} Music Commands**\n**play** (p) - Play a song\n**pause** (pa) - Pause current song\n**resume** (r, res) - Resume playback\n**skip** (s, next) - Skip current song\n**stop** (st, leave) - Stop player\n**nowplaying** (np) - Show current song\n**queue** (q) - Show queue\n**loop** (l, repeat) - Loop mode\n**shuffle** (sh, mix) - Shuffle queue\n**volume** (v, vol) - Set volume\n**clearqueue** (cq, clear) - Clear queue\n**remove** (rm, delete) - Remove from queue\n**move** (mv) - Move in queue\n**247** (24/7, stay) - Toggle 24/7\n\n**${config.emojis.info} Utility Commands**\n**stats** (status, info) - Bot stats\n**ping** (latency) - Bot ping\n**invite** (inv) - Invite link\n**support** (server) - Support server\n**help** (h, cmd) - This message`;

  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`## ${client.user.username} Help\n${description}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription('Bot Avatar')
        )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addActionRowComponents(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Invite Me')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),
          new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(config.supportServer)
        )
    );
}

riffy.on('trackStart', async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (!channel) return;

  const lastMessage = nowPlayingMessages.get(player.guildId);

  if (lastMessage) {
    try {
      await lastMessage.edit({
        components: [createNowPlayingContainer(player, track)],
        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2
      });
      return;
    } catch (err) {
      console.error('Failed to update Now Playing message:', err);
    }
  }
});

riffy.on('queueEnd', async (player) => {
  const channel = client.channels.cache.get(player.textChannel);

  const msg = nowPlayingMessages.get(player.guildId);
  if (msg && player.current) {
    try {
      const disabledContainer = createNowPlayingContainer(player, player.current, true);
      await msg.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    } catch (error) {
      console.error('Failed to disable buttons:', error);
    }
    nowPlayingMessages.delete(player.guildId);
  }

  if (queue247.has(player.guildId)) {
    if (channel) {
      const container = createSimpleContainerNoButtons('24/7 Mode', 'Queue ended but staying in 24/7 mode', config.emojis.info);
      await channel.send({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    }
    return;
  }

  player.destroy();
});

client.on('interactionCreate', async (interaction) => {
  try {
  // removed duplicate try
  // AUTO_DEFER_PATCH
  try {
    if (interaction.isChatInputCommand() && !interaction.deferred && !interaction.replied) await interaction.deferReply({});
  } catch(e) {}


  if (interaction.isStringSelectMenu() && interaction.customId === 'help_menu') {

    const category = interaction.values[0];

    const embeds = {
      info: new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('⚙️ Info Commands')
        .setDescription(`
\`.ping\` - Show bot latency
\`.stats\` - Show bot statistics
\`.invite\` - Invite bot
\`.support\` - Support server
\`.help\` - Show help menu
        `),

      music: new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🎵 Music Commands')
        .setDescription(`
\`.play\` - Play songs
\`.pause\` - Pause song
\`.resume\` - Resume song
\`.skip\` - Skip current song
\`.stop\` - Stop player
\`.queue\` - Show queue
\`.nowplaying\` - Current song
\`.shuffle\` - Shuffle queue
\`.loop\` - Loop modes
\`.volume\` - Set volume
        `),

      owner: new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('👑 Owner Commands')
        .setDescription(`
\`.setprefix\` - Change bot prefix
\`.247\` - Enable 24/7 mode
        `),

      server: new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🛡️ Server Commands')
        .setDescription(`
\`.vc\` - Show voice moderation help
        `),

      voice: new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🔊 Voice Moderation Commands')
        .setDescription(`
\`.voice mute [user]\` - Mute a user
\`.voice unmute [user]\` - Unmute a user
\`.voice muteall\` - Mute everyone in VC
\`.voice unmuteall\` - Unmute everyone in VC
\`.voice kick [user]\` - Kick user from VC
\`.voice kickall\` - Kick everyone from VC
\`.voice deafen [user]\` - Deafen a user
\`.voice undeafen [user]\` - Undeafen a user
\`.voice deafenall\` - Deafen everyone in VC
\`.voice undeafenall\` - Undeafen everyone in VC
\`.voice move [user] [vc]\` - Move user to VC
\`.voice moveall [target_vc]\` - Move all users
        `)
    };

    return interaction.update({
      embeds: [embeds[category]],
      components: interaction.message.components
    });
  }


  if (interaction.isButton()) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const player = riffy.players.get(interaction.guildId);

    if (!player) {
      return interaction.editReply({ content: `${config.emojis.error} No player found` });
    }

    const member = interaction.member;
    if (!member.voice.channel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in a voice channel` });
    }

    if (member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel` });
    }

    switch (interaction.customId) {
      case 'pause':
      case 'resume': {
        const message = nowPlayingMessages.get(player.guildId);
        const shouldPause = interaction.customId === 'pause';
        await player.pause(shouldPause);

        const targetMessage = message || interaction.message;

        if (targetMessage && player.current) {
          const updatedContainer = createNowPlayingContainer(player, player.current);
          await targetMessage.edit({
            components: [updatedContainer],
            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2
          }).catch(() => {});
        }

        await interaction.followUp({
          content: shouldPause ? `${config.emojis.pause} Paused` : `${config.emojis.play} Resumed`,
          ephemeral: true
        }).catch(() => {});
        break;
      }

      case 'skip': {
        player.stop();
        const disabledContainer = createNowPlayingContainer(player, player.current, true);
        await interaction.message.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        await interaction.editReply({ content: `${config.emojis.skip} Skipped` });
        break;
      }

      case 'stop': {
        const disabledContainer = createNowPlayingContainer(player, player.current, true);
        await interaction.message.edit({ components: [disabledContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        player.destroy();
        await interaction.editReply({ content: `${config.emojis.success} Stopped` });
        break;
      }

      case 'shuffle': {
        if (player.queue.length === 0) {
          return interaction.editReply({ content: `${config.emojis.error} Queue is empty` });
        }
        player.queue.shuffle();
        await interaction.editReply({ content: `${config.emojis.shuffle} Shuffled` });
        break;
      }

      case 'loop': {
        const modes = ['none', 'track', 'queue'];
        const currentMode = player.loop || 'none';
        const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
        player.setLoop(nextMode);
        const loopLabel = nextMode === 'none' ? 'off' : nextMode;

        const loopMsg = nowPlayingMessages.get(player.guildId);
        if (loopMsg && player.current) {
          const updatedContainer = createNowPlayingContainer(player, player.current);
          await loopMsg.edit({ components: [updatedContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        await interaction.editReply({ content: `${config.emojis.loop} Loop: ${loopLabel}` });
        break;
      }

      case 'queue': {
        const queueContainer = createQueueContainer(player, interaction.guild, interaction.user);
        await interaction.editReply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
        break;
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  const { commandName, options, member, guild, channel } = interaction;
  if (commandName === 'setprefix') {
    const newPrefix = options.getString('prefix');
    fs.writeFileSync('./prefix.json', JSON.stringify({ prefix: newPrefix }, null, 2));
    return interaction.editReply({ content: `✅ Prefix changed to: ${newPrefix}`, ephemeral: true });
  }


  if (commandName === 'vc') {
    if (!member.voice.channel) {
      return interaction.editReply({ content: '❌ Join a voice channel first', ephemeral: true });
    }

    const sub = options.getSubcommand();
    const target = options.getMember('user');
    const targetChannel = options.getChannel('channel') || options.getChannel('target_vc');
    const vc = member.voice.channel;

    try {
      if (sub === 'mute' && target) await target.voice.setMute(true);
      if (sub === 'unmute' && target) await target.voice.setMute(false);
      if (sub === 'muteall') for (const [, m] of vc.members) await m.voice.setMute(true);
      if (sub === 'unmuteall') for (const [, m] of vc.members) await m.voice.setMute(false);
      if (sub === 'kick' && target) await target.voice.disconnect();
      if (sub === 'kickall') for (const [, m] of vc.members) await m.voice.disconnect();
      if (sub === 'deafen' && target) await target.voice.setDeaf(true);
      if (sub === 'undeafen' && target) await target.voice.setDeaf(false);
      if (sub === 'deafenall') for (const [, m] of vc.members) await m.voice.setDeaf(true);
      if (sub === 'undeafenall') for (const [, m] of vc.members) await m.voice.setDeaf(false);
      if (sub === 'move' && target && targetChannel) await target.voice.setChannel(targetChannel);
      if (sub === 'moveall' && targetChannel) for (const [, m] of vc.members) await m.voice.setChannel(targetChannel);

      return interaction.editReply({ content: `✅ VC command executed: ${sub}` });
    } catch (e) {
      console.error(e);
      return interaction.editReply({ content: '❌ Failed to execute VC command' });
    }
  }

  if (commandName === 'play') {
    const query = options.getString('query');

    if (!member.voice.channel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in a voice channel`, ephemeral: true });
    }

    if (!isLavalinkConnected) {
      return interaction.editReply({ content: `${config.emojis.error} Lavalink is not connected. Music commands are unavailable.`, ephemeral: true });
    }

    try {
      let player = riffy.players.get(guild.id);

      if (!player) {
        player = riffy.createConnection({
          guildId: guild.id,
          voiceChannel: member.voice.channel.id,
          textChannel: channel.id,
          deaf: true
        });
      }

      const resolve = await riffy.resolve({ query, requester: member.user.id });

      if (!resolve || !resolve.tracks.length) {
        return interaction.editReply({ content: `${config.emojis.error} No results found` });
      }

      if (resolve.loadType === 'playlist') {
        for (const track of resolve.tracks) {
          track.info.requester = member.user.id;
          player.queue.add(track);
        }

        const container = createSimpleContainerNoButtons(
          'Playlist Added',
          `Added playlist **${resolve.playlistInfo.name}** (${resolve.tracks.length} tracks)`,
          config.emojis.success
        );

        await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
      } else if (resolve.loadType === 'search' || resolve.loadType === 'track') {
        const track = resolve.tracks[0];
        track.info.requester = member.user.id;
        player.queue.add(track);

        const container = createNowPlayingContainer(player, track);
        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2
        });

} else {
  return interaction.editReply({ content: `${config.emojis.error} No results found` });
}

if (!player.playing && !player.paused) player.play();

} catch (error) {
  console.error('Play command error:', error);

  await interaction.editReply({
    content: `${config.emojis.error} An error occurred`
  });
}
    
  }

  if (commandName === 'pause') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel` });
    }

    player.pause(true);
    const container = createSimpleContainer('Paused', 'Playback paused', config.emojis.pause);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'resume') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found`, ephemeral: true });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.pause(false);
    const container = createSimpleContainer('Resumed', 'Playback resumed', config.emojis.play);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'skip') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.stop();
    const container = createSimpleContainer('Skipped', 'Skipped to next track', config.emojis.skip);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'stop') {
    if (seriousStopGuilds.has(guild.id)) {
      return interaction.editReply({ content: '🔒 Serious Stop is active.', ephemeral: true });
    }
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    player.destroy();

    const container = createSimpleContainer(
      'Player Stopped',
      'Destroyed the queue and stopped the player.',
      config.emojis.success
    );

    await interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (commandName === 'volume') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
    if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
      return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
    }

    const volume = options.getInteger('level');
    player.setVolume(volume);
    const container = createSimpleContainer('Volume Set', `Volume set to ${volume}%`, config.emojis.volume);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'queue') {
    const player = riffy.players.get(guild.id);
    if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });

    if (player.queue.length === 0 && !player.current) {
      return interaction.editReply({ content: `${config.emojis.error} Queue is empty` });
    }

    const queueContainer = createQueueContainer(player, guild, interaction.user);
    await interaction.editReply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
  }

  if (commandName === 'nowplaying') {
    const player = riffy.players.get(guild.id);
    if (!player || !player.current) {
      return interaction.editReply({ content: `${config.emojis.error} Nothing is playing`, ephemeral: true });
    }

    const info = player.current.info ?? {};
    let thumbnail = info.artworkUrl || info.thumbnail || null;

    if (!thumbnail && info.uri && info.uri.includes('youtube.com')) {
      const videoId = info.uri.split('v=')[1]?.split('&')[0];
      if (videoId) {
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    if (!thumbnail && info.uri && info.uri.includes('youtu.be')) {
      const videoId = info.uri.split('youtu.be/')[1]?.split('?')[0];
      if (videoId) {
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    if (!thumbnail) {
      thumbnail = 'https://i.imgur.com/QYJfXQv.png';
    }

    const currentPosition = player.position || 0;
    const totalDuration = info.length || 0;
    const status = player.paused ? '⏸️ Paused' : '▶️ Playing';

          const description = `**[${info.title || 'Unknown Title'}](${info.uri || 'https://youtube.com'})**\n\n**Status:** ${status}\n**Current Duration:** ${formatTime(currentPosition)} / ${formatTime(totalDuration)}\n**Requested By:** <@${player.current.info.requester}>\n**Loop:** ${(!player.loop || player.loop === 'none') ? 'off' : player.loop}`;

          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## <a:1000024720:1504251449515704370> Now Playing\n${description}`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(thumbnail)
                    .setDescription(info.title || 'Song Thumbnail')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'shuffle') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }
          if (player.queue.length === 0) {
            return interaction.editReply({ content: `${config.emojis.error} Queue is empty` });
          }

          player.queue.shuffle();
          const container = createSimpleContainer('Shuffled', 'Shuffled the queue', config.emojis.shuffle);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'loop') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const mode = options.getString('mode');
          player.setLoop(mode);
          const container = createSimpleContainer('Loop Set', `Loop set to: ${mode}`, config.emojis.loop);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'remove') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const position = options.getInteger('position') - 1;
          if (position < 0 || position >= player.queue.length) {
            return interaction.editReply({ content: `${config.emojis.error} Invalid position`, ephemeral: true });
          }

          const removed = player.queue.remove(position);
          const container = createSimpleContainer('Removed', `Removed: ${removed.info.title}`, config.emojis.success);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'move') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          const from = options.getInteger('from') - 1;
          const to = options.getInteger('to') - 1;

          if (from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) {
            return interaction.editReply({ content: `${config.emojis.error} Invalid positions`, ephemeral: true });
          }

          const track = player.queue.remove(from);
          player.queue.splice(to, 0, track);
          const container = createSimpleContainer('Moved', `Moved: ${track.info.title}`, config.emojis.success);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'clearqueue') {
          const player = riffy.players.get(guild.id);
          if (!player) return interaction.editReply({ content: `${config.emojis.error} No player found` });
          if (!member.voice.channel || member.voice.channel.id !== player.voiceChannel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in the same voice channel`, ephemeral: true });
          }

          player.queue.clear();
          const container = createSimpleContainer('Queue Cleared', 'Cleared the queue', config.emojis.success);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === '247') {
          const player = riffy.players.get(guild.id);
          if (!member.voice.channel) {
            return interaction.editReply({ content: `${config.emojis.error} You need to be in a voice channel` });
          }

          if (queue247.has(guild.id)) {
            queue247.delete(guild.id);
            const container = createSimpleContainer('24/7 Disabled', '24/7 mode disabled', config.emojis.success);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          } else {
            queue247.add(guild.id);

            if (!player) {
              riffy.createConnection({
                guildId: guild.id,
                voiceChannel: member.voice.channel.id,
                textChannel: channel.id,
                deaf: true
              });
            }

            const container = createSimpleContainer('24/7 Enabled', '24/7 mode enabled', config.emojis.success);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }
        }

        if (commandName === 'stats') {
          const statsContainer = createStatsContainer();
          await interaction.editReply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'ping') {
          const container = createSimpleContainer('Pong!', `Latency: ${client.ws.ping}ms`, config.emojis.info);
          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'invite') {
          const invite = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## ${config.emojis.success} Invite Bot\n[Click here to invite me](${invite})`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(client.user.displayAvatarURL({ size: 1024 }))
                    .setDescription('Invite Bot')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel('Invite Me')
                    .setStyle(ButtonStyle.Link)
                    .setURL(invite)
                )
            );

          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (commandName === 'support') {
          const container = new ContainerBuilder()
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder()
                    .setContent(`## ${config.emojis.info} Support Server\n[Join our support server](${config.supportServer})`)
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(client.user.displayAvatarURL({ size: 1024 }))
                    .setDescription('Support Server')
                )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setLabel('Support')
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.supportServer)
                )
            );

          await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }


        if (commandName === 'setprefix') {
          if (!member.permissions.has('Administrator')) {
            return interaction.editReply({ content: '❌ Administrator permission required.', ephemeral: true });
          }

          const newPrefix = options.getString('prefix');

          fs.writeFileSync('./prefix.json', JSON.stringify({ prefix: newPrefix }, null, 2));

          return interaction.editReply({
            content: `✅ Prefix changed to: ${newPrefix}`
          });
        }


        if (commandName === 'playlist') {
          const sub = options.getSubcommand();
          const playlists = loadPlaylists();
          const userId = interaction.user.id;

          if (!playlists[userId]) playlists[userId] = {};

          if (sub === 'create') {
            const name = options.getString('name');

            if (playlists[userId][name]) {
              return interaction.editReply({ content: '❌ Playlist already exists', ephemeral: true });
            }

            playlists[userId][name] = [];
            savePlaylists(playlists);

            return interaction.editReply({ content: `✅ Playlist created: ${name}` });
          }

          if (sub === 'add') {
            const name = options.getString('name');
            const player = riffy.players.get(guild.id);

            if (!player || !player.current) {
              return interaction.editReply({ content: '❌ Nothing is playing', ephemeral: true });
            }

            if (!playlists[userId][name]) {
              return interaction.editReply({ content: '❌ Playlist not found', ephemeral: true });
            }

            playlists[userId][name].push(player.current.info.uri);
            savePlaylists(playlists);

            return interaction.editReply({ content: `✅ Added current song to playlist: ${name}` });
          }

          if (sub === 'list') {
            const names = Object.keys(playlists[userId]);

            if (!names.length) {
              return interaction.editReply({ content: '❌ No playlists found', ephemeral: true });
            }

            return interaction.editReply({
              content: `📂 Your playlists:\n${names.map(n => `• ${n}`).join('\n')}`
            });
          }

          if (sub === 'remove') {
            const name = options.getString('name');
            const position = options.getInteger('position') - 1;

            if (!playlists[userId][name]) {
              return interaction.editReply({ content: '❌ Playlist not found', ephemeral: true });
            }

            if (position < 0 || position >= playlists[userId][name].length) {
              return interaction.editReply({ content: '❌ Invalid song position', ephemeral: true });
            }

            playlists[userId][name].splice(position, 1);
            savePlaylists(playlists);

            return interaction.editReply({ content: '✅ Song removed from playlist' });
          }

          if (sub === 'play') {
            const name = options.getString('name');

            if (!playlists[userId][name] || playlists[userId][name].length === 0) {
              return interaction.editReply({ content: '❌ Playlist empty or not found', ephemeral: true });
            }

            if (!member.voice.channel) {
              return interaction.editReply({ content: '❌ Join a voice channel first', ephemeral: true });
            }

            let player = riffy.players.get(guild.id);

            if (!player) {
              player = riffy.createConnection({
                guildId: guild.id,
                voiceChannel: member.voice.channel.id,
                textChannel: channel.id,
                deaf: true
              });
            }

            for (const song of playlists[userId][name]) {
              const resolve = await riffy.resolve({ query: song, requester: interaction.user.id });

              if (resolve && resolve.tracks.length) {
                const track = resolve.tracks[0];
                track.info.requester = interaction.user.id;
                player.queue.add(track);
              }
            }

            if (!player.playing && !player.paused) player.play();

            return interaction.editReply({ content: `▶️ Playing playlist: ${name}` });
          }
        }

        if (commandName === 'help') {
          const helpContainer = createHelpContainer();
          await interaction.editReply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (error) {
      console.error('Interaction error:', error);
      try {
        const msg = { content: '❌ Command error. Check console.' };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.editReply({ ...msg, ephemeral: true });
      } catch {}
    }

});
delete require.cache[require.resolve("./prefix.json")];
      if (config.enablePrefix) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    delete require.cache[require.resolve("./prefix.json")];
    const currentPrefix = require("./prefix.json").prefix;

          const mentionPrefix1 = `<@${client.user.id}>`;
          const mentionPrefix2 = `<@!${client.user.id}>`;

          let usedPrefix = null;

          if (message.content.startsWith(currentPrefix)) {
            usedPrefix = currentPrefix;
          } else if (message.content.startsWith(mentionPrefix1)) {
            usedPrefix = mentionPrefix1;
          } else if (message.content.startsWith(mentionPrefix2)) {
            usedPrefix = mentionPrefix2;
          } else {
            const rawArgs = message.content.trim().split(/ +/);
            const rawCommand = rawArgs[0]?.toLowerCase();

            const availableCommands = [
              'play','pause','resume','skip','stop','volume','queue','nowplaying',
              'shuffle','loop','remove','move','clearqueue','247','stats','ping',
              'invite','support','help','vc','playlist'
            ];

            const allAliases = Object.values(config.aliases || {}).flat();

            const prefixlessUsers = Array.isArray(config.prefixlessUsers)
              ? config.prefixlessUsers.map(id => String(id))
              : [];



            if ((availableCommands.includes(rawCommand) || allAliases.includes(rawCommand)) && prefixlessUsers.includes(message.author.id)) {
              usedPrefix = '';
            } else {
              return;
            }
          }

          let content = message.content.slice(usedPrefix.length).trim();

          if (
            (usedPrefix === mentionPrefix1 || usedPrefix === mentionPrefix2) &&
            content.toLowerCase().startsWith("play ")
          ) {
            content = "play " + content.slice(5);
          }

          const args = content.trim().split(/ +/);
          let command = args.shift()?.toLowerCase();

          if (!command && args.length > 0) {
            command = args.shift()?.toLowerCase();
          }

          if (!command) return;

          if (command.startsWith('play')) {
            command = 'play';
          }

          for (const [cmd, aliases] of Object.entries(config.aliases)) {
            if (aliases.includes(command)) {
              command = cmd;
              break;
            }
          }
      if (command === 'help' || message.content.toLowerCase() === 'help') {

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } = require('discord.js');

        const helpEmbed = new EmbedBuilder()
          .setColor('#2B2D31')
          .setAuthor({
            name: 'GBL MUSIC',
            iconURL: client.user.displayAvatarURL({ dynamic: true })
          })
          .setDescription(
`# Welcome to GBL MUSIC

Hey ${message.author.username}, I'm GBL MUSIC, your Music Companion.

• Default Prefix: \`${currentPrefix}\`
• Total Commands: 22
• Prefixless Commands: Enabled
• Use \`${currentPrefix}help\` to see all commands.

__Use the dropdown menu below to explore categories.__

━━━━━━━━━━━━━━━━━━

## Categories

⚙️ : Info
🎵 : Music
👑 : Owner
🛡️ : Server
🔊 : Voice

━━━━━━━━━━━━━━━━━━`
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

        const select = new StringSelectMenuBuilder()
          .setCustomId('help_menu')
          .setPlaceholder('Select Main Category')
          .addOptions([
            {
              label: 'Info',
              description: 'Info Commands',
              value: 'info'
            },
            {
              label: 'Music',
              description: 'Music Commands',
              value: 'music'
            },
            {
              label: 'Owner',
              description: 'Owner Commands',
              value: 'owner'
            },
            {
              label: 'Server',
              description: 'Server Commands',
              value: 'server'
            },
            {
              label: 'Voice',
              description: 'Voice Moderation Commands',
              value: 'voice'
            }
          ]);

        const row1 = new ActionRowBuilder().addComponents(select);

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Invite')
            .setStyle(5)
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`),

          new ButtonBuilder()
            .setLabel('Support')
            .setStyle(5)
            .setURL(config.supportServer)
        );

        return message.reply({
          embeds: [helpEmbed],
          components: [row1, row2]
        });
      }




          
          if (command === 'vc') {
            const sub = args[0]?.toLowerCase();

            if (!sub) {
              return message.reply(`**Voice Moderation:**
• \`voice mute [user]\` - Mute a user (supports reply)
• \`voice unmute [user]\` - Unmute a user (supports reply)
• \`voice muteall\` - Mute everyone in your VC
• \`voice unmuteall\` - Unmute everyone in your VC
• \`voice kick [user]\` - Kick user from VC (supports reply)
• \`voice kickall\` - Kick everyone from your VC
• \`voice deafen [user]\` - Deafen a user (supports reply)
• \`voice undeafen [user]\` - Undeafen a user (supports reply)
• \`voice deafenall\` - Deafen everyone in your VC
• \`voice undeafenall\` - Undeafen everyone in your VC
• \`voice move [user] [vc]\` - Move user to VC (supports reply)
• \`voice moveall [target_vc] [source_vc]\` - Mass movement`);
            }

            if (!message.member.voice.channel) return message.reply(`${config.emojis.error} Join a voice channel first`);
            const userArg = args[1];
            const idArg = args[1];
            const vc = message.member.voice.channel;
            const target = message.mentions.members.first() || message.guild.members.cache.get(userArg);

            try {
              if (sub === 'mute' && target) {
                await target.voice.setMute(true);
                return message.reply(`Muted ${target.user.tag}`);
              }

              if (sub === 'unmute' && target) {
                await target.voice.setMute(false);
                return message.reply(`Unmuted ${target.user.tag}`);
              }

              if (sub === 'muteall') {
                const channel = message.guild.channels.cache.get(idArg) || vc;
                for (const [,member] of channel.members) await member.voice.setMute(true);
                return message.reply('Muted everyone in VC');
              }

              if (sub === 'unmuteall') {
                const channel = message.guild.channels.cache.get(idArg) || vc;
                for (const [,member] of channel.members) await member.voice.setMute(false);
                return message.reply('Unmuted everyone in VC');
              }

              if (sub === 'kick' && target) {
                await target.voice.disconnect();
                return message.reply(`Kicked ${target.user.tag} from VC`);
              }

              if (sub === 'kickall') {
                const channel = message.guild.channels.cache.get(idArg) || vc;
                for (const [,member] of channel.members) await member.voice.disconnect();
                return message.reply('Kicked everyone from VC');
              }

              if (sub === 'deafen' && target) {
                await target.voice.setDeaf(true);
                return message.reply(`Deafened ${target.user.tag}`);
              }

              if (sub === 'undeafen' && target) {
                await target.voice.setDeaf(false);
                return message.reply(`Undeafened ${target.user.tag}`);
              }

              if (sub === 'deafenall') {
                const channel = message.guild.channels.cache.get(idArg) || vc;
                for (const [,member] of channel.members) await member.voice.setDeaf(true);
                return message.reply('Deafened everyone in VC');
              }

              if (sub === 'undeafenall') {
                const channel = message.guild.channels.cache.get(idArg) || vc;
                for (const [,member] of channel.members) await member.voice.setDeaf(false);
                return message.reply('Undeafened everyone in VC');
              }

              if (sub === 'move' && target) {
                const channel = message.guild.channels.cache.get(args[2]);
                if (!channel) return message.reply('Provide target VC ID');
                await target.voice.setChannel(channel);
                return message.reply(`Moved ${target.user.tag}`);
              }

              if (sub === 'moveall') {
                const targetChannel = message.guild.channels.cache.get(args[1]);
                if (!targetChannel) return message.reply('Provide target VC ID');

                const movedCount = vc.members.size;

                for (const [, member] of vc.members) {
                  await member.voice.setChannel(targetChannel);
                }

                const { EmbedBuilder } = require('discord.js');

                const moveEmbed = new EmbedBuilder()
                  .setColor('#1e1f29')
                  .setAuthor({
                    name: message.author.username,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                  })
                  .setDescription(
                    `**${movedCount} Members Moved From 🔊${vc.name} to 🔊${targetChannel.name}**`
                  )
                  .setThumbnail(
                    message.author.displayAvatarURL({ dynamic: true, size: 1024 })
                  );

                return message.reply({ embeds: [moveEmbed] });
              }
            } catch (e) {
              console.error(e);
              return message.reply('VC moderation failed');
            }
          }


          if (command === 'play') {
            const query = args.join(' ');
            if (!query) return message.reply(`${config.emojis.error} Please provide a song name or URL`);

            if (!message.member.voice.channel) {
              return message.reply(`${config.emojis.error} You need to be in a voice channel`);
            }

            if (!isLavalinkConnected) {
              return message.reply(`${config.emojis.error} Lavalink is not connected. Music commands are unavailable.`);
            }

            try {
              let player = riffy.players.get(message.guild.id);

              if (!player) {
                player = riffy.createConnection({
                  guildId: message.guild.id,
                  voiceChannel: message.member.voice.channel.id,
                  textChannel: message.channel.id,
                  deaf: true
                });
              }

              const resolve = await riffy.resolve({ query, requester: message.author.id });

              if (!resolve || !resolve.tracks.length) {
                return message.reply(`${config.emojis.error} No results found`);
              }

              if (resolve.loadType === 'playlist') {
                for (const track of resolve.tracks) {
                  track.info.requester = message.author.id;
                  player.queue.add(track);
                }

                const container = createSimpleContainerNoButtons(
                  'Playlist Added',
                  `Added playlist **${resolve.playlistInfo.name}** (${resolve.tracks.length} tracks)`,
                  config.emojis.success
                );

                await message.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
              } else if (resolve.loadType === 'search' || resolve.loadType === 'track') {
                const track = resolve.tracks[0];
                track.info.requester = message.author.id;
                player.queue.add(track);

                const container = createNowPlayingContainer(player, track);
                await message.reply({
                  components: [container],
                  flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2
                });

              } else {
                return message.reply(`${config.emojis.error} No results found`);
              }

              if (!player.playing && !player.paused) player.play();
            } catch (error) {
              console.error('Play command error:', error);
              await message.reply(`${config.emojis.error} An error occurred while playing the song`);
            }
          }

          if (command === 'pause') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.pause(true);
            const container = createSimpleContainer('Paused', 'Playback paused', config.emojis.pause);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'resume') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.pause(false);
            const container = createSimpleContainer('Resumed', 'Playback resumed', config.emojis.play);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'skip') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.stop();
            const container = createSimpleContainer('Skipped', 'Skipped to next track', config.emojis.skip);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'stop') {
            if (seriousStopGuilds.has(message.guild.id)) {
              return message.reply("🔒 Serious Stop is active.");
            }
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.destroy();

            const container = createSimpleContainer(
              'Player Stopped',
              'Destroyed the queue and stopped the player.',
              config.emojis.success
            );

            await message.reply({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            });
          }

          if (command === 'volume') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const volume = parseInt(args[0]);
            if (isNaN(volume) || volume < 1 || volume > 200) {
              return message.reply(`${config.emojis.error} Please provide a volume between 1-200`);
            }

            player.setVolume(volume);
            const container = createSimpleContainer('Volume Set', `Volume set to ${volume}%`, config.emojis.volume);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'queue') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);

            if (player.queue.length === 0 && !player.current) {
              return message.reply(`${config.emojis.error} Queue is empty`);
            }

            const queueContainer = createQueueContainer(player, message.guild, message.author);
            await message.reply({ components: [queueContainer], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'nowplaying') {
            const player = riffy.players.get(message.guild.id);
            if (!player || !player.current) {
              return message.reply(`${config.emojis.error} Nothing is playing`);
            }

            const info = player.current.info ?? {};
            let thumbnail = info.artworkUrl || info.thumbnail || null;

            if (!thumbnail && info.uri && info.uri.includes('youtube.com')) {
              const videoId = info.uri.split('v=')[1]?.split('&')[0];
              if (videoId) {
                thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              }
            }

            if (!thumbnail && info.uri && info.uri.includes('youtu.be')) {
              const videoId = info.uri.split('youtu.be/')[1]?.split('?')[0];
              if (videoId) {
                thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              }
            }

            if (!thumbnail) {
              thumbnail = 'https://i.imgur.com/QYJfXQv.png';
            }

            const currentPosition = player.position || 0;
            const totalDuration = info.length || 0;
            const status = player.paused ? '⏸️ Paused' : '▶️ Playing';

            const description = `**[${info.title || 'Unknown Title'}](${info.uri || 'https://youtube.com'})**\n\n**Status:** ${status}\n**Current Duration:** ${formatTime(currentPosition)} / ${formatTime(totalDuration)}\n**Requested By:** <@${player.current.info.requester}>\n**Loop:** ${(!player.loop || player.loop === 'none') ? 'off' : player.loop}`;

            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## <a:1000024720:1504251449515704370> Now Playing\n${description}`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(thumbnail)
                      .setDescription(info.title || 'Song Thumbnail')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'shuffle') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }
            if (player.queue.length === 0) {
              return message.reply(`${config.emojis.error} Queue is empty`);
            }

            player.queue.shuffle();
            const container = createSimpleContainer('Shuffled', 'Shuffled the queue', config.emojis.shuffle);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'loop') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const mode = args[0]?.toLowerCase();
            if (!mode || !['off', 'track', 'queue'].includes(mode)) {
              return message.reply(`${config.emojis.error} Please specify: off, track, or queue`);
            }

            player.setLoop(mode);
            const container = createSimpleContainer('Loop Set', `Loop set to: ${mode}`, config.emojis.loop);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'remove') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const position = parseInt(args[0]) - 1;
            if (isNaN(position) || position < 0 || position >= player.queue.length) {
              return message.reply(`${config.emojis.error} Invalid position`);
            }

            const removed = player.queue.remove(position);
            const container = createSimpleContainer('Removed', `Removed: ${removed.info.title}`, config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'move') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            const from = parseInt(args[0]) - 1;
            const to = parseInt(args[1]) - 1;

            if (isNaN(from) || isNaN(to) || from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) {
              return message.reply(`${config.emojis.error} Invalid positions`);
            }

            const track = player.queue.remove(from);
            player.queue.splice(to, 0, track);
            const container = createSimpleContainer('Moved', `Moved: ${track.info.title}`, config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'clearqueue') {
            const player = riffy.players.get(message.guild.id);
            if (!player) return message.reply(`${config.emojis.error} No player found`);
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
              return message.reply(`${config.emojis.error} You need to be in the same voice channel`);
            }

            player.queue.clear();
            const container = createSimpleContainer('Queue Cleared', 'Cleared the queue', config.emojis.success);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === '247') {
            if (!message.member.voice.channel) {
              return message.reply(`${config.emojis.error} You need to be in a voice channel`);
            }

            if (queue247.has(message.guild.id)) {
              queue247.delete(message.guild.id);
              const container = createSimpleContainer('24/7 Disabled', '24/7 mode disabled', config.emojis.success);
              await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
              queue247.add(message.guild.id);

              let player = riffy.players.get(message.guild.id);
              if (!player) {
                riffy.createConnection({
                  guildId: message.guild.id,
                  voiceChannel: message.member.voice.channel.id,
                  textChannel: message.channel.id,
                  deaf: true
                });
              }

              const container = createSimpleContainer('24/7 Enabled', '24/7 mode enabled', config.emojis.success);
              await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
          }

          if (command === 'stats') {
            const statsContainer = createStatsContainer();
            await message.reply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'ping') {
            const container = createSimpleContainer('Pong!', `Latency: ${client.ws.ping}ms`, config.emojis.info);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'invite') {
            const invite = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## ${config.emojis.success} Invite Bot\n[Click here to invite me](${invite})`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(client.user.displayAvatarURL({ size: 1024 }))
                      .setDescription('Invite Bot')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              )
              .addActionRowComponents(
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setLabel('Invite Me')
                      .setStyle(ButtonStyle.Link)
                      .setURL(invite)
                  )
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          if (command === 'support') {
            const container = new ContainerBuilder()
              .addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(
                    new TextDisplayBuilder()
                      .setContent(`## ${config.emojis.info} Support Server\n[Join our support server](${config.supportServer})`)
                  )
                  .setThumbnailAccessory(
                    new ThumbnailBuilder()
                      .setURL(client.user.displayAvatarURL({ size: 1024 }))
                      .setDescription('Support Server')
                  )
              )
              .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
              )
              .addActionRowComponents(
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setLabel('Support')
                      .setStyle(ButtonStyle.Link)
                      .setURL(config.supportServer)
                  )
              );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          }

          
        });
      }

      client.login(config.token);


const OWNER_ID = process.env.OWNER_ID || config.ownerId || "YOUR_USER_ID";

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
delete require.cache[require.resolve("./prefix.json")];
  const currentPrefix = require("./prefix.json").prefix;

  if (message.content.startsWith(currentPrefix + "prefix")) {
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("❌ Administrator permission required.");
    }

    const args = message.content.split(" ").slice(1);
    const newPrefix = args[0];

    if (!newPrefix) {
      return message.reply("Usage: " + currentPrefix + "prefix <newprefix>");
    }

    fs.writeFileSync("./prefix.json", JSON.stringify({ prefix: newPrefix }, null, 2));

    return message.reply("✅ Prefix changed to: " + newPrefix);
  }
});


client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  delete require.cache[require.resolve("./prefix.json")];
  const currentPrefix = require("./prefix.json").prefix;

  if (
    message.content === `<@${client.user.id}>` ||
    message.content === `<@!${client.user.id}>`
  ) {

    const mentionContainer = new ContainerBuilder()
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(`## ${client.user.username}

> My Prefix for this Server is \`${currentPrefix}\` Use \`${currentPrefix}help\` to see all commands.`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(client.user.displayAvatarURL({ size: 1024 }))
              .setDescription('Bot Avatar')
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

    return message.reply({
      components: [mentionContainer],
      flags: MessageFlags.IsComponentsV2
    });
  }
});



// ===== TEAM GBL Voice Moderation =====
client.on('messageCreate', async(message)=>{
if(message.author.bot || !message.guild) return;
delete require.cache[require.resolve("./prefix.json")];
const p=require("./prefix.json").prefix;
if(!message.content.startsWith(p+"voice")) return;

const args=message.content.split(" ");
const cmd=args[1];
const member=message.mentions.members.first();

try{
if(cmd==="mute" && member){await member.voice.setMute(true); return message.reply("✅ User muted");}
if(cmd==="unmute" && member){await member.voice.setMute(false); return message.reply("✅ User unmuted");}
if(cmd==="deafen" && member){await member.voice.setDeaf(true); return message.reply("✅ User deafened");}
if(cmd==="undeafen" && member){await member.voice.setDeaf(false); return message.reply("✅ User undeafened");}
if(cmd==="kick" && member){await member.voice.disconnect(); return message.reply("✅ User disconnected");}
if(cmd==="pull" && member && message.member.voice.channel){await member.voice.setChannel(message.member.voice.channel); return message.reply("✅ User pulled");}
if(cmd==="muteall" && message.member.voice.channel){
for (const [,m] of message.member.voice.channel.members) { if(!m.user.bot) await m.voice.setMute(true);}
return message.reply("✅ All muted");
}
if(cmd==="deafenall" && message.member.voice.channel){
for (const [,m] of message.member.voice.channel.members) { if(!m.user.bot) await m.voice.setDeaf(true);}
return message.reply("✅ All deafened");
}
if(cmd==="kickall" && message.member.voice.channel){
for (const [,m] of message.member.voice.channel.members) { if(!m.user.bot) await m.voice.disconnect();}
return message.reply("✅ All disconnected");
}
}catch(e){message.reply("❌ "+e.message)}
});
