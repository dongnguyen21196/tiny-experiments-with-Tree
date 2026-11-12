import { useEffect, useState } from 'react';
import { addDays, datesBetween, formatDate, formatWeekdays, isoWeekday } from '../domain/dates';
import { defaultEndDate, validateForStart, type FieldErrors } from '../domain/rules';
import { LIMITS, type Experiment } from '../domain/types';
import { createDraft, deleteExperiment, saveDraft, startExperiment, todayFor, type DraftInput } from '../db/repo';
import { Confirm, DateField, ErrorBox, SavedNote, TextField, WeekdayPicker, errorMessage, useBusy } from './components';
import { COPY, EXAMPLES } from './content';
import { go, openExperiment, useData } from './store';

const STEPS = ['Điều tò mò', 'Hành động', 'Lịch thử', 'Xem lại'];

export function Wizard({ draftId }: { draftId?: string }) {
  const { snap } = useData();
  const existing = draftId ? snap.experiments.find((e) => e.id === draftId) : undefined;
  const tz = existing?.timezone ?? snap.profile.timezone;
  const today = todayFor(tz);
  const parent = existing?.parentId ? snap.experiments.find((e) => e.id === existing.parentId) : undefined;
  const parentRefl = parent ? snap.reflections.find((r) => r.experimentId === parent.id) : undefined;
  const blocking = openExperiment(snap.experiments);

  const [form, setForm] = useState<DraftInput>(() => ({
    curiosity: existing?.curiosity ?? '',
    action: existing?.action ?? '',
    startDate: existing?.startDate && existing.startDate >= today ? existing.startDate : today,
    endDate: existing?.endDate && existing.endDate >= today ? existing.endDate : defaultEndDate(today),
    weekdays: existing?.weekdays?.length ? existing.weekdays : [1, 2, 3, 4, 5, 6, 7],
  }));
  const [record, setRecord] = useState<Experiment | undefined>(existing);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run } = useBusy();

  useEffect(() => {
    if (existing && existing.status !== 'draft') go(`/exp/${existing.id}`);
  }, [existing]);

  const set = <K extends keyof DraftInput>(k: K, v: DraftInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const persist = async (): Promise<Experiment> => {
    if (!record) {
      const created = await createDraft(form);
      setRecord(created);
      window.history.replaceState(null, '', `#/draft/${created.id}`);
      return created;
    }
    const next = await saveDraft(record.id, form, record.version);
    setRecord(next);
    return next;
  };

  const stepErrors = (s: number): FieldErrors => {
    const all = validateForStart(form, today);
    const keys = s === 0 ? ['curiosity'] : s === 1 ? ['action'] : s === 2 ? ['startDate', 'endDate', 'weekdays'] : Object.keys(all);
    const out: FieldErrors = {};
    for (const k of keys) if (all[k]) out[k] = all[k];
    return out;
  };

  const saveAndGo = (target: number, validate: boolean) =>
    run(async () => {
      if (validate) {
        const errs = stepErrors(step);
        if (Object.keys(errs).length) {
          setErrors(errs);
          return;
        }
      }
      if (!form.curiosity.trim() && !form.action.trim()) {
        setStep(target);
        return;
      }
      try {
        setSaveError(null);
        await persist();
        setSaved(true);
        setStep(target);
      } catch (e) {
        setSaveError(errorMessage(e));
      }
    });

  const start = () =>
    run(async () => {
      const errs = stepErrors(3);
      if (Object.keys(errs).length) {
        setErrors(errs);
        setStep(errs.curiosity ? 0 : errs.action ? 1 : 2);
        return;
      }
      try {
        setSaveError(null);
        const rec = await persist();
        await startExperiment(rec.id, rec.version);
        go('/');
      } catch (e) {
        setSaveError(errorMessage(e));
      }
    });

  const scheduledDays =
    form.startDate && form.endDate && form.startDate <= form.endDate
      ? datesBetween(form.startDate, form.endDate).filter((d) => form.weekdays.includes(isoWeekday(d))).length
      : 0;
  const copyText = `${form.curiosity}\n${form.action}`;

  return (
    <div className="stack">
      <header>
        <p className="eyebrow">{parent ? 'Vòng tiếp theo' : 'Thử nghiệm mới'}</p>
        <h1>{STEPS[step]}</h1>
        <ol className="progress" aria-label="Các bước">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="sr-only">Bước {i + 1}: </span>
              {s}
            </li>
          ))}
        </ol>
      </header>

      {parent && (
        <div className="card soft">
          <p className="small muted">Nối tiếp từ vòng trước</p>
          <p>
            <strong>{parent.curiosity}</strong>
          </p>
          {parentRefl?.next && <p className="small">Bạn từng muốn thử tiếp: “{parentRefl.next}”</p>}
          <a className="small" href={`#/exp/${parent.id}`}>
            Xem vòng trước
          </a>
        </div>
      )}

      <div className="card">
        {step === 0 && (
          <div key="s0">
            <TextField
              label={COPY.start}
              hint="Nhớ lại một khoảnh khắc gần đây khi làm việc hoặc học: điều gì khiến bạn thấy vướng, hay tò mò muốn thử khác đi? Viết dạng câu hỏi càng tốt."
              value={form.curiosity}
              onChange={(v) => set('curiosity', v)}
              max={LIMITS.curiosity}
              multiline
              autoFocus
              error={errors.curiosity}
              placeholder="Ví dụ: Mình có tập trung hơn nếu…?"
            />
            <details className="examples">
              <summary>Chưa nghĩ ra? Xem vài ví dụ</summary>
              <p className="small muted">Chọn một ví dụ rồi sửa lại cho đúng với bạn.</p>
              <ul>
                {EXAMPLES.map((ex) => (
                  <li key={ex.context}>
                    <button
                      type="button"
                      className="example"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          curiosity: ex.curiosity,
                          action: ex.action,
                          weekdays: ex.weekdays,
                          endDate: f.startDate ? addDays(f.startDate, ex.days - 1) : f.endDate,
                        }));
                        setErrors({});
                      }}
                    >
                      <span className="tag">{ex.context}</span>
                      {ex.curiosity}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {step === 1 && (
          <div key="s1">
            <p className="quote">“{form.curiosity}”</p>
            <TextField
              label={COPY.action}
              hint="Một hành động nhỏ, lặp lại được, làm xong trong một lần. Tránh mục tiêu chung chung như “học chăm hơn”."
              value={form.action}
              onChange={(v) => set('action', v)}
              max={LIMITS.action}
              multiline
              autoFocus
              error={errors.action}
              placeholder="Ví dụ: Sau bữa trưa, đọc 10 trang tài liệu và viết 3 dòng tóm tắt."
            />
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid-2">
              <DateField
                label="Bắt đầu"
                value={form.startDate}
                min={today}
                onChange={(v) => set('startDate', v)}
                error={errors.startDate}
              />
              <DateField
                label="Kết thúc (tính cả ngày này)"
                value={form.endDate}
                min={form.startDate ?? today}
                onChange={(v) => set('endDate', v)}
                error={errors.endDate}
              />
            </div>
            <div className="row quick">
              <span className="small muted">Nhanh:</span>
              {[7, 14, 21].map((n) => (
                <button key={n} type="button" className="link-btn" onClick={() => form.startDate && set('endDate', addDays(form.startDate, n - 1))}>
                  {n} ngày
                </button>
              ))}
            </div>
            <WeekdayPicker value={form.weekdays} onChange={(v) => set('weekdays', v)} error={errors.weekdays} />
            <p className="small muted">
              Thời lượng do bạn chọn — không có con số “đúng”. Đủ ngắn để bắt đầu ngay, đủ dài để có vài lần quan sát. Bạn luôn có thể dừng sớm hoặc kéo dài.
            </p>
            {scheduledDays > 0 && <p className="small">→ Khoảng {scheduledDays} lần thử theo lịch.</p>}
          </>
        )}

        {step === 3 && (
          <div className="commitment">
            <p className="small muted">Cam kết của bạn</p>
            <p className="big">
              Từ <strong>{formatDate(form.startDate)}</strong> đến <strong>{formatDate(form.endDate)}</strong>, vào{' '}
              <strong>{formatWeekdays(form.weekdays).toLowerCase()}</strong>, tôi sẽ:
            </p>
            <p className="quote">{form.action}</p>
            <p className="small muted">để tìm hiểu:</p>
            <p className="quote">{form.curiosity}</p>
            <p className="small muted">
              {scheduledDays} lần theo lịch · Múi giờ {tz}. Đây là một lần thử để học, không phải lời hứa phải hoàn hảo.
            </p>
            {blocking && (
              <div className="alert">
                Bạn đang có thử nghiệm “{blocking.curiosity}” chưa khép lại. Bản nháp này được giữ nguyên; hãy{' '}
                <a href={`#/exp/${blocking.id}`}>nhìn lại hoặc dừng thử nghiệm đó</a> trước khi bắt đầu.
              </div>
            )}
          </div>
        )}

        <ErrorBox error={saveError} copyText={copyText} onRetry={() => setSaveError(null)} />

        <div className="row between wizard-nav">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => saveAndGo(step - 1, false)}>
              ← Quay lại
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <SavedNote show={saved} text="Đã lưu nháp" />
            {step < 3 ? (
              <button type="button" className="btn" disabled={busy} onClick={() => saveAndGo(step + 1, true)}>
                Tiếp →
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy || !!blocking} onClick={start}>
                Bắt đầu thử nghiệm
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="row between">
        <button type="button" className="link-btn" disabled={busy} onClick={() => saveAndGo(step, false).then(() => go('/history'))}>
          Lưu nháp & để sau
        </button>
        {record && (
          <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(true)}>
            Xóa bản nháp
          </button>
        )}
      </div>

      <Confirm
        open={confirmDelete}
        title="Xóa bản nháp này?"
        confirmLabel="Xóa"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (record) await deleteExperiment(record.id);
          setConfirmDelete(false);
          go('/history');
        }}
      >
        <p>Bản nháp sẽ bị xóa khỏi trình duyệt này.</p>
      </Confirm>
    </div>
  );
}
