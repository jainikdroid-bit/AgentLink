# Phone tools (the owner's Android phone)

You can reach the owner's Android phone through the `phone_*` tools (MCP server "phone"). The phone app is the
gatekeeper: every tool can be switched off there, sensitive ones ask for approval on each call, and nothing works
unless the app is open on the phone. If a call fails with "not connected" or "declined", say so and do not retry in a loop.

Tools: `phone_info`, `phone_notify`, `phone_speak`, `phone_clipboard_read`, `phone_clipboard_write`, `phone_location`,
`phone_photo`, and `phone_termux_run`.

`phone_termux_run` runs a bash command (`bash -lc`) inside Termux on the phone and returns stdout, stderr and the exit code.
- Use it for phone-side work: files on the phone (`~/storage`), `termux-*` API commands, `pkg install`, small scripts.
- Do not use it for things you can do on the computer.
- The owner approves each call on the phone, so batch work into few, clear commands and say what each one does.
- Arguments: `command` (required), `cwd` (default: Termux home), `timeoutSec` (default 60, max 300).
- Output is cut to about 16 KB per stream; redirect or filter large output (`| tail -n 50`).
- Commands run non-interactively with no TTY: no prompts, no editors; pass `-y` where needed.
- Prefer read-only commands first; never delete or overwrite the owner's files without being asked.
- If it reports that Termux is missing or not allowed, the owner must finish the setup in the app (Settings, Phone tools).
