// Courses: every C# example really runs, every task's reference solution passes its own check and
// the starter does not, quiz answers exist, and every explanation matches a line of the code.
import { describe, expect, it } from 'vitest';
import { COURSES, COURSE_LESSON_COUNT } from '../src/code/learn/courses';
import { runCSharp } from '../src/code/run/runner';

describe('courses', () => {
  it('has the C# for Unity course (16 lessons) and the Unreal C++ course', () => {
    expect(COURSES.find((c) => c.id === 'cs-unity')!.lessons.length).toBe(16);
    expect(COURSES.find((c) => c.id === 'unreal')!.lessons.length).toBe(4);
    expect(COURSES.find((c) => c.id === 'cs-advanced')!.lessons.length).toBe(9);
    expect(COURSE_LESSON_COUNT).toBe(29);
  });

  for (const course of COURSES)
    for (const l of course.lessons) {
      it(`${course.id}/${l.id}: notes and quiz are consistent`, () => {
        for (const [m] of l.notes) expect(l.code.includes(m), m).toBe(true);
        expect(l.quiz.length).toBeGreaterThan(0);
        for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length);
      });
      if (l.lang !== 'cs') continue;
      it(`${course.id}/${l.id}: the example runs for real`, async () => {
        const r = await runCSharp(l.code, l.input ?? [], { trace: true });
        expect(r.status, r.error?.message).toBe('done');
        expect(r.output.length).toBeGreaterThan(0);
        expect(r.steps.length).toBeGreaterThan(3);
      });
      if (l.task)
        it(`${course.id}/${l.id}: the task is checkable (solution passes, starter does not)`, async () => {
          const s = await runCSharp(l.task!.solution, l.task!.input ?? []);
          expect(s.output.filter((x) => !x.startsWith('> '))).toEqual(l.task!.expect);
          const st = await runCSharp(l.task!.starter, l.task!.input ?? []);
          expect(st.output).not.toEqual(l.task!.expect);
        });
    }

  it('Console.Write then WriteLine stays on one line; input starts a new one', async () => {
    const r = await runCSharp('using System;\nConsole.Write("a");\nConsole.WriteLine("b");\nConsole.Write("Q: ");\nstring s = Console.ReadLine();\nConsole.WriteLine("ok " + s);', ['x']);
    expect(r.output).toEqual(['ab', 'Q: ', '> x', 'ok x']);
  });
});
