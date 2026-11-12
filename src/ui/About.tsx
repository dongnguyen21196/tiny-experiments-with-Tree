import { DISCLAIMER } from './content';

export function About() {
  return (
    <div className="stack prose">
      <h1>Nguồn & quyền riêng tư</h1>
      <section className="card">
        <h2>Về ứng dụng</h2>
        <p>{DISCLAIMER}</p>
        <p>
          Ý tưởng nền tảng: quan sát điều mình tò mò, thử một hành động lặp lại trong một khoảng có hạn, ghi lại điều xảy ra và nhìn lại không phán
          xét để quyết định bước tiếp theo. Để hiểu đầy đủ phương pháp, hãy đọc sách <em>Tiny Experiments</em> của Anne-Laure Le Cunff và các bài viết
          trên Ness Labs.
        </p>
        <p>
          Mọi câu hỏi, ví dụ và quy tắc trong app (giới hạn ký tự, một thử nghiệm đang mở cùng lúc, cách điều chỉnh/kéo dài…) là lựa chọn thiết kế của
          công cụ này, <strong>không phải quy tắc của tác giả</strong>.
        </p>
        <p>
          Một thử nghiệm cá nhân không chứng minh quan hệ nhân quả: bối cảnh thay đổi, tự đánh giá và số lần thử ít đều ảnh hưởng đến điều bạn quan sát.
          App không chẩn đoán hay tư vấn sức khỏe.
        </p>
      </section>
      <section className="card">
        <h2>Dữ liệu nằm ở đâu?</h2>
        <ul>
          <li>Ghi chép được lưu trong IndexedDB của trình duyệt bạn đang dùng, trên thiết bị này. App không có máy chủ lưu nhật ký và không gửi nội dung đi đâu.</li>
          <li>Không có tài khoản, không đồng bộ. Trình duyệt khác, thiết bị khác hoặc địa chỉ web khác sẽ không thấy dữ liệu này.</li>
          <li>Trình duyệt có thể xóa dữ liệu khi bạn xóa lịch sử duyệt web, dùng chế độ ẩn danh hoặc khi thiếu bộ nhớ. Không có cách khôi phục nếu bạn chưa sao lưu.</li>
          <li>App không có khóa riêng: ai dùng được trình duyệt này đều có thể đọc ghi chép.</li>
          <li>Dữ liệu không được mã hóa. File sao lưu JSON và file Markdown là văn bản thường — hãy cất giữ cẩn thận.</li>
          <li>Máy chủ phục vụ trang web (ví dụ Vercel) vẫn nhận các yêu cầu tải trang thông thường (như địa chỉ IP), nhưng không nhận nội dung ghi chép.</li>
          <li>Không dùng quảng cáo, công cụ ghi lại phiên làm việc hay thư viện theo dõi bên thứ ba.</li>
        </ul>
      </section>
      <section className="card">
        <h2>Dữ liệu thử nghiệm (pilot)</h2>
        <p>
          Mặc định tắt. Nếu bạn bật trong mục Dữ liệu, app chỉ ghi lại các sự kiện sử dụng không chứa nội dung (ví dụ “đã lưu một ghi nhận, có kèm ghi
          chú: có/không”) ngay trên máy bạn. Dữ liệu này chỉ rời khỏi máy khi bạn tự xuất file và gửi đi. Sự kiện cũ hơn 30 ngày tự xóa.
        </p>
      </section>
    </div>
  );
}
