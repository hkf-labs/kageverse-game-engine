export type FlowState = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export type QuestState = 'not_started' | 'in_progress' | 'completed';

export type MapNodeState = 'locked' | 'newly_unlocked' | 'unlocked';

export type MapNode = {
    id: string;
    state: MapNodeState;
};

export type MainQuest = {
    id: string;
    state: QuestState;
    currentQty: number;
    requiredQty: number;
};

export type Reward = {
    exp: number;
    softCurrency: number;
    items: Array<{ id: string; qty: number }>;
};

export type OnboardingState = {
    flowState: FlowState;
    character: {
        id: string;
        displayName: string;
    };
    mainQuest: MainQuest;
    mapNodes: MapNode[];
    reward?: Reward;
    nextObjective?: string;
    toast?: string;
};

export type OnboardingApiEnvelope<T> = {
    ok: boolean;
    data: T;
};
