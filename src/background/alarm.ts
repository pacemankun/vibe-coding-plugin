export const HEALTH_ALARM = 'coin-glance-health';
export async function ensureAlarm(alarms:Pick<typeof chrome.alarms,'get'|'create'>) {
  const alarm=await alarms.get(HEALTH_ALARM);
  if(!alarm || alarm.periodInMinutes!==0.5)await alarms.create(HEALTH_ALARM,{periodInMinutes:0.5});
}
