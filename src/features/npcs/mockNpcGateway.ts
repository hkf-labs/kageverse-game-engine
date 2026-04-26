import type { NpcTemplate } from './types';

export const MOCK_NPC_TEMPLATES: Record<string, NpcTemplate> = {
    village_elder: {
        templateId: 'village_elder',
        defaultName: 'Trưởng Làng',
        spriteKey: 'npc_village_elder',
        assetUrl: 'assets/game/npcs/village/village_elder.png',
        interactable: true,
    },
    blacksmith: {
        templateId: 'blacksmith',
        defaultName: 'Thợ Rèn',
        spriteKey: 'npc_blacksmith',
        assetUrl: 'assets/game/npcs/village/blacksmith.png',
        interactable: true,
    },
    merchant: {
        templateId: 'merchant',
        defaultName: 'Thương Nhân',
        spriteKey: 'npc_merchant',
        assetUrl: 'assets/game/npcs/village/merchant.png',
        interactable: true,
    },
    stash_keeper: {
        templateId: 'stash_keeper',
        defaultName: 'Người Cất Đồ',
        spriteKey: 'npc_stash_keeper',
        assetUrl: 'assets/game/npcs/village/stash_keeper.png',
        interactable: true,
    },
    teleporter: {
        templateId: 'teleporter',
        defaultName: 'Dịch Chuyển',
        spriteKey: 'npc_teleporter',
        assetUrl: 'assets/game/npcs/village/teleporter.png',
        interactable: true,
    },
    healer: {
        templateId: 'healer',
        defaultName: 'Chữa Trị',
        spriteKey: 'npc_healer',
        assetUrl: 'assets/game/npcs/village/healer.png',
        interactable: true,
    },
};

export async function getMockNpcTemplate(templateId: string): Promise<NpcTemplate> {
    const template = MOCK_NPC_TEMPLATES[templateId];
    if (!template) throw new Error(`NPC Template ${templateId} chưa được định nghĩa`);
    return Promise.resolve(template);
}
