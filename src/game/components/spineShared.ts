import {
    AssetManager,
    AtlasAttachmentLoader,
    SkeletonJson,
    AnimationState,
    AnimationStateData,
    Skeleton,
    type SkeletonData,
} from '@esotericsoftware/spine-canvas';

const MALE_BASE_SPINE_PATH = '/assets/characters/male_base/';
const SPINE_SCALE = 0.1;

export type SharedSpineData = {
    skeletonData: SkeletonData;
    stateData: AnimationStateData;
};

let shared: SharedSpineData | null = null;
let loading = false;
const waitQueue: Array<(data: SharedSpineData) => void> = [];

/** Load male_base Spine data once — dùng chung cho mọi remote player. */
export function ensureSharedSpineData(onReady: (data: SharedSpineData) => void): void {
    if (shared) {
        onReady(shared);
        return;
    }
    waitQueue.push(onReady);
    if (loading) return;
    loading = true;

    const assetManager = new AssetManager(MALE_BASE_SPINE_PATH);
    assetManager.loadText('male_base.json');
    assetManager.loadTextureAtlas('male_base.atlas');

    const poll = (): void => {
        if (assetManager.isLoadingComplete()) {
            const atlas = assetManager.require('male_base.atlas');
            const json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
            json.scale = SPINE_SCALE;
            const skeletonData = json.readSkeletonData(assetManager.require('male_base.json'));
            const stateData = new AnimationStateData(skeletonData);
            stateData.defaultMix = 0.2;
            shared = { skeletonData, stateData };
            loading = false;
            const q = waitQueue.splice(0);
            for (const cb of q) cb(shared);
            return;
        }
        if (assetManager.hasErrors()) {
            console.error('[spineShared] load errors:', assetManager.getErrors());
            loading = false;
            waitQueue.length = 0;
            return;
        }
        setTimeout(poll, 50);
    };
    poll();
}

export function createSpineInstance(data: SharedSpineData): {
    skeleton: Skeleton;
    animState: AnimationState;
} {
    const skeleton = new Skeleton(data.skeletonData);
    skeleton.setToSetupPose();
    skeleton.scaleY = -1;
    const animState = new AnimationState(data.stateData);
    animState.setAnimation(0, 'idle', true);
    return { skeleton, animState };
}
