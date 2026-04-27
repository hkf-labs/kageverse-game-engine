# Hướng dẫn dành cho AI Agent — Kageverse Game Engine

Chào bạn, AI Agent! Tài liệu này cung cấp ngữ cảnh, quy tắc và cấu trúc cần thiết để giúp bạn đọc, hiểu và tự động generate code chính xác nhất cho dự án **Kageverse Game Engine**.

## 1. Ngữ cảnh dự án
- **Tên dự án:** Kageverse Web3 Engine
- **Thể loại:** Game Web3 MMORPG 2D (lấy cảm hứng từ Ninja School)
- **Công nghệ cốt lõi:** React (TypeScript), Vite, Phaser 3, WebSocket
- **Backend:** Golang WebSocket Server (mặc định chạy ở `ws://localhost:8080/ws`)

## 2. Quy tắc thư mục
Khi tạo ra hoặc thay đổi code, bắt buộc tuân thủ trách nhiệm của các thư mục sau:

- `/src/components/`: Chứa các React component thuần tuý. **Quy tắc:** Tuyệt đối không để logic game vào trong file React. React chỉ dùng cho UI (HUD, Menu, Wallet Integration).
- `/src/game/`: Chuyên chứa mọi đoạn code liên quan đến Phaser engine.
  - `/src/game/scenes/`: Chứa các scene của Phaser (ví dụ `MainScene.ts`). **Quy tắc:** Giữ scene gọn gàng, module hoá. Tách biệt logic game (di chuyển, va chạm, đồ hoạ) nếu có thể.
  - `/src/game/entities/`: Các class đại diện cho thực thể (Player, NPC, quái vật).
  - `/src/game/managers/`: Nơi quản lý asset, âm thanh, state của game.
- `/src/network/`: Code mạng, giao tiếp server.
  - Chứa `WebSocketClient.ts`. **Quy tắc:** Tối ưu hoá dung lượng gói tin gửi đi. Không gửi toạ độ hoặc dữ liệu nếu nhân vật đứng im (không có sự thay đổi).
- `/src/types/`: Nơi khai báo các interface TypeScript.

## 3. Kiến trúc & nguyên lý cốt lõi

### A. Dynamic Loading
- Game engine (Phaser) được tải động qua `import()` bên trong React component (`GameComponent.tsx`). Việc này nhằm tối ưu JavaScript bundle size và chuẩn bị sẵn cho Next.js SSR nếu cần thiết. **Không bao giờ được import tĩnh `phaser` ở ngoài cùng của React code.**

### B. Game Loop & dữ liệu React
- **Phân tách rạch ròi:** React lo DOM và Web3. Phaser lo Canvas và vòng lặp thời gian thực (update loop).
- Nên dùng event emitter (hoặc callback) để đẩy dữ liệu từ Phaser sang React. **Tuyệt đối không** nhúng các React state hook vào thẳng hàm `update()` của Phaser để tránh lag game.

### C. Đồng bộ mạng
- **Client Prediction:** Việc di chuyển luôn phản hồi tức thì trên client (để game mượt), nhưng backend mới giữ trạng thái cuối cùng (Authoritative Server).
- **Throttling:** Dữ liệu toạ độ cần được throttle hoặc kiểm tra khoảng cách lớn hơn 1 pixel để chống spam gói tin WebSocket.

## 4. Nguyên tắc code riêng cho AI
1. **Luôn dùng TypeScript:** Ép kiểu chặt chẽ. Cấm dùng `any` trừ khi không còn cách khác.
2. **Tính thẩm mỹ:** Khi tạo UI bằng React/CSS mới, phải theo đuổi phong cách premium, dark-mode, có hiệu ứng glow / glassmorphism.
3. **Immutability:** Thao tác array/object trong React phải theo chuẩn immutability (không biến đổi dữ liệu cũ).
4. **Cách import Phaser:** Bắt buộc import Phaser theo cú pháp `import * as Phaser from 'phaser';` (không dùng export default để tránh lỗi Rollup).

Cứ tuân thủ nghiêm ngặt cẩm nang này, bạn sẽ giữ cho mã nguồn Kageverse luôn sạch, chuẩn và mở rộng siêu tốc!
