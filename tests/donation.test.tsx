// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DonationDialog from '../src/popup/DonationDialog';
import { donationDetails, donationReady, type DonationDetails } from '../src/popup/donationConfig';

const details:DonationDetails={
  wechatQr:'donations/wechat.png',
  alipayQr:'donations/alipay.png',
  usdtAddress:'TExampleWalletAddress123456789',
  usdtNetwork:'TRC20',
};
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('donation dialog',()=>{
  it('does not expose a payment entry until all three owner destinations are provided',()=>{
    expect(donationReady(donationDetails)).toBe(false);
    expect(donationReady(details)).toBe(true);
    for(const key of Object.keys(details) as (keyof DonationDetails)[]) {
      expect(donationReady({...details,[key]:''})).toBe(false);
    }
  });
  it('shows exactly WeChat, Alipay and USDT, with the supplied QR images',async()=>{
    render(<DonationDialog details={details} onClose={()=>{}}/>);
    expect(screen.getByRole('dialog',{name:'支持蛋壳币价'})).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['微信','支付宝','USDT']);
    expect(screen.queryByText('公众号')).not.toBeInTheDocument();
    expect(screen.getByRole('img',{name:'微信收款码'})).toHaveAttribute('src','donations/wechat.png');
    await userEvent.click(screen.getByRole('tab',{name:'支付宝'}));
    expect(screen.getByRole('img',{name:'支付宝收款码'})).toHaveAttribute('src','donations/alipay.png');
  });
  it('labels the USDT network and copies only the supplied wallet address',async()=>{
    const writeText=vi.fn(async()=>{});
    Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
    render(<DonationDialog details={details} onClose={()=>{}}/>);
    await userEvent.click(screen.getByRole('tab',{name:'USDT'}));
    expect(screen.getByText('TRC20')).toBeInTheDocument();
    expect(screen.getByText(details.usdtAddress)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'复制地址'}));
    expect(writeText).toHaveBeenCalledWith(details.usdtAddress);
    expect(await screen.findByText('地址已复制')).toBeInTheDocument();
  });
  it('closes by button or Escape',async()=>{
    const onClose=vi.fn();
    const {rerender}=render(<DonationDialog details={details} onClose={onClose}/>);
    await userEvent.click(screen.getByRole('button',{name:'关闭打赏'}));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<DonationDialog details={details} onClose={onClose}/>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
