<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ word: Object, allWords: Array })
const emit = defineEmits(['pass', 'fail'])

const selected = ref(null)
const revealed = ref(false)

// 13 internal levels â†’ 8 visible labels (matches FlashCardGame)
const UI_LEVEL_MAP = [
  'New',          // 0
  'Learning',     // 1
  'Learning',     // 2
  'Reinforcing',  // 3
  'Reinforcing',  // 4
  'Stabilizing',  // 5
  'Stabilizing',  // 6
  'Strong',       // 7
  'Strong',       // 8
  'Long-Term',    // 9
  'Long-Term',    // 10
  'Mastered',     // 11
  'Elite',        // 12
]

const MASTERY_COLORS = [
  '#94a3b8', // New
  '#fbbf24', // Learning (1)
  '#fbbf24', // Learning (2)
  '#34d399', // Reinforcing (3)
  '#34d399', // Reinforcing (4)
  '#60a5fa', // Stabilizing (5)
  '#60a5fa', // Stabilizing (6)
  '#818cf8', // Strong (7)
  '#818cf8', // Strong (8)
  '#c084fc', // Long-Term (9)
  '#c084fc', // Long-Term (10)
  '#fb923c', // Mastered (11)
  '#f43f5e', // Elite (12)
]

const iml = (w) => Math.min(w.mastery_level ?? w.masteryLevel ?? 0, 12)

const plain = (w) => w.simple_meaning || w.meanings?.en || w.meaning || ''

const options = computed(() => {
  const correct = props.word
  const distractors = (props.allWords || [])
    .filter(w => w.id !== correct.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)

  return [...distractors, correct]
    .sort(() => Math.random() - 0.5)
    .map(w => ({
      id: w.id,
      meaning: plain(w),
      isCorrect: w.id === correct.id
    }))
})

const choose = (opt) => {
  if (revealed.value) return
  selected.value = opt
  revealed.value = true
  setTimeout(() => {
    if (opt.isCorrect) emit('pass')
    else emit('fail')
  }, 950)
}

const currentLevel = computed(() => iml(props.word))
const nextLevel = computed(() => Math.min(currentLevel.value + 1, 12))
const currentLabel = computed(() => UI_LEVEL_MAP[currentLevel.value])
const nextLabel = computed(() => UI_LEVEL_MAP[nextLevel.value])
const currentColor = computed(() => MASTERY_COLORS[currentLevel.value])
const nextColor = computed(() => MASTERY_COLORS[nextLevel.value])
</script>

<template>
  <div class="qz">

    <!-- Header -->
    <div class="qz-head">
      <div class="qz-tag">
        <i class="fas fa-trophy"></i>
        Level Up Challenge
      </div>
      <p class="qz-sub">Match the word to its meaning to advance</p>
    </div>

    <!-- Level badge -->
    <div class="level-row">
      <div class="lvl-from" :style="{ color: currentColor, background: currentColor + '28' }">
        {{ currentLabel }}
      </div>
      <div class="lvl-arrow">
        <i class="fas fa-arrow-right"></i>
      </div>
      <div class="lvl-to" :style="{ color: nextColor, background: nextColor + '28' }">
        {{ nextLabel }}
      </div>
    </div>

    <!-- Word to identify -->
    <div class="qz-word-box">
      <p class="qz-prompt">Which meaning belongs to:</p>
      <h1 class="qz-word">{{ word.word }}</h1>
      <span v-if="word.part_of_speech" class="qz-pos">{{ word.part_of_speech }}</span>
    </div>

    <!-- Options -->
    <div class="options">
      <button
        v-for="opt in options"
        :key="opt.id"
        class="opt-btn"
        :class="{
          correct: revealed && opt.isCorrect,
          wrong: revealed && selected?.id === opt.id && !opt.isCorrect,
          dim: revealed && selected?.id !== opt.id && !opt.isCorrect
        }"
        @click="choose(opt)"
      >
        <span class="opt-check" v-if="revealed && opt.isCorrect"><i class="fas fa-check"></i></span>
        <span class="opt-x" v-else-if="revealed && selected?.id === opt.id && !opt.isCorrect"><i class="fas fa-xmark"></i></span>
        <span class="opt-meaning">{{ opt.meaning }}</span>
      </button>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.qz {
  flex: 1;
  background: white;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  padding: 20px 18px;
  gap: 14px;
  border: 1px solid #eaecf0;
  box-shadow: 0 16px 48px -10px rgba(15,23,42,0.15);
  font-family: 'Plus Jakarta Sans', sans-serif;
  overflow: hidden;
}

.qz-head { text-align: center; }
.qz-tag {
  display: inline-flex; align-items: center; gap: 6px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
  font-size: 0.72rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 5px 14px; border-radius: 20px;
  margin-bottom: 5px;
}
.qz-sub {
  font-size: 0.78rem; color: #94a3b8; margin: 0; font-weight: 500;
}

.level-row {
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.lvl-from, .lvl-to {
  padding: 6px 16px; border-radius: 12px;
  font-size: 0.8rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.lvl-arrow {
  color: #94a3b8; font-size: 0.85rem;
}

.qz-word-box {
  background: #f8f9fb; border: 1px solid #eaecf0;
  border-radius: 16px; padding: 16px 14px;
  text-align: center;
}
.qz-prompt {
  font-size: 0.68rem; color: #94a3b8; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  margin: 0 0 6px;
}
.qz-word {
  font-family: 'Lora', serif;
  font-size: 2rem; font-weight: 700;
  color: #0f172a; margin: 0 0 4px;
}
.qz-pos {
  font-size: 0.68rem; color: #94a3b8; font-style: italic; font-weight: 600;
}

.options {
  display: flex; flex-direction: column; gap: 8px; flex: 1; justify-content: center;
}

.opt-btn {
  display: flex; align-items: center; gap: 10px;
  background: #f8f9fb; border: 1.5px solid #e2e8f0;
  border-radius: 14px; padding: 14px 16px;
  cursor: pointer; text-align: left;
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: border-color 0.2s, background 0.2s, transform 0.15s;
}
.opt-btn:hover:not(:disabled) { border-color: #c7d2fe; background: #eef2ff; }
.opt-btn:active { transform: scale(0.98); }

.opt-btn.correct {
  border-color: #86efac; background: #f0fdf4;
}
.opt-btn.wrong {
  border-color: #fca5a5; background: #fef2f2;
}
.opt-btn.dim {
  opacity: 0.45;
}

.opt-check { color: #16a34a; font-size: 1rem; flex-shrink: 0; }
.opt-x     { color: #dc2626; font-size: 1rem; flex-shrink: 0; }

.opt-meaning {
  font-size: 0.88rem; font-weight: 600; color: #334155; line-height: 1.4;
}
</style>