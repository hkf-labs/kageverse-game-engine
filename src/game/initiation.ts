/** Q10 Bái Sư — 2 phái mỗi trường (sync domain/initiation.go). */

export const MQ_INITIATION = 'mq_initiation';

export type InitiationFactionOption = {
    classId: string;
    labelKey: string;
    mvp: boolean;
};

const FACTIONS_BY_PRINCIPAL: Record<string, InitiationFactionOption[]> = {
    npc_tsukikage: [
        { classId: 'sword', labelKey: 'class.sword', mvp: true },
        { classId: 'dart', labelKey: 'class.dart', mvp: false },
    ],
    npc_tobishima: [
        { classId: 'kunai', labelKey: 'class.kunai', mvp: false },
        { classId: 'bow', labelKey: 'class.bow', mvp: true },
    ],
    npc_honoo: [
        { classId: 'katana', labelKey: 'class.katana', mvp: false },
        { classId: 'fan', labelKey: 'class.fan', mvp: false },
    ],
};

const PRINCIPAL_IDS = new Set(Object.keys(FACTIONS_BY_PRINCIPAL));

export function isInitiationPrincipal(npcTemplateId: string | undefined): boolean {
    return !!npcTemplateId && PRINCIPAL_IDS.has(npcTemplateId);
}

export function factionsForPrincipal(npcTemplateId: string): InitiationFactionOption[] {
    return FACTIONS_BY_PRINCIPAL[npcTemplateId] ?? [];
}

export function confirmWarningKeyForClass(classId: string): string {
    return `quest.mq_initiation.confirm.${classId}`;
}
