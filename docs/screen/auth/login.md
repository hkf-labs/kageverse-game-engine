# Kageverse — Đặc tả màn hình: Đăng nhập

Mô tả chuẩn giao diện frontend cho quá trình đăng nhập.

## Đặc tả màn hình

* **Tên scene:** `AuthScene` (trạng thái `login-view`)
* **Loại component:** Phaser 4 DOM Overlay Element
* **Đường dẫn template:** `public/assets/html/auth_form.html`

### Thành phần giao diện
Form hiển thị ở trung tâm màn hình (overlay ẩn tàng hình trên nền game canvas) bao gồm:
- **Tiêu đề**: Hiển thị "ACADEMY GATES" (Cổng học viện).
- **Input `identifier`**: Cho phép nhập username hoặc email.
- **Input `password`**: Khung nhập mật khẩu ẩn.
- **Button `btn-login`**: Nút "ENTER GAME" mang màu xanh xác nhận.
- **Link `switch-to-register`**: Đoạn text "New Initiate? Register here." với vai trò button ảo để toggle hoán đổi sang UI đăng ký.
- **Status text**: Một object text canvas của Phaser (`statusText`) lơ lửng bên trên để hiển thị thông báo.

### Hành vi
1. **Xác thực phía client:** Cảnh báo người chơi cần điền đầy đủ identifier và password (hiển thị ngay trên `statusText` nếu bắt rỗng).
2. **Gửi request:** Trích xuất giá trị từ các trường `input` và gọi trực tiếp hàm `authAPI.login`.
3. **Xử lý trạng thái:**
   - Đang chờ API: set text "Logging in..." (màu bạc).
   - Validation lỗi: báo lỗi thông điệp được trả về từ tầng backend (màu đỏ).
   - **Thành công**:
     - Trích xuất `access_token`.
     - Gắn JWT token vào `localStorage` với định danh `kageverse_jwt`.
     - Chạy lệnh `this.scene.start('MainScene')` để kích hoạt game world loop.
