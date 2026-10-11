import type { HomeworkView } from '@/lib/homework/repo';
import type { ReminderResult } from '@/lib/notify';
import type { SendResult } from '@/lib/push';

/** Shared by the homework API schema and the admin client components (no runtime deps). */
export { HOMEWORK_LIMITS as LIMITS } from '@/lib/homework/limits';

export interface BoardSubject {
  code: string;
  title: string;
  /** Its class on the "given on" day, when it had one. */
  classToday: { time: string | null } | null;
  /** First class strictly after the "given on" day. */
  next: { date: string; time: string | null } | null;
}

export type AdminHomeworkItem = HomeworkView & { doneCount: number };

export interface PostResult {
  created: HomeworkView[];
  notified: SendResult | null;
  notifyError: string | null;
}

export type { ReminderResult };
