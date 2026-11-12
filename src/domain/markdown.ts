import { formatDate, formatWeekdays } from './dates';
import { buildTimeline, sortRevisions } from './rules';
import type { CheckIn, Experiment, ISODate, Reflection, Revision } from './types';
import { CLARITY_LABEL, DECISION_LABEL, STATUS_LABEL, CHANGE_LABEL } from './labels';

/** Giữ nội dung là văn bản thường khi đọc trong trình xem Markdown. */
function esc(s: string): string {
  return s.replace(/([\\`*_{}[\]<>#|])/g, '\\$1').replace(/\r?\n/g, '  \n');
}

export function experimentToMarkdown(
  e: Experiment,
  revs: Revision[],
  checkins: CheckIn[],
  refl: Reflection | undefined,
  today: ISODate,
): string {
  const lines: string[] = [];
  lines.push(`## ${esc(e.curiosity || '(chưa đặt tên)')}`, '');
  lines.push(`- **Trạng thái:** ${STATUS_LABEL[e.status]}`);
  lines.push(`- **Hành động hiện tại:** ${esc(e.action)}`);
  lines.push(`- **Thời gian:** ${formatDate(e.startDate, false)} → ${formatDate(e.endDate, false)}${e.effectiveEndDate ? ` (dừng ngày ${formatDate(e.effectiveEndDate, false)})` : ''}`);
  lines.push(`- **Lịch:** ${formatWeekdays(e.weekdays)}`, '');
  const sorted = sortRevisions(revs);
  if (sorted.length > 1) {
    lines.push('### Các lần điều chỉnh', '');
    for (const r of sorted.slice(1)) {
      lines.push(`- ${formatDate(r.effectiveDate, false)} — ${CHANGE_LABEL[r.changeType]}${r.reason ? `: ${esc(r.reason)}` : ''}`);
    }
    lines.push('');
  }
  const rows = buildTimeline(e, revs, checkins, today).filter((r) => r.checkIn);
  lines.push('### Ghi nhận', '');
  if (!rows.length) lines.push('_Chưa có ghi nhận._');
  for (const r of rows) {
    const c = r.checkIn!;
    lines.push(`- **${formatDate(r.date)}** — ${c.outcome === 'tried' ? 'Đã thử' : 'Chưa thực hiện'}${r.scheduled ? '' : ' (ngoài lịch)'}${c.observation ? `: ${esc(c.observation)}` : ''}`);
  }
  lines.push('');
  if (refl) {
    lines.push(`### Nhìn lại${refl.status === 'draft' ? ' (bản nháp)' : ''}`, '');
    if (refl.plus) lines.push(`**Điều có ích:** ${esc(refl.plus)}`, '');
    if (refl.minus) lines.push(`**Điều chưa phù hợp:** ${esc(refl.minus)}`, '');
    if (refl.next) lines.push(`**Muốn thử tiếp:** ${esc(refl.next)}`, '');
    if (refl.clarity) lines.push(`**Mức rõ ràng:** ${CLARITY_LABEL[refl.clarity]}`, '');
    if (refl.decision) lines.push(`**Quyết định:** ${DECISION_LABEL[refl.decision]}`, '');
    if (refl.rationale) lines.push(`**Căn cứ:** ${esc(refl.rationale)}`, '');
  }
  return lines.join('\n');
}

export function allToMarkdown(
  experiments: Experiment[],
  revs: Revision[],
  checkins: CheckIn[],
  refls: Reflection[],
  todayFor: (tz: string) => ISODate,
): string {
  const head = [
    '# Nhật ký Tiny Experiments',
    '',
    `_Xuất lúc ${new Date().toLocaleString('vi-VN')}. File này chỉ để đọc — dùng file JSON để khôi phục. Nội dung là văn bản thường, không mã hóa._`,
    '',
  ];
  const body = experiments
    .filter((e) => e.status !== 'draft')
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
    .map((e) =>
      experimentToMarkdown(
        e,
        revs.filter((r) => r.experimentId === e.id),
        checkins.filter((c) => c.experimentId === e.id),
        refls.find((r) => r.experimentId === e.id),
        todayFor(e.timezone),
      ),
    );
  return [...head, ...body].join('\n');
}
