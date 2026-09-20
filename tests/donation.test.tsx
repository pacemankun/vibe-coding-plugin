// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { existsSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DonationDialog from '../src/popup/DonationDialog';
import { donationDetails, donationReady, type DonationDetails } from '../src/popup/donationConfig';

afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('donation dialog',()=>{
  it('uses all three owner-provided QR assets and a complete USDT destination',()=>{
    expect(donationReady(donationDetails)).toBe(true);
    for(const key of ['wechatQr','alipayQr','usdtQr'] as const) {
      expect(existsSync(`public/${donationDetails[key]}`)).toBe(true);
    }
    expect(donationDetails.usdtNetwork).toBe('ERC20 (Ethereum)');
    expect(donationDetails.usdtAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    for(const key of Object.keys(donationDetails) as (keyof DonationDetails)[]) {
      expect(donationReady({...donationDetails,[key]:''})).toBe(false);
    }
  });
  it('shows exactly WeChat, Alipay and USDT with clean QR images',async()=>{
    render(<DonationDialog details={donationDetails} onClose={()=>{}}/>);
    expect(screen.getByRole('dialog',{name:'支持蛋壳币价'})).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['微信','支付宝','USDT']);
    expect(screen.queryByText('公众号')).not.toBeInTheDocument();
    expect(screen.getByRole('img',{name:'微信收款码'})).toHaveAttribute('src',donationDetails.wechatQr);
    await userEvent.click(screen.getByRole('tab',{name:'支付宝'}));
    expect(screen.getByRole('img',{name:'支付宝收款码'})).toHaveAttribute('src',donationDetails.alipayQr);
    await userEvent.click(screen.getByRole('tab',{name:'USDT'}));
    expect(screen.getByRole('img',{name:'USDT收款码'})).toHaveAttribute('src',donationDetails.usdtQr);
  });
  it('labels the USDT network and minimum, and copies only the address',async()=>{
    const writeText=vi.fn(async()=>{});
    Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
    render(<DonationDialog details={donationDetails} onClose={()=>{}}/>);
    await userEvent.click(screen.getByRole('tab',{name:'USDT'}));
    expect(screen.getAllByText(/ERC20 \(Ethereum\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0.5 USDT/)).toBeInTheDocument();
    expect(screen.getByText(donationDetails.usdtAddress)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'复制地址'}));
    expect(writeText).toHaveBeenCalledWith(donationDetails.usdtAddress);
    expect(await screen.findByText('地址已复制')).toBeInTheDocument();
  });
  it('closes by button or Escape',async()=>{
    const onClose=vi.fn();
    const {rerender}=render(<DonationDialog details={donationDetails} onClose={onClose}/>);
    await userEvent.click(screen.getByRole('button',{name:'关闭打赏'}));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<DonationDialog details={donationDetails} onClose={onClose}/>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
