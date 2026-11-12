import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { buildTimeline } from '../domain/rules';
import { LIMITS, type Clarity, type Decision } from '../domain/types';
import { createFollowUpDraft, saveReflection, todayFor, type ReflectionInput } from '../db/repo';
import { ErrorBox, SavedNote, TextField, errorMessage, useBusy } from './components';
import { COPY } from './content';
import { go, useData } from './store';

const DECISIONS: { value: Decision; label: string; hint: string }[] = [
  { value: 'continue', label: 'Tiếp tục', hint: 'Thử thêm một vòng với cách làm tương tự.' },
  { value: 'adjust', label: 'Điều chỉnh', hint: 'Thử lại nhưng thay đổi một điều.' },
  { value: 'stop', label: 'Dừng ở đây', hint: 'Đủ rồi — giữ lại điều đã học (nếu có).' },
];

export function Reflect({ id }: { id: string }) {
  const { snap } = useData();
  const e = snap.experiments.find((x) => x.id === id);
  const existing = snap.reflections.find((r) => r.experimentId === id);
  const [form, setForm] = useState<ReflectionInput>({
    plus: existing?.plus ?? '',
    minus: existing?.minus ?? '',
    next: existing?.next ?? '',
    clarity: existing?.clarity ?? null,
    decision: existing?.decision ?? null,
    rationale: existing?.rationale ?? '',
  });
  const [version, setVersion] = useState(existing?.version ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { busy, run } = useBusy();

  if (!e) {
    return (
      <div className="card empty">
        <p>Không tìm thấy thử nghiệm.</p>
      </div>
    );
  }
  if (e.status === 'draft' || e.status === 'active') {
    return (
      <div className="card empty stack">
        <p>Thử nghiệm vẫn đang chạy. Hãy dừng nó (hoặc chờ đến hết kỳ) trước khi nhìn lại.</p>
        <a className="btn" href={`#/exp/${e.id}`}>
          Về thử nghiệm
        </a>
      </div>
    );
  }

  const today = todayFor(e.timezone);
  const revs = snap.revisions.filter((r) => r.experimentId === e.id);
  const checkins = snap.checkins.filter((c) => c.experimentId === e.id);
  const timeline = buildTimeline(e, revs, checkins, today);
  const withLogs = timeline.filter((r) => r.checkIn);
  const tried = checkins.filter((c) => c.outcome === 'tried').length;
  const notDone = checkins.length - tried;
  const notLogged = timeline.filter((r) => r.state === 'not_logged').length;

  const set = <K extends keyof ReflectionInput>(k: K, v: ReflectionInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(null);
  };

  const save = (submit: boolean) =>
    run(async () => {
      try {
        setError(null);
        const { r } = await saveReflection(e.id, form, version, submit);
        setVersion(r.version);
        if (submit) setSubmitted(true);
        else setSaved('Đã lưu nháp');
      } catch (err) {
        setError(errorMessage(err));
      }
    });

  const copyText = [form.plus, form.minus, form.next, form.rationale].filter(Boolean).join('\n\n');

  if (submitted) {
    const wantsNext = form.decision === 'continue' || form.decision === 'adjust';
    return (
      <div className="stack">
        <div className="card">
          <h1>Đã khép vòng</h1>
          <p>
            {form.clarity === 'unclear'
              ? 'Chưa rõ bài học cũng là một kết quả hợp lệ. Bạn đã đi hết một vòng thử – quan sát – nhìn lại.'
              : 'Bạn đã đi hết một vòng thử – quan sát – nhìn lại.'}
          </p>
          <div className="row wrap">
            {wantsNext && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    try {
                      const child = await createFollowUpDraft(e.id);
                      go(`/draft/${child.id}`);
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  })
                }
              >
                Lên bản nháp cho vòng tiếp theo
              </button>
            )}
            <a className="btn btn-ghost" href={`#/exp/${e.id}`}>
              Xem thử nghiệm
            </a>
            <a className="btn btn-ghost" href="#/history">
              Lịch sử
            </a>
          </div>
          {wantsNext && <p className="small muted">Bản nháp chỉ bắt đầu khi bạn xác nhận cam kết mới.</p>}
          <ErrorBox error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <header>
        <p className="eyebrow">Nhìn lại</p>
        <h1>{e.curiosity}</h1>
        <p className="small muted">
          {formatDate(e.startDate, false)} → {formatDate(e.effectiveEndDate ?? e.endDate, false)} · {tried} lần đã thử · {notDone} chưa thực hiện ·{' '}
          {notLogged} ngày theo lịch chưa ghi nhận
        </p>
      </header>

      <div className="reflect-grid">
        <section className="card">
          <h2>Ghi chép của bạn</h2>
          {withLogs.length === 0 ? (
            <p className="muted">
              Chưa có ghi nhận nào. Không sao — bạn vẫn có thể nhìn lại dựa trên những gì còn nhớ, hoặc chọn “Chưa rõ bài học”.
            </p>
          ) : (
            <ul className="obs-list">
              {withLogs.map((r) => (
                <li key={r.date}>
                  <p className="small muted">
                    {formatDate(r.date)} · {r.checkIn!.outcome === 'tried' ? 'Đã thử' : 'Chưa thực hiện'}
                  </p>
                  {r.checkIn!.observation ? <p className="pre">{r.checkIn!.observation}</p> : <p className="tiny muted">(không ghi chú)</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <p className="muted">{COPY.reflect} Không cần điền đủ cả ba ô.</p>
          <TextField label="Điều gì có ích?" value={form.plus} onChange={(v) => set('plus', v)} max={LIMITS.reflectionField} multiline />
          <TextField label="Điều gì chưa phù hợp?" value={form.minus} onChange={(v) => set('minus', v)} max={LIMITS.reflectionField} multiline />
          <TextField label="Bạn muốn thử gì tiếp?" value={form.next} onChange={(v) => set('next', v)} max={LIMITS.reflectionField} multiline />

          <fieldset className="field">
            <legend>Bạn thấy mình đã rút ra được gì chưa?</legend>
            <div className="choices">
              {(
                [
                  ['some_learning', 'Có rút ra điều gì đó'],
                  ['unclear', 'Chưa rõ bài học'],
                ] as [Clarity, string][]
              ).map(([v, l]) => (
                <label key={v} className={`choice ${form.clarity === v ? 'on' : ''}`}>
                  <input type="radio" name="clarity" checked={form.clarity === v} onChange={() => set('clarity', v)} />
                  {l}
                </label>
              ))}
            </div>
            {form.clarity === 'unclear' && <p className="small muted">{COPY.unclear}</p>}
          </fieldset>

          <fieldset className="field">
            <legend>Bước tiếp theo</legend>
            <div className="choices">
              {DECISIONS.map((d) => (
                <label key={d.value} className={`choice ${form.decision === d.value ? 'on' : ''}`}>
                  <input type="radio" name="decision" checked={form.decision === d.value} onChange={() => set('decision', d.value)} />
                  <span>
                    <strong>{d.label}</strong>
                    <span className="small muted block">{d.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <TextField
            label="Điều gì khiến bạn chọn như vậy? (tùy chọn)"
            hint="Ví dụ: một quan sát cụ thể trong ghi chép bên cạnh."
            value={form.rationale}
            onChange={(v) => set('rationale', v)}
            max={LIMITS.rationale}
            multiline
            rows={2}
          />

          <ErrorBox error={error} copyText={copyText || undefined} />
          <div className="row end wrap">
            <SavedNote show={!!saved} text={saved ?? ''} />
            <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
              Lưu nháp
            </button>
            <button className="btn" disabled={busy} onClick={() => save(true)}>
              {existing?.status === 'submitted' ? 'Lưu thay đổi' : 'Lưu & khép vòng'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
