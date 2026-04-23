# 🎮 Kageverse Game Engine 

Kageverse là một **Web3 MMORPG 2D Game Engine** được xây dựng và lấy cảm hứng mạnh mẽ từ tượng đài Ninja School. Mã nguồn này đóng vai trò là một Boilerplate siêu mượt mà để các AI Agents (và bạn) có thể dễ dàng nhảy vào phát triển mở rộng.

## ✨ Tính năng nổi bật

- 🏗 **Kiến trúc Tối ưu**: Giao thoa sức mạnh của **React.js** (Quản lý UI/UX và logic Web3 phi tập trung) và **Phaser 3** (Render vòng lặp Game 2D hiệu năng cao).
- ⚡ **Dynamic Import**: Phaser Engine được load dưới dạng *Trì hoãn tải (Dynamic Loaded)*. Việc này giúp Game tải cực kỳ nhẹ nhàng mà không làm nghẽn main-thread của trình duyệt.
- 🔌 **Tích hợp Real-time Mạng**: Websocket Client có sẵn, tích hợp với Backend Golang và được thiết lập cơ chế *Chống Spam (Anti-spam)* tọa độ tự động.
- 🎨 **Giao diện Cao cấp (Premium Aesthetic)**: Setup chuẩn CSS Animations, Glassmorphism và Dark mode cực kỳ bí ẩn dành cho hệ sinh thái Game Web3.

## 🚀 Hướng dẫn Cài đặt & Chạy

### Yêu cầu tiên quyết
- Node.js (phiên bản 18+ khuyến nghị)
- npm hoặc yarn

### Cài đặt thư viện
Tại thư mục gốc của dự án `kageverse-game-engine`, chạy lệnh:
```bash
npm install
```

### Chạy Môi trường Phát triển (Dev)
```bash
npm run dev
```
Dự án sẽ khởi chạy mặc định tại cổng `http://localhost:5173`. Bạn chỉ việc mở trình duyệt và ngắm nhìn Ninja của bạn lên sóng.

## 🧱 Cấu trúc Dự án

```text
kageverse-game-engine/
├── .cursorrules           # Bắt buộc: Luật lệ và Document để cho IDE và hệ thống AI đọc.
├── src/
│   ├── components/        # Thư mục UI React (Overlay, HUD, Wallet Carts...)
│   ├── game/              # Lõi Game Phaser (Scenes, Entities, Configuration)
│   ├── network/           # Kết nối Backend Golang (Websockets, REST APIs)
│   └── App.tsx            # Trái tim của ứng dụng Web phi tập trung.
```

## 🧞 Dành cho AI Agents
Toàn bộ quy ước lập trình, tư chuẩn Import/Export, và ràng buộc State React/Phaser đã được đính kèm ở tệp tin `.cursorrules` ngay tại thư mục hiện tại. Các Agent khi tương tác với thư mục này sẽ biết chính xác mình cần code gì, đặt ở đâu!

---
*Powered by Kageverse Team.*
