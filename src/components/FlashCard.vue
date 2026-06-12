<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['word'])
// emit('rate', rating) where rating = 1 (blackout) | 2 (forgot) | 3 (hard) | 4 (easy)
const emit = defineEmits(['rate'])

const isFlipped  = ref(false)
const flipTime   = ref(0)   // ms timestamp when card was flipped

watch(() => props.word?.id, () => { isFlipped.value = false; flipTime.value = 0 })

const flip = () => {
  if (isFlipped.value) return
  isFlipped.value = true
  flipTime.value  = Date.now()
}

// Compute response time in seconds after flip
const responseMs = () => flipTime.value ? Date.now() - flipTime.value : 999999

// Rate with context:
//  Forgot  → always rating 1 (blackout) — no hesitation needed
//  Hard    → rating 2 — user took >5s or tapped "Hard"
//  Good    → rating 3 — standard remember (< 5s)
//  Easy    → rating 4 — user explicitly taps Easy
const rateForget = () => emit('rate', 1)
const rateHard   = () => emit('rate', 2)
const rateGood   = () => {
  // auto-detect: if user took >6 seconds after flip → downgrade to Hard
  const secs = responseMs() / 1000
  emit('rate', secs > 6 ? 2 : 3)
}
const rateEasy   = () => emit('rate', 4)

// ── Box labels & colours ──────────────────────────────────────────────────────
const BOX_LABELS = ['','Just Learned','Short-Term','Reinforcing','Solidifying','Long-Term','Deep Memory','Mastered']
const BOX_COLORS = ['','#fbbf24','#f97316','#34d399','#60a5fa','#818cf8','#c084fc','#f43f5e']

const getBox = (w) => {
  if (w._box)        return Math.min(Math.max(w._box, 1), 7)
  if (w.leitner_box) return Math.min(Math.max(w.leitner_box, 1), 7)
  const lvl = w.mastery_level ?? w.masteryLevel ?? 0
  if (lvl <= 2) return 1; if (lvl <= 4) return 2; if (lvl <= 6) return 3
  if (lvl <= 8) return 4; if (lvl <= 10) return 5; if (lvl === 11) return 6
  return 7
}
const mlLabel = (w) => BOX_LABELS[getBox(w)] || `Box ${getBox(w)}`
const mlColor = (w) => BOX_COLORS[getBox(w)] || '#94a3b8'

// Stability bar: 0–100 based on _stability (days), cap at 30 days = full bar
const stabilityPct = (w) => Math.min(100, Math.round(((w._stability || 0) / 30) * 100))
const stabilityColor = (pct) => {
  if (pct < 20)  return '#ef4444'
  if (pct < 50)  return '#f97316'
  if (pct < 75)  return '#facc15'
  return '#22c55e'
}

const pos      = (w) => w.part_of_speech || ''
const plain    = (w) => w.simple_meaning || w.meanings?.en || w.meaning || ''
const plainn   = (w) => w.meaning || w.meanings?.en || ''
const scenes   = (w) => Array.isArray(w.scenarios) ? w.scenarios : (w.scenario ? [w.scenario] : [])
const examples = (w) => {
  if (Array.isArray(w.examples)) return w.examples.flat()
  if (w.example_sentence) return [w.example_sentence]
  return []
}
const syns = (w) => w.synonyms || []
const ants = (w) => w.antonyms || []
</script>

<template>
  <div class="cw">

    <!-- ── FRONT ── -->
    <div v-if="!isFlipped" class="card front" @click="flip">

      <div class="f-top">
        <div class="mastery-tag" :style="{ background: mlColor(word) + '22', color: mlColor(word) }">
          <span class="m-dot" :style="{ background: mlColor(word) }"></span>
          {{ mlLabel(word) }}
        </div>
        <span v-if="pos(word)" class="pos-tag">{{ pos(word) }}</span>
      </div>

      <div class="f-center">
        <h1 class="big-word">{{ word.word }}</h1>
        <div class="tap-row">
          <span class="tl"></span>
          <span class="tap-hint">tap to reveal</span>
          <span class="tl"></span>
        </div>
      </div>

      <!-- Stability bar -->
      <div class="stab-row">
        <span class="stab-label">Memory</span>
        <div class="stab-track">
          <div
            class="stab-fill"
            :style="{
              width: stabilityPct(word) + '%',
              background: stabilityColor(stabilityPct(word))
            }"
          ></div>
        </div>
        <span class="stab-val" :style="{ color: stabilityColor(stabilityPct(word)) }">
          {{ word._stability ? (word._stability < 1 ? '<1d' : Math.round(word._stability) + 'd') : 'New' }}
        </span>
      </div>

      <!-- Session streak pips -->
      <div class="pips">
        <span
          v-for="n in 3" :key="n"
          class="pip"
          :class="{ on: n <= (word._sessionStreak || 0) }"
        ></span>
      </div>

    </div>

    <!-- ── BACK ── -->
    <div v-else class="card back">

      <div class="b-head">
        <div class="b-wordrow">
          <span class="b-word">{{ word.word }}</span>
          <span v-if="pos(word)" class="b-pos">{{ pos(word) }}</span>
        </div>
        <div class="chips">
          <span v-if="plain(word)"        class="chip simple"><i class="fas fa-lightbulb ci"></i>{{ plain(word) }}</span>
          <span v-if="plainn(word) && plainn(word) !== plain(word)" class="chip simple"><i class="fas fa-lightbulb ci"></i>{{ plainn(word) }}</span>
          <span v-if="word?.urdu_meaning"  class="chip urdu">{{ word.urdu_meaning }}</span>
          <span v-if="word?.hindi_meaning" class="chip hindi">{{ word.hindi_meaning }}</span>
        </div>
      </div>

      <div class="b-body">
        <div v-if="scenes(word).length" class="iblock scene-block">
          <div class="blabel">SCENARIO</div>
          <p v-for="(s, i) in scenes(word)" :key="i" class="eg-txt">{{ i+1 }}. {{ s }}</p>
        </div>
        <div v-if="examples(word).length" class="iblock eg-block">
          <div class="blabel">EXAMPLES</div>
          <div v-for="(ex, i) in examples(word)" :key="'ex-'+i" class="eg-txt">{{ i+1 }}. {{ ex }}</div>
        </div>
      </div>

      <div class="b-foot">
        <div v-if="syns(word).length" class="pgroup">
          <span class="glabel syn-l"><i class="fas fa-equals"></i> Synonyms</span>
          <div class="pills">
            <span v-for="s in syns(word)" :key="s" class="pill spill">{{ s }}</span>
          </div>
        </div>
        <div v-if="ants(word).length" class="pgroup">
          <span class="glabel ant-l"><i class="fas fa-not-equal"></i> Antonyms</span>
          <div class="pills">
            <span v-for="a in ants(word)" :key="a" class="pill apill">{{ a }}</span>
          </div>
        </div>
      </div>

      <!-- 4-button rating row -->
      <div class="actions">
        <button class="abtn r1" @click="rateForget">
          <span class="abtn-icon">✕</span>
          <span class="abtn-label">Forgot</span>
          <span class="abtn-sub">Blackout</span>
        </button>
        <button class="abtn r2" @click="rateHard">
          <span class="abtn-icon">≈</span>
          <span class="abtn-label">Hard</span>
          <span class="abtn-sub">Barely got it</span>
        </button>
        <button class="abtn r3" @click="rateGood">
          <span class="abtn-icon">✓</span>
          <span class="abtn-label">Good</span>
          <span class="abtn-sub">Remembered</span>
        </button>
        <button class="abtn r4" @click="rateEasy">
          <span class="abtn-icon">★</span>
          <span class="abtn-label">Easy</span>
          <span class="abtn-sub">Instant</span>
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.cw { flex: 1; display: flex; flex-direction: column; min-height: 0; font-family: 'Plus Jakarta Sans', sans-serif; }

.card {
  flex: 1; border-radius: 22px; display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 48px -10px rgba(15,23,42,0.15), 0 4px 12px -4px rgba(15,23,42,0.06);
}

/* FRONT */
.front {
  background: #fff; border: 1px solid #eaecf0;
  padding: 18px 18px 14px; cursor: pointer; user-select: none;
  justify-content: space-between; transition: transform 0.12s;
}
.front:active { transform: scale(0.982); }
.f-top { display: flex; justify-content: space-between; align-items: center; }
.mastery-tag {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  padding: 4px 10px; border-radius: 20px;
}
.m-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.pos-tag { font-size: 0.65rem; color: #94a3b8; font-weight: 600; font-style: italic; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 8px; }
.f-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.big-word { font-family: 'Lora', serif; font-size: clamp(2.3rem, 10vw, 3.5rem); font-weight: 700; color: #0f172a; margin: 0; text-align: center; line-height: 1.1; }
.tap-row { display: flex; align-items: center; gap: 10px; }
.tl { flex: 1; height: 1px; background: #e2e8f0; max-width: 36px; }
.tap-hint { font-size: 0.62rem; color: #cbd5e1; font-weight: 700; text-transform: uppercase; letter-spacing: 1.8px; }

/* Stability bar */
.stab-row { display: flex; align-items: center; gap: 7px; padding: 0 2px; }
.stab-label { font-size: 0.6rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; flex-shrink: 0; }
.stab-track { flex: 1; height: 4px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.stab-fill  { height: 100%; border-radius: 4px; transition: width 0.5s ease, background 0.4s ease; }
.stab-val   { font-size: 0.62rem; font-weight: 800; flex-shrink: 0; min-width: 26px; text-align: right; }

/* Session pips */
.pips { display: flex; justify-content: center; gap: 6px; }
.pip  { width: 30px; height: 5px; border-radius: 3px; background: #e2e8f0; transition: background 0.3s, transform 0.2s; }
.pip.on { background: #f59e0b; transform: scaleY(1.5); }

/* BACK */
.back { background: #f8f9fb; border: 1px solid #eaecf0; }
.b-head { background: #fff; padding: 12px 14px 10px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; }
.b-wordrow { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
.b-word { font-family: 'Lora', serif; font-size: 1.5rem; font-weight: 700; color: #0f172a; }
.b-pos  { font-size: 0.65rem; color: #94a3b8; font-style: italic; font-weight: 600; }
.chips  { display: flex; gap: 5px; flex-wrap: wrap; }
.chip   { padding: 4px 10px; border-radius: 9px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.ci     { font-size: 0.62rem; }
.chip.simple { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.chip.urdu   { background: #f0fdf4; border: 1px solid #bbf7d0; font-family: 'Noto Nastaliq Urdu', serif; font-size: 0.95rem; color: #166534; }
.chip.hindi  { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
.b-body { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 8px 10px; }
.iblock { border-radius: 13px; padding: 10px; display: flex; flex-direction: column; gap: 6px; -webkit-overflow-scrolling: touch; height: 120px; overflow-y: auto; }
.scene-block { background: linear-gradient(145deg,#fff7ed,#ffedd5); border: 1px solid #fed7aa; }
.eg-block    { background: linear-gradient(145deg,#eff6ff,#dbeafe); border: 1px solid #bfdbfe; }
.blabel { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.65; }
.scene-block .blabel { color: #9a3412; }
.eg-block    .blabel { color: #1e40af; }
.eg-txt { font-size: 0.76rem; line-height: 1.5; color: #1e3a8a; margin: 0; }
.b-foot { display: flex; gap: 6px; padding: 0 10px 6px; flex-shrink: 0; }
.pgroup { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.glabel { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 3px; }
.syn-l { color: #16a34a; }
.ant-l { color: #dc2626; }
.pills { display: flex; flex-wrap: wrap; gap: 3px; }
.pill  { padding: 3px 9px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
.spill { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.apill { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

/* 4-button rating row */
.actions {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 5px; padding: 7px 8px 10px;
  background: #fff; border-top: 1px solid #f1f5f9; flex-shrink: 0;
  margin-bottom: 0;
}
.abtn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  padding: 9px 4px; border: 1.5px solid transparent; border-radius: 13px;
  cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
  transition: transform 0.12s; background: transparent;
}
.abtn:active { transform: scale(0.92); }
.abtn-icon  { font-size: 1rem; line-height: 1; }
.abtn-label { font-size: 0.72rem; font-weight: 800; }
.abtn-sub   { font-size: 0.55rem; font-weight: 600; opacity: 0.7; }
.r1 { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.r2 { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.r3 { background: #f0fdf4; border-color: #86efac; color: #16a34a; }
.r4 { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
</style>
