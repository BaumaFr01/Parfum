import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cache-band',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('die Leiste zeigt alle Teile und klappt zu', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 140_000,
        window: 200_000,
        percent: 70,
        breakdown: { totalTokens: 140_000, autoCompactThreshold: 160_000 },
      },
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Cache –/ }))?.text).toBe('Cache –')
    expect(await ui.find({ type: 'Text', text: /Kontext 70 %/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Compact bei 80 %/ })).toBeDefined()
    // 70 / 80 = 0,875 > 0,8: Gewitter
    expect(await ui.find({ type: 'Text', text: '⛈️' })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeDefined()

    await ui.press({ key: 'toggle' })
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '70 %' })).toBeDefined()
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})

test('nach /compact stehen Tokens und Zusammenfassung im Log', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const logged: string[] = []
  on('ui.log', (_, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 } } }))

  const para = 'Absatz. '.repeat(150).trim()
  const summary = [para, para, para].join('\n\n')
  on('session.compact', () => ({
    messages: [{ role: 'user', text: summary, toolUses: [] }],
    tokensBefore: 150_000,
    tokensAfter: 12_000,
  }))

  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'alt', toolUses: [] }] })

  expect(logged[0]).toBe('🗜️ Compact: 150.000 → 12.000 Tokens')
  expect(logged.length).toBeGreaterThan(2)
  for (const line of logged) expect(line.length).toBeLessThanOrEqual(2000)
  const body = logged
    .slice(1)
    .map(line => line.replace(/^Zusammenfassung[^\n]*\n/, ''))
    .join('\n\n')
  expect(body).toBe(summary)
})

test('der Cache-Balken läuft in 5 Minuten leer', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 } } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: 'm',
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 90,
      },
    }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1 })) {
    // nichts
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '5 min' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '90 %' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '■'.repeat(20) })).toBeDefined()

  await clock.advance(4 * 60_000)
  expect(await ui.find({ type: 'Text', text: '1 min' })).toBeDefined()

  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: 'abgelaufen' })).toBeDefined()
  await ui.unmount()
})
