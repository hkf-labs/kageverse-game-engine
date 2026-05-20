import type { QuestDTO, QuestObjectiveDTO } from '../network/api';
import { t } from '../i18n';

/** Text câu hỏi quiz — ưu tiên question_key từ BE. */
export function quizQuestionText(objective: QuestObjectiveDTO): string {
    if (objective.question_key) {
        const text = t(objective.question_key);
        if (text !== objective.question_key) return text;
    }
    return objective.target_id;
}

/** Text hiển thị trong quest log / tracker cho 1 bước quiz. */
export function quizObjectiveSummary(objective: QuestObjectiveDTO): string {
    return quizQuestionText(objective);
}

export function isQuizObjective(o: QuestObjectiveDTO): boolean {
    return o.type === 'quiz_npc';
}

export function isQuizStepPending(o: QuestObjectiveDTO): boolean {
    return isQuizObjective(o) && o.done < o.count;
}

/** Bước quiz chưa xong tại NPC (thứ tự objectives trong quest). */
export function findPendingQuizStep(
    quest: QuestDTO,
    npcTemplateId: string,
): QuestObjectiveDTO | undefined {
    if (quest.status !== 'active') return undefined;
    return quest.objectives.find(
        (o) => isQuizStepPending(o) && o.npc_id === npcTemplateId,
    );
}

export type QuizMenuEntry = {
    questId: string;
    questName: string;
};

/** Quest active có quiz pending tại NPC → mục menu 「Làm nhiệm vụ」. */
export function listQuizMenuEntries(
    quests: QuestDTO[],
    npcTemplateId: string,
    questNameFn: (nameKey: string) => string,
): QuizMenuEntry[] {
    const out: QuizMenuEntry[] = [];
    for (const q of quests) {
        if (findPendingQuizStep(q, npcTemplateId)) {
            out.push({
                questId: q.quest_id,
                questName: questNameFn(q.name_key),
            });
        }
    }
    return out;
}
