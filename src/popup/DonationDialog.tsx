import { useEffect, useRef, useState } from 'react';
import { Copy, X } from 'lucide-react';
import type { DonationDetails } from './donationConfig';

type Method='wechat'|'alipay'|'usdt';
const methods:[Method,string][]=[['wechat','微信'],['alipay','支付宝'],['usdt','USDT']];

export default function DonationDialog({details,onClose}:{details:DonationDetails;onClose:()=>void}) {
  const [method,setMethod]=useState<Method>('wechat');
  const [copyStatus,setCopyStatus]=useState('');
  const closeButton=useRef<HTMLButtonElement>(null);
  const closeHandler=useRef(onClose);
  closeHandler.current=onClose;

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')closeHandler.current();};
    document.addEventListener('keydown',onKeyDown);
    return ()=>{document.removeEventListener('keydown',onKeyDown);previous?.focus();};
  },[]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(details.usdtAddress);
      setCopyStatus('地址已复制');
    } catch {setCopyStatus('复制失败，请手动选择地址');}
  }

  const qr=method==='wechat'?details.wechatQr:method==='alipay'?details.alipayQr:details.usdtQr;
  const label=method==='wechat'?'微信':method==='alipay'?'支付宝':'USDT';
  return <div className="donation-overlay" onMouseDown={onClose}>
    <section className="donation-dialog" role="dialog" aria-modal="true" aria-label="支持蛋壳币价" onMouseDown={event=>event.stopPropagation()}>
      <header className="donation-header"><h2>支持蛋壳币价</h2><button ref={closeButton} type="button" className="icon-button" aria-label="关闭打赏" onClick={onClose}><X size={20}/></button></header>
      <div className="donation-tabs" role="tablist" aria-label="收款方式">
        {methods.map(([key,name])=><button key={key} type="button" role="tab" aria-selected={method===key} onClick={()=>{setMethod(key);setCopyStatus('');}}>{name}</button>)}
      </div>
      <div className={`donation-panel${method==='usdt'?' donation-panel-usdt':''}`} role="tabpanel" aria-label={method==='usdt'?'USDT 收款码与地址':`${label}收款码`}>
        {method==='usdt' && <p className="donation-network">USDT · 网络 <strong>{details.usdtNetwork}</strong></p>}
        <div className="donation-qr"><img src={qr} alt={`${label}收款码`}/></div>
        {method==='usdt' ? <>
          <p className="donation-warning">仅限 USDT · {details.usdtNetwork}；截图所示最低充值 {details.usdtMinimum}。转账前请核对当前地址和最低限额。</p>
          <code className="donation-address">{details.usdtAddress}</code>
          <button type="button" className="donation-copy" onClick={()=>void copyAddress()}><Copy size={15}/>复制地址</button>
          <p className="donation-copy-status" role="status">{copyStatus}</p>
        </> : <p className="donation-hint">使用{label}扫一扫</p>}
      </div>
    </section>
  </div>;
}
