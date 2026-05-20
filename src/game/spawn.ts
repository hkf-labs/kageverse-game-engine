import type { CharacterDTO } from '../network/api';

export type MapSpawnPoint = { x: number; y: number };

/** Scene init data — AuthScene / portal truyền tọa độ đã biết trước khi mount map. */
export type MapSceneInitData = {
    spawnX?: number;
    spawnY?: number;
};

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
