import { formatDate, formatWeekdays } from '../domain/dates';
import { buildTimeline, isScheduled, remainingDays, revisionFor } from '../domain/rules';
import { STATUS_LABEL } from '../domain/labels';
import { dismissPrompt, todayFor } from '../db/repo';
import { CheckInForm } from './CheckInForm';
import { go, openExperiment, useData } from './store';

export function Today() {
  const { snap } = useData();
  const open = openExperiment(snap.experiments);
  const drafts = snap.experiments.filter((e) => e.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lastClosed = snap.experiments
    .filter((e) => e.status === 'closed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  if (!open) {
    return (
      <div className="stack">
        <h1>Hôm nay</h1>
        <div className="card empty">
          <p className="big">Bạn chưa có thử nghiệm nào đang chạy.</p>
          <p className="muted">Có điều gì trong cách làm việc hoặc học tập mà bạn muốn thử khác đi?</p>
          <button className="btn btn-large" onClick={() => go('/new')}>
            Tạo thử nghiệm mới
          </button>
        </div>
        {drafts.length > 0 && (
          <section className="card">
            <h2>Bản nháp</h2>
            <ul className="list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <a href={`#/draft/${d.id}`}>{d.curiosity || d.action || '(nháp chưa có nội dung)'}</a>
                  {d.parentId && <span className="badge">vòng tiếp theo</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {lastClosed && (
          <section className="card soft">
            <p className="small muted">Vòng gần nhất</p>
            <p>
              <a href={`#/exp/${lastClosed.id}`}>{lastClosed.curiosity}</a>
            </p>
          </section>
        )}
      </div>
    );
  }

  const today = todayFor(open.timezone);
  const revs = snap.revisions.filter((r) => r.experimentId === open.id);
  const checkins = snap.checkins.filter((c) => c.experimentId === open.id);
  const todayCheckIn = checkins.find((c) => c.occurrenceDate === today);
  const rev = revisionFor(revs, today);
  const scheduledToday = isScheduled(revs, today);
  const inPhase = !!open.startDate && today >= open.startDate && today <= (open.effectiveEndDate ?? open.endDate!);
  const notStarted = !!open.startDate && today < open.startDate;
  const timeline = buildTimeline(open, revs, checkins, today);
  const pending = timeline.filter((r) => r.state === 'not_logged' && r.date < today).slice(-5).reverse();
  const reviewKey = `review:${open.id}`;
  const reviewDismissed = snap.profile.dismissedPrompts.includes(reviewKey);
  const logged = checkins.length;

  return (
    <div className="stack">
      <header className="row between wrap">
        <div>
          <p className="eyebrow">
            {STATUS_LABEL[open.status]} · {formatDate(today)}
          </p>
          <h1>Hôm nay</h1>
        </div>
        <a className="btn btn-ghost btn-small" href={`#/exp/${open.id}`}>
          Chi tiết & dòng thời gian
        </a>
      </header>

      {open.status === 'awaiting_reflection' &&
        (reviewDismissed ? (
          <p className="small">
            Thử nghiệm đã kết thúc giai đoạn thực hiện. <a href={`#/exp/${open.id}/reflect`}>Nhìn lại khi bạn sẵn sàng</a>.
          </p>
        ) : (
          <div className="banner" role="status">
            <div>
              <strong>Đến lúc nhìn lại</strong>
              <p>
                Giai đoạn thử đã kết thúc{open.effectiveEndDate ? ' (bạn đã dừng)' : ''}. Xem lại ghi chép và chọn bước tiếp theo — có thể làm bây giờ hoặc để sau.
              </p>
            </div>
            <div className="row wrap">
              <button className="btn" onClick={() => go(`/exp/${open.id}/reflect`)}>
                Nhìn lại
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => dismissPrompt(reviewKey)}>
                Ẩn nhắc này
              </button>
            </div>
          </div>
        ))}

      <section className="card">
        <p className="small muted">Bạn đang tìm hiểu</p>
        <p className="quote">{open.curiosity}</p>
        <p className="small muted">Hành động</p>
        <p className="big">{rev?.after.action ?? open.action}</p>
        <p className="small muted">
          {formatWeekdays(open.weekdays)} · {formatDate(open.startDate, false)} → {formatDate(open.effectiveEndDate ?? open.endDate, false)}
          {open.status === 'active' && inPhase && ` · còn ${remainingDays(open, today)} ngày`} · {logged} ghi nhận
        </p>
      </section>

      {notStarted && (
        <div className="card soft">
          <p>
            Thử nghiệm bắt đầu vào <strong>{formatDate(open.startDate)}</strong>. Hẹn gặp bạn hôm đó!
          </p>
        </div>
      )}

      {inPhase && (
        <section className="card">
          <h2>
            {scheduledToday ? 'Lần thử hôm nay' : 'Hôm nay không có trong lịch'}
          </h2>
          {!scheduledToday && !todayCheckIn && (
            <p className="small muted">Bạn vẫn có thể ghi lại nếu đã thử hoặc có điều đáng chú ý — ghi nhận sẽ được đánh dấu “ngoài lịch”.</p>
          )}
          <CheckInForm
            key={`${open.id}-${today}`}
            experiment={open}
            date={today}
            existing={todayCheckIn}
            scheduled={scheduledToday}
            compact
          />
        </section>
      )}

      {pending.length > 0 && (
        <section className="card">
          <h2>Những ngày chưa ghi nhận</h2>
          <p className="small muted">Chưa ghi nhận không có nghĩa là bỏ lỡ. Nếu muốn, bạn có thể ghi lại muộn.</p>
          <ul className="list">
            {pending.map((r) => (
              <li key={r.date} className="row between">
                <span>{formatDate(r.date)}</span>
                <a href={`#/exp/${open.id}?log=${r.date}`}>Ghi muộn</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
