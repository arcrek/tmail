import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playNewMailChime, resetAudioContextForTesting, setSoundEnabled, soundEnabled } from '../sound'

describe('sound', () => {
  beforeEach(() => {
    resetAudioContextForTesting()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetAudioContextForTesting()
  })

  it('toggles sound preference and updates state', () => {
    setSoundEnabled(false)
    expect(soundEnabled.value).toBe(false)
    setSoundEnabled(true)
    expect(soundEnabled.value).toBe(true)
  })

  it('plays chime when sound is enabled', () => {
    const createOscillator = vi.fn().mockReturnValue({
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })
    const createGain = vi.fn().mockReturnValue({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })
    const mockAudioContext = vi.fn().mockImplementation(() => ({
      currentTime: 0,
      state: 'running',
      createOscillator,
      createGain,
      destination: {},
    }))

    vi.stubGlobal('AudioContext', mockAudioContext)
    setSoundEnabled(true)
    playNewMailChime()

    expect(createOscillator).toHaveBeenCalledTimes(2)
    expect(createGain).toHaveBeenCalledTimes(2)
  })

  it('does not play chime when sound is disabled', () => {
    const createOscillator = vi.fn()
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
      currentTime: 0,
      state: 'running',
      createOscillator,
      createGain: vi.fn(),
      destination: {},
    })))

    setSoundEnabled(false)
    playNewMailChime()
    expect(createOscillator).not.toHaveBeenCalled()
  })
})
