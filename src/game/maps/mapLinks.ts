/**
 * Mock map links (BE chưa có migration) — nguồn sự thật tạm cho portal spawn đối xứng.
 * Tọa độ X theo Tiled/business (cùng đơn vị PortalConfig.x và docs/business/maps).
 */

export type MapLinkEdge = {
    linkId: string;
    fromMapId: string;
    /** Tâm cổng trên map nguồn (business X). */
    portalX: number;
    toMapId: string;
    /**
     * Điểm chân khi vào map đích (business X).
     * = portal_x của link ngược (B→A) trên map đích — đứng ngay cổng quay về.
     */
    targetX: number;
    /** Nếu set: business Y; không set → FE tính từ nền tại targetX. */
    targetY?: number;
};

/** Nhánh MVP: village_001 → village_to_fire_* → fire_school_001 */
export const VILLAGE_TO_FIRE_SCHOOL_LINKS: MapLinkEdge[] = [
    {
        linkId: 'village_001_to_village_to_fire_001',
        fromMapId: 'village_001',
        portalX: 6300,
        toMapId: 'village_to_fire_001',
        targetX: 180,
    },
    {
        linkId: 'village_to_fire_001_to_village_001',
        fromMapId: 'village_to_fire_001',
        portalX: 180,
        toMapId: 'village_001',
        targetX: 6300,
    },
    {
        linkId: 'village_to_fire_001_to_village_to_fire_002',
        fromMapId: 'village_to_fire_001',
        portalX: 2900,
        toMapId: 'village_to_fire_002',
        targetX: 180,
    },
    {
        linkId: 'village_to_fire_002_to_village_to_fire_001',
        fromMapId: 'village_to_fire_002',
        portalX: 180,
        toMapId: 'village_to_fire_001',
        targetX: 2900,
    },
    {
        linkId: 'village_to_fire_002_to_fire_school_001',
        fromMapId: 'village_to_fire_002',
        portalX: 2900,
        toMapId: 'fire_school_001',
        targetX: 750,
    },
    {
        linkId: 'fire_school_001_to_village_to_fire_002',
        fromMapId: 'fire_school_001',
        portalX: 750,
        toMapId: 'village_to_fire_002',
        targetX: 2900,
    },
];

const linkById = new Map<string, MapLinkEdge>(
    VILLAGE_TO_FIRE_SCHOOL_LINKS.map((e) => [e.linkId, e]),
);

export function getMapLink(linkId: string): MapLinkEdge | undefined {
    return linkById.get(linkId);
}

export function getOutgoingLinks(fromMapId: string): MapLinkEdge[] {
    return VILLAGE_TO_FIRE_SCHOOL_LINKS.filter((e) => e.fromMapId === fromMapId);
}
