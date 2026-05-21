import type { MapDetail, Vec2 } from './types';

function vec2(raw: unknown): Vec2 {
    const o = raw as Record<string, unknown> | null;
    return {
        x: typeof o?.x === 'number' ? o.x : 0,
        y: typeof o?.y === 'number' ? o.y : 0,
    };
}

/** Parse GET /api/v1/maps/:map_id (snake_case BE). */
export function parseMapDetail(raw: Record<string, unknown>): MapDetail {
    const size = (raw.size as Record<string, unknown>) ?? {};
    const coord = (raw.coordinate_system as Record<string, unknown>) ?? {};
    const assets = (raw.assets as Record<string, unknown>) ?? {};
    const spawn = (raw.spawn_points as Record<string, unknown>) ?? {};
    const rules = (raw.rules as Record<string, unknown>) ?? {};

    const byLinkRaw = (spawn.by_link_id as Record<string, unknown>) ?? {};
    const byLinkId: Record<string, Vec2> = {};
    for (const [k, v] of Object.entries(byLinkRaw)) {
        byLinkId[k] = vec2(v);
    }

    const linksRaw = Array.isArray(raw.links) ? raw.links : [];
    const links = linksRaw.map((item) => {
        const l = item as Record<string, unknown>;
        return {
            linkId: String(l.link_id ?? ''),
            targetMapId: String(l.target_map_id ?? ''),
            portalPoint: l.portal_point ? vec2(l.portal_point) : undefined,
            entryPoint: vec2(l.entry_point),
            linkType: String(l.link_type ?? 'portal'),
            requiredLevel: typeof l.required_level === 'number' ? l.required_level : undefined,
            requiredQuest: (l.required_quest as string | null | undefined) ?? null,
            unlockCondition: (l.unlock_condition as string | null) ?? null,
        };
    });

    return {
        mapId: String(raw.map_id ?? ''),
        displayNameKey: String(raw.display_name_key ?? ''),
        mapType: String(raw.map_type ?? 'combat_zone'),
        version: typeof raw.version === 'number' ? raw.version : 1,
        status: String(raw.status ?? 'active'),
        size: {
            width: typeof size.width === 'number' ? size.width : 3200,
            height: typeof size.height === 'number' ? size.height : 1200,
        },
        coordinateSystem: {
            origin: String(coord.origin ?? 'bottom_left'),
            xAxis: String(coord.x_axis ?? 'left_to_right'),
            yAxis: String(coord.y_axis ?? 'bottom_to_top'),
        },
        assets: {
            assetFolder: String(assets.asset_folder ?? ''),
            backgroundFile: String(assets.background_file ?? 'bg.jpg'),
            tilesetId: String(assets.tileset_id ?? ''),
        },
        spawnPoints: {
            default: vec2(spawn.default),
            byLinkId,
        },
        links,
        rules: {
            allowPvp: Boolean(rules.allow_pvp),
            allowCombat: Boolean(rules.allow_combat),
            allowMount: Boolean(rules.allow_mount),
        },
    };
}
