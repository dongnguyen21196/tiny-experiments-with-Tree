# Tiny Experiments — app thực hành thử nghiệm nhỏ

Ứng dụng web (tiếng Việt, dùng được trên điện thoại và máy tính) giúp người chưa đọc sách đi hết một vòng:
**điều tò mò → hành động nhỏ có lịch → ghi nhận → nhìn lại → tiếp tục / điều chỉnh / dừng**.

> Công cụ thực hành độc lập, lấy cảm hứng từ *Tiny Experiments* của Anne-Laure Le Cunff. Không phải sản phẩm chính thức và không được tác giả bảo trợ.

Xây theo tài liệu *Kế hoạch phát triển ứng dụng thực hành Tiny Experiments* (v0.1), phạm vi **Must** của MVP cộng một số mục **Should**.

## Tính năng

| Màn hình | Chức năng |
|---|---|
| Giới thiệu | Giải thích ngắn phương pháp, cảnh báo dữ liệu chỉ lưu trên thiết bị, tạo mới hoặc khôi phục bản sao lưu |
| Wizard | Điều tò mò (có ví dụ) → hành động → ngày bắt đầu/kết thúc + ngày trong tuần → xem lại cam kết. Tự lưu nháp ở mỗi bước |
| Hôm nay | Thử nghiệm đang chạy, ghi “Đã thử / Chưa thực hiện” + quan sát tùy chọn, danh sách ngày chưa ghi nhận để ghi muộn, nhắc “Đến lúc nhìn lại” (ẩn được). Không streak, không điểm |
| Chi tiết | Dòng thời gian từng ngày, sửa/ghi muộn, điều chỉnh hành động/lịch (có lịch sử thay đổi), dừng sớm, kéo dài, xuất Markdown, xóa |
| Nhìn lại | Ghi chép đặt cạnh 3 câu hỏi (có ích / chưa phù hợp / muốn thử tiếp), “Chưa rõ bài học” là lựa chọn hợp lệ, quyết định + căn cứ, lưu nháp |
| Lịch sử | Các vòng cũ, quyết định, liên kết vòng trước/vòng sau, bản nháp |
| Dữ liệu | Xuất/nhập JSON (thay thế toàn bộ, có xem trước), xuất Markdown, múi giờ, xin lưu bền vững, bật/tắt thu sự kiện pilot, xóa tất cả |
| Nguồn & quyền riêng tư | Ghi nguồn, tuyên bố độc lập, dữ liệu nằm ở đâu và giới hạn |

## Quyết định kỹ thuật (theo ADR-01…06 của kế hoạch)

- **React 18 + TypeScript + Vite**, SPA tĩnh, deploy Vercel (`vercel.json` có CSP và security headers).
- **IndexedDB qua Dexie**, không đăng nhập, không backend, không đồng bộ. Một hồ sơ cục bộ cho mỗi trình duyệt.
- **Sao lưu JSON** để khôi phục / chuyển thiết bị; **Markdown** chỉ để đọc.
- **Tối đa một thử nghiệm đang mở** (đang chạy hoặc chờ nhìn lại); nhiều nháp / đã khép vòng.
- **Không AI, push, email, service worker, analytics bên thứ ba.**
- **Sự kiện pilot**: mặc định tắt; khi bật chỉ lưu metadata trên máy (allowlist, không có nội dung nhật ký), tự xóa sau 30 ngày, người dùng tự xuất file để chia sẻ.

Các quy tắc nghiệp vụ chính đã cài đặt: BR-01…BR-24 (ngày nghiệp vụ dạng `YYYY-MM-DD` theo timezone của thử nghiệm, “chưa ghi nhận” ≠ bỏ lỡ, một ghi nhận/ngày, revision khi điều chỉnh/kéo dài/dừng, không tự đóng vòng, kiểm tra version chống ghi đè giữa các tab, import all-or-nothing, xóa cascade…).

## Chạy trên máy

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration test (Vitest + fake-indexeddb)
npm run build      # typecheck + build ra dist/
```

Yêu cầu Node 18+ (đã thử với Node 22).

## Deploy lên Vercel

1. Vào vercel.com → **Add New Project** → chọn repo này.
2. Framework preset: **Vite** (build `npm run build`, output `dist`). Không cần biến môi trường.
3. Dùng **một URL production cố định**: dữ liệu IndexedDB gắn với từng domain, đổi domain/URL preview sẽ không thấy dữ liệu cũ (phải xuất/nhập JSON).

## Cấu trúc

```
src/
  domain/   types, ngày & timezone, quy tắc nghiệp vụ, nhãn, xuất Markdown (không phụ thuộc UI)
  db/       schema Dexie, các thao tác có transaction + version check, sao lưu/khôi phục, telemetry
  ui/       các màn hình và component dùng chung
  test/     test cho ngày giờ, vòng đời thử nghiệm, check-in, xóa, telemetry, backup
```

## Chưa làm (để sau theo kế hoạch)

- Việc nghiên cứu M0/M1/M5 (phỏng vấn, prototype test, pilot) — không phải phần code.
- PWA/offline khi tải lại, nhắc hệ thống, đồng bộ/tài khoản, AI, cộng đồng (REQ-13…15).
- Đổi timezone cho thử nghiệm đang chạy, nhiều lần thử/ngày, nhập kiểu gộp (merge).
- E2E tự động trong repo (đã chạy thử hành trình bằng Playwright ngoài repo) và kiểm thử thiết bị thật (Safari iPhone, Chrome Android).
