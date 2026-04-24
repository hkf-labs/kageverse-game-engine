import type { CharacterDTO } from '../network/api';

const CURRENT_CHARACTER_KEY = 'kageverse_current_character';

export type CurrentCharacter = {
    id: string;
    displayName: string;
    gender?: string;
    costumePrimaryColor?: string;
};

export function saveCurrentCharacter(character: CharacterDTO) {
    const payload: CurrentCharacter = {
        id: character.id,
        displayName: character.display_name,
        gender: character.gender,
        costumePrimaryColor: character.costume_primary_color,
    };
    localStorage.setItem(CURRENT_CHARACTER_KEY, JSON.stringify(payload));
}

export function getCurrentCharacter(): CurrentCharacter | null {
    const raw = localStorage.getItem(CURRENT_CHARACTER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as CurrentCharacter;
    } catch {
        return null;
    }
}
