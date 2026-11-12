import { useEffect, useMemo, useRef, useState } from 'react';
import { formatStamp } from '../domain/dates';
import { allToMarkdown } from '../domain/markdown';
import { exportBackupJSON, parseBackup, replaceImport, type ImportPreview } from '../db/backup';
import { deleteAll, refreshStatuses, setTelemetryConsent, todayFor, updateProfile } from '../db/repo';
import { exportEvents } from '../db/telemetry';
import { Confirm, ErrorBox, Modal, SavedNote, downloadFile, errorMessage, stampForFile, useBusy } from './components';
import { go, useData } from './store';

export function DataSettings() {
  const { snap } = useData();
  const { profile } = snap;
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [consentDialog, setConsentDialog] = useState<'on' | 'off' | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [tzSaved, setTzSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();

  const timezones = useMemo(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
      return list.includes(profile.timezone) ? list : [profile.timezone, ...list];
    } catch {
      return [profile.timezone];
    }
  }, [profile.timezone]);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const hasData = snap.experiments.length > 0;
  const openExp = snap.experiments.find((e) => e.status === 'active' || e.status === 'awaiting_reflection');

  const exportJSON = async () => {
    try {
      const json = await exportBackupJSON();
      downloadFile(`tiny-experiments-backup-${stampForFile()}.json`, json, 'application/json');
      setBackedUp(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onFile = async (f: File | undefined) => {
    setImportError(null);
    setImportDone(false);
    if (!f) return;
    try {
      const text = f.size > 5 * 1024 * 1024 ? '' : await f.text();
      setPreview(parseBackup(text, f.size));
      setBackedUp(false);
    } catch (e) {
      setImportError(errorMessage(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="stack">
      <h1>Dữ liệu & cài đặt</h1>

      <section className="card notice">
        <h2>Dữ liệu chỉ nằm trên trình duyệt này</h2>
        <p>
          Không có tài khoản hay đồng bộ. Để giữ an toàn hoặc chuyển sang thiết bị khác, hãy <strong>xuất bản sao lưu JSON</strong> và nhập lại ở nơi
          mới. Bản sao lưu là văn bản thường (không mã hóa) — đừng gửi cho người khác nếu không muốn họ đọc nhật ký của bạn.
        </p>
        <p className="small">
          Hiện có {snap.experiments.length} thử nghiệm, {snap.checkins.length} ghi nhận.{' '}
          {persisted === true && 'Trình duyệt đã đồng ý lưu bền vững.'}
          {persisted === false && (
            <>
              Trình duyệt có thể tự xóa dữ liệu khi thiếu bộ nhớ.{' '}
              <button
                className="link-btn"
                onClick={async () => {
                  try {
                    setPersisted(await navigator.storage.persist());
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Xin lưu bền vững
              </button>{' '}
              (không thay thế việc sao lưu).
            </>
          )}
        </p>
      </section>

      <section className="card">
        <h2>Sao lưu & khôi phục</h2>
        <div className="row wrap">
          <button className="btn" onClick={exportJSON} disabled={!hasData}>
            Xuất bản sao lưu (JSON)
          </button>
          <button
            className="btn btn-ghost"
            disabled={!hasData}
            onClick={() =>
              downloadFile(
                `tiny-experiments-${stampForFile()}.md`,
                allToMarkdown(snap.experiments, snap.revisions, snap.checkins, snap.reflections, todayFor),
                'text/markdown;charset=utf-8',
              )
            }
          >
            Xuất bản dễ đọc (Markdown)
          </button>
        </div>
        <p className="small muted">JSON dùng để khôi phục. Markdown chỉ để đọc hoặc lưu bài học, không dùng để khôi phục.</p>
        <ErrorBox error={error} />

        <h3>Khôi phục từ file JSON</h3>
        <p className="small muted">
          Khôi phục sẽ <strong>thay thế toàn bộ</strong> dữ liệu hiện có trên trình duyệt này bằng nội dung file (không gộp). File tối đa 5 MB.
        </p>
        <label className="btn btn-ghost file-btn">
          Chọn file sao lưu…
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <ErrorBox error={importError} />
        {importDone && (
          <p className="alert alert-ok" role="status">
            Đã khôi phục dữ liệu. <a href="#/">Về trang Hôm nay</a>
          </p>
        )}
      </section>

      <section className="card">
        <h2>Múi giờ</h2>
        <p className="small muted">
          Dùng để xác định “hôm nay” cho thử nghiệm mới. Thử nghiệm đang chạy giữ múi giờ lúc bắt đầu
          {openExp ? ` (${openExp.timezone})` : ''}; ngày của ghi nhận cũ không thay đổi.
        </p>
        <div className="row wrap">
          <select
            aria-label="Múi giờ mặc định"
            value={profile.timezone}
            onChange={async (e) => {
              try {
                await updateProfile({ timezone: e.target.value });
                setTzSaved(true);
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <SavedNote show={tzSaved} />
        </div>
      </section>

      <section className="card">
        <h2>Tham gia thử nghiệm sản phẩm (tùy chọn)</h2>
        <p className="small">
          Khi bật, app ghi lại <strong>sự kiện sử dụng không chứa nội dung</strong> (ví dụ: đã bắt đầu thử nghiệm, đã lưu ghi nhận có/không kèm ghi chú) ngay
          trên máy bạn. Không gửi đi đâu cả — chỉ khi bạn tự xuất file và chia sẻ. Bạn vẫn dùng app đầy đủ khi tắt.
        </p>
        <p className="small">
          Trạng thái: <strong>{profile.telemetryConsent ? 'Đang bật' : 'Đang tắt'}</strong> · {snap.eventCount} sự kiện lưu trên máy
        </p>
        <div className="row wrap">
          <button className="btn btn-ghost" onClick={() => setConsentDialog(profile.telemetryConsent ? 'off' : 'on')}>
            {profile.telemetryConsent ? 'Tắt' : 'Bật thu sự kiện'}
          </button>
          {snap.eventCount > 0 && (
            <button
              className="btn btn-ghost"
              onClick={async () => downloadFile(`tiny-experiments-pilot-events-${stampForFile()}.json`, await exportEvents(), 'application/json')}
            >
              Xuất file sự kiện
            </button>
          )}
        </div>
      </section>

      <section className="card danger-zone">
        <h2>Xóa toàn bộ dữ liệu</h2>
        <p className="small">Xóa mọi thử nghiệm, ghi nhận, phần nhìn lại, cài đặt và sự kiện trên trình duyệt này. Không thể hoàn tác.</p>
        <button className="btn btn-danger" onClick={() => setConfirmDeleteAll(true)}>
          Xóa tất cả…
        </button>
      </section>

      <Modal open={!!preview} title="Khôi phục từ bản sao lưu?" onClose={() => setPreview(null)}>
        {preview && (
          <>
            <p>
              File xuất lúc <strong>{formatStamp(preview.exportedAt)}</strong> gồm {preview.counts.experiments} thử nghiệm, {preview.counts.checkins} ghi nhận,{' '}
              {preview.counts.reflections} phần nhìn lại.
            </p>
            {hasData ? (
              <div className="alert">
                <p>
                  Toàn bộ {snap.experiments.length} thử nghiệm hiện có trên trình duyệt này sẽ bị <strong>thay thế</strong>. Nên xuất bản sao lưu dữ liệu hiện tại
                  trước.
                </p>
                <button className="btn btn-small" onClick={exportJSON}>
                  {backedUp ? '✓ Đã xuất bản sao lưu' : 'Xuất bản sao lưu hiện tại'}
                </button>
              </div>
            ) : (
              <p className="small muted">Trình duyệt này chưa có dữ liệu.</p>
            )}
            <ErrorBox error={importError} />
            <div className="row end">
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>
                Hủy
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    try {
                      await replaceImport(preview);
                      await refreshStatuses();
                      setPreview(null);
                      setImportDone(true);
                    } catch (e) {
                      setImportError(errorMessage(e));
                    }
                  })
                }
              >
                Thay thế & khôi phục
              </button>
            </div>
          </>
        )}
      </Modal>

      <Confirm
        open={confirmDeleteAll}
        title="Xóa toàn bộ dữ liệu?"
        confirmLabel="Xóa vĩnh viễn"
        danger
        busy={busy || deleteText.trim().toUpperCase() !== 'XÓA'}
        onClose={() => {
          setConfirmDeleteAll(false);
          setDeleteText('');
        }}
        onConfirm={() =>
          run(async () => {
            try {
              await deleteAll();
              setConfirmDeleteAll(false);
              setDeleteText('');
              go('/');
            } catch (e) {
              setError(errorMessage(e));
            }
          })
        }
      >
        <p>Mọi dữ liệu của app trên trình duyệt này sẽ bị xóa. File sao lưu bạn đã tải về nằm ngoài app và không bị ảnh hưởng.</p>
        <div className="field">
          <label htmlFor="del-confirm">
            Gõ <strong>XÓA</strong> để xác nhận
          </label>
          <input id="del-confirm" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
        </div>
      </Confirm>

      <Confirm
        open={consentDialog === 'on'}
        title="Bật thu sự kiện sử dụng?"
        confirmLabel="Đồng ý bật"
        onClose={() => setConsentDialog(null)}
        onConfirm={async () => {
          await setTelemetryConsent(true, false);
          setConsentDialog(null);
        }}
      >
        <ul className="small">
          <li>Chỉ ghi loại thao tác, ngày, trạng thái (ví dụ “đã thử”), có/không có ghi chú — không bao giờ ghi nội dung bạn viết.</li>
          <li>Lưu trên máy bạn tối đa 30 ngày; chỉ chia sẻ khi bạn tự xuất file.</li>
          <li>Có thể tắt và xóa bất cứ lúc nào.</li>
        </ul>
      </Confirm>

      <Modal open={consentDialog === 'off'} title="Tắt thu sự kiện" onClose={() => setConsentDialog(null)}>
        <p>Bạn có muốn xóa {snap.eventCount} sự kiện đã lưu trên máy không?</p>
        <div className="row end wrap">
          <button className="btn btn-ghost" onClick={() => setConsentDialog(null)}>
            Hủy
          </button>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await setTelemetryConsent(false, false);
              setConsentDialog(null);
            }}
          >
            Tắt, giữ sự kiện
          </button>
          <button
            className="btn"
            onClick={async () => {
              await setTelemetryConsent(false, true);
              setConsentDialog(null);
            }}
          >
            Tắt & xóa sự kiện
          </button>
        </div>
      </Modal>
    </div>
  );
}
