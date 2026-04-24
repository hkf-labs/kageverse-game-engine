import type { OnboardingGateway } from './OnboardingGateway';
import type { FlowState, OnboardingState } from './types';

function toFlowState(mainQuestState: OnboardingState['mainQuest']['state'], currentQty: number): FlowState {
    if (mainQuestState === 'not_started') return 'S1';
    if (mainQuestState === 'completed') return 'S4';
    if (currentQty >= 5) return 'S3';
    return 'S2';
}

export class MockOnboardingGateway implements OnboardingGateway {
    private state: OnboardingState = {
        flowState: 'S1',
        character: {
            id: 'char_001',
            displayName: 'DemoNinja',
        },
        mainQuest: {
            id: 'quest_main_001',
            state: 'not_started',
            currentQty: 0,
            requiredQty: 5,
        },
        mapNodes: [
            { id: 'fog_village', state: 'unlocked' },
            { id: 'school_map', state: 'locked' },
            { id: 'normal_monster_map_01', state: 'locked' },
        ],
    };

    async getOnboardingState(): Promise<OnboardingState> {
        return this.cloneState();
    }

    async acceptMainQuest(): Promise<OnboardingState> {
        this.state.mainQuest.state = 'in_progress';
        this.state.mainQuest.currentQty = 0;
        this.state.nextObjective = 'Thu thap Manh Da Dinh Vi (0/5)';
        this.state.flowState = 'S2';
        this.state.toast = undefined;
        return this.cloneState();
    }

    async simulateShardDrop(): Promise<OnboardingState> {
        if (this.state.mainQuest.state !== 'in_progress') return this.cloneState();
        this.state.mainQuest.currentQty = Math.min(this.state.mainQuest.currentQty + 1, this.state.mainQuest.requiredQty);
        this.state.toast = `Da thu thap Manh Da Dinh Vi: ${this.state.mainQuest.currentQty}/${this.state.mainQuest.requiredQty}`;
        this.state.flowState = toFlowState(this.state.mainQuest.state, this.state.mainQuest.currentQty);
        this.state.nextObjective = this.state.flowState === 'S3'
            ? 'Quay ve gap Truong Lang'
            : `Thu thap Manh Da Dinh Vi (${this.state.mainQuest.currentQty}/${this.state.mainQuest.requiredQty})`;
        return this.cloneState();
    }

    async turnInMainQuest(): Promise<OnboardingState> {
        if (this.state.mainQuest.currentQty < this.state.mainQuest.requiredQty) return this.cloneState();
        this.state.mainQuest.state = 'completed';
        this.state.flowState = 'S4';
        this.state.nextObjective = 'Cac khu vuc moi da duoc mo khoa';
        this.state.reward = {
            exp: 100,
            softCurrency: 300,
            items: [{ id: 'basic_heal_pack', qty: 3 }],
        };
        this.state.mapNodes = this.state.mapNodes.map((node) => {
            if (node.id === 'school_map' || node.id === 'normal_monster_map_01') {
                return { ...node, state: 'newly_unlocked' };
            }
            return node;
        });
        return this.cloneState();
    }

    private cloneState(): OnboardingState {
        return JSON.parse(JSON.stringify(this.state)) as OnboardingState;
    }
}
