# Hướng dẫn dành cho AI (AI Guidelines) - Kageverse Game Engine

Chào bạn, AI Agent! Tài liệu này cung cấp ngữ cảnh, quy tắc và cấu trúc cần thiết để giúp bạn đọc, hiểu và tự động generate code chính xác nhất cho dự án **Kageverse Game Engine**.

## 1. Ngữ cảnh Dự án (Project Context)
- **Tên Dự án:** Kageverse Web3 Engine
- **Thể loại:** Game Web3 MMORPG 2D (Lấy cảm hứng từ Ninja School)
- **Công nghệ Cốt lõi:** React (TypeScript), Vite, Phaser 3, WebSocket
- **Backend:** Golang Websocket Server (Mặc định chạy ở `ws://localhost:8080/ws`)

## 2. Quy tắc Thư mục (Directory Structure)
Khi tạo ra hoặc thay đổi code, bắt buộc tuân thủ trách nhiệm của các thư mục sau:

- `/src/components/`: Chứa các React Component thuần túy. **Quy tắc:** Tuyệt đối không để logic Game vào trong file React. React chỉ dùng cho giao diện UI (HUD, Menu, Wallet Integration).
- `/src/game/`: Chuyên chứa mọi đoạn code liên quan đến Phaser Engine.
  - `/src/game/scenes/`: Chứa các Scene của Phaser (ví dụ `MainScene.ts`). **Quy tắc:** Giữ Scene gọn gàng, module hóa. Tách biệt logic game (di chuyển, va chạm đồ họa) nếu có thể.
  - `/src/game/entities/`: Các class đại diện cho thực thể (Player, NPC, Quái vật).
  - `/src/game/managers/`: Nơi quản lý Asset, Âm thanh, State của Game.
- `/src/network/`: Code mạng, giao tiếp Server.
  - Chứa `WebSocketClient.ts`. **Quy tắc:** Tối ưu hóa dung lượng gói tin gửi đi. Không gửi tọa độ hoặc dữ liệu nếu nhân vật đứng im (không có sự thay đổi).
- `/src/types/`: Nơi khai báo Interfaces của TypeScript.

## 3. Kiến trúc & Nguyên lý cốt lõi (Architecture & Principles)

### A. Dynamic Loading (Tải động thư viện)
- Game engine (Phaser) được tải động thông qua `import()` bên trong React Component (`GameComponent.tsx`). Điều này nhằm tối ưu Javascript Bundle size và chuẩn bị sẵn cho Next.js SSR nếu cần thiết. **Không bao giờ được import tĩnh 'phaser' ở ngoài cùng của React Code.**

### B. Game Loop & Reactivity (Vòng lặp Game & Dữ liệu React)
- **Phân tách Rạch ròi:** React lo DOM và Web3. Phaser lo Canvas và Vòng lặp thời gian thực (update loop).
- Nên dùng Event Emitter (hoặc callbacks) để đẩy dữ liệu từ Phaser sang React. **Tuyệt đối không** nhúng các State hook của React vào thẳng hàm `update()` của Phaser để tránh lag game.

### C. Networking Sync (Đồng bộ Mạng)
- **Client Prediction:** Việc di chuyển luôn phản hồi tức thì trên Client (để game mượt), nhưng Backend mới giữ trạng thái cuối cùng (Authoritative Server).
- **Throttling:** Dữ liệu tọa độ cần được Throttle hoặc kiểm tra khoảng cách lớn hơn 1 pixel để chống Spam gói tin Websocket.

## 4. Nguyên tắc Code riêng cho AI (Code Generation Rules)
1. **Luôn dùng TypeScript:** Ép kiểu chặt chẽ. Cấm dùng `any` trừ khi không còn cách khác.
2. **Tính Thẩm mỹ (Aesthetic):** Khi tạo UI bằng React/CSS mới, phải theo đuổi phong cách Premium, Dark-mode, có hiệu ứng Glow/Glassmorphism.
3. **Immutability:** Thao tác Array/Object trong React phải theo chuẩn Immutability (không biến đổi dữ liệu cũ).
4. **Cách Import Phaser:** Bắt buộc import Phaser theo cú pháp `import * as Phaser from 'phaser';` (không dùng export default để tránh lỗi Rollup).

Cứ tuân thủ nghiêm ngặt cẩm nang này, bạn sẽ giữ cho mã nguồn Kageverse luôn sạch, chuẩn và mở rộng siêu tốc!
