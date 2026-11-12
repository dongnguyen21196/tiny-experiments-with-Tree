import { useEffect, useState } from 'react';
import { addDays, formatDate, formatStamp, formatWeekdays, WEEKDAY_SHORT, isoWeekday } from '../domain/dates';
import { buildTimeline, scheduledCount, sortRevisions, type DayRow } from '../domain/rules';
import { CHANGE_LABEL, CLARITY_LABEL, DECISION_LABEL, STATUS_LABEL } from '../domain/labels';
import { experimentToMarkdown } from '../domain/markdown';
import { LIMITS, type Experiment, type ISODate } from '../domain/types';
import { amendCommitment, deleteExperiment, endEarly, extendExperiment, todayFor } from '../db/repo';
import { CheckInForm } from './CheckInForm';
import { Confirm, DateField, ErrorBox, Modal, TextField, WeekdayPicker, downloadFile, errorMessage, stampForFile, useBusy } from './components';
import { COPY } from './content';
import { go, useData, useQuery } from './store';

const STATE_LABEL: Record<DayRow['state'], string> = {
  logged_tried: 'Đã thử',
  logged_not_done: 'Chưa thực hiện',
  not_logged: 'Chưa ghi nhận',
  off_schedule: 'Ngoài lịch',
  upcoming: 'Sắp tới',
};
const STATE_ICON: Record<DayRow['state'], string> = {
  logged_tried: '✓',
  logged_not_done: '○',
  not_logged: '·',
  off_schedule: '–',
  upcoming: ' ',
};

export function ExperimentDetail({ id }: { id: string }) {
  const { snap } = useData();
  const query = useQuery();
  const e = snap.experiments.find((x) => x.id === id);
  const [logDate, setLogDate] = useState<ISODate | null>(null);
  const [dialog, setDialog] = useState<'stop' | 'extend' | 'amend' | 'delete' | null>(null);

  useEffect(() => {
    const q = query.get('log');
    if (q) setLogDate(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.hash]);

  if (!e) {
    return (
      <div className="card empty">
        <p>Không tìm thấy thử nghiệm này (có thể đã bị xóa).</p>
        <a href="#/history">Về lịch sử</a>
      </div>
    );
  }
  if (e.status === 'draft') {
    go(`/draft/${e.id}`);
    return null;
  }

  const today = todayFor(e.timezone);
  const revs = sortRevisions(snap.revisions.filter((r) => r.experimentId === e.id));
  const checkins = snap.checkins.filter((c) => c.experimentId === e.id);
  const refl = snap.reflections.find((r) => r.experimentId === e.id);
  const timeline = buildTimeline(e, revs, checkins, today);
  const parent = e.parentId ? snap.experiments.find((x) => x.id === e.parentId) : undefined;
  const children = snap.experiments.filter((x) => x.parentId === e.id);
  const logRow = logDate ? timeline.find((r) => r.date === logDate) : undefined;
  const isOpen = e.status === 'active' || e.status === 'awaiting_reflection';
  const tried = checkins.filter((c) => c.outcome === 'tried').length;
  const notDone = checkins.filter((c) => c.outcome === 'not_done').length;

  const closeLog = () => {
    setLogDate(null);
    if (window.location.hash.includes('?')) window.history.replaceState(null, '', `#/exp/${e.id}`);
  };

  return (
    <div className="stack">
      <header>
        <p className="eyebrow">
          <span className={`status status-${e.status}`}>{STATUS_LABEL[e.status]}</span>
        </p>
        <h1>{e.curiosity}</h1>
      </header>

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <p className="small muted">Hành động hiện tại</p>
            <p className="big">{e.action}</p>
            <dl className="facts">
              <div>
                <dt>Thời gian</dt>
                <dd>
                  {formatDate(e.startDate, false)} → {formatDate(e.endDate, false)}
                  {e.effectiveEndDate && <> (dừng {formatDate(e.effectiveEndDate, false)})</>}
                </dd>
              </div>
              <div>
                <dt>Lịch</dt>
                <dd>{formatWeekdays(e.weekdays)}</dd>
              </div>
              <div>
                <dt>Ghi nhận</dt>
                <dd>
                  {tried} đã thử · {notDone} chưa thực hiện · {scheduledCount(e, revs)} lần theo lịch
                </dd>
              </div>
              <div>
                <dt>Múi giờ</dt>
                <dd>{e.timezone}</dd>
              </div>
            </dl>
            <div className="row wrap actions">
              {e.status !== 'active' && (
                <button className="btn" onClick={() => go(`/exp/${e.id}/reflect`)}>
                  {refl?.status === 'submitted' ? 'Xem / sửa phần nhìn lại' : 'Nhìn lại'}
                </button>
              )}
              {e.status === 'active' && (
                <>
                  <button className="btn btn-ghost" onClick={() => setDialog('amend')}>
                    Điều chỉnh hành động/lịch
                  </button>
                  <button className="btn btn-ghost" onClick={() => setDialog('stop')}>
                    Dừng & nhìn lại
                  </button>
                </>
              )}
              {isOpen && (
                <button className="btn btn-ghost" onClick={() => setDialog('extend')}>
                  Kéo dài
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() =>
                  downloadFile(`tiny-experiment-${stampForFile()}.md`, experimentToMarkdown(e, revs, checkins, refl, today), 'text/markdown;charset=utf-8')
                }
              >
                Xuất Markdown
              </button>
            </div>
          </section>

          {refl && (
            <section className="card">
              <h2>Nhìn lại {refl.status === 'draft' && <span className="badge">bản nháp</span>}</h2>
              {refl.plus && (
                <>
                  <p className="small muted">Điều có ích</p>
                  <p className="pre">{refl.plus}</p>
                </>
              )}
              {refl.minus && (
                <>
                  <p className="small muted">Điều chưa phù hợp</p>
                  <p className="pre">{refl.minus}</p>
                </>
              )}
              {refl.next && (
                <>
                  <p className="small muted">Muốn thử tiếp</p>
                  <p className="pre">{refl.next}</p>
                </>
              )}
              <p className="small">
                {refl.clarity && <>{CLARITY_LABEL[refl.clarity]} · </>}
                {refl.decision && <strong>{DECISION_LABEL[refl.decision]}</strong>}
              </p>
              {refl.rationale && <p className="small pre">Căn cứ: {refl.rationale}</p>}
            </section>
          )}

          {(parent || children.length > 0) && (
            <section className="card soft">
              {parent && (
                <p className="small">
                  Nối tiếp từ: <a href={`#/exp/${parent.id}`}>{parent.curiosity}</a>
                </p>
              )}
              {children.map((c) => (
                <p className="small" key={c.id}>
                  Vòng tiếp theo: <a href={c.status === 'draft' ? `#/draft/${c.id}` : `#/exp/${c.id}`}>{c.curiosity}</a> ({STATUS_LABEL[c.status]})
                </p>
              ))}
            </section>
          )}

          {revs.length > 1 && (
            <section className="card">
              <h2>Lịch sử thay đổi</h2>
              <ol className="revisions">
                {revs.map((r) => (
                  <li key={r.id}>
                    <strong>{CHANGE_LABEL[r.changeType]}</strong> · hiệu lực {formatDate(r.effectiveDate, false)}
                    {r.before && r.before.action !== r.after.action && (
                      <p className="small">
                        Hành động: <del>{r.before.action}</del> → {r.after.action}
                      </p>
                    )}
                    {r.before && r.before.weekdays.join() !== r.after.weekdays.join() && (
                      <p className="small">
                        Lịch: {formatWeekdays(r.before.weekdays)} → {formatWeekdays(r.after.weekdays)}
                      </p>
                    )}
                    {r.before && r.before.endDate !== r.after.endDate && (
                      <p className="small">
                        Kết thúc: {formatDate(r.before.endDate, false)} → {formatDate(r.after.endDate, false)}
                      </p>
                    )}
                    {r.after.effectiveEndDate && r.changeType === 'end_early' && (
                      <p className="small">Dừng thực hiện sau ngày {formatDate(r.after.effectiveEndDate, false)}</p>
                    )}
                    {r.reason && <p className="small muted">Lý do: {r.reason}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <section className="card">
          <h2>Dòng thời gian</h2>
          <p className="small muted">Chạm vào một ngày đã qua để ghi nhận hoặc sửa. “Chưa ghi nhận” không bị tính là bỏ lỡ.</p>
          <ol className="timeline">
            {timeline.map((r) => {
              const rev = r.checkIn ? revs.find((x) => x.id === r.checkIn!.revisionId) : undefined;
              const actionChanged = rev && rev.after.action !== e.action;
              const clickable = r.date <= today;
              return (
                <li key={r.date} className={`tl tl-${r.state} ${r.date === today ? 'tl-today' : ''}`}>
                  <button type="button" className="tl-btn" disabled={!clickable} onClick={() => setLogDate(r.date)}>
                    <span className="tl-icon" aria-hidden="true">
                      {STATE_ICON[r.state]}
                    </span>
                    <span className="tl-date">
                      {WEEKDAY_SHORT[isoWeekday(r.date)]} {formatDate(r.date, false).slice(0, 5)}
                      {r.date === today && <span className="badge">hôm nay</span>}
                    </span>
                    <span className="tl-state">
                      {STATE_LABEL[r.state]}
                      {r.checkIn && !r.scheduled && ' (ngoài lịch)'}
                    </span>
                  </button>
                  {r.checkIn?.observation && <p className="tl-note pre">{r.checkIn.observation}</p>}
                  {actionChanged && <p className="tiny muted">Theo hành động cũ: {rev!.after.action}</p>}
                  {r.checkIn && r.checkIn.createdAt.slice(0, 10) > r.date && (
                    <p className="tiny muted">Ghi muộn lúc {formatStamp(r.checkIn.createdAt)}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="row end">
        <button className="link-btn danger" onClick={() => setDialog('delete')}>
          Xóa thử nghiệm này
        </button>
      </div>

      <Modal open={!!logDate} title="Ghi nhận" onClose={closeLog}>
        {logDate && logRow && logDate <= today ? (
          <>
            <CheckInForm
              key={logDate}
              experiment={e}
              date={logDate}
              existing={logRow.checkIn}
              scheduled={logRow.scheduled}
              onSaved={() => setTimeout(closeLog, 400)}
            />
            <div className="row end">
              <button className="btn btn-ghost btn-small" onClick={closeLog}>
                Đóng
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Ngày này nằm ngoài giai đoạn thực hiện nên không ghi nhận được.</p>
            <button className="btn btn-ghost" onClick={closeLog}>
              Đóng
            </button>
          </>
        )}
      </Modal>

      <StopDialog open={dialog === 'stop'} e={e} onClose={() => setDialog(null)} />
      <ExtendDialog open={dialog === 'extend'} e={e} today={today} onClose={() => setDialog(null)} />
      <AmendDialog open={dialog === 'amend'} e={e} onClose={() => setDialog(null)} />
      <Confirm
        open={dialog === 'delete'}
        title="Xóa thử nghiệm này?"
        confirmLabel="Xóa vĩnh viễn"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await deleteExperiment(e.id);
          setDialog(null);
          go('/history');
        }}
      >
        <p>Toàn bộ ghi nhận, lịch sử thay đổi và phần nhìn lại của thử nghiệm này sẽ bị xóa khỏi trình duyệt. Không thể hoàn tác.</p>
        {children.length > 0 && <p className="small">Các vòng tiếp theo vẫn được giữ, chỉ mất liên kết tới vòng này.</p>}
        <p className="small muted">File bạn đã xuất trước đó (nếu có) nằm ngoài app và không bị xóa.</p>
      </Confirm>
    </div>
  );
}

function StopDialog({ open, e, onClose }: { open: boolean; e: Experiment; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const act = (thenReflect: boolean) =>
    run(async () => {
      try {
        await endEarly(e.id, reason, e.version);
        onClose();
        if (thenReflect) go(`/exp/${e.id}/reflect`);
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  return (
    <Modal open={open} title="Dừng thử nghiệm" onClose={onClose}>
      <p>{COPY.stop}</p>
      <p className="small muted">Hôm nay sẽ là ngày cuối của giai đoạn thực hiện. Bạn vẫn có thể ghi nhận cho hôm nay và những ngày trước.</p>
      <TextField label="Điều muốn ghi lại (tùy chọn)" value={reason} onChange={setReason} max={LIMITS.reason} multiline rows={2} />
      <ErrorBox error={error} copyText={reason || undefined} />
      <div className="row end wrap">
        <button className="btn btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act(false)}>
          Dừng, nhìn lại sau
        </button>
        <button className="btn" disabled={busy} onClick={() => act(true)}>
          Dừng & nhìn lại ngay
        </button>
      </div>
    </Modal>
  );
}

function ExtendDialog({ open, e, today, onClose }: { open: boolean; e: Experiment; today: ISODate; onClose: () => void }) {
  const base = e.status === 'active' && e.endDate! >= today ? addDays(e.endDate!, 7) : addDays(today, 6);
  const [date, setDate] = useState(base);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) setDate(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} title="Kéo dài thử nghiệm" onClose={onClose}>
      <p className="small muted">
        Các ghi nhận cũ được giữ nguyên. Nếu bạn muốn thử theo cách khác hẳn, tạo một vòng mới sau khi nhìn lại có thể rõ ràng hơn.
      </p>
      <DateField label="Ngày kết thúc mới (tính cả ngày này)" value={date} min={today} onChange={setDate} />
      <TextField label="Lý do (tùy chọn)" value={reason} onChange={setReason} max={LIMITS.reason} />
      <ErrorBox error={error} />
      <div className="row end">
        <button className="btn btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              try {
                await extendExperiment(e.id, date, reason, e.version);
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              }
            })
          }
        >
          Kéo dài tới {formatDate(date, false)}
        </button>
      </div>
    </Modal>
  );
}

function AmendDialog({ open, e, onClose }: { open: boolean; e: Experiment; onClose: () => void }) {
  const [action, setAction] = useState(e.action);
  const [weekdays, setWeekdays] = useState(e.weekdays);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setAction(e.action);
      setWeekdays(e.weekdays);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} title="Điều chỉnh hành động hoặc lịch" onClose={onClose}>
      <p className="small muted">
        Thay đổi có hiệu lực từ hôm nay. Ghi nhận trước đó vẫn gắn với cam kết cũ. Nếu bạn muốn đổi hẳn câu hỏi muốn khám phá, nên kết thúc vòng này và tạo vòng mới.
      </p>
      <TextField label="Hành động" value={action} onChange={setAction} max={LIMITS.action} multiline rows={2} />
      <WeekdayPicker value={weekdays} onChange={setWeekdays} />
      <TextField label="Lý do (tùy chọn)" value={reason} onChange={setReason} max={LIMITS.reason} />
      <ErrorBox error={error} copyText={action} />
      <div className="row end">
        <button className="btn btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              try {
                await amendCommitment(e.id, { action, weekdays }, reason, e.version);
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              }
            })
          }
        >
          Lưu điều chỉnh
        </button>
      </div>
    </Modal>
  );
}
