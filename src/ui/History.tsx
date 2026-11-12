import { formatDate, formatWeekdays } from '../domain/dates';
import { DECISION_LABEL, STATUS_LABEL } from '../domain/labels';
import type { Experiment } from '../domain/types';
import { go, useData } from './store';

export function History() {
  const { snap } = useData();
  const byStart = (a: Experiment, b: Experiment) => (b.startDate ?? b.updatedAt).localeCompare(a.startDate ?? a.updatedAt);
  const started = snap.experiments.filter((e) => e.status !== 'draft').sort(byStart);
  const drafts = snap.experiments.filter((e) => e.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const byId = new Map(snap.experiments.map((e) => [e.id, e]));

  return (
    <div className="stack">
      <header className="row between wrap">
        <h1>Lịch sử</h1>
        <button className="btn btn-small" onClick={() => go('/new')}>
          + Thử nghiệm mới
        </button>
      </header>

      {started.length === 0 && drafts.length === 0 && (
        <div className="card empty">
          <p>Chưa có thử nghiệm nào. Khi bạn hoàn thành các vòng thử, chúng sẽ hiện ở đây để bạn tìm lại bài học.</p>
        </div>
      )}

      {drafts.length > 0 && (
        <section className="stack">
          <h2>Bản nháp</h2>
          {drafts.map((d) => (
            <a key={d.id} href={`#/draft/${d.id}`} className="card card-link">
              <span className="status status-draft">Bản nháp</span>
              <strong>{d.curiosity || '(chưa có nội dung)'}</strong>
              {d.parentId && byId.get(d.parentId) && <span className="small muted">Nối tiếp: {byId.get(d.parentId)!.curiosity}</span>}
            </a>
          ))}
        </section>
      )}

      {started.length > 0 && (
        <section className="stack">
          <h2>Các vòng thử</h2>
          {started.map((e) => {
            const refl = snap.reflections.find((r) => r.experimentId === e.id);
            const count = snap.checkins.filter((c) => c.experimentId === e.id).length;
            const parent = e.parentId ? byId.get(e.parentId) : undefined;
            return (
              <a key={e.id} href={`#/exp/${e.id}`} className="card card-link">
                <span className={`status status-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                <strong>{e.curiosity}</strong>
                <span className="small">{e.action}</span>
                <span className="small muted">
                  {formatDate(e.startDate, false)} → {formatDate(e.effectiveEndDate ?? e.endDate, false)} · {formatWeekdays(e.weekdays)} · {count} ghi nhận
                  {refl?.decision && refl.status === 'submitted' && <> · Quyết định: {DECISION_LABEL[refl.decision]}</>}
                </span>
                {refl?.next && refl.status === 'submitted' && <span className="small">Muốn thử tiếp: “{refl.next}”</span>}
                {parent && <span className="tiny muted">Nối tiếp từ: {parent.curiosity}</span>}
              </a>
            );
          })}
        </section>
      )}
    </div>
  );
}
