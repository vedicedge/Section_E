/**
 * Plain-text question import so a whole mock can be pasted in one go:
 *
 *   1. Which ratio measures liquidity?
 *   a) Debt-equity
 *   b) Current ratio *
 *   c) ROE
 *   Explanation: Current assets ÷ current liabilities.
 *
 * Correct options end with "*" (or use a line "Answer: b"). Several stars → multi-answer question.
 * Optional "Points: 2" per question.
 */

export interface BulkQuestion {
  prompt: string;
  options: { id: string; text: string }[];
  correct: string[];
  multiple: boolean;
  points: number;
  explanation: string;
}

export interface BulkResult {
  questions: BulkQuestion[];
  errors: string[];
}

const Q_START = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i;
const OPTION = /^\(?([a-hA-H])\s*[.)\]:]\s*(.+)$/;
const ANSWER = /^(?:ans(?:wer)?|correct)\s*[:\-]\s*(.+)$/i;
const EXPLANATION = /^(?:explanation|solution|reason)\s*[:\-]\s*(.*)$/i;
const POINTS = /^(?:points?|marks?)\s*[:\-]\s*(\d+(?:\.\d+)?)$/i;

export function parseBulkQuestions(input: string): BulkResult {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const questions: (BulkQuestion & { line: number; answerLine?: string })[] = [];
  const errors: string[] = [];
  let current: (typeof questions)[number] | null = null;
  let mode: 'prompt' | 'options' | 'explanation' = 'prompt';

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const lineNo = idx + 1;
    if (!line) return;

    const q = Q_START.exec(line);
    if (q && (!current || mode !== 'prompt' || current.options.length > 0)) {
      current = { prompt: q[2]!.trim(), options: [], correct: [], multiple: false, points: 1, explanation: '', line: lineNo };
      questions.push(current);
      mode = 'prompt';
      return;
    }
    if (!current) {
      errors.push(`Line ${lineNo}: expected a numbered question like "1. …".`);
      return;
    }
    const opt = OPTION.exec(line);
    if (opt && mode !== 'explanation') {
      let text = opt[2]!.trim();
      const id = opt[1]!.toLowerCase();
      const starred = /\s*(\*|\(correct\)|✓|✔)$/i.test(text);
      if (starred) {
        text = text.replace(/\s*(\*|\(correct\)|✓|✔)$/i, '').trim();
        current.correct.push(id);
      }
      current.options.push({ id, text });
      mode = 'options';
      return;
    }
    const ans = ANSWER.exec(line);
    if (ans) {
      current.answerLine = ans[1]!;
      return;
    }
    const pts = POINTS.exec(line);
    if (pts) {
      current.points = Number(pts[1]);
      return;
    }
    const exp = EXPLANATION.exec(line);
    if (exp) {
      current.explanation = exp[1]!.trim();
      mode = 'explanation';
      return;
    }
    if (mode === 'prompt') current.prompt = `${current.prompt}\n${line}`.trim();
    else if (mode === 'explanation') current.explanation = `${current.explanation}\n${line}`.trim();
    else {
      const last = current.options[current.options.length - 1];
      if (last) last.text = `${last.text} ${line}`;
    }
  });

  for (const [i, q] of questions.entries()) {
    const label = `Question ${i + 1} (line ${q.line})`;
    if (q.answerLine) {
      const letters = q.answerLine.toLowerCase().match(/\b[a-h]\b/g) ?? [];
      q.correct = [...new Set([...q.correct, ...letters])];
    }
    if (!q.prompt) errors.push(`${label}: missing question text.`);
    if (q.options.length < 2) errors.push(`${label}: needs at least two options.`);
    if (!q.correct.length) errors.push(`${label}: no correct answer — end the right option with "*" or add "Answer: b".`);
    const ids = new Set(q.options.map((o) => o.id));
    for (const c of q.correct) if (!ids.has(c)) errors.push(`${label}: answer "${c}" is not one of the options.`);
    q.multiple = q.correct.length > 1;
  }

  return {
    questions: questions.map(({ line: _line, answerLine: _answer, ...q }) => q),
    errors,
  };
}
