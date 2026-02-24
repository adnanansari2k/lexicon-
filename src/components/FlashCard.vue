<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['word'])
const emit = defineEmits(['remember', 'forgot'])

const isFlipped = ref(false)

watch(() => props.word?.id, () => { isFlipped.value = false })
const flip = () => { isFlipped.value = true }

const UI_LEVEL_MAP = [
  'New','Learning','Learning','Reinforcing','Reinforcing',
  'Stabilizing','Stabilizing','Strong','Strong',
  'Long-Term','Long-Term','Mastered','Elite',
]
const MASTERY_COLORS = [
  '#94a3b8','#fbbf24','#fbbf24','#34d399','#34d399',
  '#60a5fa','#60a5fa','#818cf8','#818cf8',
  '#c084fc','#c084fc','#fb923c','#f43f5e',
]

// Support both old and new JSON schema
const iml     = (w) => Math.min(w.mastery_level ?? w.masteryLevel ?? 0, 12)
const mlLabel = (w) => UI_LEVEL_MAP[iml(w)]
const mlColor = (w) => MASTERY_COLORS[iml(w)]
const pos   = (w) => w.part_of_speech || ''
const plain = (w) => w.simple_meaning || w.meanings?.en || w.meaning || ''
const plainn = (w) => w.meaning || w.meanings?.en || w.meaning || ''
const urdu  = (w) => w.urdu_meaning || ''
const hindi = (w) => w.hindi_meaning|| ''
const scenes = (w) =>
  Array.isArray(w.scenarios)
    ? w.scenarios
    : (w.scenario ? [w.scenario] : [])
const examples = (w) => {
  if (Array.isArray(w.examples)) return w.examples.flat()
  if (w.example_sentence) return w.example_sentence
  return []
}
const syns  = (w) => w.synonyms || []
const ants  = (w) => w.antonyms || []
</script>

<template>
  <div class="cw">

    <!-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â FRONT Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â -->
    <div v-if="!isFlipped" class="card front" @click="flip">

      <div class="f-top">
        <div class="mastery-tag" :style="{ background: mlColor(word) + '22', color: mlColor(word) }">
          <span class="m-dot" :style="{ background: mlColor(word) }"></span>
          {{ mlLabel(word) }}
        </div>
        <span v-if="pos(word)" class="pos">{{ pos(word) }}</span>
      </div>

      <div class="f-center">
        <h1 class="big-word">{{ word.word }}</h1>
        <div class="tap-row">
          <span class="tl"></span>
          <span class="tap-hint">tap to reveal</span>
          <span class="tl"></span>
        </div>
      </div>

      <div class="pips">
        <span v-for="n in 3" :key="n" class="pip" :class="{ on: n <= (word.sessionStreak || 0) }"></span>
      </div>

    </div>

    <!-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â BACK Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â -->
    <div v-else class="card back">

      <!-- Header: word + meanings -->
      <div class="b-head">
        
        <div class="b-wordrow">
          <span class="b-word">{{ word.word }}</span>
          <span v-if="pos(word)" class="b-pos">{{ pos(word) }}</span>
        </div>
        <div class="chips">
          <span v-if="plain(word)" class="chip simple">
            <i class="fas fa-lightbulb ci"></i>{{ plain(word) }}
          </span>
          <span v-if="plainn(word)" class="chip simple">
            <i class="fas fa-lightbulb ci"></i>{{ plainn(word) }}
          </span>
         <span v-if="word?.urdu_meaning" class="chip urdu">
  {{ word.urdu_meaning }}
</span>
<span v-if="word?.hindi_meaning" class="chip hindi">
  {{ word.hindi_meaning }}
</span>
        </div>
      </div>

      <!-- Body: scenario + example side by side -->
      <div class="b-body">
       <div v-if="scenes(word).length" class="iblock scene-block">
         <div class="blabel">SCENARIO</div>
  <p v-for="(s, i) in scenes(word)" :key="i" class="eg-txt">
    {{ i + 1 }}. {{ s }}
  </p>
</div>
       <div v-if="examples(word).length" class="iblock eg-block">
  <div class="blabel">EXAMPLES</div>

  <div
    v-for="(ex, i) in examples(word)"
    :key="'ex-' + i"
    class="eg-txt"
  >
    {{ i + 1 }}. {{ ex }}
  </div>
</div>
      </div>

      <!-- Footer: synonyms + antonyms -->
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

      <!-- Buttons -->
      <div class="actions">
        <button class="abtn forgot" @click="emit('forgot')">
          <i class="fas fa-xmark"></i> Forgot
        </button>
        <button class="abtn remember" @click="emit('remember')">
          <i class="fas fa-check"></i> Remember
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,700;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.cw {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.card {
  flex: 1;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 48px -10px rgba(15,23,42,0.15), 0 4px 12px -4px rgba(15,23,42,0.06);
}

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FRONT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
.front {
  background: #fff;
  border: 1px solid #eaecf0;
  padding: 18px 18px 14px;
  cursor: pointer;
  user-select: none;
  justify-content: space-between;
  transition: transform 0.12s;
}
.front:active { transform: scale(0.982); }

.f-top { display: flex; justify-content: space-between; align-items: center; }

.mastery-tag {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.65rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 4px 10px; border-radius: 20px;
}
.m-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

.pos {
  font-size: 0.65rem; color: #94a3b8; font-weight: 600; font-style: italic;
  background: #f8fafc; border: 1px solid #e2e8f0;
  padding: 3px 8px; border-radius: 8px;
}

.f-center {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px;
}

.big-word {
  font-family: 'Lora', serif;
  font-size: clamp(2.3rem, 10vw, 3.5rem);
  font-weight: 700;
  color: #0f172a;
  margin: 0; text-align: center; line-height: 1.1;
}

.tap-row { display: flex; align-items: center; gap: 10px; }
.tl { flex: 1; height: 1px; background: #e2e8f0; max-width: 36px; }
.tap-hint { font-size: 0.62rem; color: #cbd5e1; font-weight: 700; text-transform: uppercase; letter-spacing: 1.8px; }

.pips { display: flex; justify-content: center; gap: 6px; }
.pip {
  width: 30px; height: 5px; border-radius: 3px;
  background: #e2e8f0; transition: background 0.3s, transform 0.2s;
}
.pip.on { background: #f59e0b; transform: scaleY(1.5); }

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ BACK Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
.back {
  background: #f8f9fb;
  border: 1px solid #eaecf0;
}

.b-head {
  background: #fff;
  padding: 12px 14px 10px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.b-wordrow {
  display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px;
}
.b-word {
  font-family: 'Lora', serif;
  font-size: 1.5rem; font-weight: 700; color: #0f172a;
}
.b-pos {
  font-size: 0.65rem; color: #94a3b8; font-style: italic; font-weight: 600;
}

.chips { display: flex; gap: 5px; flex-wrap: wrap; }
.chip {
  padding: 4px 10px; border-radius: 9px;
  font-size: 0.75rem; font-weight: 600;
  display: flex; align-items: center; gap: 4px;
}
.ci { font-size: 0.62rem; }
.chip.simple { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.chip.urdu { background: #f0fdf4; border: 1px solid #bbf7d0; font-family: 'Noto Nastaliq Urdu', serif; font-size: 0.95rem; color: #166534; }
.chip.hindi { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }

/* Body: 2-col grid */
.b-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  padding: 8px 10px;
}
.iblock {
  border-radius: 13px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  -webkit-overflow-scrolling: touch;
  height: 260px;        /* 👈 SET HEIGHT */
  overflow-y: auto;     /* 👈 SCROLL HERE */
}
.scene-block { background: linear-gradient(145deg,#fff7ed,#ffedd5); border: 1px solid #fed7aa; }
.eg-block    { background: linear-gradient(145deg,#eff6ff,#dbeafe); border: 1px solid #bfdbfe; }

.blabel {
  font-size: 0.58rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1px;
  display: flex; align-items: center; gap: 3px; opacity: 0.65;
}
.scene-block .blabel { color: #9a3412; }
.eg-block    .blabel { color: #1e40af; }

.scene-txt {
  font-family: 'Lora', serif; font-style: italic;
  font-size: 0.76rem; line-height: 1.5; color: #7c2d12; margin: 0;
}
.eg-txt {
  font-size: 0.76rem; line-height: 1.5; color: #1e3a8a; margin: 0;
}

/* Pills row */
.b-foot {
  display: flex; gap: 6px; padding: 0 10px 6px; flex-shrink: 0;
}
.pgroup { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.glabel {
  font-size: 0.58rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.8px;
  display: flex; align-items: center; gap: 3px;
}
.syn-l { color: #16a34a; }
.ant-l { color: #dc2626; }

.pills { display: flex; flex-wrap: wrap; gap: 3px; }
.pill { padding: 3px 9px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
.spill { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.apill { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

/* Action buttons */
.actions {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 7px; padding: 8px 10px 10px;
  background: #fff; border-top: 1px solid #f1f5f9; flex-shrink: 0;
}
.abtn {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 12px; border: none; border-radius: 13px;
  cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700; font-size: 0.88rem;
  transition: transform 0.12s;
}
.abtn:active { transform: scale(0.94); }
.abtn.forgot  { background: #fef2f2; border: 1.5px solid #fecaca; color: #dc2626; }
.abtn.remember{ background: #f0fdf4; border: 1.5px solid #86efac; color: #16a34a; }
</style>