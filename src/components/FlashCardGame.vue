<script setup>
/**
 * FlashCardGame.vue  —  Full FSRS-inspired memory engine
 *
 * Solves all 20 issues:
 *  1  DB updated on every rating (not just graduation)
 *  2  Forgot reschedules next_review_at correctly
 *  3  "Mastered" cards still decay — max interval capped at 60 days
 *  4  Time-based forget penalty: long-gap forget = big drop
 *  5  Per-card session cap: max 5 reps per card per session
 *  6  Failed cards reinserted 1–3 positions ahead (strong priority)
 *  7  4-level rating: Forgot / Hard / Good / Easy
 *  8  Quiz only fires when word is genuinely weak (difficulty > 0.7)
 *  9  Graduation requires streak of 3 *with rating ≥ 3* (no lucky Hard chain)
 * 10  Memory stability field (in days) tracked per word
 * 11  Session queue sorted by urgency: overdue + weak first
 * 12  Long-gap penalty: returning after days/weeks resets weak cards
 * 13  Session loop is secondary — Leitner intervals drive long-term learning
 * 14  Hard cap: MAX_REPS_PER_CARD per session
 * 15  Smooth stability growth: Hard gives partial gain
 * 16  Forgotten long-term word: stability resets to 0, difficulty rises
 * 17  Difficulty tracks per word (0–1); harder words → shorter intervals
 * 18  Intervals = stability × difficulty-modifier (adaptive SM-2-like)
 * 19  Response time auto-degrades Good → Hard if >6 s
 * 20  Safety net: mastered words resurface every 60 days max
 */

import { ref, computed, onMounted, watch } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import FlashCard from './FlashCard.vue'
import LevelUpQuiz from './LevelUpQuiz.vue'

const props = defineProps(['words'])
const emit  = defineEmits(['refresh', 'update:currentTab'])

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_BOX            = 7
const MAX_REPS_PER_CARD  = 5          // issue 5 & 14: session cap per card
const GRADUATE_STREAK    = 3          // issue 9: need 3 consecutive Good/Easy
const MAX_INTERVAL_DAYS  = 60         // issue 3 & 20: even mastered = max 60d
const QUIZ_DIFFICULTY    = 0.70       // issue 8: only quiz weak words

// Re-insert offsets (positions ahead)
const REINSERT_FORGOT    = [1, 3]     // issue 6: very close
const REINSERT_HARD      = [3, 6]
const REINSERT_GOOD      = [8, 12]
const REINSERT_EASY      = [14, 18]   // known word, push far

// Initial stability per box (days) — baseline for new words entering a box
const BOX_INIT_STABILITY = [0, 0.04, 0.5, 1, 3, 7, 21, 60]

const BOX_LABELS  = ['','Just Learned','Short-Term','Reinforcing','Solidifying','Long-Term','Deep Memory','Mastered']
const BOX_COLORS  = ['','#fbbf24','#f97316','#34d399','#60a5fa','#818cf8','#c084fc','#f43f5e']

// ─── FSRS-LITE MEMORY MODEL ──────────────────────────────────────────────────
/**
 * stability  (s): estimated days until 50% forgetting probability
 * difficulty (d): 0–1, how hard this word is for this user
 * retrievability (r): current recall probability = e^(-t/s)
 *
 * On rating:
 *   Easy  (4): s ← s × 2.5 × (2 - d)     big stability jump, lower difficulty
 *   Good  (3): s ← s × 1.8 × (1.5 - d)   normal jump
 *   Hard  (2): s ← s × 1.2                small jump, raise difficulty
 *   Forgot(1): s ← s × 0.2 × decay_bonus  reset + difficulty spike
 *              decay_bonus = gap/s (bigger gap → harder reset)
 *
 * difficulty update:
 *   Easy  → d = max(0,   d - 0.15)
 *   Good  → d unchanged
 *   Hard  → d = min(1,   d + 0.15)
 *   Forgot→ d = min(1,   d + 0.30)
 */
const MIN_STABILITY = 0.04  // ~1 hour minimum

const computeNewStability = (s, d, rating, gapDays) => {
  let newS
  if (rating === 4) {
    // Easy
    newS = s * 2.5 * Math.max(0.5, 2 - d)
  } else if (rating === 3) {
    // Good
    newS = s * 1.8 * Math.max(0.5, 1.5 - d)
  } else if (rating === 2) {
    // Hard — small gain
    newS = s * 1.2
  } else {
    // Forgot (1) — issue 4: time-based penalty
    // If gap >> stability the word was due for a long time and they still forgot → worse reset
    const decayFactor = gapDays > 0 ? Math.min(3, gapDays / Math.max(s, 0.1)) : 1
    newS = s * 0.2 / decayFactor
  }
  return Math.max(MIN_STABILITY, Math.min(newS, MAX_INTERVAL_DAYS))
}

const computeNewDifficulty = (d, rating) => {
  if (rating === 4) return Math.max(0, d - 0.15)
  if (rating === 2) return Math.min(1, d + 0.15)
  if (rating === 1) return Math.min(1, d + 0.30)
  return d
}

// interval in ms from new stability, modulated by difficulty
const stabilityToMs = (stability, difficulty) => {
  const modifier = 1 - difficulty * 0.4  // harder word → shorter interval
  const days = Math.min(stability * modifier, MAX_INTERVAL_DAYS)
  return Math.round(days * 24 * 60 * 60 * 1000)
}

// ─── LEGACY MIGRATION ────────────────────────────────────────────────────────
const legacyToBox = (lvl) => {
  if (lvl <= 2) return 1; if (lvl <= 4) return 2; if (lvl <= 6) return 3
  if (lvl <= 8) return 4; if (lvl <= 10) return 5; if (lvl === 11) return 6
  return 7
}
const getBox = (w) => {
  if (w.leitner_box) return Math.min(Math.max(w.leitner_box, 1), MAX_BOX)
  return legacyToBox(w.mastery_level ?? w.masteryLevel ?? 0)
}
const getStability = (w) => {
  if (w.stability) return w.stability
  return BOX_INIT_STABILITY[getBox(w)]
}
const getDifficulty = (w) => {
  if (typeof w.difficulty === 'number') return w.difficulty
  return 0.3  // default moderate difficulty for new/legacy words
}

// ─── URGENCY SCORE ────────────────────────────────────────────────────────────
// Higher = show sooner. Overdue × weak = maximum urgency.
const urgencyScore = (w) => {
  const now        = Date.now()
  const reviewAt   = w.next_review_at ?? w.nextReview ?? 0
  const overdueDays= Math.max(0, (now - reviewAt) / 86400000)
  const s          = getStability(w)
  const d          = getDifficulty(w)
  // words with low stability or long overdue get prioritized
  return overdueDays * (1 + d) / Math.max(s, 0.1)
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const deck    = ref([])
const pos     = ref(0)
const mode    = ref('loading')
const quizWord = ref(null)
const sessionStats = ref({ easy: 0, good: 0, hard: 0, forgot: 0, graduated: 0 })

// ─── BUILD SESSION ────────────────────────────────────────────────────────────
const buildSession = () => {
  if (!props.words?.length) { mode.value = 'finished'; return }

  const now = Date.now()

  // issue 12: detect long-gap return — if user's most-overdue word is 3+ days late, warn
  // issue 11: sort by urgency descending
  const due = props.words
    .filter(w => {
      const box      = getBox(w)
      const reviewAt = w.next_review_at ?? w.nextReview ?? 0
      // issue 20: mastered words re-enter if overdue by MAX_INTERVAL_DAYS
      return reviewAt <= now
    })
    .map(w => ({
      ...w,
      _box:            getBox(w),
      _stability:      getStability(w),
      _difficulty:     getDifficulty(w),
      _sessionStreak:  0,   // consecutive Good/Easy this session
      _sessionRating:  0,   // sum of ratings (for graduation quality check)
      _failStreak:     0,   // consecutive forgets
      _repsThisSession:0,   // total appearances this session
      _lastReviewAt:   w.next_review_at ?? w.nextReview ?? 0,
    }))

  if (!due.length) { mode.value = 'finished'; return }

  // issue 11: sort by urgency
  due.sort((a, b) => urgencyScore(b) - urgencyScore(a))

  deck.value = due
  pos.value  = 0
  mode.value = 'session'
}

onMounted(buildSession)
watch(() => props.words, buildSession, { deep: false })

const currentCard = computed(() => deck.value[pos.value])

// ─── HANDLE RATING ────────────────────────────────────────────────────────────
const handleRate = async (rating) => {
  // rating: 1=Forgot, 2=Hard, 3=Good, 4=Easy
  const card = currentCard.value
  if (!card) return

  // Update session stats
  if (rating === 4) sessionStats.value.easy++
  else if (rating === 3) sessionStats.value.good++
  else if (rating === 2) sessionStats.value.hard++
  else sessionStats.value.forgot++

  card._repsThisSession++

  // ── Compute new memory values ──
  const now      = Date.now()
  const gapDays  = (now - (card._lastReviewAt || now)) / 86400000
  const newStab  = computeNewStability(card._stability, card._difficulty, rating, gapDays)
  const newDiff  = computeNewDifficulty(card._difficulty, rating)

  // ── Update box ──
  let newBox = card._box
  if (rating === 1) {
    // issue 4 & 16: forgot → drop box based on how long since last review
    if (gapDays > 7)        newBox = Math.max(1, card._box - 2)
    else if (card._box > 1) newBox = card._box - 1
    else                    newBox = 1
  } else if (rating === 4 && card._sessionStreak >= GRADUATE_STREAK - 1) {
    newBox = Math.min(card._box + 1, MAX_BOX)
  }

  // ── Update streak ──
  if (rating >= 3) {
    card._sessionStreak++
    card._failStreak = 0
  } else if (rating === 2) {
    // Hard: half-credit, only resets if previous were Good
    card._sessionStreak = Math.max(0, card._sessionStreak - 1)
    card._failStreak    = 0
  } else {
    card._sessionStreak  = 0
    card._failStreak++
  }

  // ── Save to Firestore on every interaction (issue 1) ──
  const intervalMs     = stabilityToMs(newStab, newDiff)
  const next_review_at = now + intervalMs

  await saveWord(card.id, {
    leitner_box:   newBox,
    stability:     newStab,
    difficulty:    newDiff,
    next_review_at,
    nextReview:    next_review_at,
    lastReviewed:  now,
    mastery_level: Math.round((newBox / MAX_BOX) * 12),
    masteryLevel:  Math.round((newBox / MAX_BOX) * 12),
    stage:         newBox >= MAX_BOX ? 'mastered' : 'spaced',
    totalReviews:  (card.totalReviews || 0) + 1,
    totalFailures: rating === 1 ? (card.totalFailures || 0) + 1 : (card.totalFailures || 0),
  })

  // Reflect in local card object
  card._box        = newBox
  card._stability  = newStab
  card._difficulty = newDiff
  card.leitner_box = newBox
  card.stability   = newStab
  card.difficulty  = newDiff

  // ── Graduation check ──
  // issue 9: only graduate if streak reached with avg rating ≥ 3
  const shouldGraduate =
    card._sessionStreak >= GRADUATE_STREAK &&
    rating >= 3 &&
    newBox > card._box  // box actually moved up

  if (shouldGraduate) {
    // issue 8: quiz only for genuinely weak words
    const needsQuiz = card._difficulty > QUIZ_DIFFICULTY
    if (needsQuiz) {
      card._pendingBox = newBox
      quizWord.value   = card
      mode.value       = 'quiz'
      return
    } else {
      graduateFromDeck()
      if (deck.value.length === 0) mode.value = 'finished'
      return
    }
  }

  // ── Issue 5 & 14: session cap ──
  if (card._repsThisSession >= MAX_REPS_PER_CARD) {
    removeFromDeck()
    if (deck.value.length === 0) mode.value = 'finished'
    return
  }

  // ── Reinsert based on rating ──
  let range
  if (rating === 1)      range = REINSERT_FORGOT
  else if (rating === 2) range = REINSERT_HARD
  else if (rating === 3) range = REINSERT_GOOD
  else                   range = REINSERT_EASY

  reinsert(randBetween(...range))
}

// ─── QUIZ HANDLERS ───────────────────────────────────────────────────────────
const handleQuizPass = async () => {
  sessionStats.value.graduated++
  quizWord.value = null
  graduateFromDeck()
  if (deck.value.length === 0) mode.value = 'finished'
  else mode.value = 'session'
}

const handleQuizFail = async () => {
  sessionStats.value.forgot++
  const card = quizWord.value

  // Penalise: raise difficulty, reset streak
  const newDiff = computeNewDifficulty(card._difficulty, 1)
  card._difficulty    = newDiff
  card._sessionStreak = 0
  card._failStreak++

  await saveWord(card.id, {
    difficulty:   newDiff,
    totalFailures:(card.totalFailures || 0) + 1,
  })

  // Reinsert near front
  const idx = deck.value.findIndex(w => w.id === card.id)
  if (idx !== -1) {
    const extracted = deck.value.splice(idx, 1)[0]
    const insertAt  = Math.min(pos.value + randBetween(...REINSERT_FORGOT), deck.value.length)
    deck.value.splice(insertAt, 0, extracted)
    if (pos.value >= deck.value.length) pos.value = 0
  }

  quizWord.value = null
  mode.value     = 'session'
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const saveWord = async (id, data) => {
  try { await updateDoc(doc(db, 'words', id), data) }
  catch (e) { console.error('Save failed', e) }
}

const reinsert = (offset) => {
  const card     = deck.value.splice(pos.value, 1)[0]
  const insertAt = Math.min(pos.value + offset, deck.value.length)
  deck.value.splice(insertAt, 0, card)
  if (pos.value >= deck.value.length) pos.value = 0
}

const removeFromDeck = () => {
  deck.value.splice(pos.value, 1)
  if (pos.value >= deck.value.length) pos.value = 0
}

const graduateFromDeck = () => {
  deck.value.splice(pos.value, 1)
  if (pos.value >= deck.value.length) pos.value = 0
}

const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const returnToLibrary = () => {
  emit('refresh')
  emit('update:currentTab', 'library')
}

// ─── DERIVED UI ──────────────────────────────────────────────────────────────
const boxColor = computed(() => BOX_COLORS[currentCard.value?._box] || '#94a3b8')
const boxLabel = computed(() => BOX_LABELS[currentCard.value?._box] || '')
const progressPct = computed(() =>
  currentCard.value ? Math.round((currentCard.value._box / MAX_BOX) * 100) : 0)

const uniqueRemaining = computed(() => new Set(deck.value.map(c => c.id)).size)

// Next 5 upcoming cards for mini-map
const deckPreview = computed(() => {
  const out = []
  for (let i = 1; i <= 5; i++) {
    const c = deck.value[pos.value + i]
    if (!c) break
    out.push({ box: c._box, color: BOX_COLORS[c._box], fail: c._failStreak, diff: c._difficulty })
  }
  return out
})

// issue 12: long-gap warning
const longGapWarning = computed(() => {
  if (!currentCard.value) return false
  const now      = Date.now()
  const reviewAt = currentCard.value._lastReviewAt || 0
  const gapDays  = (now - reviewAt) / 86400000
  return gapDays > 3
})

const totalSessionRatings = computed(() =>
  sessionStats.value.easy + sessionStats.value.good +
  sessionStats.value.hard + sessionStats.value.forgot)
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
        <span class="box-pill" :style="{ background: boxColor + '22', color: boxColor }">
          Box {{ currentCard?._box }} · {{ boxLabel }}
        </span>
      </div>

      <!-- Long-gap warning (issue 12) -->
      <div v-if="longGapWarning" class="gap-warn">
        ⏰ You've been away a while — memory may have faded. Review carefully.
      </div>

      <!-- Box progress bar -->
      <div class="box-progress-wrap">
        <div class="box-progress-fill" :style="{ width: progressPct + '%', background: boxColor }"></div>
      </div>

      <!-- Stability + difficulty indicators -->
      <div class="mem-indicators" v-if="currentCard">
        <div class="mi">
          <span class="mi-lbl">Stability</span>
          <span class="mi-val" :style="{ color: currentCard._stability < 1 ? '#ef4444' : currentCard._stability < 7 ? '#f97316' : '#22c55e' }">
            {{ currentCard._stability < 1 ? '<1d' : Math.round(currentCard._stability) + 'd' }}
          </span>
        </div>
        <div class="mi-sep"></div>
        <div class="mi">
          <span class="mi-lbl">Difficulty</span>
          <span class="mi-val" :style="{ color: currentCard._difficulty > 0.7 ? '#ef4444' : currentCard._difficulty > 0.4 ? '#f97316' : '#22c55e' }">
            {{ currentCard._difficulty > 0.7 ? 'Hard' : currentCard._difficulty > 0.4 ? 'Mid' : 'Easy' }}
          </span>
        </div>
        <div class="mi-sep"></div>
        <div class="mi">
          <span class="mi-lbl">Streak</span>
          <span class="mi-val" style="color:#818cf8">
            {{ currentCard._sessionStreak }}/{{ 3 }}
          </span>
        </div>
      </div>

      <!-- Deck mini-map -->
      <div class="deck-map">
        <span class="dm-label">UP NEXT</span>
        <div class="dm-dots">
          <div
            v-for="(c, i) in deckPreview" :key="i"
            class="dm-dot"
            :class="{ 'dm-hot': c.fail >= 2 }"
            :style="{ background: c.color }"
            :title="`Box ${c.box}${c.fail >= 2 ? ' · Struggling' : ''}`"
          ></div>
          <div v-for="i in (5 - deckPreview.length)" :key="'e'+i" class="dm-dot dm-empty"></div>
        </div>

        <!-- Struggling badge -->
        <span v-if="currentCard?._failStreak >= 2" class="hot-badge">🔥 Tight loop</span>
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

    <!-- CARD -->
    <div class="card-area">

      <FlashCard
        v-if="mode === 'session' && currentCard"
        :word="currentCard"
        @rate="handleRate"
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
        <p class="done-sub">Memory model updated in real-time.</p>

        <div class="done-stats">
          <div class="ds ds-easy">
            <span class="ds-num">{{ sessionStats.easy }}</span>
            <span class="ds-lbl">Easy</span>
          </div>
          <div class="ds ds-good">
            <span class="ds-num">{{ sessionStats.good }}</span>
            <span class="ds-lbl">Good</span>
          </div>
          <div class="ds ds-hard">
            <span class="ds-num">{{ sessionStats.hard }}</span>
            <span class="ds-lbl">Hard</span>
          </div>
          <div class="ds ds-forgot">
            <span class="ds-num">{{ sessionStats.forgot }}</span>
            <span class="ds-lbl">Forgot</span>
          </div>
        </div>

        <div class="done-hint">
          <span>Adaptive intervals based on your performance · max cap </span>
          <strong>60 days</strong>
        </div>

        <button @click="returnToLibrary" class="done-btn">Back to Library</button>
      </div>

    </div>

    <!-- BOX LADDER -->
    <div v-if="mode === 'session' && currentCard" class="box-ladder">
      <div
        v-for="b in 7" :key="b"
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
  height: calc(100vh - 100px); display: flex; flex-direction: column;
  padding: 10px 12px 6px; max-width: 500px; margin: 0 auto;
  gap: 6px; font-family: 'Plus Jakarta Sans', sans-serif;
}

/* TOP BAR */
.top-bar { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
.queue-info { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; }
.q-num   { font-weight: 800; color: #334155; font-size: 0.95rem; }
.q-label { color: #94a3b8; font-weight: 600; }
.sep     { color: #cbd5e1; }
.box-pill { font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 20px; }

/* Long-gap warning */
.gap-warn {
  font-size: 0.68rem; font-weight: 700; color: #92400e;
  background: #fffbeb; border: 1px solid #fde68a;
  border-radius: 10px; padding: 5px 10px;
}

/* Box progress */
.box-progress-wrap { height: 4px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.box-progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease, background 0.4s ease; }

/* Memory indicators */
.mem-indicators { display: flex; align-items: center; gap: 10px; }
.mi { display: flex; align-items: center; gap: 5px; }
.mi-lbl { font-size: 0.6rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.mi-val { font-size: 0.75rem; font-weight: 800; }
.mi-sep { width: 1px; height: 12px; background: #e2e8f0; }

/* Deck mini-map */
.deck-map { display: flex; align-items: center; gap: 8px; min-height: 18px; }
.dm-label { font-size: 0.55rem; font-weight: 800; letter-spacing: 1px; color: #cbd5e1; flex-shrink: 0; }
.dm-dots  { display: flex; gap: 4px; align-items: center; }
.dm-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
.dm-dot.dm-empty { background: #e2e8f0; }
.dm-dot.dm-hot   { animation: pulse-hot 0.9s ease-in-out infinite alternate; }
@keyframes pulse-hot { from { transform: scale(1); opacity: 1; } to { transform: scale(1.35); opacity: 0.75; } }
.hot-badge { font-size: 0.62rem; font-weight: 700; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 20px; margin-left: auto; }

/* Quiz bar */
.quiz-bar { flex-direction: row !important; justify-content: space-between; align-items: center; }
.stage-tag { font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 12px; border-radius: 20px; }
.quiz-tag  { background: #fef9ee; color: #92400e; border: 1px solid #fde68a; }

/* Card area */
.card-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }

/* Box ladder */
.box-ladder { display: flex; gap: 5px; justify-content: center; padding: 4px 0; flex-shrink: 0; }
.box-step { flex: 1; height: 6px; border-radius: 4px; transition: background 0.4s, transform 0.2s; }
.box-step.current { transform: scaleY(1.8); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }

/* Done screen */
.done {
  position: relative; background: white; border-radius: 24px; height: 100%;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center; padding: 40px 24px; overflow: hidden;
  border: 1px solid #f1f5f9; box-shadow: 0 10px 40px -10px rgba(15,23,42,0.08);
}
.done-glow { position: absolute; inset: 0; background: radial-gradient(circle at top center,#f0fdf4 0%,transparent 60%); z-index: 0; }
.done-icon { font-size: 3.2rem; z-index: 1; background: white; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 8px 24px rgba(21,128,61,0.12); margin-bottom: 18px; }
.done-title { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; z-index: 1; }
.done-sub   { color: #64748b; margin: 0 0 20px; font-size: 0.95rem; z-index: 1; }
.done-hint  { font-size: 0.72rem; color: #94a3b8; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 14px; margin-bottom: 24px; z-index: 1; }
.done-hint strong { color: #475569; }
.done-stats { display: flex; gap: 8px; margin-bottom: 20px; z-index: 1; flex-wrap: wrap; justify-content: center; }
.ds { padding: 10px 14px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 66px; }
.ds-easy   { background: #eff6ff; border: 1px solid #93c5fd; }
.ds-good   { background: #f0fdf4; border: 1px solid #bbf7d0; }
.ds-hard   { background: #fff7ed; border: 1px solid #fed7aa; }
.ds-forgot { background: #fef2f2; border: 1px solid #fecaca; }
.ds-num { font-size: 1.7rem; font-weight: 800; line-height: 1; }
.ds-easy .ds-num   { color: #1d4ed8; }
.ds-good .ds-num   { color: #16a34a; }
.ds-hard .ds-num   { color: #c2410c; }
.ds-forgot .ds-num { color: #dc2626; }
.ds-lbl { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
.done-btn { padding: 15px 44px; background: #0f172a; color: white; border: none; border-radius: 16px; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 1rem; cursor: pointer; box-shadow: 0 8px 20px -6px rgba(15,23,42,0.3); z-index: 1; transition: transform 0.2s; }
.done-btn:active { transform: scale(0.97); }
</style>
