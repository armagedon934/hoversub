// Sound: the synthesizer makes what its presets promise (checked by listening = analysis), the slow
// mode keeps the pitch, WAV export is valid, and every sound lesson's finished script passes its goals
// (written in real Unity OnAudioFilterRead, run by the interpreter) while broken ones do not.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { answerCode, blankAnswers, countBlanks, starterCode } from '../src/code/run/blanks';
import { renderSoundScript } from '../src/code/sound/soundScript';
import { SOUND_LESSONS } from '../src/code/sound/soundLessons';
import { PRESETS, analyze, duration, randomParams, render, toWav, SAMPLE_RATE } from '../src/code/sound/synth';

setLocale('ru', false);
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.p;
const mean = (xs: number[]) => { const v = xs.filter((x) => x > 0); return v.reduce((a, b) => a + b, 0) / v.length; };

describe('synthesizer', () => {
  it('12 presets, all audible and finite', () => {
    expect(PRESETS.length).toBe(12);
    for (const p of PRESETS) {
      const s = render(p.p);
      expect(s.length).toBe(Math.floor(duration(p.p) * SAMPLE_RATE));
      expect(s.every((x) => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true);
      expect(analyze(s).peak, p.id).toBeGreaterThan(0.05);
    }
  });
  it('jump goes up, laser goes down, coin has a second higher note', () => {
    const j = analyze(render(preset('jump')));
    expect(mean(j.pitch.slice(6, 9))).toBeGreaterThan(mean(j.pitch.slice(0, 2)) * 1.5);
    const l = analyze(render(preset('laser')));
    expect(mean(l.pitch.slice(5, 8))).toBeLessThan(mean(l.pitch.slice(0, 2)));
    const c = analyze(render(preset('coin')));
    expect(mean(c.pitch.slice(4, 8))).toBeGreaterThan(c.pitch[0] * 1.2);
  });
  it('noise presets are noisy, tones are not; square is square', () => {
    expect(analyze(render(preset('explosion'))).noisiness).toBeGreaterThan(0.5);
    expect(analyze(render(preset('blip'))).noisiness).toBeLessThan(0.2);
    expect(analyze(render({ ...preset('alarm'), vibDepth: 0 })).squareness).toBeGreaterThan(0.8);
  });
  it('slow mode: twice as long, same pitch', () => {
    const p = { ...preset('blip'), sustain: 0.2 };
    const a = analyze(render(p));
    const b = analyze(render(p, 2));
    expect(b.duration).toBeCloseTo(a.duration * 2, 2);
    expect(Math.abs(mean(b.pitch) - mean(a.pitch))).toBeLessThan(20);
  });
  it('random sounds are valid and repeatable', () => {
    expect(randomParams(7)).toEqual(randomParams(7));
    expect(randomParams(7)).not.toEqual(randomParams(8));
    for (let i = 0; i < 20; i++) expect(render(randomParams(i)).every(Number.isFinite)).toBe(true);
  });
  it('WAV export has a correct header', () => {
    const w = toWav(render(preset('coin')));
    const t = new TextDecoder().decode(w.slice(0, 4)) + new TextDecoder().decode(w.slice(8, 12));
    expect(t).toBe('RIFFWAVE');
    expect(new DataView(w.buffer).getUint32(24, true)).toBe(SAMPLE_RATE);
  });
});

describe('sound lessons (Unity OnAudioFilterRead)', () => {
  it('9 lessons, each with 1–5 blanks', () => {
    expect(SOUND_LESSONS.length).toBe(9);
    for (const l of SOUND_LESSONS) {
      const n = blankAnswers(l.code()).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      expect(countBlanks(starterCode(l.code()))).toBe(n);
    }
  });
  for (const l of SOUND_LESSONS)
    it(`${l.id}: the finished script passes every goal (${l.title.en})`, async () => {
      const r = await renderSoundScript(answerCode(l.code()), l.seconds);
      expect(r.problems).toBeNull();
      expect(r.error).toBeUndefined();
      const a = analyze(r.samples);
      expect(l.goals.map((g) => g.check(a)), JSON.stringify({ pitch: a.pitch.map(Math.round), loud: a.loudness.map((x) => x.toFixed(2)), sq: a.squareness, noise: a.noisiness })).toEqual(l.goals.map(() => true));
      expect(r.fields.length).toBeGreaterThan(0);
    }, 30000);
  it('wrong scripts do not pass: no slide (z4), a smooth wave instead of square (z3), no fading (z2)', async () => {
    const run = async (id: string, edit: (c: string) => string) => {
      const l = SOUND_LESSONS.find((x) => x.id === id)!;
      const r = await renderSoundScript(edit(answerCode(l.code())), l.seconds);
      return l.goals.map((g) => g.check(analyze(r.samples)));
    };
    expect((await run('z4', (c) => c.replace('frequency += slide / sampleRate;', '')))[0]).toBe(false);
    expect((await run('z3', (c) => c.replace('Mathf.Sin(phase) > 0 ? 1f : -1f', 'Mathf.Sin(phase)')))[0]).toBe(false);
    expect((await run('z2', (c) => c.replace('* volume * fade', '* volume')))[1]).toBe(false);
  }, 60000);
  it('the Inspector sliders change the sound (frequency 880 → about 880 Hz)', async () => {
    const l = SOUND_LESSONS[0];
    const r = await renderSoundScript(answerCode(l.code()), l.seconds, { frequency: 880 });
    expect(Math.abs(mean(analyze(r.samples).pitch) - 880)).toBeLessThan(40);
    expect(r.fields.find((f) => f.name === 'frequency')?.value).toBe(880);
  }, 30000);
  it('a runtime mistake is reported with its line', async () => {
    const r = await renderSoundScript(answerCode(SOUND_LESSONS[0].code()).replace('data[i] = ', 'data[i + 1] = '), 0.2);
    expect(r.error?.message).toMatch(/номер|Index/i);
  }, 30000);
});
