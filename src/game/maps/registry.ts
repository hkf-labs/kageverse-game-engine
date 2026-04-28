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
    village_001:      { sceneKey: 'VillageScene',     displayName: 'Làng Sương Khói' },
    sword_school_001: { sceneKey: 'SwordSchoolScene', displayName: 'Trường Mikazuki — Phái Kiếm' },
    combat_field_001: { sceneKey: 'CombatFieldScene', displayName: 'Hố Sâu Thời Gian' },
};

export function resolveSceneKeyForMap(mapId: string | null | undefined): string {
    if (!mapId) return 'VillageScene';
    return MAP_REGISTRY[mapId]?.sceneKey ?? 'VillageScene';
}

export function mapDisplayName(mapId: string): string {
    return MAP_REGISTRY[mapId]?.displayName ?? mapId;
}
