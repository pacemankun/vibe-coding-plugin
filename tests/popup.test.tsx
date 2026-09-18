// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/popup/App';
import { createDefaultSettings } from '../src/shared/settings';
import type { MarketSymbol, PopupBridge, Quote, Snapshot } from '../src/shared/types';

const btc: MarketSymbol = { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' };
const ethBtc: MarketSymbol = { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC' };
const solBtc: MarketSymbol = { symbol: 'SOLBTC', baseAsset: 'SOL', quoteAsset: 'BTC' };

function quote(symbol: MarketSymbol, price: string, receivedAt = Date.now()): Quote {
  return { ...symbol, price, changePercent: 1.25, receivedAt, eventTime: receivedAt, source: 'stream' };
}
function snapshot(): Snapshot {
  return {
    settings: createDefaultSettings(),
    quotes: { BTCUSDT: quote(btc, '101234.50000000') },
    connection: { status: 'live', message: '已连接', lastMessageAt: Date.now() },
  };
}
function makeBridge(initial = snapshot()) {
  let listener: ((state: Snapshot) => void) | undefined;
  const bridge: PopupBridge = {
    isPreview: false,
    getState: vi.fn(async () => initial),
    getSymbols: vi.fn(async () => [btc, ethBtc, solBtc]),
    getQuote: vi.fn(async (symbol) => quote(symbol, '0.05200000')),
    updateSettings: vi.fn(async (patch) => ({ ...initial, settings: { ...initial.settings, ...patch } })),
    refresh: vi.fn(async () => initial),
    subscribe: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
  };
  return { bridge, emit: (next: Snapshot) => listener?.(next) };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('popup', () => {
  it('shows exact quote asset and marks an old quote cached', async () => {
    const state = snapshot();
    state.settings.watchlist = [ethBtc];
    state.settings.badgeSymbol = 'ETHBTC';
    state.quotes = { ETHBTC: quote(ethBtc, '0.05200000', Date.now() - 120_000) };
    const { bridge } = makeBridge(state);
    render(<App bridge={bridge} />);
    const focus = await screen.findByTestId('focus-quote');
    expect(within(focus).getByText('0.052')).toBeInTheDocument();
    expect(within(focus).getAllByText('BTC')).toHaveLength(2);
    expect(within(focus).getByText(/缓存/)).toBeInTheDocument();
    expect(within(focus).queryByText('USD')).not.toBeInTheDocument();
  });

  it('renders the newest subscribed snapshot', async () => {
    const { bridge, emit } = makeBridge();
    render(<App bridge={bridge} />);
    expect(await within(screen.getByTestId('focus-quote')).findByText('101,234.5')).toBeInTheDocument();
    const next = snapshot();
    next.quotes.BTCUSDT = quote(btc, '99999.0000');
    emit(next);
    expect(await within(screen.getByTestId('focus-quote')).findByText('99,999')).toBeInTheDocument();
  });

  it('keeps the selected exact pair open after search closes', async () => {
    const { bridge } = makeBridge();
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: /添加币对/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'ethbtc');
    await userEvent.click(await screen.findByRole('button', { name: /ETH\/BTC/ }));
    expect(await screen.findByTestId('pair-detail')).toHaveTextContent('ETH/BTC');
    expect(screen.getByTestId('pair-detail')).toHaveTextContent('0.052');
    expect(screen.getByTestId('pair-detail')).toHaveTextContent('BTC');
  });

  it('ignores an older pair quote response after selecting another pair', async () => {
    let resolveOld!: (value: Quote) => void;
    const oldPromise = new Promise<Quote>((resolve) => { resolveOld = resolve; });
    const { bridge } = makeBridge();
    bridge.getQuote = vi.fn((symbol) => symbol.symbol === 'ETHBTC' ? oldPromise : Promise.resolve(quote(symbol, '0.008')));
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: /添加币对/ }));
    await userEvent.click(await screen.findByRole('button', { name: /ETH\/BTC/ }));
    await userEvent.click(screen.getByRole('button', { name: /添加币对/ }));
    await userEvent.click(await screen.findByRole('button', { name: /SOL\/BTC/ }));
    expect(await screen.findByTestId('pair-detail')).toHaveTextContent('0.008');
    resolveOld(quote(ethBtc, '0.052'));
    await waitFor(() => expect(screen.getByTestId('pair-detail')).toHaveTextContent('SOL/BTC'));
    expect(screen.getByTestId('pair-detail')).not.toHaveTextContent('0.052');
  });

  it('shows a failed settings save and retains the confirmed setting', async () => {
    const { bridge, emit } = makeBridge();
    bridge.updateSettings = vi.fn(async () => { throw new Error('保存失败'); });
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: /设置/ }));
    await userEvent.click(screen.getByRole('button', { name: '涨跌幅' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByRole('button', { name: '价格' })).toHaveAttribute('aria-pressed', 'true');
    const next = snapshot();
    next.connection.status = 'offline';
    emit(next);
    await screen.findByText('已离线');
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
  });

  it('updates an open watched-pair detail from the latest subscription', async () => {
    const { bridge, emit } = makeBridge();
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: /查看 BTC\/USDT 详情/ }));
    await waitFor(() => expect(screen.getByTestId('pair-detail')).toHaveTextContent('0.052'));
    const next = snapshot();
    next.quotes.BTCUSDT = quote(btc, '88888.0000');
    emit(next);
    await waitFor(() => expect(screen.getByTestId('pair-detail')).toHaveTextContent('88,888'));
  });

  it('does not pin a new pair when the watchlist is full', async () => {
    const full = snapshot();
    full.settings.watchlist = [...full.settings.watchlist, ...Array.from({ length: 10 }, (_, i) => ({ symbol: `EXTRA${i}USDT`, baseAsset: `EXTRA${i}`, quoteAsset: 'USDT' }))];
    const { bridge } = makeBridge(full);
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: /添加币对/ }));
    await userEvent.click(await screen.findByRole('button', { name: /ETH\/BTC/ }));
    expect(screen.getByRole('button', { name: /固定到角标/ })).toBeDisabled();
  });

  it('does not call an offline or REST snapshot live', async () => {
    const state = snapshot();
    state.connection.status = 'offline';
    const { bridge, emit } = makeBridge(state);
    render(<App bridge={bridge} />);
    const focus = screen.getByTestId('focus-quote');
    await within(focus).findByText('101,234.5');
    expect(within(focus).queryByText('实时行情')).not.toBeInTheDocument();
    expect(within(focus).getByText(/缓存/)).toBeInTheDocument();
    const rest = snapshot();
    rest.quotes.BTCUSDT = { ...quote(btc, '102000.000'), source: 'rest' };
    act(() => emit(rest));
    await within(focus).findByText('102,000');
    expect(within(focus).getByText(/快照/)).toBeInTheDocument();
    expect(within(focus).queryByText('实时行情')).not.toBeInTheDocument();
  });

  it('keeps a pushed quote when initial getState resolves late', async () => {
    let resolveInitial!: (value: Snapshot) => void;
    const { bridge, emit } = makeBridge();
    bridge.getState = vi.fn(() => new Promise<Snapshot>(resolve => { resolveInitial = resolve; }));
    render(<App bridge={bridge} />);
    const pushed = snapshot();
    pushed.quotes.BTCUSDT = quote(btc, '88000.000');
    act(() => emit(pushed));
    await within(screen.getByTestId('focus-quote')).findByText('88,000');
    await act(async () => resolveInitial(snapshot()));
    expect(within(screen.getByTestId('focus-quote')).getByText('88,000')).toBeInTheDocument();
  });

  it('keeps a pushed quote when refresh resolves late', async () => {
    let resolveRefresh!: (value: Snapshot) => void;
    const { bridge, emit } = makeBridge();
    bridge.refresh = vi.fn(() => new Promise<Snapshot>(resolve => { resolveRefresh = resolve; }));
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: '刷新行情' }));
    const pushed = snapshot();
    pushed.quotes.BTCUSDT = quote(btc, '88000.000');
    act(() => emit(pushed));
    await within(screen.getByTestId('focus-quote')).findByText('88,000');
    await act(async () => resolveRefresh(snapshot()));
    expect(within(screen.getByTestId('focus-quote')).getByText('88,000')).toBeInTheDocument();
  });

  it('keeps a newer quote while applying a confirmed settings response', async () => {
    let resolveSave!: (value: Snapshot) => void;
    const { bridge, emit } = makeBridge();
    bridge.updateSettings = vi.fn(() => new Promise<Snapshot>(resolve => { resolveSave = resolve; }));
    render(<App bridge={bridge} />);
    await within(screen.getByTestId('focus-quote')).findByText('101,234.5');
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(screen.getByRole('button', { name: '涨跌幅' }));
    const pushed = snapshot();
    pushed.quotes.BTCUSDT = quote(btc, '88000.000');
    act(() => emit(pushed));
    const confirmed = snapshot();
    confirmed.settings.badgeMode = 'change';
    await act(async () => resolveSave(confirmed));
    expect(screen.getByRole('button', { name: '涨跌幅' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '关闭设置' }));
    expect(within(screen.getByTestId('focus-quote')).getByText('88,000')).toBeInTheDocument();
  });

  it('retries a missing symbol catalog on explicit refresh so search recovers', async () => {
    const { bridge, emit } = makeBridge();
    let catalogAttempts = 0;
    bridge.getSymbols = vi.fn(async () => {
      if (++catalogAttempts === 1) throw new Error('目录网络故障');
      return [btc, ethBtc, solBtc];
    });
    const refreshed = snapshot();
    refreshed.quotes.BTCUSDT = quote(btc, '110000.000');
    bridge.refresh = vi.fn(async () => refreshed);
    render(<App bridge={bridge} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('目录网络故障');
    await userEvent.click(screen.getByRole('button', { name: '添加币对' }));
    await userEvent.type(screen.getByRole('searchbox'), 'ETHBTC');
    expect(screen.getByText('没有找到相关币对')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭搜索' }));
    await userEvent.click(screen.getByRole('button', { name: '刷新行情' }));
    await within(screen.getByTestId('focus-quote')).findByText('110,000');
    await userEvent.click(screen.getByRole('button', { name: '添加币对' }));
    expect(await screen.findByRole('button', { name: /选择 ETH\/BTC/ })).toBeInTheDocument();
    act(() => emit(snapshot()));
    expect(bridge.getSymbols).toHaveBeenCalledTimes(2);
  });
});
