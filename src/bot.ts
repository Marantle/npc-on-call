import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { Client, GatewayIntentBits, type Guild, type Message, type VoiceBasedChannel } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
} from "@discordjs/voice";
import OpusScript from "opusscript";
import { config, sceneExists } from "./config.ts";
import { RATE, BYTES_PER_SECOND } from "./audio.ts";
import { transcribe, synthesize } from "./speech.ts";
import {
  remember,
  forget,
  isCalled,
  isFresh,
  isOver,
  respond,
  speakerLabel,
  setChill,
  setScene,
  isChill,
  addVisitor,
  alone,
} from "./character.ts";

// HH:MM:SS in front of every log line
for (const level of ["log", "error"] as const) {
  const print = console[level];
  console[level] = (...args: unknown[]) => print(new Date().toTimeString().slice(0, 8), ...args);
}

const player = createAudioPlayer();
player.on("error", (err) => console.error("Player:", err.message));

let busy = false;
// bumps on every mode or scene switch, so replies from before it get dropped
let epoch = 0;
// cancels voicing that's still running for a reply nobody wants anymore
let aborter = new AbortController();

// Cuts the character off mid-line and throws away any reply still being made.
function interrupt() {
  epoch++;
  aborter.abort();
  aborter = new AbortController();
  player.stop();
  busy = false;
  wanted = false;
  clearTimeout(timer);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let voiceChannel: VoiceBasedChannel | undefined;

function present() {
  return voiceChannel?.members.filter((m) => !m.user.bot).map((m) => speakerLabel(m.displayName, m.user.username)) ?? [];
}

function join(channel: VoiceBasedChannel) {
  voiceChannel = channel;
  // Moving an existing connection keeps the old channel in its join config,
  // and the reconnect that follows a move takes it right back there.
  const old = getVoiceConnection(channel.guild.id);
  const moving = old?.joinConfig.channelId !== channel.id;
  if (old && moving) old.destroy();
  const conn = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  conn.subscribe(player);
  // the same channel again hands back the same connection, already wired up
  if (moving) {
    conn.receiver.speaking.on("start", (userId) => listen(conn, userId, channel.guild));
    // Discord's voice servers hiccup now and then (a 522 once). Unhandled,
    // that kills the whole bot; handled, the connection tries again.
    conn.on("error", (err) => console.error("Voice connection:", err.message));
  }
  console.log(`Joined ${channel.name}.`);
  // a fresh scene opens itself, so nobody has to speak first
  entersState(conn, VoiceConnectionStatus.Ready, 20_000)
    .then(() => {
      if ((isFresh() || isChill()) && !busy) reply();
    })
    .catch(() => console.error("Voice connection never got ready."));
}

// A command typed in a voice channel's own chat means that channel.
// Anywhere else it means the voice channel the typer is sitting in.
function targetChannel(msg: Message<true>) {
  return msg.channel.isVoiceBased() ? msg.channel : (msg.member?.voice.channel ?? undefined);
}

// channel: where the command points, if anywhere. Without one he stays put.
const commands: Record<string, (guild: Guild, channel?: VoiceBasedChannel) => void> = {
  join: (_guild, channel) => {
    if (channel) join(channel);
    else console.log("join: which channel? You're not in one, and none was named.");
  },
  leave: (guild) => {
    getVoiceConnection(guild.id)?.destroy();
  },
  chill: (guild, channel) => {
    interrupt();
    setChill(!isChill());
    const moving = channel && channel.id !== voiceChannel?.id;
    if (moving) join(channel);
    if (isChill()) {
      for (const label of present()) addVisitor(label);
      if (!isFresh()) remember(`(Later. ${config.name} is back in his study, and the people in the voice channel walk in.)`);
      console.log("--- Chill mode on.");
    } else {
      console.log("--- Chill mode off, back to the scene.");
    }
    if (!moving && getVoiceConnection(guild.id)) reply();
  },
  forget: (guild) => {
    interrupt();
    forget();
    console.log("--- Memory wiped, new scene.");
    if (getVoiceConnection(guild.id)) reply();
  },
};

// false when the word is neither a command nor a scene
function run(word: string, guild: Guild, channel?: VoiceBasedChannel) {
  if (commands[word]) commands[word](guild, channel);
  else if (sceneExists(word)) startScene(guild, word, channel);
  else return false;
  return true;
}

client.on("error", (err) => console.error("Discord:", err.message));

client.on("messageCreate", (msg) => {
  if (msg.author.bot || !msg.inGuild() || !msg.content.startsWith("!")) return;
  run(msg.content.slice(1), msg.guild, targetChannel(msg));
});

// "dinner" plays scenes/dinner.md from the start
function startScene(guild: Guild, scene: string, channel?: VoiceBasedChannel) {
  interrupt();
  setScene(scene);
  console.log(`--- Scene: ${scene}.`);
  if (channel && channel.id !== voiceChannel?.id) join(channel);
  else if (getVoiceConnection(guild.id)) reply();
}

// In the order Discord shows them, which is what the numbers in "channels" use.
function voiceChannels() {
  return client.guilds.cache.flatMap((guild) =>
    guild.channels.cache
      .filter((c): c is VoiceBasedChannel => c.isVoiceBased())
      .sorted((a, b) => (a.parent?.position ?? -1) - (b.parent?.position ?? -1) || a.position - b.position),
  ).map((c) => c);
}

// "2" is the second channel in the list, "dnd" the one called dnd (or the
// first one whose name starts with it, then the first that contains it).
function findChannel(arg: string) {
  const all = voiceChannels();
  if (/^\d+$/.test(arg)) return all[Number(arg) - 1];
  const name = arg.toLowerCase();
  return (
    all.find((c) => c.name.toLowerCase() === name) ??
    all.find((c) => c.name.toLowerCase().startsWith(name)) ??
    all.find((c) => c.name.toLowerCase().includes(name))
  );
}

// Same commands typed in this terminal, without the !, plus a channel number
// or name: "chill 1", "dinner dnd", "leave".
const terminal = createInterface({ input: process.stdin });
terminal.on("line", (line) => {
  const [word, ...rest] = line.trim().toLowerCase().split(/\s+/);
  if (!word) return;
  if (word === "channels") {
    voiceChannels().forEach((c, i) => {
      const people = c.members.filter((m) => !m.user.bot).size;
      console.log(`${i + 1}. ${c.name}${people ? ` (${people} in)` : ""}${c.id === voiceChannel?.id ? " <- here" : ""}`);
    });
    return;
  }
  const arg = rest.join(" ");
  const channel = arg ? findChannel(arg) : undefined;
  if (arg && !channel) {
    console.log(`No voice channel matches "${arg}". Type channels to see the list.`);
    return;
  }
  const guild = channel?.guild ?? voiceChannel?.guild ?? client.guilds.cache.first();
  if (!guild) console.log("Not logged in yet.");
  else if (!run(word, guild, channel)) console.log("Commands: channels, join, leave, chill, forget, or a scene name. Add a channel number or name.");
});

// Solo and chill mode: the character takes its turn once nobody has sent any
// voice for this long and every line is transcribed. In a scene with a group
// it answers as soon as someone calls it by name. Also ends each recording.
const SILENCE = 500;
let lastSound = 0;

function waitsForSilence() {
  return config.solo || isChill();
}

let wanted = false; // someone said something the character should answer
let active = 0; // lines still being recorded or transcribed
let turn = 0; // bumps whenever anyone starts talking
let timer: NodeJS.Timeout | undefined;

function schedule() {
  clearTimeout(timer);
  if (!wanted || busy) return;
  // an empty room gets his private thoughts from muse() instead
  if (isChill() && !present().length) {
    wanted = false;
    return;
  }
  if (!waitsForSilence()) reply();
  else if (active === 0) timer = setTimeout(reply, Math.max(0, lastSound + SILENCE - Date.now()));
}

// One subscription per person per sentence. Discord fires "start" a lot while
// someone talks, so skip people we're already recording.
function listen(conn: VoiceConnection, userId: string, guild: Guild) {
  if (conn.receiver.subscriptions.has(userId)) return;

  active++;
  turn++;
  clearTimeout(timer);
  // In solo mode talking over the character shuts it up. With a group, side
  // chatter would cut it off all the time, so it finishes its line.
  if (config.solo && player.state.status === AudioPlayerStatus.Playing) player.stop();

  const opus = conn.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE },
  });
  // Decode packet by packet: a stream decoder dies on the first bad packet
  // (they turn up right after joining) and takes the whole bot down with it.
  const decoder = new OpusScript(RATE, 2);
  const chunks: Buffer[] = [];
  opus.on("data", (packet: Buffer) => {
    lastSound = Date.now();
    try {
      chunks.push(decoder.decode(packet));
    } catch {
      // skip it, one lost 20 ms frame doesn't matter
    }
  });
  opus.on("error", (err) => console.error("Voice receive:", err.message));
  opus.once("close", async () => {
    decoder.delete();
    const audio = Buffer.concat(chunks);
    try {
      // under half a second is a cough or a key click
      if (audio.length < BYTES_PER_SECOND / 2) return;
      const text = await transcribe(audio);
      const member = guild.members.cache.get(userId);
      if (text) heard(speakerLabel(member?.displayName ?? "Someone", member?.user.username ?? ""), text);
    } catch (err) {
      console.error("Transcribe:", (err as Error).message);
    } finally {
      active--;
      schedule();
    }
  });
}

function heard(speaker: string, text: string) {
  console.log(`${speaker}: ${text}`);
  remember(`${speaker}: ${text}`);
  if (isOver()) return;
  if (waitsForSilence() || isCalled(text)) wanted = true;
}

async function reply() {
  busy = true;
  wanted = false;
  const startTurn = turn;
  const startEpoch = epoch;
  try {
    const line = await respond(present());
    if (!line) return;
    const audio = await synthesize(line, aborter.signal);
    if (epoch !== startEpoch) return;
    // Someone spoke while Claude was thinking, so this answer is stale. Wait
    // for them to finish and answer everything together.
    if (waitsForSilence() && turn !== startTurn) {
      wanted = true;
      return;
    }
    // they left while he was thinking
    if (isChill() && !present().length) return;
    console.log(`${config.name}: ${line}`);
    remember(`${config.name}: ${line}`);
    player.play(createAudioResource(Readable.from([audio]), { inputType: StreamType.Raw }));
    if (isOver()) console.log(`--- ${config.name} has left the scene. Type !forget in Discord to start a new one.`);
  } catch (err) {
    if (epoch === startEpoch) console.error("Reply:", (err as Error).message);
  } finally {
    // after a switch the new reply owns busy, so leave it alone
    if (epoch === startEpoch) {
      busy = false;
      schedule();
    }
  }
}

// In chill mode people walking in and out of the channel are visitors.
client.on("voiceStateUpdate", (before, after) => {
  const member = after.member;
  if (!isChill() || !voiceChannel || !member || member.user.bot) return;
  const label = speakerLabel(member.displayName, member.user.username);
  if (after.channelId === voiceChannel.id && before.channelId !== voiceChannel.id) {
    console.log(`${label} walks in.`);
    addVisitor(label);
    remember(`(${label} walks in.)`);
    // let them speak first, but if nobody says anything he takes the lead
    const arrived = Date.now();
    setTimeout(() => {
      if (!isChill() || lastSound > arrived) return;
      wanted = true;
      schedule();
    }, 5000);
  } else if (before.channelId === voiceChannel.id && after.channelId !== voiceChannel.id) {
    // Their goodbye can still be on its way through speech to text, so the
    // leaving goes into memory after it, not before.
    whenTranscribed(() => {
      console.log(`${label} leaves.`);
      remember(`(${label} leaves.)`);
      // the last one out: give it a moment in case they pop right back
      if (!present().length) setTimeout(muse, 3000);
    });
  }
});

function whenTranscribed(then: () => void) {
  if (active) setTimeout(() => whenTranscribed(then), 200);
  else then();
}

// Nobody's there to hear it, so it skips the voice and only goes into his
// memory. Whoever comes in next meets the mood he was left in.
async function muse() {
  if (!isChill() || present().length) return;
  // a reply still on its way, wait for it so he doesn't talk over himself
  if (busy) {
    setTimeout(muse, 500);
    return;
  }
  const startEpoch = epoch;
  try {
    const line = await alone();
    if (!line || epoch !== startEpoch || present().length) return;
    console.log(`${config.name} (alone): ${line}`);
    remember(`${config.name} (alone, to himself): ${line}`);
  } catch (err) {
    console.error("Muse:", (err as Error).message);
  }
}

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}. Type channels here, then chill 1 or dinner 1. Or !chill in Discord.`);
});
// Ctrl+C: leave voice and log out first, or Discord shows the bot in the
// channel until it times out.
async function quit() {
  for (const guild of client.guilds.cache.values()) getVoiceConnection(guild.id)?.destroy();
  await client.destroy();
  process.exit(0);
}
process.on("SIGINT", quit);
// while the terminal reads commands, Ctrl+C lands here instead
terminal.on("SIGINT", quit);

client.login(config.discordToken);
