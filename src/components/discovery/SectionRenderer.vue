<script setup>
const props = defineProps({
  section:       { type: Object,  required: true },
  itemId:        { type: String,  required: true },
  itemWords:     { type: Array,   default: () => [] },
  exerciseState: { type: Object,  default: () => ({}) },
})
const emit = defineEmits(['answer', 'wordTap'])

// Exercise helpers
const key      = (qi) => `${props.itemId}_${qi}`
const answered = (qi) => !!props.exerciseState[key(qi)]
const selected = (qi, opt) => props.exerciseState[key(qi)] === opt
const correct  = (qi, ans) => props.exerciseState[key(qi)] === ans

const pick = (qi, opt) => {
  if (answered(qi)) return
  emit('answer', { key: key(qi), option: opt })
}

// Highlight library words in plain text
const highlight = (text) => {
  if (!text || !props.itemWords?.length) return text
  const escaped = props.itemWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
  return text.replace(re, `<mark class="hw">$1</mark>`)
}

const onPlainClick = (e) => {
  if (e.target.classList.contains('hw'))
    emit('wordTap', { word: e.target.innerText, event: e })
}
</script>

<template>
  <div class="block">

    <h3 v-if="section.heading" class="sec-heading">
      <span class="sec-line"></span>{{ section.heading }}
    </h3>

    <!-- RULE -->
    <div v-if="section.style === 'rule'" class="rule-box">
      <span class="rule-icon">â—ˆ</span>
      <p>{{ section.content }}</p>
    </div>

    <!-- PLAIN (story, highlighted) -->
    <p v-else-if="section.style === 'plain'"
       class="plain-text"
       v-html="highlight(section.content)"
       @click="onPlainClick"></p>

    <!-- EXAMPLES -->
    <div v-else-if="section.style === 'example'" class="examples">
      <div v-for="(ex, i) in section.examples" :key="i" class="ex-card">
        <p class="ex-sentence">"{{ ex.sentence }}"</p>
        <p v-if="ex.explanation" class="ex-note">{{ ex.explanation }}</p>
        <p v-if="ex.urdu_meaning" class="ex-urdu urdu">{{ ex.urdu_meaning }}</p>
      </div>
    </div>

    <!-- HIGHLIGHT (mistakes) -->
    <div v-else-if="section.style === 'highlight'" class="hl-box">
      <div v-for="(p, i) in section.points" :key="i" class="hl-row">
        <span class="hl-dot"></span><span>{{ p }}</span>
      </div>
    </div>

    <!-- GRID (word cards) -->
    <div v-else-if="section.style === 'grid'" class="wc-grid">
      <div v-for="c in section.cards" :key="c.title" class="wc-card">
        <span class="wc-word">{{ c.title }}</span>
        <p class="wc-def">{{ c.text }}</p>
      </div>
    </div>

    <!-- ADVICE / TIP -->
    <div v-else-if="section.style === 'advice'" class="advice-box">
      <div class="advice-top">
        <span class="advice-star">&#10022;</span>
        <span class="advice-lbl">Tip</span>
      </div>
      <p v-for="(p, i) in section.points" :key="i" class="advice-p">{{ p }}</p>
    </div>

    <!-- EXERCISE -->
    <div v-else-if="section.style === 'exercise'" class="exercises">
      <div v-for="(q, qi) in section.questions" :key="qi" class="eq-card">
        <p class="eq-q">{{ q.question }}</p>
        <div class="eq-opts">
          <button
            v-for="opt in q.options" :key="opt"
            class="eq-btn"
            :class="{
              'eq-correct': answered(qi) && opt === q.answer,
              'eq-wrong':   selected(qi, opt) && opt !== q.answer,
              'eq-dim':     answered(qi) && !selected(qi, opt) && opt !== q.answer,
            }"
            @click.stop="pick(qi, opt)"
          >{{ opt }}</button>
        </div>
        <p v-if="answered(qi)" class="eq-fb" :class="{ ok: correct(qi, q.answer) }">
          {{ correct(qi, q.answer) ? 'âœ“ Correct!' : 'âœ— Answer: ' + q.answer }}
        </p>
      </div>
    </div>

    <!-- FALLBACK -->
    <p v-else-if="section.content" class="plain-text">{{ section.content }}</p>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }
.block { font-family: 'Plus Jakarta Sans', sans-serif; }

.sec-heading {
  display: flex; align-items: center; gap: 10px;
  font-size: 0.62rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: #94a3b8; margin: 0 0 12px;
}
.sec-line { flex: 0 0 18px; height: 1px; background: #e2e8f0; }

/* Rule */
.rule-box {
  display: flex; gap: 12px; align-items: flex-start;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 14px;
}
.rule-icon { color: #3b82f6; flex-shrink: 0; font-size: 1rem; margin-top: 2px; }
.rule-box p { font-size: 0.93rem; line-height: 1.7; color: #1e3a8a; margin: 0; font-weight: 500; }

/* Plain */
.plain-text { font-size: 1rem; line-height: 1.85; color: #334155; margin: 0; }
:deep(.hw) {
  background: #eff6ff; color: #2563eb; border-bottom: 1px solid #bfdbfe;
  border-radius: 3px; padding: 0 2px; cursor: pointer; font-style: normal;
}

/* Examples */
.examples { display: flex; flex-direction: column; gap: 10px; }
.ex-card {
  background: white; border: 1px solid #f1f5f9; border-left: 3px solid #f59e0b;
  border-radius: 0 13px 13px 0; padding: 13px 15px;
  box-shadow: 0 1px 5px -2px rgba(15,23,42,0.05);
}
.ex-sentence { font-family: 'Lora', serif; font-style: italic; font-size: 0.98rem; color: #92400e; margin: 0 0 5px; line-height: 1.5; }
.ex-note     { font-size: 0.8rem; color: #64748b; margin: 0 0 4px; line-height: 1.4; }
.ex-urdu     { font-size: 0.88rem; color: #166534; margin: 0; }
.urdu        { font-family: 'Noto Nastaliq Urdu', serif; }

/* Highlight */
.hl-box {
  background: #fff7ed; border: 1px solid #fed7aa; border-radius: 14px;
  padding: 14px; display: flex; flex-direction: column; gap: 9px;
}
.hl-row  { display: flex; align-items: flex-start; gap: 9px; font-size: 0.87rem; color: #9a3412; line-height: 1.5; }
.hl-dot  { width: 6px; height: 6px; border-radius: 50%; background: #f97316; flex-shrink: 0; margin-top: 6px; }

/* Grid */
.wc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wc-card { background: white; border: 1px solid #f1f5f9; border-radius: 13px; padding: 13px 11px; }
.wc-word { font-family: 'Lora', serif; font-size: 1rem; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px; }
.wc-def  { font-size: 0.76rem; color: #64748b; margin: 0; line-height: 1.4; }

/* Advice */
.advice-box  { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 16px; padding: 16px; }
.advice-top  { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
.advice-star { color: #16a34a; font-size: 0.85rem; }
.advice-lbl  { font-size: 0.56rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #16a34a; }
.advice-p    { font-size: 0.88rem; color: #166534; line-height: 1.6; padding: 5px 0; border-top: 1px solid rgba(22,163,74,0.1); margin: 0; }
.advice-p:first-of-type { border: none; padding-top: 0; }

/* Exercise */
.exercises { display: flex; flex-direction: column; gap: 14px; }
.eq-card { background: white; border: 1px solid #f1f5f9; border-radius: 14px; padding: 14px; }
.eq-q    { font-size: 0.93rem; color: #0f172a; margin: 0 0 11px; font-weight: 600; line-height: 1.5; }
.eq-opts { display: flex; flex-wrap: wrap; gap: 7px; }
.eq-btn  {
  padding: 7px 15px; border-radius: 9px; background: #f8fafc; border: 1px solid #e2e8f0;
  color: #475569; font-size: 0.83rem; font-weight: 600; cursor: pointer;
  font-family: 'Plus Jakarta Sans', sans-serif; transition: all 0.12s;
}
.eq-btn:hover   { border-color: #94a3b8; }
.eq-correct     { background: #f0fdf4 !important; border-color: #86efac !important; color: #16a34a !important; }
.eq-wrong       { background: #fef2f2 !important; border-color: #fecaca !important; color: #dc2626 !important; }
.eq-dim         { opacity: 0.3; }
.eq-fb          { font-size: 0.76rem; font-weight: 700; margin: 9px 0 0; color: #dc2626; }
.eq-fb.ok       { color: #16a34a; }
</style>