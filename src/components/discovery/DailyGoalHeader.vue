<script setup>
defineProps({
  wordsToday:  { type: Number, default: 0 },
  dailyGoal:   { type: Number, default: 10 },
  progressPct: { type: Number, default: 0 },
})
</script>

<template>
  <div class="header">
    <div class="title-row">
      <div>
        <h1 class="title">Discover</h1>
        <p class="sub">Your daily learning feed</p>
      </div>

      <div class="ring-wrap">
        <svg viewBox="0 0 36 36" class="ring-svg">
          <circle class="ring-bg" cx="18" cy="18" r="14"/>
          <circle class="ring-fg" cx="18" cy="18" r="14"
            :style="{ strokeDasharray: progressPct + ' 100' }"/>
        </svg>
        <div class="ring-center">
          <span class="ring-pct">{{ progressPct }}%</span>
          <span class="ring-lbl">Goal</span>
        </div>
      </div>
    </div>

    <div class="goal-card">
      <div class="goal-info">
        <span class="goal-num">{{ wordsToday }} / {{ dailyGoal }}</span>
        <span class="goal-lbl">words today</span>
      </div>
      <div class="goal-track">
        <div class="goal-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');

.header { margin-bottom: 24px; font-family: 'Plus Jakarta Sans', sans-serif; }

.title-row {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px;
}
.title { font-size: 1.75rem; font-weight: 800; color: #0f172a; margin: 0 0 3px; letter-spacing: -0.5px; }
.sub   { font-size: 0.82rem; color: #94a3b8; margin: 0; font-weight: 500; }

/* Ring */
.ring-wrap {
  position: relative; width: 58px; height: 58px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ring-svg { width: 58px; height: 58px; transform: rotate(-90deg); position: absolute; inset: 0; }
.ring-bg { fill: none; stroke: #f1f5f9; stroke-width: 3.5; stroke-dasharray: 100 100; }
.ring-fg {
  fill: none; stroke: #6366f1; stroke-width: 3.5; stroke-linecap: round;
  stroke-dasharray: 0 100; transition: stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1);
}
.ring-center { display: flex; flex-direction: column; align-items: center; z-index: 1; }
.ring-pct { font-size: 0.64rem; font-weight: 800; color: #6366f1; line-height: 1; }
.ring-lbl { font-size: 0.42rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

/* Goal card */
.goal-card {
  background: white; border: 1px solid #f1f5f9; border-radius: 16px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 9px;
  box-shadow: 0 2px 10px -4px rgba(15,23,42,0.06);
}
.goal-info { display: flex; align-items: baseline; gap: 6px; }
.goal-num  { font-size: 1rem; font-weight: 800; color: #0f172a; }
.goal-lbl  { font-size: 0.72rem; color: #94a3b8; }
.goal-track { height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
.goal-fill {
  height: 100%; background: linear-gradient(90deg, #818cf8, #34d399);
  border-radius: 3px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
}
</style>