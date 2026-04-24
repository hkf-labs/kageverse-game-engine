import type { MapDetail } from './types';

const MOCK_MAP_DETAILS: Record<string, MapDetail> = {
    village_001: {
        mapId: 'village_001',
        displayNameKey: 'map.village_001.name',
        mapType: 'safe_zone',
        version: 1,
        status: 'active',
        size: { width: 3200, height: 1200 },
        coordinateSystem: {
            origin: 'bottom_left',
            xAxis: 'left_to_right',
            yAxis: 'bottom_to_top',
        },
        assets: {
            assetFolder: 'maps/village_001',
            backgroundFile: 'bg.jpg',
            tilesetId: 'tileset_village_a',
        },
        spawnPoints: {
            default: { x: 200, y: 840 },
            byLinkId: {
                from_monster_a: { x: 260, y: 840 },
                from_monster_b: { x: 320, y: 840 },
            },
        },
        links: [
            {
                linkId: 'to_monster_a',
                targetMapId: 'monster_a_001',
                entryPoint: { x: 120, y: 760 },
                linkType: 'portal',
                unlockCondition: null,
            },
            {
                linkId: 'to_monster_b',
                targetMapId: 'monster_b_001',
                entryPoint: { x: 120, y: 760 },
                linkType: 'portal',
                unlockCondition: null,
            },
        ],
        rules: {
            allowPvp: false,
            allowCombat: false,
            allowMount: false,
        },
    },
};

export async function getMockMapDetail(mapId: string): Promise<MapDetail> {
    const detail = MOCK_MAP_DETAILS[mapId];
    if (!detail) throw new Error(`Map ${mapId} chưa có mock detail`);
    return Promise.resolve(detail);
}
