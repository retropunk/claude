# claude

Custom things I've made for Claude.

## Mods

Mods change Claude Code's own interface or behavior. Each one lives in its own folder under [`mods/`](mods/).

| Mod | What it does |
| --- | --- |
| [session-tags](mods/session-tags/) | Puts a color and a picture at the start of each session's name in the Claude desktop app's sidebar, like `🟦🎬 Video edit`. Change it with `/tag`. |

### Installing a mod

At the prompt of a Claude Code terminal session:

```
/plugin install session-tags --marketplace retropunk/claude
```

Answer `y` to add the marketplace, then press Enter to install it for your user account.

Or from a shell:

```
claude plugin install session-tags --marketplace retropunk/claude
```

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `retropunk/claude`, then **Add plugin**.

## Skills

Coming later, in `skills/`.

## License

MIT. See [LICENSE](LICENSE).
