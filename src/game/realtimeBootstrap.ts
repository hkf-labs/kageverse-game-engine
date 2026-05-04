import * as Phaser from 'phaser';
import { connectRealtime } from '../network/realtime';
import { t } from '../i18n';

// bootstrapRealtimeForGameEntry — gọi sau khi setTokens + saveCurrentCharacter
// thành công, ngay trước khi scene.start vào map đầu tiên. Idempotent
// (wsClient singleton — đã open thì no-op). 2 scene dùng chung helper này:
//   - AuthScene.goToGameOrCharacterCreate (login với character đã có).
//   - CharacterCreateScene.submit (vừa tạo character → vào game).
//
// session_replaced (close 4010) hoặc auth_failed (close 4001) → quay về
// AuthScene + alert. Caller scene.stop() bỏ qua vì scene.start tự stop.
export function bootstrapRealtimeForGameEntry(scene: Phaser.Scene): void {
    connectRealtime({
        onSessionReplaced: () => {
            scene.scene.start('AuthScene');
            window.alert(t('realtime.error.session_replaced'));
        },
        onAuthFailed: () => {
            scene.scene.start('AuthScene');
        },
    });
}
