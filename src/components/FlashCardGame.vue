<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import FlashCard from './FlashCard.vue'
import LevelUpQuiz from './LevelUpQuiz.vue'

const props = defineProps(['words'])
const emit = defineEmits(['refresh', 'update:currentTab'])

// ─── LEITNER BOX CONFIG ───────────────────────────────────────────────────────
// Box 1 → 90 sec, Box 2 → 30 min, Box 3 → 12 h, Box 4 → 2 d,
// Box 5 → 7 d, Box 6 → 30 d, Box 7 → mastered (∞)
const BOX_INTERVALS_MS = [
  0,                     // box 0 (unused – 1-indexed)
  90 * 1000,             // box 1 → 90 seconds
  30 * 60 * 1000,        // box 2 → 30 minutes
  12 * 60 * 60 * 1000,   // box 3 → 12 hours
  2  * 24 * 60 * 60 * 1000, // box 4 → 2 days
  7  * 24 * 60 * 60 * 1000, // box 5 → 7 days
  30 * 24 * 60 * 60 * 1000, // box 6 → 30 days
  Infinity,              // box 7 → mastered
]

const MAX_BOX = 7
const QUIZ_BOXES = new Set([3, 5, 7]) // quiz fires when entering these boxes

// UI label per box
const BOX_LABELS = ['', 'Just Learned', 'Short-Term', 'Reinforcing', 'Solidifying', 'Long-Term', 'Deep Memory', 'Mastered']
const BOX_COLORS = ['', '#fbbf24', '#f97316', '#34d399', '#60a5fa', '#818cf8', '#c084fc', '#f43f5e']

// ─── BACKWARD-COMPAT: map old mastery_level (0–12) → leitner box (1–7) ──────
const legacyToBox = (level) => {
  if (level <= 0)  return 1
  if (level <= 2)  return 1
  if (level <= 4)  return 2
  if (level <= 6)  return 3
  if (level <= 8)  return 4
  if (level <= 10) return 5
  if (level === 11) return 6
  return 7
}

const getBox = (w) => {
  if (w.leitner_box) return Math.min(Math.max(w.leitner_box, 1), MAX_BOX)
  // migrate old mastery_level field on the fly
  return legacyToBox(w.mastery_level ?? w.masteryLevel ?? 0)
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const queue   = ref([])
const currentIndex = ref(0)
const mode    = ref('loading') // 'session' | 'quiz' | 'finished'
const quizWord = ref(null)
const sessionStats = ref({ remembered: 0, forgot: 0, boxed: 0 })

// ─── BUILD SESSION ────────────────────────────────────────────────────────────
// Include word if:
//  • brand new (no leitner_box and no nextReview)
//  • next_review_at <= now
//  • box 7 words are never re-queued (mastered)
const buildSession = () => {
  if (!props.words?.length) { mode.value = 'finished'; return }

  const now = Date.now()
  const due = props.words.filter(w => {
    const box = getBox(w)
    if (box >= MAX_BOX) return false                          // mastered, skip
    const reviewAt = w.next_review_at ?? w.nextReview ?? 0
    return reviewAt <= now                                    // due now
  }).map(w => ({ ...w, _box: getBox(w), _sessionStreak: 0 }))

  if (!due.length) { mode.value = 'finished'; return }

  // Sort: lowest box first (newest / least-known words come up first)
  due.sort((a, b) => a._box - b._box)

  queue.value = due
  currentIndex.value = 0
  mode.value = 'session'
}

onMounted(buildSession)
watch(() => props.words, buildSession, { deep: false })

// ─── CURRENT WORD ─────────────────────────────────────────────────────────────
const currentWord = computed(() => queue.value[currentIndex.value])

// ─── CORRECT → move card up one box ──────────────────────────────────────────
const handleRemember = async () => {
  const word = currentWord.value
  if (!word) return
  sessionStats.value.remembered++

  const currentBox = word._box
  const newBox     = Math.min(currentBox + 1, MAX_BOX)

  if (QUIZ_BOXES.has(newBox)) {
    // Quiz gate before promotion
    word._pendingBox = newBox
    quizWord.value   = word
    mode.value       = 'quiz'
  } else {
    await promoteWord(word, newBox)
    removeFromQueue()
    if (queue.value.length === 0) mode.value = 'finished'
  }
}

// ─── WRONG → drop back 1–2 boxes ─────────────────────────────────────────────
const handleForgot = async () => {
  const word = currentWord.value
  if (!word) return
  sessionStats.value.forgot++

  const currentBox = word._box
  // Box 1-2 → reset to 1; Box 3-5 → drop 1; Box 6-7 → drop 2
  let newBox
  if (currentBox <= 2)     newBox = 1
  else if (currentBox <= 5) newBox = currentBox - 1
  else                      newBox = currentBox - 2

  await saveBox(word.id, newBox, {
    totalFailures: (word.totalFailures || 0) + 1,
    totalReviews:  (word.totalReviews  || 0) + 1,
  })

  // Update in-queue reference and rotate to back
  word._box = newBox
  word.leitner_box = newBox
  word._sessionStreak = 0
  rotateToBack()
}

// ─── QUIZ PASS → confirm promotion ───────────────────────────────────────────
const handleQuizPass = async () => {
  const word = quizWord.value
  sessionStats.value.boxed++

  const newBox = word._pendingBox ?? Math.min(word._box + 1, MAX_BOX)
  await promoteWord(word, newBox)

  quizWord.value = null
  removeFromQueue()
  if (queue.value.length === 0) mode.value = 'finished'
  else mode.value = 'session'
}

// ─── QUIZ FAIL → demote ───────────────────────────────────────────────────────
const handleQuizFail = async () => {
  const word = quizWord.value
  sessionStats.value.forgot++

  const currentBox = word._box
  const newBox = currentBox <= 2 ? 1 : currentBox - 1

  await saveBox(word.id, newBox, {
    totalFailures: (word.totalFailures || 0) + 1,
    totalReviews:  (word.totalReviews  || 0) + 1,
  })

  // Put back in queue at end
  const idx = queue.value.findIndex(w => w.id === word.id)
  if (idx !== -1) {
    queue.value[idx]._box = newBox
    queue.value[idx].leitner_box = newBox
    queue.value[idx]._sessionStreak = 0
    const w = queue.value.splice(idx, 1)[0]
    queue.value.push(w)
    if (currentIndex.value >= queue.value.length) currentIndex.value = 0
  }

  quizWord.value = null
  mode.value = 'session'
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const promoteWord = async (word, newBox) => {
  const intervalMs   = BOX_INTERVALS_MS[newBox]
  const next_review_at = newBox >= MAX_BOX ? null : Date.now() + intervalMs

  await saveBox(word.id, newBox, {
    totalReviews: (word.totalReviews || 0) + 1,
    next_review_at,
    // keep legacy fields in sync so WordLibrary / other tabs still render
    mastery_level: Math.round((newBox / MAX_BOX) * 12),
    masteryLevel:  Math.round((newBox / MAX_BOX) * 12),
    stage: newBox >= MAX_BOX ? 'mastered' : 'spaced',
    nextReview: next_review_at,
  })
}

const saveBox = async (id, box, extra = {}) => {
  try {
    await updateDoc(doc(db, 'words', id), {
      leitner_box:   box,
      lastReviewed:  Date.now(),
      ...extra,
    })
  } catch (e) { console.error('Save failed', e) }
}

const removeFromQueue = () => {
  queue.value.splice(currentIndex.value, 1)
  if (currentIndex.value >= queue.value.length) currentIndex.value = 0
}

const rotateToBack = () => {
  const w = queue.value.splice(currentIndex.value, 1)[0]
  queue.value.push(w)
  if (currentIndex.value >= queue.value.length) currentIndex.value = 0
}

const returnToLibrary = () => {
  emit('refresh')
  emit('update:currentTab', 'library')
}

// ─── DERIVED UI ───────────────────────────────────────────────────────────────
const boxLabel = computed(() => {
  const w = currentWord.value
  if (!w) return ''
  return BOX_LABELS[w._box] || `Box ${w._box}`
})

const boxColor = computed(() => {
  const w = currentWord.value
  if (!w) return '#94a3b8'
  return BOX_COLORS[w._box] || '#94a3b8'
})

const nextReviewLabel = (box) => {
  const ms = BOX_INTERVALS_MS[box + 1]
  if (!ms || ms === Infinity) return 'Mastered!'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`
  return `${Math.round(ms / 86400000)}d`
}

const progressPct = computed(() => {
  if (!currentWord.value) return 0
  return Math.round((currentWord.value._box / MAX_BOX) * 100)
})
</script>

<template>
  <div class="shell">

    <!-- SESSION HEADER -->
    <div v-if="mode === 'session'" class="top-bar">
      <div class="queue-info">
        <span class="q-num">{{ queue.length }}</span>
        <span class="q-label">due</span>
        <span class="sep">&middot;</span>
        <span class="box-pill" :style="{ background: boxColor + '22', color: boxColor }">
          Box {{ currentWord?._box }} · {{ boxLabel }}
        </span>
      </div>

      <!-- Progress bar showing box level -->
      <div class="box-progress-wrap">
        <div
          class="box-progress-fill"
          :style="{ width: progressPct + '%', background: boxColor }"
        ></div>
      </div>
    </div>

    <!-- QUIZ HEADER -->
    <div v-if="mode === 'quiz'" class="top-bar quiz-bar">
      <div class="queue-info">
        <span class="q-num">{{ queue.length }}</span>
        <span class="q-label">left</span>
      </div>
      <div class="stage-tag quiz-tag">🎯 Box-Up Quiz</div>
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
        <div class="done-icon">🧘</div>
        <h2 class="done-title">Session Complete</h2>
        <p class="done-sub">Your Leitner boxes are updated.</p>

        <div class="done-stats">
          <div class="ds remembered">
            <span class="ds-num">{{ sessionStats.remembered }}</span>
            <span class="ds-lbl">Correct</span>
          </div>
          <div class="ds forgot">
            <span class="ds-num">{{ sessionStats.forgot }}</span>
            <span class="ds-lbl">Forgot</span>
          </div>
          <div v-if="sessionStats.boxed" class="ds leveled">
            <span class="ds-num">{{ sessionStats.boxed }}</span>
            <span class="ds-lbl">Boxed Up</span>
          </div>
        </div>

        <!-- Next review hint -->
        <div class="done-hint">
          <span>Next reviews due in: </span>
          <strong>90s · 30m · 12h · 2d · 7d · 30d</strong>
        </div>

        <button @click="returnToLibrary" class="done-btn">Back to Library</button>
      </div>

    </div>

    <!-- BOX LADDER (bottom indicator, session only) -->
    <div v-if="mode === 'session' && currentWord" class="box-ladder">
      <div
        v-for="b in 7"
        :key="b"
        class="box-step"
        :class="{ active: currentWord._box >= b, current: currentWord._box === b }"
        :style="{ background: currentWord._box >= b ? BOX_COLORS[b] : '#e2e8f0' }"
        :title="BOX_LABELS[b]"
      ></div>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');

.shell {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 6px;
  max-width: 500px;
  margin: 0 auto;
  gap: 8px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* TOP BAR */
.top-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.queue-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}
.q-num   { font-weight: 800; color: #334155; font-size: 0.95rem; }
.q-label { color: #94a3b8; font-weight: 600; }
.sep     { color: #cbd5e1; }

.box-pill {
  font-size: 0.67rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 3px 10px; border-radius: 20px;
}

/* Progress bar */
.box-progress-wrap {
  height: 5px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}
.box-progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease, background 0.4s ease;
}

/* Quiz bar */
.quiz-bar { flex-direction: row; justify-content: space-between; align-items: center; }
.stage-tag {
  font-size: 0.67rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 5px 12px; border-radius: 20px;
}
.quiz-tag { background: #fef9ee; color: #92400e; border: 1px solid #fde68a; }

/* CARD AREA */
.card-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* BOX LADDER */
.box-ladder {
  display: flex;
  gap: 5px;
  justify-content: center;
  padding: 4px 0;
  flex-shrink: 0;
}
.box-step {
  flex: 1;
  height: 6px;
  border-radius: 4px;
  transition: background 0.4s, transform 0.2s;
}
.box-step.current {
  transform: scaleY(1.8);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
  position: absolute; inset: 0;
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
.done-sub   { color: #64748b; margin: 0 0 24px; font-size: 0.95rem; z-index: 1; }

.done-hint {
  font-size: 0.72rem; color: #94a3b8;
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 12px; padding: 8px 14px;
  margin-bottom: 24px; z-index: 1;
}
.done-hint strong { color: #475569; }

.done-stats {
  display: flex; gap: 10px; margin-bottom: 20px; z-index: 1; flex-wrap: wrap; justify-content: center;
}
.ds {
  padding: 12px 18px; border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 80px;
}
.ds.remembered { background: #f0fdf4; border: 1px solid #bbf7d0; }
.ds.forgot     { background: #fef2f2; border: 1px solid #fecaca; }
.ds.leveled    { background: #fef9ee; border: 1px solid #fde68a; }

.ds-num { font-size: 1.7rem; font-weight: 800; line-height: 1; }
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
