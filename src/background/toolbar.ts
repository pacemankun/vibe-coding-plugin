const originalIcons={16:'icons/16.png',32:'icons/32.png',48:'icons/48.png',128:'icons/128.png'};
let originalIconRestored=false;

export async function paintToolbar(badge:{text:string;color:string;title:string}) {
  // Reset icons rendered by older versions before using Chrome's readable native badge.
  if(!originalIconRestored) {
    await chrome.action.setIcon({path:originalIcons});
    originalIconRestored=true;
  }
  await chrome.action.setBadgeBackgroundColor({color:badge.color});
  await chrome.action.setBadgeTextColor({color:'#30282b'});
  await chrome.action.setBadgeText({text:badge.text});
  await chrome.action.setTitle({title:badge.title});
}
