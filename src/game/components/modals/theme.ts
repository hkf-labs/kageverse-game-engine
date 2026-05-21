/**
 * Design tokens cho mọi modal/dialog/panel.
 *
 * Đổi 1 chỗ → đổi visual của toàn bộ modal. Modal subclass KHÔNG hard-code
 * màu/border/radius — tham chiếu từ MODAL_THEME.
 */

export const MODAL_COLORS = {
    /** Border vàng chủ đạo — Edo / Web3 premium feel. */
    border: '#e29e4a',
    /** Border accent (focus outline, glow). */
    borderAccent: '#ffea7a',
    /** Header background (đậm hơn body). */
    headerBg: '#4d2d13',
    /** Body / panel background gradient (top → bottom). */
    panelBgTop: '#2a1808',
    panelBgBottom: '#1a0f04',
    /** Backdrop overlay (full-screen dim). */
    backdrop: 'rgba(0,0,0,0.55)',
    /** Title text. */
    title: '#ffea7a',
    /** Body text default. */
    text: '#ffe4c4',
    /** Muted / hint text. */
    textMuted: '#a89070',
    /** Status footer text default. */
    statusText: '#aaa',
    /** Status — error. */
    statusError: '#ff8a8a',
    /** Status — success. */
    statusOk: '#bdf0a0',
    /** Close button text (red ✕). */
    closeBtn: '#ff8a8a',
    /** Section divider line. */
    divider: '#4d2d13',
    /** Footer background (status bar / action bar). */
    footerBg: '#1a0f04',
} as const;

export const MODAL_SIZES = {
    borderRadius: '14px',
    borderWidth: '3px',
    /**
     * Panel width breakpoints. Cố định pixel — viewport fit do CSS `zoom`
     * trên panel xử lý (xem createModalShell). Đừng dùng vw/vh trong width
     * ở đây vì zoom sẽ double-clamp.
     */
    width: {
        sm: '440px',
        md: '560px',
        lg: '720px',
    },
    /** Numeric design width tương ứng — dùng để tính zoom factor. */
    designWidthPx: {
        sm: 440,
        md: 560,
        lg: 720,
    },
    /** Header padding. */
    headerPaddingY: '10px',
    headerPaddingX: '16px',
    /** Panel max-height (giới hạn chiều cao trên màn nhỏ). */
    maxHeight: '92vh',
} as const;

/**
 * z-index layering — đảm bảo modal đè lên HUD/canvas + dialog đè lên modal.
 * QuestTracker / BuffIndicator / BossHPBar là Phaser-native (sống trong canvas)
 * nên không có z-index DOM — modal HTML overlay luôn nằm trên canvas tự động.
 *
 * ## Input (phím chức năng) — xem `inputFocus.ts`
 *
 * Một UI active tại một thời điểm (layer cao nhất). Không trộn ActionMenu Phaser
 * với menu item DOM trên modal.
 *
 * Thứ tự DOM (z-index):
 *  - panel: ChatPanel (100)
 *  - modal: Inventory / Shop / … (110)
 *  - modalItemMenu / tooltip: sub-menu & Xem chi tiết trên modal (150)
 *  - blockingDialog: Settings / QuestLog / HoshiUpgrade (200)
 *  - cinematic: EndMvpOverlay / DeathMenu (250)
 *  - confirm: ConfirmDialog (300)
 *  - toast: PickupToast (350)
 */
export const MODAL_Z_INDEX = {
    chat: 100,
    modal: 110,
    /** Menu item trong modal (Bùa Dịch Chuyển, …) — `ModalItemMenu`. */
    modalItemMenu: 150,
    /** Sub-modal nhẹ (vd InventoryModal "Xem chi tiết"). Cùng tầng modalItemMenu. */
    tooltip: 150,
    blockingDialog: 200,
    cinematic: 250,
    confirm: 300,
    toast: 350,
} as const;

export type ModalSize = keyof typeof MODAL_SIZES.width;
export type ModalLayer = keyof typeof MODAL_Z_INDEX;

/**
 * Style preset cho close button (✕) ở góc phải header. Modal nào cũng dùng
 * cùng 1 style — extract để DRY.
 */
export const MODAL_CLOSE_BTN_CSS = `
    width: 40px;
    text-align: center;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    color: ${MODAL_COLORS.closeBtn};
    padding: ${MODAL_SIZES.headerPaddingY} 0;
    flex-shrink: 0;
    user-select: none;
`;

/**
 * Style preset cho header bar (title + close).
 */
export const MODAL_HEADER_CSS = `
    display: flex;
    align-items: center;
    background: ${MODAL_COLORS.headerBg};
    border-bottom: 2px solid ${MODAL_COLORS.border};
    flex-shrink: 0;
`;

/**
 * Style preset cho status footer (1 dòng feedback dưới đáy modal).
 */
export const MODAL_STATUS_CSS = `
    padding: 6px 14px;
    font-size: 11px;
    color: ${MODAL_COLORS.statusText};
    background: ${MODAL_COLORS.footerBg};
    text-align: center;
    min-height: 18px;
    border-top: 1px solid ${MODAL_COLORS.divider};
`;
