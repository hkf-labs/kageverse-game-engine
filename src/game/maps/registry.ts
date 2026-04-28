/**
 * Map registry — single source of truth FE-side cho map_id → scene key + tên
 * hiển thị. BE chỉ gửi map_id + display_name_key (i18n placeholder); FE map
 * sang scene cụ thể và tên VN. Khi có i18n thực sẽ thay phần displayName.
 */
export interface MapRegistryEntry {
    sceneKey: string;
    displayName: string;
}

export const MAP_REGISTRY: Record<string, MapRegistryEntry> = {
    village_001:          { sceneKey: 'VillageScene',      displayName: 'Làng Sương Khói' },
    sword_school_001:     { sceneKey: 'SwordSchoolScene',  displayName: 'Trường Mikazuki — Phái Kiếm' },
    combat_field_001:     { sceneKey: 'CombatFieldScene',  displayName: 'Đồng Cỏ Săn Quái' },
    bamboo_forest_yatomi: { sceneKey: 'BambooForestScene', displayName: 'Rừng Tre Yatomi' },
    rocky_hill_iwagumo:   { sceneKey: 'RockyHillScene',    displayName: 'Đồi Đá Iwagumo' },
};

export function resolveSceneKeyForMap(mapId: string | null | undefined): string {
    if (!mapId) return 'VillageScene';
    return MAP_REGISTRY[mapId]?.sceneKey ?? 'VillageScene';
}

export function mapDisplayName(mapId: string): string {
    return MAP_REGISTRY[mapId]?.displayName ?? mapId;
}

/** Reverse lookup scene key → map_id. Trả undefined nếu không tìm thấy. */
export function mapIdForSceneKey(sceneKey: string): string | undefined {
    for (const [mapId, entry] of Object.entries(MAP_REGISTRY)) {
        if (entry.sceneKey === sceneKey) return mapId;
    }
    return undefined;
}
