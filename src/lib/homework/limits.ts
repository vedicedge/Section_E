/** Input limits shared by the admin form (client) and the API schema (server). */
export const HOMEWORK_LIMITS = {
  code: 20,
  subjectTitle: 120,
  title: 300,
  details: 4000,
  batch: 20,
} as const;
