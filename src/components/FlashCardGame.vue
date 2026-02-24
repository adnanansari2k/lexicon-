<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import FlashCard from './FlashCard.vue'
import LevelUpQuiz from './LevelUpQuiz.vue'

const props = defineProps(['words'])
const emit = defineEmits(['refresh', 'update:currentTab'])

// â”€â”€â”€ CONSTANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STABILIZE_TARGET = 3

// 13 internal stages â†’ interval in days (index 0â€“12)
const INTERVALS = [1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365]

const MAX_INTERNAL = 12

// 13 internal levels â†’ 8 visible UI labels
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

// Quiz fires when crossing these internal thresholds (visible label changes)
const QUIZ_THRESHOLDS = new Set([1, 3, 5, 7, 9, 11, 12])

// â”€â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const queue = ref([])
const currentIndex = ref(0)
const mode = ref('loading')  // 'session' | 'quiz' | 'finished'
const quizWord = ref(null)
const sessionStats = ref({ remembered: 0, forgot: 0, leveled: 0 })

// â”€â”€â”€ ACCESSORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const iml = (w) => Math.min(w.mastery_level ?? w.masteryLevel ?? 0, MAX_INTERNAL)

// â”€â”€â”€ SMART DECAY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Early (0â€“1): reset to 0
// Mid (2â€“7):   drop 1 level
// High (8+):   drop max 2 levels (Elite Protection)
const decayLevel = (level) => {
  if (level <= 1) return 0
  if (level <= 7) return level - 1
  return Math.max(level - 2, 0)
}

// â”€â”€â”€ BUILD SESSION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const buildSession = () => {
  if (!props.words?.length) { mode.value = 'finished'; return }

  const now = Date.now()
  const sessionWords = props.words.filter(w => {
    const stage = w.stage || 'stabilizing'
    if (stage === 'stabilizing') return true
    return w.nextReview && w.nextReview <= now
  }).map(w => ({
    ...w,
    stage: w.stage || 'stabilizing',
    sessionStreak: 0,
  }))

  if (!sessionWords.length) { mode.value = 'finished'; return }

  queue.value = sessionWords
  currentIndex.value = 0
  mode.value = 'session'
}

onMounted(buildSession)
watch(() => props.words, buildSession, { deep: false })

// â”€â”€â”€ CURRENT WORD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const currentWord = computed(() => queue.value[currentIndex.value])

// â”€â”€â”€ HANDLE REMEMBER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleRemember = async () => {
  const word = currentWord.value
  if (!word) return
  sessionStats.value.remembered++

  if (word.stage === 'stabilizing') {
    word.sessionStreak++
    if (word.sessionStreak >= STABILIZE_TARGET) {
      // Graduate â†’ quiz first
      quizWord.value = word
      mode.value = 'quiz'
    } else {
      rotateToBack()
    }
  } else {
    const currentLevel = iml(word)
    const newLevel = Math.min(currentLevel + 1, MAX_INTERNAL)

    if (QUIZ_THRESHOLDS.has(newLevel)) {
      // Visible label crossing â†’ quiz required
      word._pendingLevel = newLevel
      quizWord.value = word
      mode.value = 'quiz'
    } else {
      await advanceWord(word, newLevel)
      removeFromQueue()
    }
  }
}

// â”€â”€â”€ HANDLE FORGOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleForgot = async () => {
  const word = currentWord.value
  if (!word) return
  sessionStats.value.forgot++

  const newLevel = decayLevel(iml(word))

  await save(word.id, {
    stage: 'stabilizing',
    streak: 0,
    interval: 0,
    nextReview: Date.now(),
    lastReviewed: Date.now(),
    mastery_level: newLevel,
    masteryLevel: newLevel,
    totalFailures: (word.totalFailures || 0) + 1,
    totalReviews: (word.totalReviews || 0) + 1,
  })

  word.mastery_level = newLevel
  word.masteryLevel = newLevel
  word.stage = 'stabilizing'
  word.sessionStreak = 0
  rotateToBack()
}

// â”€â”€â”€ QUIZ PASS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleQuizPass = async () => {
  const word = quizWord.value
  sessionStats.value.leveled++

  if (word.stage === 'stabilizing') {
    await advanceWord(word, 1)  // graduate to internal level 1
  } else {
    const newLevel = word._pendingLevel ?? Math.min(iml(word) + 1, MAX_INTERNAL)
    await advanceWord(word, newLevel)
  }

  quizWord.value = null
  removeFromQueue()
  if (queue.value.length === 0) mode.value = 'finished'
  else mode.value = 'session'
}

// â”€â”€â”€ QUIZ FAIL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleQuizFail = async () => {
  const word = quizWord.value
  sessionStats.value.forgot++

  const newLevel = decayLevel(iml(word))

  await save(word.id, {
    stage: 'stabilizing',
    streak: 0,
    interval: 0,
    nextReview: Date.now(),
    lastReviewed: Date.now(),
    mastery_level: newLevel,
    masteryLevel: newLevel,
    totalFailures: (word.totalFailures || 0) + 1,
    totalReviews: (word.totalReviews || 0) + 1,
  })

  const idx = queue.value.findIndex(w => w.id === word.id)
  if (idx !== -1) {
    queue.value[idx].mastery_level = newLevel
    queue.value[idx].masteryLevel = newLevel
    queue.value[idx].stage = 'stabilizing'
    queue.value[idx].sessionStreak = 0
    const w = queue.value.splice(idx, 1)[0]
    queue.value.push(w)
    if (currentIndex.value >= queue.value.length) currentIndex.value = 0
  }

  quizWord.value = null
  mode.value = 'session'
}

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const advanceWord = async (word, newLevel) => {
  const newInterval = INTERVALS[newLevel]
  const newStreak = (word.streak || 0) + 1

  await save(word.id, {
    stage: 'spaced',
    streak: newStreak,
    interval: newInterval,
    nextReview: Date.now() + newInterval * 86400000,
    lastReviewed: Date.now(),
    mastery_level: newLevel,
    masteryLevel: newLevel,
    totalReviews: (word.totalReviews || 0) + 1,
  })
}

const removeFromQueue = () => {
  queue.value.splice(currentIndex.value, 1)
  if (queue.value.length === 0) { mode.value = 'finished'; return }
  if (currentIndex.value >= queue.value.length) currentIndex.value = 0
}

const rotateToBack = () => {
  const w = queue.value.splice(currentIndex.value, 1)[0]
  queue.value.push(w)
  if (currentIndex.value >= queue.value.length) currentIndex.value = 0
}

const save = async (id, data) => {
  try { await updateDoc(doc(db, 'words', id), data) }
  catch (e) { console.error('Save failed', e) }
}

const returnToLibrary = () => {
  emit('refresh')
  emit('update:currentTab', 'library')
}

// â”€â”€â”€ DERIVED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const progressText = computed(() => {
  if (!currentWord.value) return ''
  const w = currentWord.value
  if (w.stage === 'stabilizing') return `${w.sessionStreak} / ${STABILIZE_TARGET} recalls`
  return `Streak ${w.streak || 0}`
})

// kept for template compatibility
const stagePillText = computed(() => {
  if (!currentWord.value) return ''
  return currentWord.value.stage === 'stabilizing' ? 'Stabilizing' : 'Spaced Review'
})
</script>

<template>
  <div class="shell">

    <!-- HEADER (session only) -->
    <div v-if="mode === 'session'" class="top-bar">
      <div class="queue-info">
        <span class="q-num">{{ queue.length }}</span>
        <span class="q-label">left</span>
        <span class="sep">&middot;</span>
        <span class="prog" :class="currentWord?.stage">{{ progressText }}</span>
      </div>
      <div class="stage-tag" :class="currentWord?.stage">
        {{ currentWord?.stage === 'stabilizing' ? 'Stabilizing' : 'Spaced Review' }}
      </div>
    </div>

    <!-- QUIZ HEADER -->
    <div v-if="mode === 'quiz'" class="top-bar quiz-bar">
      <div class="queue-info">
        <span class="q-num">{{ queue.length }}</span>
        <span class="q-label">left</span>
      </div>
      <div class="stage-tag quiz-tag">
        Level Up Quiz
      </div>
    </div>

    <!-- CARD AREA -->
    <div class="card-area">

      <FlashCard
        v-if="mode === 'session' && currentWord"
        :word="currentWord"
        @remember="handleRemember"
        @forgot="handleForgot"
      />

      <LevelUpQuiz
        v-else-if="mode === 'quiz' && quizWord"
        :word="quizWord"
        :allWords="props.words"
        @pass="handleQuizPass"
        @fail="handleQuizFail"
      />

      <!-- DONE -->
      <div v-else-if="mode === 'finished'" class="done">
        <div class="done-glow"></div>
        <div class="done-icon">ðŸ§˜</div>
        <h2 class="done-title">Session Complete</h2>
        <p class="done-sub">Your mind is stronger today.</p>

        <div class="done-stats">
          <div class="ds remembered">
            <span class="ds-num">{{ sessionStats.remembered }}</span>
            <span class="ds-lbl">Remembered</span>
          </div>
          <div class="ds forgot">
            <span class="ds-num">{{ sessionStats.forgot }}</span>
            <span class="ds-lbl">Forgot</span>
          </div>
          <div v-if="sessionStats.leveled" class="ds leveled">
            <span class="ds-num">{{ sessionStats.leveled }}</span>
            <span class="ds-lbl">Leveled Up</span>
          </div>
        </div>

        <button @click="returnToLibrary" class="done-btn">Back to Library</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');

.shell {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  max-width: 500px;
  margin: 0 auto;
  gap: 10px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* TOP BAR */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.queue-info {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
}
.q-num { font-weight: 800; color: #334155; font-size: 0.95rem; }
.q-label { color: #94a3b8; font-weight: 600; }
.sep { color: #cbd5e1; }

.prog {
  font-size: 0.7rem; font-weight: 700;
  padding: 2px 8px; border-radius: 8px;
}
.prog.stabilizing { color: #d97706; background: #fef3c7; }
.prog.spaced      { color: #2563eb; background: #dbeafe; }

.stage-tag {
  font-size: 0.67rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 5px 12px; border-radius: 20px;
}
.stage-tag.stabilizing { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.stage-tag.spaced      { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.quiz-tag              { background: #fef9ee; color: #92400e; border: 1px solid #fde68a; }

/* CARD AREA */
.card-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* DONE STATE */
.done {
  position: relative;
  background: white;
  border-radius: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px 24px;
  overflow: hidden;
  border: 1px solid #f1f5f9;
  box-shadow: 0 10px 40px -10px rgba(15,23,42,0.08);
}
.done-glow {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at top center, #f0fdf4 0%, transparent 60%);
  z-index: 0;
}
.done-icon {
  font-size: 3.2rem; z-index: 1;
  background: white; width: 80px; height: 80px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; box-shadow: 0 8px 24px rgba(21,128,61,0.12);
  margin-bottom: 18px;
}
.done-title { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; z-index: 1; }
.done-sub   { color: #64748b; margin: 0 0 28px; font-size: 0.95rem; z-index: 1; }

.done-stats {
  display: flex; gap: 10px; margin-bottom: 32px; z-index: 1; flex-wrap: wrap; justify-content: center;
}
.ds {
  padding: 12px 18px; border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 82px;
}
.ds.remembered { background: #f0fdf4; border: 1px solid #bbf7d0; }
.ds.forgot     { background: #fef2f2; border: 1px solid #fecaca; }
.ds.leveled    { background: #fef9ee; border: 1px solid #fde68a; }

.ds-num {
  font-size: 1.7rem; font-weight: 800; line-height: 1;
}
.remembered .ds-num { color: #16a34a; }
.forgot .ds-num     { color: #dc2626; }
.leveled .ds-num    { color: #d97706; }

.ds-lbl {
  font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;
}

.done-btn {
  padding: 15px 44px;
  background: #0f172a; color: white;
  border: none; border-radius: 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700; font-size: 1rem; cursor: pointer;
  box-shadow: 0 8px 20px -6px rgba(15,23,42,0.3);
  z-index: 1; transition: transform 0.2s;
}
.done-btn:active { transform: scale(0.97); }
</style>