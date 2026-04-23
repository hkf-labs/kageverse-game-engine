# 🎮 Kageverse Game Engine 

Kageverse là một **Web3 MMORPG 2D Game Engine** được xây dựng và lấy cảm hứng mạnh mẽ từ tượng đài Ninja School. Mã nguồn này đóng vai trò là một Boilerplate siêu mượt mà để các AI Agents (và bạn) có thể dễ dàng nhảy vào phát triển mở rộng.

## 📜 Cốt truyện: "BẢN NGÃ CỦA BÓNG TỐI"

**Khởi đầu:** Trong một thế giới mà ánh sáng và bóng tối bị đảo lộn, những người mang trong mình dòng máu nhẫn giả được tập hợp tại *Kage Academy*. Bạn không chỉ học cách chiến đấu mà còn học cách kiểm soát "Kage" (Cái bóng) – một nguồn năng lượng huyền bí có thể biến hình. Người chơi vào vai một Tập sự (Initiate) tích lũy Yên để nâng cấp bản thân.

**Tốt nghiệp & Web3:** Khi lên cấp trưởng thành, người chơi phải đánh bại chính cái bóng của mình. Bóng tối đó sau đó sẽ được Mint thành Hộ vệ NFT độc nhất — tấm vé thoát khỏi học viện để trở thành một Ronin.

**Thế giới Ronin:** Khám phá Rừng Than Khóc, Đảo Băng Giá,... săn Boss để nâng cấp trang bị (bằng Xu) và giao dịch trên Marketplace lấy Native Coin.

## ⚔️ Gameplay & The Economy

1. **Hệ thống Ngũ Hành (Combat):** Khắc chế Kim - Mộc - Thủy - Hỏa - Thổ. Kỹ năng thi triển *realtime* qua WebSockets (được kết nối song song với Golang Server).
2. **Kinh tế 3 tầng lũy tiến:**
   - **Yên (Off-chain):** Miễn phí, dành cho sinh hoạt cơ bản (máu, mana).
   - **Xu (Off-chain):** Cày cuốc từ nhiệm vụ khó, khoá một chiều để nâng cấp trang bị (giữ giá trị).
   - **Native Coin (On-chain):** Mua bán NFT cao cấp trên sàn giao dịch.

---

## ✨ Tính năng Công nghệ

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
├── AGENT.md               # Bắt buộc: Luật lệ và Document để hệ thống AI Agent đọc.
├── src/
│   ├── components/        # Thư mục UI React (Overlay, HUD, Wallet Carts...)
│   ├── game/              # Lõi Game Phaser (Scenes, Entities, Configuration)
│   ├── network/           # Kết nối Backend Golang (Websockets, REST APIs)
│   └── App.tsx            # Trái tim của ứng dụng Web phi tập trung.
```

## 🧞 Dành cho AI Agents
Toàn bộ quy ước lập trình, tư chuẩn Import/Export, và ràng buộc State React/Phaser đã được đính kèm ở tệp tin `AGENT.md` ngay tại thư mục hiện tại. Các Agent khi tương tác với thư mục này sẽ biết chính xác mình cần code gì, đặt ở đâu!

---
*Powered by Kageverse Team.*
