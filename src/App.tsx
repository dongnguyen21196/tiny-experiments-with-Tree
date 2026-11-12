import { useCallback, useState } from 'react';
import { DataProvider, useData, useRoute } from './ui/store';
import { Intro } from './ui/Intro';
import { Today } from './ui/Today';
import { Wizard } from './ui/Wizard';
import { ExperimentDetail } from './ui/ExperimentDetail';
import { Reflect } from './ui/Reflect';
import { History } from './ui/History';
import { DataSettings } from './ui/DataSettings';
import { About } from './ui/About';

const NAV = [
  { href: '#/', label: 'Hôm nay', icon: '◎', match: (r: string[]) => r.length === 0 },
  { href: '#/history', label: 'Lịch sử', icon: '☰', match: (r: string[]) => r[0] === 'history' || r[0] === 'exp' || r[0] === 'draft' },
  { href: '#/data', label: 'Dữ liệu', icon: '⇅', match: (r: string[]) => r[0] === 'data' },
  { href: '#/about', label: 'Giới thiệu', icon: 'ⓘ', match: (r: string[]) => r[0] === 'about' },
];

function Screen({ route }: { route: string[] }) {
  const { snap } = useData();
  const [a, b, c] = route;
  if (!a) {
    if (!snap.profile.onboarded && snap.experiments.length === 0) return <Intro />;
    return <Today />;
  }
  if (a === 'new') return <Wizard key="new" />;
  if (a === 'draft' && b) {
    if (!snap.experiments.some((e) => e.id === b))
      return (
        <div className="card empty">
          <p>Không tìm thấy bản nháp này (có thể đã bị xóa).</p>
          <a href="#/history">Về lịch sử</a>
        </div>
      );
    return <Wizard key={b} draftId={b} />;
  }
  if (a === 'exp' && b && c === 'reflect') return <Reflect key={b} id={b} />;
  if (a === 'exp' && b) return <ExperimentDetail key={b} id={b} />;
  if (a === 'history') return <History />;
  if (a === 'data') return <DataSettings />;
  if (a === 'about') return <About />;
  return (
    <div className="card empty">
      <p>Không tìm thấy trang.</p>
      <a href="#/">Về trang Hôm nay</a>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const [fatal, setFatal] = useState<Error | null>(null);
  const onError = useCallback((e: Error) => setFatal(e), []);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Bỏ qua tới nội dung
      </a>
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>Tiny Experiments</span>
        </a>
        <nav className="nav" aria-label="Điều hướng chính">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={n.match(route) ? 'active' : ''} aria-current={n.match(route) ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {fatal ? (
          <div className="card alert alert-error" role="alert">
            <h1>Không thể dùng bộ nhớ trình duyệt</h1>
            <p>{fatal.message}</p>
            <p className="small">
              Thử mở lại trong cửa sổ thường (không ẩn danh), kiểm tra quyền lưu trữ của trang, hoặc giải phóng bộ nhớ. Dữ liệu hiện có (nếu có) không bị
              xóa.
            </p>
            <button className="btn" onClick={() => window.location.reload()}>
              Tải lại
            </button>
          </div>
        ) : (
          <DataProvider onError={onError} fallback={<p className="muted center">Đang mở dữ liệu…</p>}>
            <Screen route={route} />
          </DataProvider>
        )}
      </main>
    </div>
  );
}
