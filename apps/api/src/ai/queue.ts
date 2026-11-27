export const ESSAY_AI_QUEUE = "essay-ai";
/** Bot orqali yuborilgan esse */
export interface EssayAiJob {
  essayId: string;
}
/** Offline test essesi (ustoz suratga olgan qog'oz varoq). Shu navbatda: AI xarajati va parallellik bitta joyda nazorat qilinadi */
export interface OfflineEssayAiJob {
  externalEssayId: string;
}
export type AnyEssayAiJob = EssayAiJob | OfflineEssayAiJob;
