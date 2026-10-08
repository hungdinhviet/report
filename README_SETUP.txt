# DINHVIETHUNG REPORT

## Cấu trúc

- `index.html` — màn hình DINHVIETHUNG.
- `login.html` — đăng nhập/OTP.
- `dashboard.html` — menu sau khi đăng nhập.
- `package/index.html` — PACKAGE cũ của bạn, giữ nguyên chức năng.
- `backend/Code.gs` — backend Google Apps Script.

## 1. Tạo backend

1. Tạo một Google Sheet mới.
2. Extensions -> Apps Script.
3. Dán `backend/Code.gs`.
4. Chạy `setup()` một lần.
5. Deploy -> New deployment -> Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Copy Web App URL.

## 2. Cấu hình URL

Mở:
- `login.html`
- `dashboard.html`
- `package/index.html`

Tìm:

`DAN_URL_GOOGLE_APPS_SCRIPT_VAO_DAY`

thay bằng URL Web App.

Ví dụ:

`https://script.google.com/macros/s/XXXXXXXX/exec`

Sau đó upload toàn bộ thư mục lên repository GitHub Pages.

## 3. Luồng hoạt động

1. Mở `/report/` -> màn hình DINHVIETHUNG.
2. Bấm phím hoặc click -> Login.
3. Nhập email `@mobifone.vn`.
4. Backend gửi OTP về email.
5. Nhập OTP.
6. Nếu user mới -> tạo PENDING + gửi email duyệt tới:
   `hung.dinhviet1997@gmail.com`
7. Admin bấm DUYỆT.
8. User đăng nhập lại bằng OTP.
9. Vào Dashboard -> PACKAGE.
10. PACKAGE kiểm tra session trước khi tải Google Sheet.

## Lưu ý bảo mật

- Không đặt API key Gmail/Resend vào JavaScript.
- OTP được lưu dưới dạng SHA-256.
- OTP hết hạn sau 5 phút.
- Session mặc định 7 ngày.
- Chỉ `@mobifone.vn` được đăng ký.
- Quyền duyệt nằm ở backend, không nằm trong GitHub Pages.

## Lưu ý

Google Apps Script dùng hạn mức gửi email của tài khoản Google. Nếu website có lượng đăng ký lớn, nên chuyển phần gửi mail sang dịch vụ email transactional.
