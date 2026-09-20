export interface DonationDetails {
  wechatQr: string;
  alipayQr: string;
  usdtQr: string;
  usdtAddress: string;
  usdtNetwork: string;
  usdtMinimum: string;
}

// The three QR assets are regenerated from the owner's codes so screenshots,
// account names, and embedded portraits never enter the extension bundle.
export const donationDetails:DonationDetails={
  wechatQr:'donations/wechat.png',
  alipayQr:'donations/alipay.png',
  usdtQr:'donations/usdt.png',
  usdtAddress:'0xec80be6d6a4add98405efa2ef68e9f15d44072d8',
  usdtNetwork:'ERC20 (Ethereum)',
  usdtMinimum:'0.5 USDT',
};

export const donationReady=(details:DonationDetails)=>Object.values(details).every(value=>value.trim().length>0);
