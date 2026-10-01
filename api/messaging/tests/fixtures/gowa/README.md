# Gowa webhook fixtures

These payloads are **derived from `go-whatsapp-web-multidevice/docs/webhook-payload.md`**, not captured
from a real Gowa instance. Phones (`5491100000001`), LIDs and the group id
(`120363000000000000@g.us`) are obviously fake. Replace them with redacted real captures once the
bot is live (milestone task T11) and keep this note honest about which files are real.

| File | What it covers |
| --- | --- |
| `group_text.json` | plain text in a group |
| `group_command_ping.json` | `/viaje ping` in a group |
| `group_from_lid.json` | sender known only by `@lid` (no phone JID) |
| `group_own_message.json` | `is_from_me` (the bot's own message) |
| `dm_text.json` | direct message (non-group chat) |
| `message_ack.json` | non-`message` event (read receipt) |
| `group_text_with_device_suffix.json` | sender JID with a `:device` suffix |

Replay one against a running api with `manage.py replay_gowa <file>`.
