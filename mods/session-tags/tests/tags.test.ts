import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const reply = (value: unknown) => ({
  value: { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false },
})

// Each hook here stands for the engine and the desktop app beneath the mod.
// `others` are the sidebar's other sessions, by id, for list_sessions.
function desktop(on: On, start: string, work = 'video or motion graphics', others: Record<string, string> = {}) {
  const app = { title: start, renames: [] as string[], others }
  on('mcp.call', (_, e) => {
    if (e.tool === 'get_session') return reply({ sessionId: 'local_self', title: app.title })
    if (e.tool === 'list_sessions') {
      return reply(Object.entries(app.others).map(([sessionId, title]) => ({ sessionId, title })))
    }
    const id = String(e.args.session_id)
    if (id !== 'self' && id !== 'local_self') {
      app.others[id] = String(e.args.title)

      return reply({ ok: true })
    }
    app.title = String(e.args.title)
    app.renames.push(app.title)

    return reply({ ok: true })
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'Edit the launch video', toolUses: [] }] }))
  on('model.classify', () => ({ value: work }))
  // A theme gets a JSON list (a different one on refresh); a lone word, one emoji.
  on('model.complete', (_, e) => {
    const prompt = String(e.prompt)
    const text = !prompt.includes('theme')
      ? '🌌'
      : prompt.includes("Don't use")
        ? '[{"name":"Shell","emoji":"🐚"},{"name":"Big wave","emoji":"🌊"}]'
        : `Here you go: [{"name":"Big wave","emoji":"🌊"},{"name":"Octopus","emoji":"🐙"},{"name":"Twin","emoji":"🐙"},{"name":"Bad","emoji":"x"}]`

    return { value: { isAnswered: true, text, usage: USAGE } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'tag' } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  mock.store(on)

  return app
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const PANE = {
  plugin: 'session-tags',
  component: 'Pane',
  requestId: 'tag-picker',
  props: {
    title: 'Tag picker',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// The test runner has timers; the mod's typings leave them out.
declare function setTimeout(done: () => void, ms: number): unknown

// The mod tags after a turn without holding it, so wait for the rename.
async function settle(app: { renames: string[] }, count: number) {
  for (let i = 0; i < 100 && app.renames.length < count; i++) await new Promise<void>(done => setTimeout(done, 10))
}

test('a turn tags an untagged title with the project color and work emoji', async ($, on) => {
  const app = desktop(on, 'Video edit test')
  await $.turn.complete(TURN)
  await settle(app, 1)
  expect(app.renames).toEqual(['🟦🎬 Video edit test'])

  // Once per session: a later turn renames nothing.
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await settle(app, 2)
  expect(app.renames.length).toBe(1)
})

test('a title that already starts with emoji is kept', async ($, on) => {
  const app = desktop(on, '🔥 Launch day')
  await $.turn.complete(TURN)
  await settle(app, 1)
  expect(app.renames).toEqual([])
})

test('/tag takes words, emoji, a project color, and clears', async ($, on) => {
  const app = desktop(on, 'Video edit test', 'design or images')

  await $.command.run({ ...RUN, command: 'tag', args: '' })
  expect(app.title).toBe('🟦🎨 Video edit test')

  const words = await $.command.run({ ...RUN, command: 'tag', args: 'red fire' })
  expect(app.title).toBe('🟥🔥 Video edit test')
  expect(words.text).toContain('red → 🟥')

  // A word off the built-in list is asked of the model, as one phrase.
  const looked = await $.command.run({ ...RUN, command: 'tag', args: 'Yellow deep sea' })
  expect(app.title).toBe('🟨🌌 Video edit test')
  expect(looked.text).toContain('deep sea → 🌌')

  await $.command.run({ ...RUN, command: 'tag', args: '🟪🎨' })
  expect(app.title).toBe('🟪🎨 Video edit test')

  await $.command.run({ ...RUN, command: 'tag', args: 'project red' })
  expect(app.title).toBe('🟥🎨 Video edit test')

  await $.command.run({ ...RUN, command: 'tag', args: 'clear' })
  expect(app.title).toBe('Video edit test')

  // Cleared: the next turn leaves it untagged.
  const count = app.renames.length
  await $.turn.complete(TURN)
  await settle(app, count + 1)
  expect(app.title).toBe('Video edit test')
})

test('/tag help explains it for someone new to emoji', async ($, on) => {
  desktop(on, 'Video edit test')
  const { text } = await $.command.run({ ...RUN, command: 'tag', args: 'help' })
  expect(text).toContain('/tag red fire → 🟥🔥')
  expect(text).toContain('Control + Command + Space')
})

test('/tag reset lets the next turn tag the session again', async ($, on) => {
  const app = desktop(on, 'Video edit test')
  await $.turn.complete(TURN)
  await settle(app, 1)
  expect(app.title).toBe('🟦🎬 Video edit test')

  const { text } = await $.command.run({ ...RUN, command: 'tag', args: 'reset' })
  expect(text).toContain('after the next reply')
  expect(app.title).toBe('Video edit test')

  await $.turn.complete({ ...TURN, turnId: 't2' })
  await settle(app, 3)
  expect(app.title).toBe('🟦🎬 Video edit test')
})

test('the picker tags the session with the buttons pressed', async ($, on) => {
  const app = desktop(on, '🟦🎬 Video edit test')
  const { text } = await $.command.run({ ...RUN, command: 'tag', args: 'pick' })
  expect(text).toContain('picker is open')

  for (const surface of ['terminal', 'desktop'] as const) {
    app.title = '🟦🎬 Video edit test'
    await $.command.run({ ...RUN, command: 'tag', args: 'pick' })
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Video edit/ }))?.text).toBe('🟦🎬 Video edit test')

    await ui.press({ key: 'color-Red' })
    await ui.press({ key: 'idea-Pizza' })
    expect((await ui.find({ type: 'Text', text: /Video edit/ }))?.text).toBe('🟥🍕 Video edit test')

    await ui.press({ key: 'apply' })
    expect(app.title).toBe('🟥🍕 Video edit test')
    expect((await ui.find({ type: 'Text', text: /^Done/ }))?.text).toContain('🟥🍕')
    await ui.unmount()
  }
})

test('a theme fills the ideas row, refreshes, and is remembered', async ($, on) => {
  const app = desktop(on, 'Video edit test')
  await $.command.run({ ...RUN, command: 'tag', args: 'pick' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Ideas:/ }))?.text).toBe('3. Ideas: just for fun')

    // Repeats and anything that isn't one emoji are dropped.
    await ui.input({ key: 'theme', text: 'ocean' })
    expect((await ui.find({ type: 'Text', text: /Ideas:/ }))?.text).toBe('3. Ideas: ocean')
    expect(await ui.find({ key: 'idea-Octopus' })).toBeDefined()
    expect(await ui.find({ key: 'idea-Twin' })).toBeUndefined()
    expect(await ui.find({ key: 'idea-Bad' })).toBeUndefined()

    // New ideas leaves out the ones on show.
    await ui.press({ key: 'new-ideas' })
    expect(await ui.find({ key: 'idea-Shell' })).toBeDefined()
    expect(await ui.find({ key: 'idea-Big wave' })).toBeUndefined()

    await ui.press({ key: 'color-Blue' })
    await ui.press({ key: 'idea-Shell' })
    await ui.press({ key: 'apply' })
    expect(app.title).toBe('🟦🐚 Video edit test')

    // An empty theme puts the built-in fun row back.
    await ui.input({ key: 'theme', text: '' })
    expect((await ui.find({ type: 'Text', text: /Ideas:/ }))?.text).toBe('3. Ideas: just for fun')
    await ui.unmount()
  }

  const { text } = await $.command.run({ ...RUN, command: 'tag', args: 'pick space' })
  expect(text).toContain('ideas for space')
  await $.command.run({ ...RUN, command: 'tag', args: 'pick' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Ideas:/ }))?.text).toBe('3. Ideas: space')
  await ui.unmount()
})

test('colors come as squares, circles or hearts', async ($, on) => {
  const app = desktop(on, '🟦🎬 Video edit test')

  // A new shape redraws this session's color and every color after it.
  const shaped = await $.command.run({ ...RUN, command: 'tag', args: 'shape circles' })
  expect(shaped.text).toContain('circles now')
  expect(app.title).toBe('🔵🎬 Video edit test')
  await $.command.run({ ...RUN, command: 'tag', args: 'red fire' })
  expect(app.title).toBe('🔴🔥 Video edit test')

  // A shape word after a color is for that tag alone.
  const once = await $.command.run({ ...RUN, command: 'tag', args: 'green heart' })
  expect(app.title).toBe('💚 Video edit test')
  expect(once.text).toContain('green heart → 💚')

  // Claude's suggestion draws the project's color in the shape in use.
  await $.command.run({ ...RUN, command: 'tag', args: 'shape hearts' })
  await $.command.run({ ...RUN, command: 'tag', args: '' })
  expect(app.title).toBe('💙🎬 Video edit test')

  for (const surface of ['terminal', 'desktop'] as const) {
    app.title = '💚 Video edit test'
    await $.command.run({ ...RUN, command: 'tag', args: 'pick' })
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'shape-square' })
    expect((await ui.find({ type: 'Text', text: /Video edit/ }))?.text).toBe('🟩 Video edit test')
    await ui.press({ key: 'apply' })
    expect(app.title).toBe('🟩 Video edit test')
    await ui.press({ key: 'shape-heart' })
    await ui.unmount()
  }
})

test('/tag auto off stops automatic tags, and on brings them back', async ($, on) => {
  const app = desktop(on, 'Video edit test')
  const off = await $.command.run({ ...RUN, command: 'tag', args: 'auto off' })
  expect(off.text).toContain('Automatic tags are off')
  await $.turn.complete(TURN)
  await settle(app, 1)
  expect(app.renames).toEqual([])

  // /tag itself still works while automatic tags are off.
  await $.command.run({ ...RUN, command: 'tag', args: 'red fire' })
  expect(app.title).toBe('🟥🔥 Video edit test')
  await $.command.run({ ...RUN, command: 'tag', args: 'reset' })

  const back = await $.command.run({ ...RUN, command: 'tag', args: 'auto on' })
  expect(back.text).toContain('Automatic tags are on')
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await settle(app, 3)
  expect(app.title).toBe('🟦🎬 Video edit test')
})

test('/tag remove all asks first, then clears every tag and starts over', async ($, on) => {
  const app = desktop(on, '🟦🎬 Video edit test', 'video or motion graphics', {
    local_a: '🔴🎵 Song mix',
    local_b: 'Plain notes',
    local_c: '🎉',
  })

  // The first run only says what would change; nothing is renamed.
  const asked = await $.command.run({ ...RUN, command: 'tag', args: 'remove all' })
  expect(asked.text).toContain('2 sessions')
  expect(asked.text).toContain('🔴🎵 Song mix → Song mix')
  expect(asked.text).toContain('/tag remove all yes')
  expect(app.title).toBe('🟦🎬 Video edit test')

  // A title that is only emoji is left alone, having no name to fall back to.
  const done = await $.command.run({ ...RUN, command: 'tag', args: 'remove all yes' })
  expect(done.text).toContain('Removed the tags from 2 sessions')
  expect(app.title).toBe('Video edit test')
  expect(app.others).toEqual({ local_a: 'Song mix', local_b: 'Plain notes', local_c: '🎉' })

  // Automatic tags are off afterward.
  await $.turn.complete(TURN)
  await settle(app, 2)
  expect(app.title).toBe('Video edit test')
})
