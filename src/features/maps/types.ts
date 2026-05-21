import type { MapNpc } from '../npcs/types';

export type Vec2 = { x: number; y: number };

export type MapDetail = {
    mapId: string;
    displayNameKey: string;
    mapType: 'safe_zone' | 'combat_zone' | string;
    version: number;
    status: 'active' | 'inactive' | string;
    size: { width: number; height: number };
    coordinateSystem: {
        origin: 'bottom_left' | string;
        xAxis: 'left_to_right' | string;
        yAxis: 'bottom_to_top' | string;
    };
    assets: {
        assetFolder: string;
        backgroundFile: string;
        tilesetId: string;
    };
    spawnPoints: {
        default: Vec2;
        byLinkId: Record<string, Vec2>;
    };
    links: Array<{
        linkId: string;
        targetMapId: string;
        portalPoint?: Vec2;
        entryPoint: Vec2;
        linkType: 'portal' | 'gate' | 'door' | 'teleport' | string;
        requiredLevel?: number;
        requiredQuest?: string | null;
        unlockCondition: string | null;
    }>;
    rules: {
        allowPvp: boolean;
        allowCombat: boolean;
        allowMount: boolean;
    };
    npcs?: MapNpc[];
};
