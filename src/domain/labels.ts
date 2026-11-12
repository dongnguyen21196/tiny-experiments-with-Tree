import type { ChangeType, Clarity, Decision, ExperimentStatus } from './types';

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: 'Bản nháp',
  active: 'Đang thử',
  awaiting_reflection: 'Chờ nhìn lại',
  closed: 'Đã khép vòng',
};

export const DECISION_LABEL: Record<Decision, string> = {
  continue: 'Tiếp tục',
  adjust: 'Điều chỉnh',
  stop: 'Dừng ở đây',
};

export const CLARITY_LABEL: Record<Clarity, string> = {
  some_learning: 'Có rút ra điều gì đó',
  unclear: 'Chưa rõ bài học',
};

export const CHANGE_LABEL: Record<ChangeType, string> = {
  baseline: 'Cam kết ban đầu',
  amend: 'Điều chỉnh hành động/lịch',
  extend: 'Kéo dài',
  end_early: 'Dừng thực hiện',
};
