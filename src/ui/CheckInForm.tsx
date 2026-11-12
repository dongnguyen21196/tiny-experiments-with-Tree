import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { LIMITS, type CheckIn, type Experiment, type ISODate, type Outcome } from '../domain/types';
import { upsertCheckIn } from '../db/repo';
import { ErrorBox, SavedNote, TextField, errorMessage, useBusy } from './components';
import { COPY } from './content';

export function CheckInForm(props: {
  experiment: Experiment;
  date: ISODate;
  existing?: CheckIn;
  scheduled: boolean;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { experiment, date, existing } = props;
  const [outcome, setOutcome] = useState<Outcome | null>(existing?.outcome ?? null);
  const [note, setNote] = useState(existing?.observation ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState<number | undefined>(existing?.version);
  const { busy, run } = useBusy();
  const groupName = `outcome-${experiment.id}-${date}`;

  const save = () =>
    run(async () => {
      if (!outcome) {
        setError('Chọn “Đã thử” hoặc “Chưa thực hiện”.');
        return;
      }
      try {
        setError(null);
        const ci = await upsertCheckIn({ experimentId: experiment.id, occurrenceDate: date, outcome, observation: note, expectedVersion: version });
        setVersion(ci.version);
        setSaved(true);
        props.onSaved?.();
      } catch (e) {
        setSaved(false);
        setError(errorMessage(e));
      }
    });

  return (
    <form
      className="checkin"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!props.compact && (
        <p className="small muted">
          {formatDate(date)}
          {!props.scheduled && <span className="badge">ngoài lịch</span>}
        </p>
      )}
      <fieldset>
        <legend className={props.compact ? 'sr-only' : ''}>Lần này thế nào?</legend>
        <div className="outcomes">
          <label className={`outcome ${outcome === 'tried' ? 'on' : ''}`}>
            <input
              type="radio"
              name={groupName}
              checked={outcome === 'tried'}
              onChange={() => {
                setOutcome('tried');
                setSaved(false);
              }}
            />
            <span aria-hidden="true">✓</span> Đã thử
          </label>
          <label className={`outcome ${outcome === 'not_done' ? 'on' : ''}`}>
            <input
              type="radio"
              name={groupName}
              checked={outcome === 'not_done'}
              onChange={() => {
                setOutcome('not_done');
                setSaved(false);
              }}
            />
            <span aria-hidden="true">○</span> Chưa thực hiện
          </label>
        </div>
      </fieldset>
      {outcome && (
        <TextField
          label={outcome === 'tried' ? `${COPY.observe} (tùy chọn)` : COPY.missed}
          value={note}
          onChange={(v) => {
            setNote(v);
            setSaved(false);
          }}
          max={LIMITS.observation}
          multiline
          rows={3}
        />
      )}
      <ErrorBox error={error} copyText={note || undefined} />
      <div className="row end">
        <SavedNote show={saved} />
        <button type="submit" className="btn" disabled={busy || !outcome}>
          {existing || version ? 'Lưu thay đổi' : 'Lưu ghi nhận'}
        </button>
      </div>
      {existing && (existing.updatedAt !== existing.createdAt || existing.editedAfterClose) && (
        <p className="tiny muted">Đã sửa{existing.editedAfterClose ? ' sau khi khép vòng' : ''}.</p>
      )}
    </form>
  );
}
