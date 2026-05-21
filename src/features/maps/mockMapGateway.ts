import type { MapDetail } from './types';
import {
    VILLAGE_TO_FIRE_SCHOOL_LINKS,
    getOutgoingLinks,
    type MapLinkEdge,
} from '../../game/maps/mapLinks';

function buildSpawnByLinkId(links: MapLinkEdge[]): MapDetail['spawnPoints']['byLinkId'] {
    const out: MapDetail['spawnPoints']['byLinkId'] = {};
    for (const link of links) {
        out[link.linkId] = { x: link.targetX, y: link.targetY ?? 0 };
    }
    return out;
}

function buildOutgoingLinks(mapId: string): MapDetail['links'] {
    return getOutgoingLinks(mapId).map((link) => ({
        linkId: link.linkId,
        targetMapId: link.toMapId,
        entryPoint: { x: link.targetX, y: link.targetY ?? 0 },
        linkType: 'portal' as const,
        unlockCondition: null,
    }));
}

const MOCK_MAP_DETAILS: Record<string, MapDetail> = {
    village_001: {
        mapId: 'village_001',
        displayNameKey: 'map.village_001.name',
        mapType: 'safe_zone',
        version: 1,
        status: 'active',
        size: { width: 6688, height: 1200 },
        coordinateSystem: {
            origin: 'bottom_left',
            xAxis: 'left_to_right',
            yAxis: 'bottom_to_top',
        },
        assets: {
            assetFolder: 'maps/village_001',
            backgroundFile: 'village_1.png',
            tilesetId: 'tileset_village_a',
        },
        spawnPoints: {
            default: { x: 400, y: 96 },
            byLinkId: buildSpawnByLinkId(VILLAGE_TO_FIRE_SCHOOL_LINKS),
        },
        links: buildOutgoingLinks('village_001'),
        rules: {
            allowPvp: false,
            allowCombat: false,
            allowMount: false,
        },
    },
    village_to_fire_001: {
        mapId: 'village_to_fire_001',
        displayNameKey: 'map.name.village_to_fire_001',
        mapType: 'combat_zone',
        version: 1,
        status: 'active',
        size: { width: 3200, height: 1200 },
        coordinateSystem: {
            origin: 'bottom_left',
            xAxis: 'left_to_right',
            yAxis: 'bottom_to_top',
        },
        assets: {
            assetFolder: 'maps/village_to_fire_001',
            backgroundFile: 'village_to_fire_001.png',
            tilesetId: 'mock_32',
        },
        spawnPoints: {
            default: { x: 200, y: 96 },
            byLinkId: buildSpawnByLinkId(VILLAGE_TO_FIRE_SCHOOL_LINKS),
        },
        links: buildOutgoingLinks('village_to_fire_001'),
        rules: { allowPvp: false, allowCombat: true, allowMount: false },
    },
    village_to_fire_002: {
        mapId: 'village_to_fire_002',
        displayNameKey: 'map.name.village_to_fire_002',
        mapType: 'combat_zone',
        version: 1,
        status: 'active',
        size: { width: 3200, height: 1200 },
        coordinateSystem: {
            origin: 'bottom_left',
            xAxis: 'left_to_right',
            yAxis: 'bottom_to_top',
        },
        assets: {
            assetFolder: 'maps/village_to_fire_002',
            backgroundFile: 'village_to_fire_002.png',
            tilesetId: 'mock_32',
        },
        spawnPoints: {
            default: { x: 200, y: 96 },
            byLinkId: buildSpawnByLinkId(VILLAGE_TO_FIRE_SCHOOL_LINKS),
        },
        links: buildOutgoingLinks('village_to_fire_002'),
        rules: { allowPvp: false, allowCombat: true, allowMount: false },
    },
    fire_school_001: {
        mapId: 'fire_school_001',
        displayNameKey: 'map.name.fire_school_001',
        mapType: 'safe_zone',
        version: 1,
        status: 'active',
        size: { width: 4000, height: 1200 },
        coordinateSystem: {
            origin: 'bottom_left',
            xAxis: 'left_to_right',
            yAxis: 'bottom_to_top',
        },
        assets: {
            assetFolder: 'maps/fire_school_001',
            backgroundFile: 'bg.png',
            tilesetId: 'tileset_school',
        },
        spawnPoints: {
            default: { x: 400, y: 96 },
            byLinkId: buildSpawnByLinkId(VILLAGE_TO_FIRE_SCHOOL_LINKS),
        },
        links: buildOutgoingLinks('fire_school_001'),
        rules: { allowPvp: false, allowCombat: false, allowMount: false },
    },
};

export async function getMockMapDetail(mapId: string): Promise<MapDetail> {
    const detail = MOCK_MAP_DETAILS[mapId];
    if (!detail) throw new Error(`Map ${mapId} chưa có mock detail`);
    return Promise.resolve(detail);
}
