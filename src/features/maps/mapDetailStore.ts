import { mapsAPI } from '../../network/api';
import type { MapDetail } from './types';

const cache = new Map<string, MapDetail>();

export async function loadMapDetail(mapId: string): Promise<MapDetail> {
    const cached = cache.get(mapId);
    if (cached) return cached;
    const detail = await mapsAPI.getDetail(mapId);
    cache.set(mapId, detail);
    return detail;
}

export function peekMapDetail(mapId: string): MapDetail | undefined {
    return cache.get(mapId);
}

export function peekLinkTargetMapId(fromMapId: string, linkId: string): string | undefined {
    const detail = cache.get(fromMapId);
    if (!detail) return undefined;
    return detail.links.find((l) => l.linkId === linkId)?.targetMapId;
}

export function peekSpawnForIncomingLink(mapId: string, linkId: string): { x: number; y: number } | undefined {
    const detail = cache.get(mapId);
    if (!detail) return undefined;
    return detail.spawnPoints.byLinkId[linkId];
}

export function clearMapDetailCache(): void {
    cache.clear();
}
