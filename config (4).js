// config.js
module.exports = {
  token: process.env.DISCORD_TOKEN,
  prefix: ",",
  enablePrefix: true,
  ownerId: "1379140565589033040",
  prefixlessUsers: [
    "1379140565589033040", // owner
    "888312998467354694",
    "1342904243488817163",
  ],
  supportServer: "https://discord.gg/5rFpMjmbX",

  activity: {
    name: "/help",
    type: "LISTENING" // PLAYING, LISTENING, WATCHING, STREAMING, COMPETING
  },

  express: {
    enabled: true,
    port: 5000
  },

  emojis: {
    play: "▶️",
    pause: "⏸️",
    stop: "⏹️",
    skip: "⏭️",
    queue: "📜",
    music: "🎵",
    loop: "🔁",
    shuffle: "🔀",
    volume: "🔊",
    success: "✅",
    error: "❌",
    info: "ℹ️"
  },

  aliases: {
    play: ['p'],
    pause: ['pa'],
    resume: ['r', 'res'],
    skip: ['s', 'next'],
    stop: ['st', 'leave', 'disconnect'],
    volume: ['v', 'vol'],
    queue: ['q'],
    nowplaying: ['np', 'current'],
    shuffle: ['sh', 'mix'],
    loop: ['l', 'repeat'],
    remove: ['rm', 'delete'],
    move: ['mv'],
    clearqueue: ['cq', 'clear'],
    '247': ['24/7', 'stay'],
    stats: ['status', 'info'],
    ping: ['latency'],
    invite: ['inv'],
    support: ['server'],
    help: ['h', 'commands', 'cmd']
  },

  lavalink: {
    nodes: [
      {
        name: "Main Node",
        host: "lava-v4.ajieblogs.eu.org",
        port: 80,
        password: "https://dsc.gg/ajidevserver",
        secure: false
      }
    ]
  }
};
