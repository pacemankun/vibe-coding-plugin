export interface DonationDetails {
  wechatQr: string;
  alipayQr: string;
  usdtAddress: string;
  usdtNetwork: string;
}

// Fill these fields only with the owner's verified destinations. The entry stays
// hidden until both original QR images and the wallet network/address are known.
export const donationDetails:DonationDetails={
  wechatQr:'',
  alipayQr:'',
  usdtAddress:'',
  usdtNetwork:'',
};

export const donationReady=(details:DonationDetails)=>Object.values(details).every(value=>value.trim().length>0);
