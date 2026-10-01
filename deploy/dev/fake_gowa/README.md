# fake-gowa

Dev-only stub of [Gowa](https://github.com/aldinokemal/go-whatsapp-web-multidevice)'s
`POST /send/message`. It records sends in memory so you can see what the backend "sent" without a
real WhatsApp session. Never deploy it.

| Endpoint | Behavior |
| --- | --- |
| `POST /send/message` | Body `{"phone","message","reply_message_id"?}`. `400 {"code":"VALIDATION_ERROR",...}` if `phone`/`message` are missing or empty; `401` if `APP_BASIC_AUTH` is set and Basic auth does not match; otherwise `200 {"code":"SUCCESS","message":"Message sent","results":{"message_id","status"}}`. |
| `GET /__sent` | Recorded sends (`?phone=` filter), newest last. |
| `GET /__sent/latest?phone=` | Newest send to that phone; the phone matches with or without `+` and the `@s.whatsapp.net` suffix. `404 {"code":"NOT_FOUND",...}` if none, `400` if `phone` is missing. |
| `DELETE /__sent` | Clears the records. |
| `GET /health` | `{"status":"ok"}`. |

Environment: `APP_BASIC_AUTH=user:pass` enables Basic auth (disabled when unset).

```sh
uv run pytest                                   # tests
uv run uvicorn app:app --port 4000 --reload     # run locally
```
