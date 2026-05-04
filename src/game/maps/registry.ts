/**
 * Map registry — single source of truth FE-side cho map_id → scene key. Tên
 * hiển thị resolve qua i18n (`map.name.<map_id>`) lazy ở mapDisplayName(),
 * không cache trong const để switch locale là thấy ngay.
 */
import { t } from '../../i18n';

export interface MapRegistryEntry {
    sceneKey: string;
}

export const MAP_REGISTRY: Record<string, MapRegistryEntry> = {
    village_001:          { sceneKey: 'VillageScene' },
    sword_school_001:     { sceneKey: 'SwordSchoolScene' },
    hayabusa_school_001:  { sceneKey: 'HayabusaSchoolScene' },
    combat_field_001:     { sceneKey: 'CombatFieldScene' },
    bamboo_forest_yatomi: { sceneKey: 'BambooForestScene' },
    rocky_hill_iwagumo:   { sceneKey: 'RockyHillScene' },
};

export function resolveSceneKeyForMap(mapId: string | null | undefined): string {
    if (!mapId) return 'VillageScene';
    return MAP_REGISTRY[mapId]?.sceneKey ?? 'VillageScene';
}

export function mapDisplayName(mapId: string): string {
    if (!MAP_REGISTRY[mapId]) return mapId;
    return t(`map.name.${mapId}`);
}

/** Reverse lookup scene key → map_id. Trả undefined nếu không tìm thấy. */
export function mapIdForSceneKey(sceneKey: string): string | undefined {
    for (const [mapId, entry] of Object.entries(MAP_REGISTRY)) {
        if (entry.sceneKey === sceneKey) return mapId;
    }
    return undefined;
}
