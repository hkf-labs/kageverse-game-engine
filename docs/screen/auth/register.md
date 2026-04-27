# Kageverse — Đặc tả màn hình: Đăng ký

Mô tả chuẩn giao diện frontend cho quá trình đăng ký tài khoản mới.

## Đặc tả màn hình

* **Tên scene:** `AuthScene` (trạng thái `register-view`)
* **Loại component:** Phaser 4 DOM Overlay Element
* **Đường dẫn template:** `public/assets/html/auth_form.html`

### Thành phần giao diện
Giao diện này mặc định bị dìm `display: none`. Nó chỉ nổi lên khi người chơi click "Register here" từ form login:
- **Tiêu đề**: "ENROLLMENT" (tham gia học viện).
- **Input `reg-username`**: Text input để người chơi nhập định danh nhân vật (tên in-game).
- **Input `reg-email`**: Khung địa chỉ chuẩn email bảo vệ tài khoản.
- **Input `reg-password`**: Mật khẩu, hiển thị placeholder nhắc nhở `min 6` ký tự.
- **Button `btn-register`**: Nút "REGISTER" màu xanh dương.
- **Link `switch-to-login`**: Đoạn text "Already enrolled? Back to Gates." để hoán đổi về UI đăng nhập.

### Hành vi
1. **Xác thực phía client:** Cấm người chơi gửi lệnh nếu để rỗng 3 trường điền cơ bản. Ghi log cảnh báo bằng thẻ `statusText` của Phaser.
2. **Gửi request:** Mã hoá payload và gọi trực tiếp tầng proxy kết nối `authAPI.register(username, email, password)`.
3. **Xử lý trạng thái:**
   - Đang chờ API: set text "Registering..." màu bạc trên Phaser canvas.
   - Bị từ chối (form invalid / trùng lặp email/user): render ra lỗi trực tiếp từ API. Backend đã chuẩn hoá lỗi nào sẽ ra lỗi đó, ví dụ `auth.error.email_already_exists`.
   - **Thành công**:
     - Game flow Kageverse không yêu cầu bắt đăng nhập tay lại. Backend sẽ trả luôn JWT token lúc register.
     - Trích xuất JWT lưu vào localStorage.
     - Gỡ DOM và thực thi `this.scene.start('MainScene')` để thả nhân vật vào thế giới in-game.
