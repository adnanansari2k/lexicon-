<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import FlashCard from './FlashCard.vue'
import LevelUpQuiz from './LevelUpQuiz.vue'

const props = defineProps(['words'])
const emit = defineEmits(['refresh', 'update:currentTab'])

// ─── LEITNER BOX CONFIG ───────────────────────────────────────────────────────
const BOX_INTERVALS_MS = [
  0,
  90 * 1000,                   // box 1 → 90 s
  30 * 60 * 1000,              // box 2 → 30 min
  12 * 60 * 60 * 1000,         // box 3 → 12 h
  2  * 24 * 60 * 60 * 1000,   // box 4 → 2 d
  7  * 24 * 60 * 60 * 1000,   // box 5 → 7 d
  30 * 24 * 60 * 60 * 1000,   // box 6 → 30 d
  Infinity,                    // box 7 → mastered
]

const MAX_BOX     = 7
const QUIZ_BOXES  = new Set([3, 5, 7])

const BOX_LABELS  = ['','Just Learned','Short-Term','Reinforcing','Solidifying','Long-Term','Deep Memory','Mastered']
const BOX_COLORS  = ['','#fbbf24','#f97316','#34d399','#60a5fa','#818cf8','#c084fc','#f43f5e']

// ─── IN-SESSION REINSERT RULES ────────────────────────────────────────────────
// Remembered  → reinsert 8–12 positions ahead (keep in deck until streak = 3)
// Forgot      → reinsert 3–5 positions ahead
// Hot-mess    → _failStreak ≥ 3: reinsert 1–2 positions ahead (tight loop)
// Graduated   → _sessionStreak = 3: promote Leitner box, remove from active deck
const REMEMBER_NEAR  = [8,  12]   // [min, max] positions ahead
const FORGOT_NEAR    = [3,  5]
const HOTMESS_NEAR   = [1,  2]
const GRADUATE_AT    = 3          // consecutive remembers to graduate

// ─── BACKWARD COMPAT ─────────────────────────────────────────────────────────
const legacyToBox = (level) => {
  if (level <= 2)   return 1
  if (level <= 4)   return 2
  if (level <= 6)   return 3
  if (level <= 8)   return 4
  if (level <= 10)  return 5
  if (level === 11) return 6
  return 7
}
const getBox = (w) => {
  if (w.leitner_box) return Math.min(Math.max(w.leitner_box, 1), MAX_BOX)
  return legacyToBox(w.mastery_level ?? w.masteryLevel ?? 0)
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const deck    = ref([])   // active session deck — cards live here until graduated
const pos     = ref(0)    // current index into deck
const mode    = ref('loading')
const quizWord = ref(null)
const sessionStats = ref({ remembered: 0, forgot: 0, graduated: 0 })

// ─── BUILD SESSION ────────────────────────────────────────────────────────────
const buildSession = () => {
  if (!props.words?.length) { mode.value = 'finished'; return }

  const now = Date.now()
  const due = props.words
    .filter(w => {
      const box = getBox(w)
      if (box >= MAX_BOX) return false
      const reviewAt = w.next_review_at ?? w.nextReview ?? 0
      return reviewAt <= now
    })
    .map(w => ({
      ...w,
      _box:            getBox(w),
      _sessionStreak:  0,   // consecutive remembers this session
      _failStreak:     0,   // consecutive forgets this session
      _totalSeen:      0,   // how many times shown this session
    }))

  if (!due.length) { mode.value = 'finished'; return }

  // Weakest (lowest box) first, shuffle within same box
  due.sort((a, b) => {
    if (a._box !== b._box) return a._box - b._box
    return Math.random() - 0.5
  })

  deck.value = due
  pos.value  = 0
  mode.value = 'session'
}

onMounted(buildSession)
watch(() => props.words, buildSession, { deep: false })

// ─── CURRENT CARD ─────────────────────────────────────────────────────────────
const currentCard = computed(() => deck.value[pos.value])

// ─── REINSERT HELPER ─────────────────────────────────────────────────────────
// Removes card at pos, inserts it `offset` positions ahead (relative to new pos).
const reinsert = (offset) => {
  const card = deck.value.splice(pos.value, 1)[0]
  // clamp so we never go out of bounds
  const insertAt = Math.min(pos.value + offset, deck.value.length)
  deck.value.splice(insertAt, 0, card)
  // pos stays at same index → next card is naturally at pos
  if (pos.value >= deck.value.length) pos.value = 0
}

const randBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min

// ─── HANDLE REMEMBER ─────────────────────────────────────────────────────────
const handleRemember = async () => {
  const card = currentCard.value
  if (!card) return

  sessionStats.value.remembered++
  card._sessionStreak++
  card._failStreak   = 0
  card._totalSeen++

  if (card._sessionStreak >= GRADUATE_AT) {
    // Ready to graduate → promote Leitner box
    const newBox = Math.min(card._box + 1, MAX_BOX)

    if (QUIZ_BOXES.has(newBox)) {
      card._pendingBox = newBox
      quizWord.value   = card
      mode.value       = 'quiz'
    } else {
      await promoteCard(card, newBox)
      graduateFromDeck()
    }
  } else {
    // Not graduated yet — reinsert farther ahead for spaced practice
    const offset = randBetween(...REMEMBER_NEAR)
    reinsert(offset)
  }
}

// ─── HANDLE FORGOT ───────────────────────────────────────────────────────────
const handleForgot = async () => {
  const card = currentCard.value
  if (!card) return

  sessionStats.value.forgot++
  card._sessionStreak = 0
  card._failStreak++
  card._totalSeen++

  // Demote Leitner box immediately on forget
  const currentBox = card._box
  let newBox
  if (currentBox <= 2)      newBox = 1
  else if (currentBox <= 5) newBox = currentBox - 1
  else                      newBox = currentBox - 2

  await saveBox(card.id, newBox, {
    totalFailures: (card.totalFailures || 0) + 1,
    totalReviews:  (card.totalReviews  || 0) + 1,
  })

  card._box        = newBox
  card.leitner_box = newBox

  // Hot-mess word (3+ consecutive forgets): very tight loop
  const range  = card._failStreak >= 3 ? HOTMESS_NEAR : FORGOT_NEAR
  const offset = randBetween(...range)
  reinsert(offset)
}

// ─── QUIZ PASS ────────────────────────────────────────────────────────────────
const handleQuizPass = async () => {
  const card = quizWord.value
  sessionStats.value.graduated++

  const newBox = card._pendingBox ?? Math.min(card._box + 1, MAX_BOX)
  await promoteCard(card, newBox)

  quizWord.value = null
  graduateFromDeck()
  if (deck.value.length === 0) mode.value = 'finished'
  else mode.value = 'session'
}

// ─── QUIZ FAIL ────────────────────────────────────────────────────────────────
const handleQuizFail = async () => {
  const card = quizWord.value
  sessionStats.value.forgot++

  const currentBox = card._box
  const newBox = currentBox <= 2 ? 1 : currentBox - 1

  await saveBox(card.id, newBox, {
    totalFailures: (card.totalFailures || 0) + 1,
    totalReviews:  (card.totalReviews  || 0) + 1,
  })

  // Find card in deck and update, reinsert near front
  const idx = deck.value.findIndex(w => w.id === card.id)
  if (idx !== -1) {
    deck.value[idx]._box        = newBox
    deck.value[idx].leitner_box = newBox
    deck.value[idx]._sessionStreak = 0
    deck.value[idx]._failStreak++
    const extracted = deck.value.splice(idx, 1)[0]
    const offset = randBetween(...FORGOT_NEAR)
    const insertAt = Math.min(pos.value + offset, deck.value.length)
    deck.value.splice(insertAt, 0, extracted)
    if (pos.value >= deck.value.length) pos.value = 0
  }

  quizWord.value = null
  mode.value     = 'session'
}

// ─── PROMOTE + SAVE ──────────────────────────────────────────────────────────
const promoteCard = async (card, newBox) => {
  const intervalMs     = BOX_INTERVALS_MS[newBox]
  const next_review_at = newBox >= MAX_BOX ? null : Date.now() + intervalMs

  await saveBox(card.id, newBox, {
    totalReviews:  (card.totalReviews || 0) + 1,
    next_review_at,
    mastery_level: Math.round((newBox / MAX_BOX) * 12),
    masteryLevel:  Math.round((newBox / MAX_BOX) * 12),
    stage:         newBox >= MAX_BOX ? 'mastered' : 'spaced',
    nextReview:    next_review_at,
  })
}

const saveBox = async (id, box, extra = {}) => {
  try {
    await updateDoc(doc(db, 'words', id), {
      leitner_box:  box,
      lastReviewed: Date.now(),
      ...extra,
    })
  } catch (e) { console.error('Save failed', e) }
}

const graduateFromDeck = () => {
  deck.value.splice(pos.value, 1)
  sessionStats.value.graduated++
  if (pos.value >= deck.value.length) pos.value = 0
  if (deck.value.length === 0) mode.value = 'finished'
}

const returnToLibrary = () => {
  emit('refresh')
  emit('update:currentTab', 'library')
}

// ─── DERIVED UI ──────────────────────────────────────────────────────────────
const boxLabel = computed(() => {
  const w = currentCard.value; if (!w) return ''
  return BOX_LABELS[w._box] || `Box ${w._box}`
})
const boxColor = computed(() => {
  const w = currentCard.value; if (!w) return '#94a3b8'
  return BOX_COLORS[w._box] || '#94a3b8'
})
const progressPct = computed(() => {
  if (!currentCard.value) return 0
  return Math.round((currentCard.value._box / MAX_BOX) * 100)
})

// Streak dots (shown on card front): filled = consecutive remembers
const streakDots = computed(() => currentCard.value?._sessionStreak ?? 0)

// Mini deck-map: next 5 cards after current, colour-coded by box
const deckPreview = computed(() => {
  const out = []
  for (let i = 1; i <= 5; i++) {
    const c = deck.value[pos.value + i]
    if (!c) break
    out.push({ box: c._box, color: BOX_COLORS[c._box], fail: c._failStreak })
  }
  return out
})

// How many unique cards remain (not counting re-insertions)
const uniqueRemaining = computed(() => {
  const seen = new Set()
  deck.value.forEach(c => seen.add(c.id))
  return seen.size
})
</script>

<template>
  <div class="shell">

    <!-- SESSION HEADER -->
    <div v-if="mode === 'session'" class="top-bar">

      <div class="header-row">
        <div class="queue-info">
          <span class="q-num">{{ uniqueRemaining }}</span>
          <span class="q-label">words</span>
          <span class="sep">·</span>
          <span class="q-num">{{ deck.length }}</span>
          <span class="q-label">reps</span>
        </div>
        <span
          class="box-pill"
          :style="{ background: boxColor + '22', color: boxColor }"
        >
          Box {{ currentCard?._box }} · {{ boxLabel }}
        </span>
      </div>

      <!-- Leitner box progress bar -->
      <div class="box-progress-wrap">
        <div
          class="box-progress-fill"
          :style="{ width: progressPct + '%', background: boxColor }"
        ></div>
      </div>

      <!-- Deck mini-map: next 5 upcoming cards -->
      <div class="deck-map">
        <span class="dm-label">UP NEXT</span>
        <div class="dm-dots">
          <div
            v-for="(c, i) in deckPreview"
            :key="i"
            class="dm-dot"
            :style="{ background: c.color }"
            :class="{ 'dm-hot': c.fail >= 3 }"
            :title="`Box ${c.box}${c.fail >= 3 ? ' · Struggling' : ''}`"
          ></div>
          <div v-for="i in (5 - deckPreview.length)" :key="'e'+i" class="dm-dot dm-empty"></div>
        </div>

        <!-- Streak indicator for current card -->
        <div class="streak-row" v-if="currentCard?._sessionStreak > 0 || currentCard?._failStreak > 0">
          <template v-if="currentCard._sessionStreak > 0">
            <span
              v-for="n in GRADUATE_AT"
              :key="'s'+n"
              class="streak-pip"
              :class="{ filled: n <= currentCard._sessionStreak }"
            ></span>
            <span class="streak-hint">{{ currentCard._sessionStreak }}/{{ GRADUATE_AT }} to graduate</span>
          </template>
          <template v-else-if="currentCard._failStreak >= 2">
            <span class="hot-badge">🔥 Struggling — tight loop</span>
          </template>
        </div>
      </div>

    </div>

    <!-- QUIZ HEADER -->
    <div v-if="mode === 'quiz'" class="top-bar quiz-bar">
      <div class="queue-info">
        <span class="q-num">{{ deck.length }}</span>
        <span class="q-label">reps left</span>
      </div>
      <div class="stage-tag quiz-tag">🎯 Box-Up Quiz</div>
    </div>

    <!-- CARD AREA -->
    <div class="card-area">

      <FlashCard
        v-if="mode === 'session' && currentCard"
        :word="currentCard"
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

      <!-- FINISHED -->
      <div v-else-if="mode === 'finished'" class="done">
        <div class="done-glow"></div>
        <div class="done-icon">🧘</div>
        <h2 class="done-title">Session Complete</h2>
        <p class="done-sub">All words cycled through their loops.</p>

        <div class="done-stats">
          <div class="ds remembered">
            <span class="ds-num">{{ sessionStats.remembered }}</span>
            <span class="ds-lbl">Correct</span>
          </div>
          <div class="ds forgot">
            <span class="ds-num">{{ sessionStats.forgot }}</span>
            <span class="ds-lbl">Forgot</span>
          </div>
          <div v-if="sessionStats.graduated" class="ds leveled">
            <span class="ds-num">{{ sessionStats.graduated }}</span>
            <span class="ds-lbl">Graduated</span>
          </div>
        </div>

        <div class="done-hint">
          <span>Intervals: </span>
          <strong>90s · 30m · 12h · 2d · 7d · 30d</strong>
        </div>

        <button @click="returnToLibrary" class="done-btn">Back to Library</button>
      </div>

    </div>

    <!-- BOX LADDER -->
    <div v-if="mode === 'session' && currentCard" class="box-ladder">
      <div
        v-for="b in 7"
        :key="b"
        class="box-step"
        :class="{ active: currentCard._box >= b, current: currentCard._box === b }"
        :style="{ background: currentCard._box >= b ? BOX_COLORS[b] : '#e2e8f0' }"
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

/* ── TOP BAR ── */
.top-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.queue-info {
  display: flex; align-items: center; gap: 5px; font-size: 0.78rem;
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
  height: 4px; background: #f1f5f9; border-radius: 4px; overflow: hidden;
}
.box-progress-fill {
  height: 100%; border-radius: 4px;
  transition: width 0.5s ease, background 0.4s ease;
}

/* Deck mini-map */
.deck-map {
  display: flex; align-items: center; gap: 8px; min-height: 20px;
}
.dm-label {
  font-size: 0.55rem; font-weight: 800; letter-spacing: 1px;
  color: #cbd5e1; flex-shrink: 0;
}
.dm-dots {
  display: flex; gap: 4px; align-items: center;
}
.dm-dot {
  width: 10px; height: 10px; border-radius: 50%;
  transition: background 0.3s;
  flex-shrink: 0;
}
.dm-dot.dm-empty { background: #e2e8f0; }
.dm-dot.dm-hot {
  animation: pulse-hot 0.9s ease-in-out infinite alternate;
}
@keyframes pulse-hot {
  from { transform: scale(1);    opacity: 1; }
  to   { transform: scale(1.35); opacity: 0.75; }
}

/* Streak pips */
.streak-row {
  display: flex; align-items: center; gap: 4px; margin-left: auto;
}
.streak-pip {
  width: 8px; height: 8px; border-radius: 50%;
  background: #e2e8f0; transition: background 0.2s, transform 0.2s;
}
.streak-pip.filled { background: #22c55e; transform: scale(1.2); }
.streak-hint {
  font-size: 0.6rem; color: #94a3b8; font-weight: 700; white-space: nowrap;
}
.hot-badge {
  font-size: 0.62rem; font-weight: 700; color: #dc2626;
  background: #fef2f2; border: 1px solid #fecaca;
  padding: 2px 8px; border-radius: 20px;
}

/* Quiz bar */
.quiz-bar { flex-direction: row; justify-content: space-between; align-items: center; }
.stage-tag {
  font-size: 0.67rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 5px 12px; border-radius: 20px;
}
.quiz-tag { background: #fef9ee; color: #92400e; border: 1px solid #fde68a; }

/* Card area */
.card-area {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
}

/* Box ladder */
.box-ladder {
  display: flex; gap: 5px; justify-content: center;
  padding: 4px 0; flex-shrink: 0;
}
.box-step {
  flex: 1; height: 6px; border-radius: 4px;
  transition: background 0.4s, transform 0.2s;
}
.box-step.current {
  transform: scaleY(1.8);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* Done screen */
.done {
  position: relative; background: white; border-radius: 24px; height: 100%;
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; text-align: center; padding: 40px 24px;
  overflow: hidden; border: 1px solid #f1f5f9;
  box-shadow: 0 10px 40px -10px rgba(15,23,42,0.08);
}
.done-glow {
  position: absolute; inset: 0;
  background: radial-gradient(circle at top center, #f0fdf4 0%, transparent 60%);
  z-index: 0;
}
.done-icon {
  font-size: 3.2rem; z-index: 1; background: white;
  width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; box-shadow: 0 8px 24px rgba(21,128,61,0.12); margin-bottom: 18px;
}
.done-title { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; z-index: 1; }
.done-sub   { color: #64748b; margin: 0 0 24px; font-size: 0.95rem; z-index: 1; }
.done-hint {
  font-size: 0.72rem; color: #94a3b8; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 14px;
  margin-bottom: 24px; z-index: 1;
}
.done-hint strong { color: #475569; }
.done-stats {
  display: flex; gap: 10px; margin-bottom: 20px; z-index: 1;
  flex-wrap: wrap; justify-content: center;
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
  padding: 15px 44px; background: #0f172a; color: white;
  border: none; border-radius: 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700; font-size: 1rem; cursor: pointer;
  box-shadow: 0 8px 20px -6px rgba(15,23,42,0.3);
  z-index: 1; transition: transform 0.2s;
}
.done-btn:active { transform: scale(0.97); }
</style>
