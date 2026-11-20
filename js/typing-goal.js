/* 교사 화면과 지급 서버가 같은 기준으로 하루 기록을 판정한다. */
function typingGoalMet(day, goal) {
  if (!goal) return null;
  if (!day || !(day.keys > 0 || day.sec > 0 || Object.values(day.modes || {}).some(n => n > 0))) return false;
  const speed = day.cpm > 1000 ? 0 : (day.cpm || 0);
  return (day.sec || 0) >= (goal.min || 0) * 60 &&
    (day.acc || 0) >= (goal.acc || 0) && speed >= (goal.cpm || 0);
}
if (typeof module !== 'undefined') module.exports = typingGoalMet;
