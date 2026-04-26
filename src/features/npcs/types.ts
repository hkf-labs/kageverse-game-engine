import type { Vec2 } from '../maps/types';

export type NpcRole = 
    | 'village_elder'
    | 'blacksmith'
    | 'merchant'
    | 'stash_keeper'
    | 'teleporter'
    | 'healer';

export type NpcTemplate = {
    templateId: NpcRole | string;
    defaultName: string;
    spriteKey: string;
    assetUrl: string;
    interactable: boolean;
};

export type MapNpc = {
    npcId: string;
    templateId: NpcRole | string;
    position: Vec2;
    nameOverride?: string;
};
