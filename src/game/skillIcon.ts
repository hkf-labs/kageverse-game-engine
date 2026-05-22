import type Phaser from 'phaser';

/** Texture key Phaser — `skill_icon_sword_slash_lv10`. */
export function skillTextureKey(skillID: string): string {
    return `skill_icon_${skillID.replace(/\./g, '_')}`;
}

/** Đường dẫn asset (loader / public): `assets/game/skills/icon_<id>.png`. */
export function skillIconAssetPath(skillID: string): string {
    return `assets/game/skills/icon_${skillID.replace(/\./g, '_')}.png`;
}

/** URL tuyệt đối cho DOM / HTMLImageElement (Vite public). */
export function skillIconPublicUrl(skillID: string): string {
    const base = import.meta.env.BASE_URL ?? '/';
    const root = base.endsWith('/') ? base : `${base}/`;
    return `${root}${skillIconAssetPath(skillID)}`;
}

/** Các skill đã có file `public/assets/game/skills/icon_*.png` — preload trong scene. */
export const SKILL_ICON_FILE_IDS: readonly string[] = [
    'bow.eagle_eye_lv15',
    'bow.falcon_lv70',
    'bow.hunter_lv40',
    'bow.master_lv80',
    'bow.piercing_lv35',
    'bow.rapid_lv25',
    'bow.shadow_step_lv60',
    'bow.shoot_lv10',
    'bow.steady_aim_lv20',
    'bow.storm_lv50',
    'bow.swift_lv45',
    'bow.wind_lv30',
    'sword.cleave_lv35',
    'sword.combo_lv25',
    'sword.crit_focus_lv30',
    'sword.divine_lv80',
    'sword.fury_lv45',
    'sword.guard_lv15',
    'sword.heavy_lv40',
    'sword.iron_body_lv20',
    'sword.kage_lv70',
    'sword.parry_lv60',
    'sword.slash_lv10',
    'sword.thunder_lv50',
];

export function registerSkillIconPreloads(scene: Phaser.Scene): void {
    for (const skillID of SKILL_ICON_FILE_IDS) {
        scene.load.image(skillTextureKey(skillID), skillIconAssetPath(skillID));
    }
}

const iconLoadPromises = new Map<string, Promise<boolean>>();

/**
 * Đảm bảo texture skill có trong TextureManager (dùng sau create — LoaderPlugin hay fail im lặng).
 * Trả về true nếu texture sẵn sàng.
 */
export function ensureSkillIconTexture(scene: Phaser.Scene, skillID: string): Promise<boolean> {
    const key = skillTextureKey(skillID);
    if (scene.textures.exists(key)) {
        return Promise.resolve(true);
    }

    const pending = iconLoadPromises.get(key);
    if (pending) return pending;

    const promise = new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (!scene.sys || !scene.textures) {
                resolve(false);
                return;
            }
            if (!scene.textures.exists(key)) {
                scene.textures.addImage(key, img);
            }
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = skillIconPublicUrl(skillID);
    }).finally(() => {
        iconLoadPromises.delete(key);
    });

    iconLoadPromises.set(key, promise);
    return promise;
}
