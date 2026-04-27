# 🎮 Kageverse Game Engine

Kageverse là một **Web3 MMORPG 2D Game Engine** được xây dựng và lấy cảm hứng mạnh mẽ từ tượng đài Ninja School. Mã nguồn này đóng vai trò là một boilerplate siêu mượt mà để các AI agent (và bạn) có thể dễ dàng nhảy vào phát triển mở rộng.

## 📜 Cốt truyện: "BẢN NGÃ CỦA BÓNG TỐI"

**Khởi đầu:** Trong một thế giới mà ánh sáng và bóng tối bị đảo lộn, những người mang trong mình dòng máu nhẫn giả được tập hợp tại *Kage Academy*. Bạn không chỉ học cách chiến đấu mà còn học cách kiểm soát "Kage" (cái bóng) — một nguồn năng lượng huyền bí có thể biến hình. Người chơi vào vai một Tập Sự (Initiate) tích luỹ Yên để nâng cấp bản thân.

**Tốt nghiệp & Web3:** Khi lên cấp trưởng thành, người chơi phải đánh bại chính cái bóng của mình. Bóng tối đó sau đó sẽ được mint thành Hộ Vệ NFT độc nhất — tấm vé thoát khỏi học viện để trở thành một Ronin.

**Thế giới Ronin:** Khám phá Rừng Than Khóc, Đảo Băng Giá,... săn boss để nâng cấp trang bị (bằng Xu) và giao dịch trên marketplace lấy native coin.

## ⚔️ Gameplay & nền kinh tế

1. **Hệ thống Ngũ Hành:** Khắc chế Kim — Mộc — Thuỷ — Hoả — Thổ. Kỹ năng thi triển *realtime* qua WebSocket (kết nối song song với Golang server).
2. **Kinh tế 3 tầng luỹ tiến:**
   - **Yên (off-chain):** Miễn phí, dành cho sinh hoạt cơ bản (máu, mana).
   - **Xu (off-chain):** Cày cuốc từ nhiệm vụ khó, khoá một chiều để nâng cấp trang bị (giữ giá trị).
   - **Native Coin (on-chain):** Mua bán NFT cao cấp trên sàn giao dịch.

---

## ✨ Tính năng công nghệ

- 🏗 **Kiến trúc tối ưu**: Giao thoa sức mạnh của **React** (quản lý UI/UX và logic Web3 phi tập trung) và **Phaser 3** (render vòng lặp game 2D hiệu năng cao).
- ⚡ **Dynamic Import**: Phaser engine được load dưới dạng *trì hoãn (dynamic loaded)*. Việc này giúp game tải cực nhẹ mà không làm nghẽn main-thread của trình duyệt.
- 🔌 **Tích hợp realtime**: WebSocket client có sẵn, tích hợp với backend Golang và được thiết lập cơ chế *chống spam* toạ độ tự động.
- 🎨 **Giao diện cao cấp**: Setup chuẩn CSS animations, glassmorphism và dark mode cực kỳ bí ẩn dành cho hệ sinh thái game Web3.

## 🚀 Hướng dẫn cài đặt & chạy

### Yêu cầu tiên quyết
- Node.js (phiên bản 18+ khuyến nghị)
- npm hoặc yarn

### Cài đặt thư viện
Tại thư mục gốc của dự án `kageverse-game-engine`, chạy lệnh:
```bash
npm install
```

### Chạy môi trường phát triển
```bash
npm run dev
```
Dự án sẽ khởi chạy mặc định tại `http://localhost:5173`. Bạn chỉ việc mở trình duyệt và ngắm nhìn ninja của bạn lên sóng.

## 🧱 Cấu trúc dự án

```text
kageverse-game-engine/
├── AGENT.md               # Bắt buộc: luật lệ và document để hệ thống AI agent đọc.
├── src/
│   ├── components/        # Thư mục UI React (overlay, HUD, wallet,...)
│   ├── game/              # Lõi game Phaser (scene, entity, config)
│   ├── network/           # Kết nối backend Golang (WebSocket, REST API)
│   └── App.tsx            # Trái tim của ứng dụng web phi tập trung.
```

## 🧞 Dành cho AI Agent
Toàn bộ quy ước lập trình, tiêu chuẩn import/export, và ràng buộc state React/Phaser đã được đính kèm ở `AGENT.md` ngay tại thư mục gốc. Các agent khi tương tác với thư mục này sẽ biết chính xác mình cần code gì, đặt ở đâu!

---
*Powered by Kageverse Team.*
