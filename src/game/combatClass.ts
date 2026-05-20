/**
 * Quy tắc tấn công theo phái — MVP: chỉ Cung (xạ chiến) đánh được quái
 * nằm dưới nhân vật (screen Y lớn hơn). Cận chiến + chưa vào lớp (`none`) thì không.
 */
export function canAttackMonsterBelow(playerClass: string | undefined): boolean {
    return playerClass === 'bow';
}

/** Quái nằm dưới hitbox player trên màn hình (cùng quy ước auto-select). */
export function isMonsterBelowPlayer(playerY: number, monsterScreenY: number): boolean {
    return monsterScreenY > playerY;
}
