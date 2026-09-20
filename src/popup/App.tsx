import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, CircleAlert, Pin, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { formatChange, formatPrice, isStale } from '../shared/format';
import { createDefaultSettings } from '../shared/settings';
import { connectionFor, marketLabel, marketOf, pairKey } from '../shared/market';
import type { MarketSymbol, MarketType, PopupBridge, Quote, Settings, Snapshot } from '../shared/types';
import DonationDialog from './DonationDialog';
import { donationDetails, donationReady } from './donationConfig';
import './popup.css';

type View = 'home' | 'search' | 'settings' | 'donation';
const statusText = { live: '实时行情', connecting: '连接中', degraded: '连接不稳定', offline: '已离线' } as const;
const pairName = (pair: MarketSymbol) => `${pair.baseAsset}/${pair.quoteAsset}`;
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function App({ bridge }: { bridge: PopupBridge }) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>('home');
  const [catalogs, setCatalogs] = useState<Record<MarketType, MarketSymbol[] | null>>({ spot: null, usdm: null });
  const [catalogErrors, setCatalogErrors] = useState<Record<MarketType, string>>({ spot: '', usdm: '' });
  const [catalogLoading, setCatalogLoading] = useState<Record<MarketType, boolean>>({ spot: false, usdm: false });
  const [searchMarket, setSearchMarket] = useState<MarketType>('spot');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MarketSymbol | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const quoteRequest = useRef(0);
  const catalogRequest = useRef<Record<MarketType, number>>({ spot: 0, usdm: 0 });
  const catalogAttempted = useRef<Record<MarketType, boolean>>({ spot: false, usdm: false });
  const mounted = useRef(true);
  const selectedStateQuote = useRef<Quote | undefined>(undefined);
  const pushGeneration = useRef(0);
  const stateRef = useRef<Snapshot | null>(null);
  const settings = state?.settings ?? createDefaultSettings();

  function acceptSnapshot(next: Snapshot) {
    stateRef.current = next;
    setState(next);
  }

  function loadCatalog(market: MarketType, retry = false): Promise<string> {
    if (!retry && catalogAttempted.current[market]) return Promise.resolve('');
    catalogAttempted.current[market] = true;
    const request = ++catalogRequest.current[market];
    setCatalogLoading(previous => ({ ...previous, [market]: true }));
    setCatalogErrors(previous => ({ ...previous, [market]: '' }));
    return bridge.getSymbols(market).then(items => {
      if (mounted.current && catalogRequest.current[market] === request) {
        setCatalogs(previous => ({ ...previous, [market]: items }));
        setCatalogErrors(previous => ({ ...previous, [market]: '' }));
      }
      return '';
    }).catch(err => {
      const message = `无法加载${market === 'usdm' ? 'USDT 永续' : '现货'}币对：${messageOf(err)}`;
      if (mounted.current && catalogRequest.current[market] === request) {
        setCatalogErrors(previous => ({ ...previous, [market]: message }));
        setError(message);
      }
      return message;
    }).finally(() => {
      if (mounted.current && catalogRequest.current[market] === request) setCatalogLoading(previous => ({ ...previous, [market]: false }));
    });
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const unsubscribe = bridge.subscribe(next => {
      if (active) {
        pushGeneration.current++;
        acceptSnapshot(next);
      }
    });
    const initialGeneration = pushGeneration.current;
    bridge.getState().then(next => {
      if (active && pushGeneration.current === initialGeneration) acceptSnapshot(next);
    }).catch(err => { if (active && pushGeneration.current === initialGeneration) setError(`无法读取行情：${messageOf(err)}`); });
    void loadCatalog('spot');
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => { active = false; mounted.current = false; unsubscribe(); window.clearInterval(timer); quoteRequest.current++; catalogRequest.current.spot++; catalogRequest.current.usdm++; };
  }, [bridge]);

  useEffect(() => {
    if (!selected) return;
    const incoming = state?.quotes[pairKey(selected)];
    if (incoming && incoming !== selectedStateQuote.current) {
      selectedStateQuote.current = incoming;
      quoteRequest.current++;
      setSelectedQuote(incoming);
      setDetailLoading(false);
    }
  }, [selected, state]);

  const focusSymbol = settings.watchlist.find(item => pairKey(item) === settings.badgeSymbol) ?? settings.watchlist[0];
  const focusQuote = focusSymbol ? state?.quotes[pairKey(focusSymbol)] : undefined;
  const filteredSymbols = useMemo(() => {
    const query = search.trim().toUpperCase();
    const matches = (catalogs[searchMarket] ?? []).filter(item => !query || item.symbol.toUpperCase().includes(query) || item.baseAsset.toUpperCase().includes(query) || item.quoteAsset.toUpperCase().includes(query));
    matches.sort((a, b) => {
      const rank = (item: MarketSymbol) => query && (item.symbol.toUpperCase() === query || item.baseAsset.toUpperCase() === query) ? 0 : item.quoteAsset === 'USDT' ? 1 : 2;
      return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
    });
    return matches.slice(0, 30);
  }, [catalogs, searchMarket, search]);

  function selectPair(pair: MarketSymbol) {
    const request = ++quoteRequest.current;
    selectedStateQuote.current = state?.quotes[pairKey(pair)];
    setSelected(pair);
    setSelectedQuote(state?.quotes[pairKey(pair)] ?? null);
    setDetailLoading(true);
    setError('');
    setView('home');
    bridge.getQuote(pair).then(next => {
      if (quoteRequest.current === request) setSelectedQuote(next);
    }).catch(err => {
      if (quoteRequest.current === request) setError(`无法读取 ${pairName(pair)}：${messageOf(err)}`);
    }).finally(() => {
      if (quoteRequest.current === request) setDetailLoading(false);
    });
  }

  async function save(patch: Partial<Omit<Settings, 'version'>>) {
    if (busy) return;
    setBusy(true);
    setError('');
    const startedAt = pushGeneration.current;
    const startingSettings = stateRef.current?.settings ?? settings;
    try {
      const result = await bridge.updateSettings(patch);
      if (pushGeneration.current === startedAt) acceptSnapshot(result);
      else {
        const current = stateRef.current;
        if (current && JSON.stringify(current.settings) === JSON.stringify(startingSettings)) {
          acceptSnapshot({ ...current, settings: result.settings });
        }
      }
    }
    catch (err) { setError(`保存失败：${messageOf(err)}`); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError('');
    const startedAt = pushGeneration.current;
    try {
      const marketTask = bridge.refresh().then(result => {
        if (pushGeneration.current === startedAt) acceptSnapshot(result);
        return '';
      }).catch(err => `刷新失败：${messageOf(err)}`);
      const catalogTasks = (['spot', 'usdm'] as const).filter(market => catalogAttempted.current[market] && catalogs[market] === null).map(market => loadCatalog(market, true));
      const failures = (await Promise.all([marketTask, ...catalogTasks])).filter(Boolean);
      if (failures.length) setError(failures.join('；'));
    }
    finally { setBusy(false); }
  }

  const selectedInList = selected && settings.watchlist.some(item => pairKey(item) === pairKey(selected));
  const changeClass = (change: number | null | undefined) => {
    if (change == null) return '';
    return (change >= 0) === (settings.colorScheme === 'green-up') ? 'positive' : 'negative';
  };
  const quoteStatus = (item: Quote | undefined, pair: MarketSymbol | undefined) => {
    if (!item) return '等待行情';
    if (isStale(item, now)) return '缓存行情';
    const connection = state && pair ? connectionFor(state, pair) : state?.connection;
    if (connection?.status === 'offline') return '离线缓存';
    if (connection?.status !== 'live') return '缓存行情';
    return item.source === 'rest' ? '最新快照' : '实时行情';
  };

  return <div className="popup-shell" data-theme={settings.theme} data-color-scheme={settings.colorScheme}>
    <header className="topbar">
      <div className="brand"><img className="brand-mark" src="icons/128.png" alt=""/><div><strong>蛋壳币价</strong><small>DANKE COIN</small></div></div>
      {donationReady(donationDetails) && <div className="donation-trigger">
        <button type="button" className="donation-entry" onClick={() => setView('donation')}>
          <span>投喂蛋壳</span><small className="donation-note">（支持开发）</small>
        </button>
      </div>}
      <div className="top-actions">
        <span className={`connection ${state?.connection.status ?? (error ? 'offline' : 'connecting')}`} title={state?.connection.message ?? (error || '正在连接')}><i />{state ? statusText[state.connection.status] : error ? '不可用' : '连接中'}</span>
        <button type="button" className="icon-button" aria-label="刷新行情" title="刷新行情" onClick={refresh} disabled={busy}><RefreshCw size={17} /></button>
        <button type="button" className="icon-button" aria-label={view === 'settings' ? '返回首页' : '设置'} title="设置" onClick={() => setView(view === 'settings' ? 'home' : 'settings')}><Settings2 size={17} /></button>
      </div>
    </header>
    {bridge.isPreview && <div className="preview-banner">交互预览 · 示例数据</div>}
    {error && <div className="error-banner" role="alert"><CircleAlert size={15}/><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><X size={14}/></button></div>}
    <main>
      {view === 'settings' ? <section className="settings-panel" aria-label="设置">
        <div className="section-head"><div><span className="eyebrow">PREFERENCES</span><h1>偏好设置</h1></div><button className="icon-button" onClick={() => setView('home')} aria-label="关闭设置"><X size={18}/></button></div>
        <SettingGroup title="角标显示" note="浏览器图标上的简略数值，完整价格请在这里查看。" options={[['price','价格'],['change','涨跌幅']]} value={settings.badgeMode} disabled={busy} onSelect={value => save({ badgeMode: value as Settings['badgeMode'] })}/>
        <SettingGroup title="角标轮换" note="固定到角标会关闭轮换。" options={[[0,'固定'],[5,'5 秒'],[10,'10 秒'],[15,'15 秒']]} value={settings.rotationSeconds} disabled={busy} onSelect={value => save({ rotationSeconds: value as Settings['rotationSeconds'] })}/>
        <SettingGroup title="外观" options={[["system",'跟随系统'],['light','浅色'],['dark','深色']]} value={settings.theme} disabled={busy} onSelect={value => save({ theme: value as Settings['theme'] })}/>
        <SettingGroup title="涨跌颜色" options={[["green-up",'涨绿跌红'],['red-up','涨红跌绿']]} value={settings.colorScheme} disabled={busy} onSelect={value => save({ colorScheme: value as Settings['colorScheme'] })}/>
      </section> : <>
        <div className="intro-row"><div><span className="eyebrow">YOUR MARKET AT A GLANCE</span><h1>市场概览<span className="live-spark">✳</span></h1></div><span className="market-note">现货 / USDT 永续 · 24H</span></div>
        <section className="focus-card" data-testid="focus-quote" aria-label="角标关注行情">
          <div className="focus-top"><span className="focus-kicker"><span className="focus-dot"/>角标关注{focusSymbol && <span className="market-tag">{marketLabel(focusSymbol)}</span>}</span><span className="fresh-label">{quoteStatus(focusQuote, focusSymbol)}</span></div>
          <div className="focus-pair"><span className="coin-symbol">{focusSymbol?.baseAsset ?? '—'}</span><span className="pair-divider">/</span><span>{focusSymbol?.quoteAsset ?? '—'}</span></div>
          <div className="price-caption">{focusSymbol && marketOf(focusSymbol) === 'usdm' ? '最新成交价' : '最新价格'}</div><div className="focus-price"><strong title={focusQuote ? formatPrice(focusQuote.price) : undefined}>{focusQuote ? formatPrice(focusQuote.price) : '--'}</strong><span>{focusSymbol?.quoteAsset ?? ''}</span></div>
          <div className="focus-bottom"><span>过去 24 小时</span><span className={`change-pill ${changeClass(focusQuote?.changePercent)}`}>{focusQuote?.changePercent != null && focusQuote.changePercent >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {formatChange(focusQuote?.changePercent ?? null)}</span></div>
        </section>
        {selected && <section className="detail-card" data-testid="pair-detail" aria-label="币对详情">
          <div className="detail-head"><div><span className="eyebrow">币对预览 · {marketLabel(selected)}</span><h2>{pairName(selected)}</h2></div><button className="icon-button" aria-label="关闭币对详情" onClick={() => { quoteRequest.current++; setSelected(null); setSelectedQuote(null); }}><X size={17}/></button></div>
          <div className="price-caption">{marketOf(selected) === 'usdm' ? '最新成交价' : '最新价格'}</div><div className="detail-price"><strong title={selectedQuote ? formatPrice(selectedQuote.price) : undefined}>{selectedQuote ? formatPrice(selectedQuote.price) : detailLoading ? '加载中…' : '--'}</strong><span>{selected.quoteAsset}</span></div>
          <div className="detail-meta"><span>{quoteStatus(selectedQuote ?? undefined, selected)}</span><span>24h {formatChange(selectedQuote?.changePercent ?? null)}</span></div>
          <div className="detail-actions"><button className="primary-button" disabled={busy || !!selectedInList || settings.watchlist.length >= 20} onClick={() => save({ watchlist: [...settings.watchlist, selected] })}>{selectedInList ? <><Check size={15}/> 已在自选</> : settings.watchlist.length >= 20 ? '自选已满（20）' : <><Plus size={15}/> 加入自选</>}</button><button className="outline-button" disabled={busy || (!selectedInList && settings.watchlist.length >= 20)} onClick={() => save({ badgeSymbol: pairKey(selected), watchlist: selectedInList ? settings.watchlist : [...settings.watchlist, selected], rotationSeconds: 0 })}><Pin size={14}/> 固定到角标</button></div>
        </section>}
        <section className="watch-section" aria-label="自选行情"><div className="watch-head"><div><span className="eyebrow">WATCHLIST</span><h2>我的自选 <span>{settings.watchlist.length}/20</span></h2></div><button className="add-button" aria-label="添加币对" onClick={() => setView('search')}><Plus size={16}/> 添加币对</button></div>
          <div className="watch-list">{settings.watchlist.map(item => { const itemQuote = state?.quotes[pairKey(item)]; return <div className="watch-row" key={pairKey(item)}><button className="watch-main" onClick={() => selectPair(item)} aria-label={`查看 ${pairName(item)}${marketOf(item) === 'usdm' ? ' USDT 永续' : ''} 详情`}><span className="coin-avatar">{item.baseAsset.slice(0, 1)}</span><span className="watch-identity"><strong>{item.baseAsset}<small>/{item.quoteAsset}</small></strong><small>{marketLabel(item)} · {quoteStatus(itemQuote, item)}{marketOf(item) === 'usdm' ? ' · 最新成交价' : ''}</small></span><span className="watch-value"><strong title={itemQuote ? `${formatPrice(itemQuote.price)} ${item.quoteAsset}` : undefined}>{itemQuote ? formatPrice(itemQuote.price) : '--'} <small>{item.quoteAsset}</small></strong><small className={changeClass(itemQuote?.changePercent)}>{formatChange(itemQuote?.changePercent ?? null)}</small></span><ChevronRight size={15} className="row-chevron"/></button><button className="remove-button" aria-label={`移除 ${pairName(item)}${marketOf(item) === 'usdm' ? ' USDT 永续' : ''}`} title={settings.watchlist.length <= 1 ? '至少保留一个币对' : '移除自选'} disabled={busy || settings.watchlist.length <= 1} onClick={() => save({watchlist: settings.watchlist.filter(entry => pairKey(entry) !== pairKey(item))})}><X size={14}/></button></div>; })}</div>
        </section>
      </>}
      {view === 'search' && <div className="search-overlay"><section className="search-panel" aria-label="搜索币对">
        <div className="section-head"><div><span className="eyebrow">FIND A PAIR</span><h2>添加币对</h2></div><button className="icon-button" aria-label="关闭搜索" onClick={() => setView('home')}><X size={18}/></button></div>
        <div className="market-tabs" role="tablist" aria-label="选择市场">
          {(['spot', 'usdm'] as const).map(market => <button key={market} type="button" role="tab" aria-selected={searchMarket === market} onClick={() => { setSearchMarket(market); void loadCatalog(market); }}>{market === 'spot' ? '现货' : 'USDT 永续'}</button>)}
        </div>
        <label className="search-field"><Search size={17}/><input type="search" autoFocus placeholder="搜索 BTC、BTW 或 USDT" value={search} onChange={event => setSearch(event.target.value)} aria-label="搜索币对"/></label>
        <p className="search-hint">{searchMarket === 'spot' ? '优先显示 USDT 交易对' : 'USDT 结算永续合约 · 最新成交价'} · 选择后可查看详情</p>
        <div className="search-results" role="tabpanel" aria-label={`${searchMarket === 'spot' ? '现货' : 'USDT 永续'}搜索结果`}>
          {filteredSymbols.length ? filteredSymbols.map(item => <button key={pairKey(item)} onClick={() => selectPair(item)} aria-label={`选择 ${pairName(item)}${marketOf(item) === 'usdm' ? ' USDT 永续' : ''}`}><span className="coin-avatar">{item.baseAsset.slice(0, 1)}</span><span><strong>{pairName(item)}</strong><small>{item.symbol} · {marketLabel(item)}</small></span><ChevronRight size={16}/></button>)
            : <div className="empty-results"><p>{catalogLoading[searchMarket] ? '正在加载币对…' : catalogErrors[searchMarket] || '没有找到相关币对'}</p><button type="button" className="alternate-market" onClick={() => { const next = searchMarket === 'spot' ? 'usdm' : 'spot'; setSearchMarket(next); void loadCatalog(next); }}>试试{searchMarket === 'spot' ? 'USDT 永续' : '现货'}</button></div>}
        </div>
      </section></div>}
    </main>
    <footer><span>BINANCE <i/> SPOT / USDT 永续</span><span>24h 涨跌幅 · 行情仅供参考</span></footer>
    {view==='donation' && donationReady(donationDetails) && <DonationDialog details={donationDetails} onClose={()=>setView('home')}/>}
  </div>;
}

function SettingGroup<T extends string | number>({ title, note, options, value, disabled, onSelect }: { title: string; note?: string; options: [T, string][]; value: T; disabled: boolean; onSelect: (value: T) => void }) {
  return <div className="setting-group"><div className="setting-title"><strong>{title}</strong>{note && <small>{note}</small>}</div><div className="segmented">{options.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} disabled={disabled} onClick={() => onSelect(key)}>{label}</button>)}</div></div>;
}
