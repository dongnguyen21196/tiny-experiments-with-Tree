import { completeOnboarding } from '../db/repo';
import { go } from './store';
import { DISCLAIMER } from './content';

export function Intro() {
  return (
    <div className="stack">
      <section className="hero card">
        <p className="eyebrow">Thử nghiệm nhỏ · học từ chính trải nghiệm</p>
        <h1>Thử một cách làm mới, quan sát, rồi quyết định bước tiếp theo.</h1>
        <p>
          Bạn không cần đọc sách hay lập kế hoạch lớn. Chọn một điều muốn khám phá, thử một hành động nhỏ trong vài ngày,
          ghi lại điều đã xảy ra, rồi nhìn lại để chọn: <strong>tiếp tục, điều chỉnh hay dừng</strong>.
        </p>
        <ol className="steps">
          <li>
            <strong>Tò mò</strong> — điều gì trong cách làm việc/học tập bạn muốn thử khác đi?
          </li>
          <li>
            <strong>Thử</strong> — một hành động cụ thể, trong một khoảng ngày có hạn.
          </li>
          <li>
            <strong>Quan sát</strong> — “Đã thử” hay “Chưa thực hiện”, thêm một câu ghi chú nếu muốn.
          </li>
          <li>
            <strong>Nhìn lại</strong> — điều có ích, điều chưa phù hợp, và bước tiếp theo. “Chưa rõ” cũng hợp lệ.
          </li>
        </ol>
        <p className="muted">Không có điểm, không có chuỗi ngày (streak). Bỏ lỡ hay dừng sớm đều là thông tin, không phải thất bại.</p>
      </section>

      <section className="card notice">
        <h2>Dữ liệu của bạn ở đâu?</h2>
        <ul>
          <li>Mọi ghi chép chỉ lưu <strong>trên trình duyệt này, trên thiết bị này</strong>. Không có tài khoản, không đồng bộ đám mây.</li>
          <li>Mở app trên điện thoại khác hay trình duyệt khác sẽ không thấy dữ liệu — hãy dùng <strong>Xuất/Nhập bản sao lưu</strong> để chuyển.</li>
          <li>Xóa dữ liệu trình duyệt hoặc dùng chế độ ẩn danh có thể làm mất ghi chép. Hãy sao lưu định kỳ.</li>
        </ul>
      </section>

      <div className="row wrap">
        <button
          className="btn btn-large"
          onClick={async () => {
            await completeOnboarding('new');
            go('/new');
          }}
        >
          Tạo thử nghiệm đầu tiên
        </button>
        <button className="btn btn-ghost btn-large" onClick={() => go('/data')}>
          Tôi có file sao lưu
        </button>
      </div>
      <p className="muted small">
        {DISCLAIMER} <a href="#/about">Nguồn & quyền riêng tư</a>
      </p>
    </div>
  );
}
