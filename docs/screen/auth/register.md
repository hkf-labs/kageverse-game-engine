# Kageverse - Screen Specification: Authentication / Register

Mô tả chuẩn Giao diện (Screen/UI) Frontend cho quá trình Đăng ký tài khoản mới.

## Đặc tả Screen

* **Screen Name:** `AuthScene` (Trạng thái `register-view`)
* **Component Type:** Phaser 4 DOM Overlay Element
* **Template Path:** `public/assets/html/auth_form.html`

### Giao diện hiển thị (UI Elements)
Giao diện này mặc định bị dìm `display: none`. Nó chỉ nổi lên khi người chơi click "Register here" từ bản Login:
- **Tiêu đề**: "ENROLLMENT" (Tham gia học viện).
- **Input `reg-username`**: Text input để người chơi nhập định danh nhân vật (Tên In-game).
- **Input `reg-email`**: Khung địa chỉ chuẩn email bảo vệ tài khoản.
- **Input `reg-password`**: Mật khẩu, hiển thị placeholder nhắc nhở `min 6` ký tự.
- **Button `btn-register`**: Nút "REGISTER" màu xanh dương.
- **Link `switch-to-login`**: Đoạn text "Already enrolled? Back to Gates." để hoán đổi về UI Đăng nhập.

### Hành vi (Behaviors)
1. **Xác thực Client (Pre-flight Checks):** Cấm người chơi gửi lệnh nếu để rỗng 3 trường điền cơ bản. Ghi log cảnh báo bằng thẻ `statusText` của Phaser.
2. **Gửi Request:** Mã hóa payload và gọi trực tiếp tầng proxy kết nối `authAPI.register(username, email, password)`.
3. **Xử lý Trạng thái:** 
   - Đang chờ API: Set text "Registering..." màu bạc trên Phaser Canvas.
   - Bị từ chối (Form Invalid / Trùng lặp Email/User): Render ra lỗi trực tiếp từ API. Backend đã chuẩn hóa lỗi nào sẽ ra lỗi đó, ví dụ `auth.error.email_already_exists`.
   - **Thành công**:
     - Game flow Kageverse không yêu cầu bắt đăng nhập tay lại. Backend sẽ trả luôn `JWT Token` lúc Register.
     - Trích xuất JWT lưu vào localStorage. 
     - Gỡ DOM và thực thi `this.scene.start('MainScene')` để thả nhân vật vào thế giới In-game.
