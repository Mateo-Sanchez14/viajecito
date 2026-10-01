# WAHA webhook fixtures

Derived from the WAHA docs (Context7 `/devlikeapro/waha-docs`), **not captured** from a live
instance. Phones (`5491100000001`), LIDs and the group id (`120363000000000000@g.us`) are fake.

Doc pages followed:
- `how-to/receive-messages` (message payload, `replyTo` object; `id`/`participant` may be absent
  depending on the engine) and `how-to/events` (envelope `event`/`session`/`engine`/`payload`,
  group `participant`, HMAC headers).
- `how-to/send-messages` (`reply_to`, message id format `{fromMe}_{chat}_{id}[_{participant}]`).

Unconfirmed, engine-specific (GOWS) guesses, parsed tolerantly: `_data.Info.PushName`,
`_data.Info.Sender`, `_data.Info.SenderAlt` (phone JID of a LID sender), `_data.notifyName` (WEBJS).

| File | Covers |
| --- | --- |
| `group_text.json` | group text, sender as `@c.us` |
| `group_from_lid.json` | group text, sender only as `@lid` (+ device-suffixed alt phone JID) |
| `group_reply.json` | reply with a `replyTo` object |
| `group_own_message.json` | `fromMe` |
| `dm_text.json` | non-group chat |
| `session_status.json` | non-`message` event |

Replay one with `manage.py replay_waha <file>`.
