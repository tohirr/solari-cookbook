# Notes from building on Solari

Everything below was found on a live VM while building passk, and cost an afternoon each. Solari's team may find the first four worth a changelog entry.


- **Key chords must be one string.** `keyboard.press(["ctrl", "s"])` presses
  ctrl, then s, and you get a literal "s". `keyboard.press("ctrl+s")` is the
  chord. `keyboard.hotkey("ctrl", "s")` has the same bug. `down`/`up` do hold
  modifiers correctly. Key names are xdotool's: `Return`, `BackSpace`,
  `Page_Down` — not `enter`.
- **Home is `/home/desktop`, and GUI apps run as root.** Mousepad shows a red
  root warning; file dialogs default to `/home/desktop`. `exec` runs with an
  empty `$HOME`, so use absolute paths in setup and checks.
- **The SDK's `mouse.scroll` has no direction.** X11 scroll is buttons 4–7 and
  the typed `MouseButton` can't express them, so passk scrolls through
  `xdotool click 4|5|6|7`, which the default template ships.
- **`sandboxes.createDesktop`, not `desktops.create`, for forks.** Only the
  sandbox-flavoured route accepts `fromSnapshot`.
- **Lowercase the letters in chords.** `ctrl+A` reaches xdotool as
  ctrl+shift+a, which in Chrome opens the tab-search panel and silently
  swallows everything typed next. One capital letter cost a whole run.
- **The control channel can drop right after a fork** on the office template:
  up for `connect()` and `health()`, gone by the first action. passk reconnects
  once and retries the action instead of failing the run.
- **Chrome will not upload a file from `/root`.** A form with a file input
  chosen from under `/root` fails with `ERR_ACCESS_DENIED` on submit and never
  reaches the server; the same file under `/home/desktop` or `/tmp` uploads
  fine. Put task inputs the agent must attach under the desktop user's home.
- **Verify the verifier.** An `exec` check that ran `cat` on two candidate
  paths failed with exit 1 whenever the first path was missing, even though the
  second printed the right text. Two real passes were scored as failures until
  the forensics in the report showed the file sitting exactly where it should
  be. `exec` checks with `stdout_contains` now judge output only unless an
  `exit_code` is given.
- **Clipboard readback is empty** (`xclip -o` exits 1) even after a real copy.
  Verify results through the filesystem instead.
