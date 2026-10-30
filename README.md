# D&D voice bot

A character that sits in your Discord voice channel, listens to the table and
talks back out loud. It can play a scene with a goal and an ending, or just
hang around between sessions so anyone who drops in can chat with it.

Azure Speech turns what you say into text, Claude writes the reply in
character, and ElevenLabs reads it out loud. An optional second voice
narrates what the character does, the way a DM would.

## Setup

1. Make the Discord bot. Go to https://discord.com/developers/applications,
   click New Application, then open the Bot page.
   - Click Reset Token and copy the token.
   - Turn on Message Content Intent.
   - Open OAuth2, pick the `bot` scope, and tick View Channels, Send
     Messages, Connect and Speak. Open the link it gives you and add the bot
     to your server.
2. Get an Anthropic key at https://console.anthropic.com. Set a monthly
   spend limit there too.
3. Make an Azure Speech resource at https://portal.azure.com. Search for
   Speech, create one, and pick the Free F0 pricing tier. When it's done,
   open Keys and Endpoint and copy Key 1 and the Location/Region.
4. Get an ElevenLabs key at https://elevenlabs.io under API Keys. Pick a
   voice for the character in the Voice Library and copy its voice ID. Pick
   a second one for the narrator if you want one.
5. Copy `.env.example` to `.env` and fill it in.
6. Write your character in `character.md`, and put its name in `.env`.
7. Copy `world.example.md` to `world.md` and `party.example.md` to
   `party.md`, then fill them in: the setting and the story so far, and who
   plays which character. Both stay out of git, so your campaign and your
   friends' names stay on your machine.

You can edit the notes and the scenes while the bot runs. It reads them again
before every reply.

## Run it

```
npm start
```

The bot logs in and waits. Tell it where to go, either in Discord or in the
terminal.

In any Discord text channel, type:

- `!join` brings the character into your voice channel.
- `!dinner` (or the name of any file in `scenes/`) starts that scene from the
  top.
- `!chill` switches chill mode on or off.
- `!forget` wipes what it heard so far.
- `!leave` sends it away.

A command typed in a voice channel's own chat means that channel. Anywhere
else it means the voice channel you're sitting in.

In the terminal, type the same commands without the `!`, plus a channel:

- `channels` lists the voice channels with a number for each.
- `chill 3` or `chill dnd` puts the character in that channel in chill mode.
  The name can be the start of it, or any part.
- `dinner dnd`, `join 1`, `leave`, `forget` work the same way.

The terminal also shows everything the bot heard and said, with the time.

## Scenes and chill mode

A scene is a file in `scenes/`. It tells the character where it is, what it
wants and how the scene can end. In a scene the character answers when
someone says its name, then closes the scene after a while with a clear
ending. Type `!forget` or start the scene again to play it once more.

In chill mode there's no scene. The character relaxes at home and answers
whoever is in the channel after half a second of silence, no name needed. It
greets people who walk in, notices who leaves, and has a private thought when
the last one goes. Chill mode keeps its memory in `chill-memory.json`, so it
remembers its visitors across restarts.

## Good to know

- If the transcript keeps spelling the name wrong, add those spellings to
  `CALL_NAMES` in `.env`.
- The free Azure tier gives 5 hours of transcription a month. That's about
  two or three sessions. After that, switch the resource to Standard S0 or
  wait for next month.
- On the free tier Azure transcribes one person at a time. When several
  people talk at once, the bot catches up a few seconds later.
- Once the memory gets long, the oldest part is summed up by a cheaper model,
  so the character remembers the gist of a long evening without the cost
  growing.
- Everyone in the channel gets transcribed and chill mode saves it, so tell
  your friends.

## License

The code is MIT, see `LICENSE`. The Strahd notes and the scenes are fan
material for Curse of Strahd, which belongs to Wizards of the Coast.
