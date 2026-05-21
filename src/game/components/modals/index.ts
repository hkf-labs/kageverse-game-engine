/**
 * Barrel cho mọi modal/dialog/panel + shared modal infrastructure.
 *
 * Thêm modal mới: tạo file ở đây, export ở dưới, đồng thời re-export ở
 * `components/index.ts` để giữ public API ngoài `components/` không đổi.
 */

export { BaseModal } from './BaseModal';
export { createModalShell } from './createModalShell';
export type { ModalShell, ModalShellOptions } from './createModalShell';
export {
    MODAL_COLORS,
    MODAL_SIZES,
    MODAL_Z_INDEX,
    MODAL_CLOSE_BTN_CSS,
    MODAL_HEADER_CSS,
    MODAL_STATUS_CSS,
} from './theme';
export type { ModalSize, ModalLayer } from './theme';

export { CharacterInfoModal } from './CharacterInfoModal';
export { ChatPanel } from './ChatPanel';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogOpenParams } from './ConfirmDialog';
export { DeathMenu } from './DeathMenu';
export type { DeathChoice } from './DeathMenu';
export { EndMvpOverlay, detectEndMvpClass } from './EndMvpOverlay';
export { EquipmentModal } from './EquipmentModal';
export { HoshiUpgradeModal } from './HoshiUpgradeModal';
export { InventoryModal } from './InventoryModal';
export type { CharacterCurrencies } from './InventoryModal';
export { ModalItemMenu } from './ModalItemMenu';
export type { ModalItemMenuEntry, ModalItemMenuOptions } from './ModalItemMenu';
export { QuestLogPanel, questDisplayName, targetDisplayName } from './QuestLogPanel';
export { SettingsModal } from './SettingsModal';
export { ShopModal } from './ShopModal';
export { SkillModal } from './SkillModal';
