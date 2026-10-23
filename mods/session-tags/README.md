# session-tags

A Claude Code mod that puts a small color and picture at the start of each session's name in the Claude desktop app's sidebar, like `🟦🎬 Video edit`, so you can spot sessions at a glance.

## Install

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

Tags need the Claude desktop app, since that's where the sidebar is. Sessions started after the install pick the mod up.

## What it does

- After a session's first reply, it adds a tag: a color for the project folder and a picture for the kind of work (🎬 video, 🎨 design, 🔌 plugins, 📝 writing, and more).
- Every session in the same folder gets the same color.
- A session whose name already starts with an emoji is left as it is.
- A pop-up says when it tags. Type `/tag auto off` to stop automatic tags.

## Changing a tag with /tag

Type words, and they turn into emoji:

```
/tag red fire        → 🟥🔥
/tag yellow space    → 🟨🪐
/tag blue video      → 🟦🎬
```

Other ways to tag:

| Command | What it does |
| --- | --- |
| `/tag help` | Shows every option, with examples |
| `/tag pick` | Opens a picker beside the chat: choose a color, a picture, or ideas from a theme, then press Apply |
| `/tag pick ocean` | Opens the picker with ocean ideas (any theme works) |
| `/tag` | Lets Claude suggest a tag for this session |
| `/tag 🟪🎨` | Uses exactly the emoji you type |
| `/tag shape circles` | Draws colors as circles (also `hearts`, or `squares`, the default) |
| `/tag red circle` | A color in a shape, for just this tag |
| `/tag project red` | Gives every session in this folder that color from now on |
| `/tag reset` | Removes the tag; Claude picks a new one after the next reply |
| `/tag clear` | Removes the tag and stops tagging this session |
| `/tag auto off` / `on` | Turns automatic tags off or on |
| `/tag remove all` | Shows what would change, then `/tag remove all yes` removes every session's tag and turns automatic tags off |

New to emoji? You never have to type one: words and the picker do it for you. To type one on a Mac anyway, press Control + Command + Space, search for a name like "purple square", and press Return.

## Good to know

- Choosing the kind of work, finding an emoji for a word the mod doesn't know, and theme ideas each make one quick call to a small Claude model.
- If you named a session yourself, the desktop app asks you before the mod renames it.
- The shape, project colors and last theme are remembered across sessions.

## Developing

`claude plugin validate .` checks the mod, and `claude plugin test .` runs its tests.
