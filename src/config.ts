import { existsSync, readFileSync } from "node:fs";

process.loadEnvFile();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is missing from .env`);
  return value;
}

const name = required("CHARACTER_NAME");

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  solo: process.env.SOLO_MODE === "true",
  azureKey: required("AZURE_SPEECH_KEY"),
  azureRegion: required("AZURE_SPEECH_REGION"),
  name,
  // speech to text can mangle fantasy names, so allow a few spellings
  callNames: [name, ...(process.env.CALL_NAMES ?? "").split(",")].map((s) => s.trim()).filter(Boolean),
  model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  language: process.env.SPEECH_LANGUAGE || "en-US",
  elevenLabsKey: required("ELEVENLABS_API_KEY"),
  voiceId: required("ELEVENLABS_VOICE_ID"),
  narratorVoiceId: process.env.NARRATOR_VOICE_ID || undefined,
  // the scene that plays when the bot starts, a file in scenes/
  scene: process.env.SCENE || "dinner",
};

// the Anthropic SDK reads ANTHROPIC_API_KEY itself, this just fails early
required("ANTHROPIC_API_KEY");

// Read on every reply, so edits to these files work without a restart.
// world.md and party.md are your own and stay out of git, so a fresh copy
// runs on the examples until you write them.
export function readNotes(file: "character.md" | "world.md" | "party.md") {
  const own = new URL(`../${file}`, import.meta.url);
  return readFileSync(existsSync(own) ? own : new URL(`../${file.replace(".md", ".example.md")}`, import.meta.url), "utf8");
}

// Scenes live in scenes/<name>.md, and "!<name>" starts one.
function sceneFile(scene: string) {
  return new URL(`../scenes/${scene}.md`, import.meta.url);
}

export function sceneExists(scene: string) {
  return /^[\w-]+$/.test(scene) && existsSync(sceneFile(scene));
}

export function readScene(scene: string) {
  return readFileSync(sceneFile(scene), "utf8");
}
