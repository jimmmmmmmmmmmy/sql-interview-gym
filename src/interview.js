import { questionById, QUESTIONS } from './questions.js';
import { mulberry32 } from './rng.js';

export const INTERVIEW_MS = 40 * 60 * 1000;
export const INTERVIEW_LENGTH = 5;

export function pickInterviewIds(seed) {
  const rng = mulberry32(seed >>> 0);
  const ids = [];
  for (let tier = 1; tier <= INTERVIEW_LENGTH; tier += 1) {
    const pool = QUESTIONS.filter((question) => question.tier === tier);
    if (!pool.length) throw new Error(`No questions in tier ${tier}`);
    ids.push(pool[Math.floor(rng() * pool.length)].id);
  }
  return ids;
}

export function interviewQuestions(ids) {
  return ids.map((id) => {
    const question = questionById(id);
    if (!question) throw new Error(`Unknown question ${id}`);
    return question;
  });
}
