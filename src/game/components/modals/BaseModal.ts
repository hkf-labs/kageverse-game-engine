import * as Phaser from 'phaser';
import type { GameComponent } from '../types';
import { createModalShell, type ModalShell, type ModalShellOptions } from './createModalShell';

/**
 * BaseModal — abstract base cho mọi modal/dialog/panel dùng `createModalShell`.
 *
 * Wrap vòng đời lazy chuẩn (build DOM khi mở, teardown khi đóng) + state
 * `visible` + cleanup ở `destroy()`. Subclass chỉ cần implement 2 hook:
 *
 *   - `buildShellOptions()` — trả về config cho `createModalShell` (title,
 *     size, layer, withStatus, ...). Hàm gọi mỗi lần build, nên có thể đọc
 *     state subclass (vd ShopModal trả title kèm npc name).
 *
 *   - `populateShell(shell)` — append content riêng vào `shell.body` (grid,
 *     list, button, ...) + register locale sync nếu cần. Gọi 1 lần ngay sau
 *     khi shell vừa build, trước khi `ensureShell` trả ref.
 *
 * Subclass tự định nghĩa `open()` / `close()` / `toggle()` (signature có thể
 * đa dạng — open(params), open(id), show(className), ...) và bên trong gọi
 * `this.ensureShell()` / `this.teardownShell()`. Field-specific refs (gridEl,
 * detailEl, ...) override `teardownShell()` để clear thêm.
 *
 * Pattern này không ép open/close API uniform — lý do: ConfirmDialog có
 * open(params), DeathMenu dùng showKietSucButton/showOptions, EndMvpOverlay
 * dùng show(className) với fade animation. Ép cùng signature sẽ phải dùng
 * any/overload phức tạp.
 */
export abstract class BaseModal implements GameComponent {
    protected scene: Phaser.Scene;
    protected shell?: ModalShell;
    protected visible = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** GameComponent contract — DOM tạo lazy ở open/show/toggle, nên create()
     * default no-op. Subclass có thể override để set up Phaser keyboard key
     * (vd CharacterInfoModal đăng ký UP/DOWN key luôn ở create). */
    create(): void {
        // no-op
    }

    /** GameComponent contract — đảm bảo overlay được dọn khi scene shutdown. */
    destroy(): void {
        this.teardownShell();
    }

    isOpen(): boolean {
        return this.visible;
    }

    /** Subclass cung cấp shell options. Gọi mỗi lần build (thường mỗi lần
     * open lần đầu sau khi đóng). Có thể đọc state subclass — vd ShopModal
     * trả title đã prefix tên NPC. */
    protected abstract buildShellOptions(): Omit<ModalShellOptions, 'scene'>;

    /** Subclass append content riêng vào shell.body + wire listener +
     * registerLocaleSync. Gọi 1 lần ngay sau buildShellOptions, ngay trước
     * khi ensureShell trả ref cho caller. */
    protected abstract populateShell(shell: ModalShell): void;

    /**
     * Đảm bảo shell tồn tại — build nếu chưa có, no-op nếu đã build.
     * Trả undefined nếu canvas chưa attach (mount='canvas-parent') —
     * caller cần guard.
     */
    protected ensureShell(): ModalShell | undefined {
        if (this.shell) return this.shell;
        const opts = this.buildShellOptions();
        const shell = createModalShell({ scene: this.scene, ...opts });
        if (!shell) return undefined;
        this.shell = shell;
        this.populateShell(shell);
        return shell;
    }

    /**
     * Remove DOM + clear shell ref + reset visible. Idempotent.
     *
     * Subclass override để clear thêm field-specific refs (gridEl, detailEl,
     * ...). Nhớ gọi `super.teardownShell()` để chạy logic chung. Ví dụ:
     *
     *   protected teardownShell(): void {
     *       super.teardownShell();
     *       this.gridEl = undefined;
     *       this.detailEl = undefined;
     *   }
     */
    protected teardownShell(): void {
        this.shell?.teardown();
        this.shell = undefined;
        this.visible = false;
    }
}
