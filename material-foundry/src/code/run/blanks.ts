// Fill-in-the-blank scripts: the answer is written with ⟦…⟧ around the parts the learner types.

const BLANK = /⟦([^⟧]*)⟧/g;
/** What the learner starts with: every blank becomes ___. */
export const starterCode = (code: string): string => code.replace(BLANK, '___');
/** The finished script. */
export const answerCode = (code: string): string => code.replace(BLANK, '$1');
/** The answers of the blanks, in order. */
export const blankAnswers = (code: string): string[] => [...code.matchAll(BLANK)].map((m) => m[1]);
/** How many ___ are still in the text. */
export const countBlanks = (code: string): number => code.split('___').length - 1;
