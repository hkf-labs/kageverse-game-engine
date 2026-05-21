import type { MapDetail } from '../features/maps';
import type { Vec2 } from '../features/maps/types';
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

/**
 * Business (bottom_left, GET /maps coordinate_system) → Phaser render (top_left, đã scale viewport).
 * Khớp kageverse-server/docs/business/maps/coordinates.md §3.1.
 */
export function businessVecToRender(
    business: Vec2,
    mapHeight: number,
    viewportHeight: number,
): { x: number; y: number } {
    const scale = viewportHeight / mapHeight;
    return {
        x: business.x * scale,
        y: (mapHeight - business.y) * scale,
    };
}

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
 * Dùng size.height từ API làm map_height; fallback mapHeightFallback khi chưa có detail.
 */
export function resolveSpawnFromIncomingLink(
    linkId: string,
    toMapId: string,
    mapDetail: MapDetail | undefined,
    viewportHeight: number,
    mapHeightFallback: number,
    platformYAtRenderX?: (renderX: number) => number,
): MapSpawnPoint | null {
    const business = mapDetail?.spawnPoints.byLinkId[linkId]
        ?? peekSpawnForIncomingLink(toMapId, linkId);
    if (!business) return null;

    const mapHeight = mapDetail?.size.height ?? mapHeightFallback;

    if (business.y <= 0 && platformYAtRenderX) {
        const scale = viewportHeight / mapHeight;
        const spawnX = business.x * scale;
        const groundY = platformYAtRenderX(spawnX);
        return { x: spawnX, y: groundY - SPAWN_FOOT_OFFSET_RENDER };
    }

    const render = businessVecToRender(business, mapHeight, viewportHeight);
    return {
        x: render.x,
        y: render.y - SPAWN_FOOT_OFFSET_RENDER,
    };
}
