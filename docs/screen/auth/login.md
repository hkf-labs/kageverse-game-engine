# Kageverse - Screen Specification: Authentication / Login

Mô tả chuẩn Giao diện (Screen/UI) Frontend cho quá trình Đăng nhập.

## Đặc tả Screen

* **Screen Name:** `AuthScene` (Trạng thái `login-view`)
* **Component Type:** Phaser 4 DOM Overlay Element
* **Template Path:** `public/assets/html/auth_form.html`

### Giao diện hiển thị (UI Elements)
Form hiển thị ở trung tâm màn hình (Overlay ẩn tàng hình trên nền Game Canvas) bao gồm:
- **Tiêu đề**: Hiển thị "ACADEMY GATES" (Cổng học viện).
- **Input `identifier`**: Cho phép nhập Username hoặc Email.
- **Input `password`**: Khung nhập mật khẩu ẩn.
- **Button `btn-login`**: Nút "ENTER GAME" mang màu xanh xác nhận.
- **Link `switch-to-register`**: Đoạn text "New Initiate? Register here." với vai trò Button ảo để Toggle hoán đổi sang UI Đăng ký.
- **Status Text**: 1 object Text Canvas của Phaser (`statusText`) lơ lửng bên trên để hiển thị thông báo.

### Hành vi (Behaviors)
1. **Xác thực Client (Pre-flight Checks):** Cảnh báo người chơi cần điền đầy đủ Identifier và Password (Hiển thị ngay trên `statusText` nếu bắt rỗng).
2. **Gửi Request:** Trích xuất giá trị từ các trường `input` và gọi trực tiếp hàm `authAPI.login`.
3. **Xử lý Trạng thái:** 
   - Đang chờ API: Set text "Logging in..." (Màu bạc).
   - Validation Lỗi: Báo lỗi thông điệp được trả về từ tầng Backend (Màu đỏ).
   - **Thành công**:
     - Extract `access_token`.
     - Gắn JWT Token vào `localStorage` với định danh `kageverse_jwt`.
     - Chạy lệnh `this.scene.start('MainScene')` để kích hoạt game world loop.
