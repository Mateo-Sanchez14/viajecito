# fake-gowa

Dev-only stub of [Gowa](https://github.com/aldinokemal/go-whatsapp-web-multidevice)'s
`POST /send/message` and `GET /group/participants`. It records sends in memory so you can see what the backend "sent" without a
real WhatsApp session. Never deploy it.

| Endpoint | Behavior |
| --- | --- |
| `POST /send/message` | Body `{"phone","message","reply_message_id"?}`. `400 {"code":"VALIDATION_ERROR",...}` if `phone`/`message` are missing or empty; `401` if `APP_BASIC_AUTH` is set and Basic auth does not match; otherwise `200 {"code":"SUCCESS","message":"Message sent","results":{"message_id","status"}}`. |
| `GET /__sent` | Recorded sends (`?phone=` filter), newest last. |
| `GET /__sent/latest?phone=` | Newest send to that phone; the phone matches with or without `+` and the `@s.whatsapp.net` suffix. `404 {"code":"NOT_FOUND",...}` if none, `400` if `phone` is missing. |
| `DELETE /__sent` | Clears the records. |
| `GET /group/participants?group_id=` | Gowa shape `{"code":"SUCCESS","message":"Success get list participants","results":{"participants":[{jid, phone_number, lid, display_name, is_admin, is_super_admin}]}}`. Unknown group: empty list. `400` without `group_id`; `401` when `APP_BASIC_AUTH` is set and does not match. |
| `PUT /__groups/{group_id}` | Seeds the group; body is a JSON list of participants (`jid` required). Replaces the previous list. |
| `GET /__groups` | All seeded groups, `{group_id: [participants]}`. |
| `DELETE /__groups` | Clears all seeded groups. |
| `GET /health` | `{"status":"ok"}`. |

Environment: `APP_BASIC_AUTH=user:pass` enables Basic auth (disabled when unset).

```sh
uv run pytest                                   # tests
uv run uvicorn app:app --port 4000 --reload     # run locally
```
