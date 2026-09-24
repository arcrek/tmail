---
title: "Triệt để giải quyết 520, 522, QUIC protocol error và tối ưu hóa hiệu năng"
date: 2026-09-24
summary: "Fix bottleneck admin_lock, debounce Stalwart JMAP, throttle frontend resolveCodes, update Nginx http2"
---

# Triệt để giải quyết 520, 522, QUIC protocol error và tối ưu hóa hiệu năng

## What happened
Hệ thống gặp tình trạng request bị Cloudflare timeout (522), rớt kết nối (520) và lỗi HTTP/3 QUIC (`net::ERR_QUIC_PROTOCOL_ERROR`) trên các endpoint: `/admin/api/session`, `/domains?page=1`, `/messages/stream`, `/messages/<id>`, và lỗi frontend "No receiving domains are available. Try again later".

### Nguyên nhân gốc rễ (Root Causes)
1. **Lock Contention**: `mail_runtime(request)` trong `src/api_server.py` chiếm giữ `admin_lock`. Trong khi đó, `refresh_domains` trong `src/admin_api.py` giữ `admin_lock` suốt thời gian gọi synchronous JMAP HTTP sang Stalwart (lấy 141KB danh sách domain mất 0.5s - 2s). Điều này khiến toàn bộ các request đọc tin nhắn, đọc session, đọc domains bị nghẽn đồng loạt.
2. **Thundering Herd / Thiếu Double-Checked Locking**: Khi debounce 60s hết hạn, nhiều request đồng thời vượt qua check ban đầu và xếp hàng chờ `admin_lock`. Không có check thứ hai bên trong lock, dẫn đến việc chúng lần lượt gọi JMAP liên tiếp.
3. **Frontend Request Flood (`resolveCodes`)**: Trong `frontend/src/components/InboxView.vue`, khi mở hộp thư có 15 mail, hàm `resolveCodes` dùng `Promise.allSettled` bắn đồng loạt 15 request `GET /messages/<id>` về single-worker Uvicorn. Khi worker đang nghẽn lock, hàng đợi request bị tràn dẫn đến Cloudflare 15s timeout (522) hoặc stream reset (520).
4. **False "No receiving domains"**: Trong `src/api_auth.py`, `active_domains` gán `source = []` trước khi nạp cache. Nếu cache chưa kịp nạp hoặc đang ghi, danh sách domain trả về rỗng khiến UI hiển thị cảnh báo không có domain.
5. **Nginx Host thiếu HTTP/2 và Keep-alive**: Host Nginx chỉ cấu hình `listen 443 ssl;` (HTTP/1.1) và thiếu `proxy_set_header Connection ""` cho upstream connection reuse.

## Decision & Fixes
1. **Tách Lock JMAP**: Tạo `jmap_lock = threading.Lock()` riêng cho `mail_runtime(request)`, hoàn toàn giải phóng `admin_lock` khỏi các luồng đọc tin nhắn/session.
2. **Tối ưu Debounce & JMAP Call**: Đưa `jmap.list_domains()` ra ngoài `admin_lock`, bổ sung double-checked locking bên trong lock để loại bỏ thundering herd.
3. **Throttle Frontend Concurrency**: Cập nhật `resolveCodes` trong `InboxView.vue` xử lý theo lô với concurrency = 2 thay vì bắn song song 15 request.
4. **Fallback Domain An toàn**: Cập nhật `active_domains` trong `src/api_auth.py` fallback về `state.get_frozen_domains()` khi cache rỗng, đảm bảo không bao giờ trả về danh sách rỗng.
5. **Nginx HTTP/2 & Keep-Alive**: Bật `http2` trên Nginx host và thêm `proxy_set_header Connection ""` trong block upstream proxy.

## Verification & Kết quả
- 282 backend unit tests pass 100%.
- 194 frontend unit tests pass 100%.
- Latency đo trực tiếp trên server:
  - `/site`: 0.004s (4ms)
  - `/domains?page=1`: 0.175s (175ms)
  - `/messages?page=1`: 0.006s (6ms)
  - `/favicon.ico`: 0.001s (1ms)
  - `/admin/api/session`: 0.016s (16ms)
- Đã build frontend dist, rebuild container `tmail-api-1`, restart `tmail-policy.service` và reload Nginx.

## Đánh giá nâng cấp VPS
- Hiện tại: 2 vCPU AMD EPYC, 1GB RAM, 2GB Swap.
- Sau khi tối ưu mã nguồn và lock, CPU load chỉ 0.10, memory ổn định ~650MB/954MB. Nút thắt trước đây là do nghẽn lock trong Python backend và request flood từ client, không phải do phần cứng thiếu hụt.
- Khuyến nghị: Cấu hình hiện tại hoàn toàn đáp ứng tốt lưu lượng hiện tại. Nếu tương lai lượng truy cập đồng thời tăng cao (> 20-30 user hoạt động cùng lúc), có thể nâng cấp lên VPS 2GB hoặc 4GB RAM để chạy Uvicorn multi-workers (`--workers 2`) và loại bỏ hoàn toàn việc dùng swap.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
