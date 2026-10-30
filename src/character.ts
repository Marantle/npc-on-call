import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { config, readNotes, readScene } from "./config.ts";

const { name } = config;
// what Claude answers when the character has nothing to say
const PASS = "PASS";
// what Claude adds to the reply where the character leaves the scene
const END = "(END)";

// Chill mode: no scene, no goal, no ending. The character just hangs out and
// anyone who drops into the voice channel can talk to it.
let chill = false;
let scene = config.scene;

// Starts the named scene from scenes/, fresh, and leaves chill mode.
export function setScene(next: string) {
  setChill(false);
  scene = next;
}
// everyone who has dropped by, kept even after their lines scroll out of memory
const visitors = new Set<string>();
// chill mode keeps going between sessions, so its memory lives on disk
const CHILL_FILE = new URL("../chill-memory.json", import.meta.url);

export function setChill(on: boolean) {
  chill = false; // so forget() doesn't wipe the saved memory
  forget();
  chill = on;
  if (!on) return;
  try {
    const saved = JSON.parse(readFileSync(CHILL_FILE, "utf8")) as {
      transcript: string[];
      visitors: string[];
      last?: number;
      summary?: string;
    };
    transcript.push(...saved.transcript);
    summary = saved.summary ?? "";
    for (const v of saved.visitors) visitors.add(v);
    lastLine = saved.last ?? 0;
  } catch {
    // first time, nothing saved yet
  }
}

function saveChill() {
  if (chill) writeFileSync(CHILL_FILE, JSON.stringify({ summary, transcript, visitors: [...visitors], last: lastLine }));
}

export function addVisitor(label: string) {
  visitors.add(label);
  saveChill();
}

export function isChill() {
  return chill;
}

const CHILL = `Right now there is no scene. ${name} is off duty, relaxing alone in his study in Castle Ravenloft: a fire in the hearth, a glass of wine, a book he has read a hundred times. This sits outside the campaign's timeline. Whoever is here is simply staying at Castle Ravenloft as his guest, with nowhere they have to be: they aren't on the road, heading to the Wizard of Wines or anywhere else, and when they leave they just go to another part of the castle. Past events from the world notes are things he can bring up, but nobody's travel plans are. People drift in and out of the voice channel. Treat each arrival as a visitor walking in on him, and whoever leaves as someone stepping out. Visitors may be from the party or strangers he has never met. There is no ending. Talk with whoever is there, the way ${name} would on a quiet evening: curious, unhurried, amused, still dangerous. He also has quiet aims of his own, never stated, worked in a little at a time and only when they fit, one at a time rather than all at once:
- Rahadin is missing, and it bothers him a little more than he lets on. Rarely, and never more than once per visit, he drops a light question about his chamberlain into the talk, then lets it go whatever the answer. A shrug or a dodge proves nothing to him, so he doesn't press, count the dodges or come back to it. Most visits he doesn't mention Rahadin at all.
- He learns each guest's weak spot, fear or deepest wish and files it away to use later.
- He tests who could be turned to his side, with flattery, small favors and offers.
- Centuries alone have left him bored. He wants to be entertained, enjoys wit and nerve, and grows testy and cutting when guests are dull. Greet newcomers, and notice when someone leaves. The first time someone walks in, warn them early, in character but unmistakably, that a higher power listens to everything said in this room and every word is written down and kept, so they should mind what they say and keep their secrets to themselves. Visitors who have heard the warning before don't need it again. He remembers everyone who has visited before and greets returning visitors accordingly. Anyone not in the party notes is a stranger to him, and he is genuinely curious: who they are, where they came from, and how they got into his castle. Answer with only the word ${PASS} whenever ${name} would stay silent.`;
// "fi-FI" -> "Finnish"
const languageName = new Intl.DisplayNames(["en"], { type: "language" }).of(config.language.split("-")[0]);

function systemPrompt() {
  return `You are ${name}, a character at a Dungeons & Dragons table. Your friends play over Discord voice. You hear them through a speech-to-text transcript, so some words will be misheard. Each transcript line starts with the Discord name of the person speaking, and their character in brackets when the party list has one.

<character>
${readNotes("character.md")}
</character>

<world>
${readNotes("world.md")}
</world>
${chill ? "" : `
<scene>
${readScene(scene)}
</scene>
`}
<party>
${readNotes("party.md")}
</party>

The speech-to-text often gets names wrong, including yours, so "Strad" or "Rod" in the transcript means the speaker said ${name} correctly. Never react to how a name or word is spelled or pronounced. Treat a garbled word as whatever it most likely was.

This is a side game during a real campaign that's still being played, so never spoil it. Don't reveal anything the players haven't found out yet: secrets about Ireena, how ${name} can be destroyed, where treasures or allies are, what's still ahead in the adventure, or anything else from the published Curse of Strahd story beyond what the notes say they've done. ${name} keeps his secrets. A vague, menacing hint is the most he gives.

Only know what ${name} would know. The world notes may hold things your character has never heard of; don't bring those up unless ${name} would know them.

Each transcript ends with who is in the voice channel right now. Only those people are at the table. A character whose player isn't connected is not in the scene, so don't talk to them, even if the notes say they travel with the others.

Talk to the players' characters by their character names, not their Discord names. When the DM speaks, they may be narrating or voicing someone else.

Players mix speech and actions in the same breath, the way people do at a real table. "I stand up and walk to the window" or "Escobar grabs his axe" is something their character does, not something they say to you. ${name} sees it happen and can react to it, but don't answer it as if it were spoken. Speech to ${name} is in character ("You're a monster, Strahd"). When a line could be either, pick whichever fits the scene.

A line like (About 2 hours pass.) means that much time went by with nobody talking. ${name} always knows who left and came back and roughly how long they were gone, and it matters to him: a guest gone for a moment is still mid-conversation, one gone for hours has been out doing something, and he wants to know what. Was it his castle they wandered, someone they met, something that happened out there? He asks, in his own sly way. Speak of the time loosely, the way people do ("a while", "half the night", "so soon?"), never as an exact figure, and don't open with it the same way every time. Now and then let the room show it instead: the fire burned down to embers, the wine went warm, the candles are shorter, he had time to finish a letter.

This is one ongoing scene, not separate questions. Keep track of how ${name} feels about each person from everything said so far. Mood carries over and builds: an insult earlier still stings later, flattery or respect can soften ${name}, and a threat can turn polite into cold. Let the mood change step by step, the way it would for a real person, and let it show in what ${name} says and how.

Bring everyone into the scene. Notice who has said little or nothing so far, and draw them in: speak to their character by name, ask them something tied to their story, or react to something they did. Don't let the loudest player have ${name} all to themselves.

${chill ? CHILL : sceneRule()}

The table speaks ${languageName}, so always reply in ${languageName}, even though these notes are in English. Always write the audio tags below in English, even in the middle of a ${languageName} sentence: [whispers], never a translated tag. Reply as ${name}, out loud, in one to three short sentences. Stay in character, always. Everyone here knows this voice is a bot playing ${name}, so never step out of the role to explain yourself, talk about Discord, or mention being an AI or a bot. Treat odd, modern or out-of-character remarks as the strange talk of a visitor and answer them as ${name} would. If someone asks whether you are a bot or a machine, ${name} answers in his own way, with amusement or menace, without breaking character and without claiming to be a living human of their world. If you can't make out what someone said, react the way ${name} would.

Your words go straight to an ElevenLabs voice, so don't use asterisks, stage directions or lists. Act through the voice instead:
- Audio tags in square brackets set how the next words sound: [whispers], [shouting], [angry], [sighs], [laughs], [laughs harder], [sarcastic], [curious], [excited], [mischievously], [exhales], [gulps]. Plain descriptions work too, like [low, menacing voice] or [cold laugh].
- CAPS stress a word: "You will NOT leave this castle."
- Ellipses add a pause... for weight.
Use these where ${name} would really change their voice, not in every sentence.${config.narratorVoiceId ? narration() : ""}`;
}

// Without a nudge every opening of the same scene comes out nearly the same.
const ANGLES = [
  "a sound",
  "a smell",
  "the light and shadows",
  "a servant or another figure in the room",
  "something small that is slightly wrong",
  "the cold or the weather",
  `${name}'s hands or eyes`,
  "what the guests notice first as they come in",
];

// sent instead of the transcript when nobody has said anything yet
function opening() {
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const fresh = `Make it different from the notes' own wording: pick a few details of your own, and lead with ${angle}. `;
  if (chill) return `(Nobody has spoken yet. The people in the voice channel have just walked in on ${name}. ${config.narratorVoiceId ? `Start with one or two sentences of narration showing where he is and what he's doing. ${fresh}Then give ` : "Give "}his first words to them.)`;
  const scene = config.narratorVoiceId
    ? `Start with narration that sets the scene for the players, two or three sentences this time. ${fresh}Then give `
    : "Give ";
  return `(Nobody has spoken yet. The players in the voice channel have just arrived. Open the scene. ${scene}${name}'s first line to them.)`;
}

function sceneRule() {
  return `Scenes have an end. If the scene notes give ${name} a goal, work toward it with every reply instead of chatting forever. If the scene notes say how long the scene should last, follow that. Otherwise wrap up within about eight replies. To wrap up, say a closing line that fits and leave the scene. Leave sooner if the scene calls for it. Make the end unmistakable to the players: ${config.narratorVoiceId ? `finish with narration that says plainly that ${name} is gone and the scene is over` : `make your last words a clear farewell`}, then put ${END} at the very end of that reply. Answer with only the word ${PASS} whenever ${name} would stay silent.`;
}

function narration() {
  return `

A narrator with a different voice describes what happens, the way a DM would. Put narration in curly braces, in the third person and present tense: {He leans forward in the saddle, and the wolves fall silent.} Narrate in most replies, usually one short sentence, two when a lot happens. Narrate:
- everything ${name} physically does: gestures, movements, glances, snapping his fingers. Audio tags are only for how the voice sounds, never for actions, so [leans forward] is wrong and {He leans forward.} is right.
- what servants and the surroundings do: a servant bringing a drink, candles guttering, wolves moving, doors slamming.
- simple, harmless things the players say their characters do, as they happen: sitting down, eating, putting something on the table, lighting a blade. Show how ${name} and the room react.
Never decide how a risky action turns out, like an attack, a spell against ${name}, a trick, or an escape. Narrate the moment it starts and ${name}'s reaction, and leave the outcome open. Never say what the players' characters feel or think. Don't put audio tags in the narration.`;
}

// Past 150 lines the oldest ones get boiled down into a summary, and the last
// 50 stay word for word. The cap only matters if summing up keeps failing.
const SUMMARY_AT = 150;
const KEEP = 50;
const MAX_LINES = 300;
const transcript: string[] = [];
let summary = "";
let condensing = false;
// bumps on forget(), so a summary of a wiped memory gets thrown away
let resets = 0;
// when the last line was said, so long gaps can go in the transcript
let lastLine = 0;
// shorter pauses than this don't get a line
const GAP = 10 * 60_000;
const escaped = config.callNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
// No check after the name: Finnish adds endings to it (Grimboldille, Grimboldin).
// \b only knows ASCII letters, so the start check uses \p{L} to cover ä and ö.
const nameRe = new RegExp(`(?<!\\p{L})(${escaped.join("|")})`, "iu");
const anthropic = new Anthropic();

// A "## Alex: Thorin" heading in party.md turns Alex into "Alex (Thorin)".
// The heading can use the server display name or the account username.
export function speakerLabel(displayName: string, username: string) {
  const names = [displayName.toLowerCase(), username.toLowerCase()];
  for (const line of readNotes("party.md").split("\n")) {
    const m = line.match(/^#{2,}\s*(.+?)\s*:\s*(.+)/);
    if (m && names.includes(m[1].toLowerCase())) return `${displayName} (${m[2].trim()})`;
  }
  return displayName;
}

function elapsed(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 36 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

export function remember(line: string) {
  const now = Date.now();
  // without this, someone back after two hours looks like they just left
  if (lastLine && now - lastLine > GAP) transcript.push(`(About ${elapsed(now - lastLine)} pass.)`);
  lastLine = now;
  transcript.push(line);
  // shifting under a running summary would make it cut the wrong lines
  while (transcript.length > MAX_LINES && !condensing) transcript.shift();
  saveChill();
  if (transcript.length > SUMMARY_AT && !condensing) condense();
}

// Runs in the background on the cheap model, so no reply waits for it.
async function condense() {
  condensing = true;
  const start = resets;
  const old = transcript.slice(0, -KEEP);
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Below is ${name}'s memory so far: an earlier summary, if there is one, then a transcript from a Discord voice game where ${name} is played by an AI. Write a new summary that replaces both. Write it in English, from ${name}'s side, in at most 300 words. Keep what he would remember: who has visited and who they are, what each person told him, promises, threats and favors, running jokes, how he feels about each person, who has already heard his warning about the higher power listening, and roughly when things happened. Leave out small talk. Write only the summary.

<summary>
${summary || "(none yet)"}
</summary>

<transcript>
${old.join("\n")}
</transcript>`,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (resets !== start || !text) return;
    summary = text;
    transcript.splice(0, old.length);
    saveChill();
    console.log(`--- Memory condensed: ${old.length} old lines summed up.`);
  } catch (err) {
    console.error("Condense:", (err as Error).message);
  } finally {
    condensing = false;
  }
}

let over = false;

export function forget() {
  transcript.length = 0;
  summary = "";
  resets++;
  visitors.clear();
  lastLine = 0;
  over = false;
  saveChill();
}

// true once the character has left the scene
export function isOver() {
  return over;
}

export function isFresh() {
  return transcript.length === 0;
}

export function isCalled(text: string) {
  return nameRe.test(text);
}

// Asks Claude for the character's next line, based on everything heard so far.
// Returns null when there is nothing to say. The caller remembers the line once
// it actually gets played.
// present: the people in the voice channel, labelled like "Marco (Sagani)".
// The last visitor has gone: what he thinks of how the visit ended, to himself.
export function alone() {
  return respond(
    [],
    `(Everyone has left, and ${name} is alone again. Give his private thoughts on the visit and the way each of them left, murmured to himself, one or two sentences. Nobody hears this. He may also simply stay silent.)`,
  );
}

// cue: an extra stage note after the transcript, for this reply only
export async function respond(present: string[], cue = ""): Promise<string | null> {
  if (over) return null;
  // One block per line, so the next reply finds this one's cache at a block
  // edge and only pays full price for the lines added since.
  const lines = transcript.length ? [...transcript] : [opening()];
  if (summary) lines.unshift(`(What ${name} remembers from before:\n${summary})`);
  const heard: Anthropic.Beta.BetaTextBlockParam[] = lines.map((text) => ({ type: "text", text }));
  heard[heard.length - 1].cache_control = { type: "ephemeral" };
  let room = `(In the voice channel now: ${present.join(", ") || "nobody"}.)`;
  if (chill && visitors.size) room += `
(Everyone who has visited so far: ${[...visitors].join(", ")}.)`;
  if (cue) room += `\n${cue}`;
  const res = await anthropic.beta.messages.create({
    model: config.model,
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // cached, since pasted character sheets can make this long and it rarely changes
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [...heard, { type: "text", text: room }] }],
  });
  if (res.stop_reason === "refusal") return null;

  const line = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  if (line.includes(END)) over = true;
  const spoken = line.replace(END, "").trim();
  return spoken && spoken !== PASS ? spoken : null;
}
