import type { MapDetail } from '../features/maps';
import { peekSpawnForIncomingLink } from '../features/maps/mapDetailStore';
import type { CharacterDTO } from '../network/api';

export type MapSpawnPoint = { x: number; y: number };

/** Scene init data — AuthScene / portal truyền tọa độ đã biết trước khi mount map. */
export type MapSceneInitData = {
    spawnX?: number;
    spawnY?: number;
    /** Cổng vừa đi qua — map đích resolve spawn từ BE map_links (spawn_points.by_link_id). */
    linkId?: string;
};

/** Chân nhân vật ~22px dưới tâm hitbox so với mặt nền (khớp PlayerController). */
const SPAWN_FOOT_OFFSET_RENDER = 22;

/** Tọa độ spawn trên map nếu BE đã lưu last_* cho đúng map_id. */
export function resolveSpawnOnMap(
    character: CharacterDTO,
    mapId: string,
): MapSpawnPoint | null {
    if (
        character.last_map_id === mapId
        && character.last_pos_x !== null
        && character.last_pos_x !== undefined
        && character.last_pos_y !== null
        && character.last_pos_y !== undefined
    ) {
        return { x: character.last_pos_x, y: character.last_pos_y };
    }
    return null;
}

export function spawnFromSceneInit(
    data: MapSceneInitData | undefined,
): MapSpawnPoint | null {
    if (data?.spawnX === undefined || data?.spawnY === undefined) return null;
    return { x: data.spawnX, y: data.spawnY };
}

export function incomingLinkIdFromSceneInit(
    data: MapSceneInitData | undefined,
): string | null {
    const id = data?.linkId?.trim();
    return id ? id : null;
}

/**
 * Spawn sau khi đi qua link_id — đọc spawn_points.by_link_id từ MapDetail BE (đã cache).
 */
export function resolveSpawnFromIncomingLink(
    linkId: string,
    toMapId: string,
    mapDetail: MapDetail | undefined,
    tiledOriginalHeight: number,
    viewportHeight: number,
    platformYAtRenderX: (renderX: number) => number,
): MapSpawnPoint | null {
    const business = mapDetail?.spawnPoints.byLinkId[linkId]
        ?? peekSpawnForIncomingLink(toMapId, linkId);
    if (!business) return null;

    const scale = viewportHeight / tiledOriginalHeight;
    const spawnX = business.x * scale;
    const groundY = platformYAtRenderX(spawnX);
    const spawnY = business.y > 0
        ? business.y * scale - SPAWN_FOOT_OFFSET_RENDER
        : groundY - SPAWN_FOOT_OFFSET_RENDER;
    return { x: spawnX, y: spawnY };
}
