<script setup>
import { ref, computed, onMounted } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import FlashCard from './FlashCard.vue'
import LevelUpQuiz from './LevelUpQuiz.vue'

const props = defineProps(['words'])
const emit  = defineEmits(['refresh', 'update:currentTab'])

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const MAX_BOX            = 7
const MASTERED_BOX       = 6      // box ≥ 6: exclude unless overdue
const MAX_SESSION_CARDS  = 20     // issue 15: cap per session
const MAX_REPS_FORGOT    = 4      // hard stop: forgot path
const MAX_REPS_HARD      = 3      // hard stop: hard path
const MAX_INTERVAL_DAYS  = 60     // issue 3+20: even mastered → max 60d
const OVERDUE_BUFFER_MS  = 5 * 60 * 1000  // issue 4: 5-min grace before "overdue"
const GOOD_STREAK_REQ    = 1      // Golden rule: trust on FIRST Good/Easy — remove immediately
const QUIZ_DIFFICULTY    = 0.72

// Reinsert offsets — Good/Easy NEVER reinsert (issue 2+7)
const OFFSET_FORGOT = [2, 4]
const OFFSET_HARD   = [5, 9]

const BOX_LABELS = ['','Just Learned','Short-Term','Reinforcing','Solidifying','Long-Term','Deep Memory','Mastered']
const BOX_COLORS = ['','#fbbf24','#f97316','#34d399','#60a5fa','#818cf8','#c084fc','#f43f5e']
const BOX_INIT_STABILITY = [0, 0.04, 0.5, 1, 3, 7, 21, 60]

// ═══════════════════════════════════════════════════════════════════
// FSRS-LITE MEMORY MODEL
// ═══════════════════════════════════════════════════════════════════
const MIN_STABILITY = 0.04

const computeNewStability = (s, d, rating, gapDays) => {
  let newS
  if      (rating === 4) newS = s * 3.5 * Math.max(0.6, 2.0 - d)  // issue 5: bigger Easy jump
  else if (rating === 3) newS = s * 2.5 * Math.max(0.6, 1.5 - d)  // issue 5: bigger Good jump
  else if (rating === 2) newS = s * 1.2
  else {
    // Forgot — time-based penalty
    const decayFactor = gapDays > 0 ? Math.min(3, gapDays / Math.max(s, 0.1)) : 1
    newS = (s * 0.2) / decayFactor
  }
  return Math.max(MIN_STABILITY, Math.min(newS, MAX_INTERVAL_DAYS))
}

const computeNewDifficulty = (d, rating) => {
  if (rating === 4) return Math.max(0, d - 0.25)  // issue 6: aggressive Easy drop
  if (rating === 3) return Math.max(0, d - 0.05)
  if (rating === 2) return Math.min(1, d + 0.15)
  if (rating === 1) return Math.min(1, d + 0.30)
  return d
}

const stabilityToMs = (stability, difficulty) => {
  const modifier = 1 - difficulty * 0.4
  const days     = Math.min(stability * modifier, MAX_INTERVAL_DAYS)
  return Math.round(days * 24 * 60 * 60 * 1000)
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY MIGRATION
// ═══════════════════════════════════════════════════════════════════
const legacyToBox = (lvl) => {
  if (lvl <= 2) return 1; if (lvl <= 4) return 2; if (lvl <= 6) return 3
  if (lvl <= 8) return 4; if (lvl <= 10) return 5; if (lvl === 11) return 6
  return 7
}
const resolveBox        = (w) => w.leitner_box
  ? Math.min(Math.max(w.leitner_box, 1), MAX_BOX)
  : legacyToBox(w.mastery_level ?? w.masteryLevel ?? 0)
const resolveStability  = (w) => w.stability  ?? BOX_INIT_STABILITY[resolveBox(w)]
const resolveDifficulty = (w) => typeof w.difficulty === 'number' ? w.difficulty : 0.3

// ═══════════════════════════════════════════════════════════════════
// URGENCY — filter-then-sort (issue 11+16)
// ═══════════════════════════════════════════════════════════════════
const urgencyScore = (w) => {
  const now         = Date.now()
  const reviewAt    = w.next_review_at ?? w.nextReview ?? 0
  const overdueDays = Math.max(0, (now - reviewAt) / 86400000)
  const s           = resolveStability(w)
  const d           = resolveDifficulty(w)
  return (overdueDays + 0.1) * (1 + d) / Math.max(s, 0.1)
}

// ═══════════════════════════════════════════════════════════════════
// SESSION STATE
// ═══════════════════════════════════════════════════════════════════
const deck         = ref([])
const pos          = ref(0)
const mode         = ref('loading')
const quizWord     = ref(null)
const sessionStats = ref({ easy: 0, good: 0, hard: 0, forgot: 0, graduated: 0 })

// issue 2+3+12: blacklist — IDs of cards rated Good/Easy this session.
// These can NEVER re-enter the session deck regardless of what props.words does.
const sessionBlacklist = new Set()

// ═══════════════════════════════════════════════════════════════════
// BUILD SESSION — runs once on mount only (issue 2)
// ═══════════════════════════════════════════════════════════════════
const makeCard = (w) => ({
  ...w,
  _box:          resolveBox(w),
  _stability:    resolveStability(w),
  _difficulty:   resolveDifficulty(w),
  _repsTotal:    0,
  _repsHard:     0,
  _failStreak:   0,
  _goodStreak:   0,   // issue 9+13+14: consecutive Good/Easy
  _lastReviewAt: w.next_review_at ?? w.nextReview ?? 0,
  _type:         resolveBox(w) <= 3 ? 'learning' : 'review',
})

const buildSession = () => {
  if (!props.words?.length) { mode.value = 'finished'; return }

  sessionBlacklist.clear()
  const now = Date.now()

  // issue 1+4+6: strict filter — only genuinely overdue cards
  const due = props.words.filter(w => {
    const box      = resolveBox(w)
    const reviewAt = w.next_review_at ?? w.nextReview ?? 0
    // issue 15: mastered with future schedule → skip
    if (box >= MASTERED_BOX && reviewAt > now) return false
    // issue 4: 5-min buffer — "barely due" doesn't count
    return reviewAt <= now - OVERDUE_BUFFER_MS
  })

  if (!due.length) { mode.value = 'finished'; return }

  // issue 10: deduplicate by ID
  const seenIds = new Set()
  const unique  = due.filter(w => { if (seenIds.has(w.id)) return false; seenIds.add(w.id); return true })

  // issue 18: two queues, sorted independently
  const learning = unique.filter(w => resolveBox(w) <= 3).sort((a, b) => urgencyScore(b) - urgencyScore(a))
  const review   = unique.filter(w => resolveBox(w) >  3).sort((a, b) => urgencyScore(b) - urgencyScore(a))

  // issue 15: hard cap at MAX_SESSION_CARDS
  const combined = [...learning, ...review].slice(0, MAX_SESSION_CARDS)

  deck.value = combined.map(makeCard)
  pos.value  = 0
  mode.value = deck.value.length ? 'session' : 'finished'
}

// Run once on mount — do NOT watch props.words (issue 2: reactive re-run brings back good cards)
onMounted(buildSession)

const currentCard = computed(() => deck.value[pos.value])

// ═══════════════════════════════════════════════════════════════════
// HANDLE RATING
// ═══════════════════════════════════════════════════════════════════
const handleRate = async (rating) => {
  const card = currentCard.value
  if (!card) return

  // Stats
  if      (rating === 4) sessionStats.value.easy++
  else if (rating === 3) sessionStats.value.good++
  else if (rating === 2) sessionStats.value.hard++
  else                   sessionStats.value.forgot++

  card._repsTotal++

  // Memory model
  const now     = Date.now()
  const gapDays = Math.max(0, (now - (card._lastReviewAt || now)) / 86400000)
  const newStab = computeNewStability(card._stability, card._difficulty, rating, gapDays)
  const newDiff = computeNewDifficulty(card._difficulty, rating)

  // Box movement
  let newBox = card._box
  if (rating === 1) {
    // Forgot → drop (issue 4+16: bigger drop for long gap)
    newBox = gapDays > 7 ? Math.max(1, card._box - 2) : Math.max(1, card._box - 1)
  } else if (rating >= 3) {
    // Good/Easy → promote immediately (issue 13 resolved by removal, not delayed promotion)
    newBox = Math.min(card._box + 1, MAX_BOX)
  }
  // Hard → box stays same

  // Compute next review timestamp
  // Good/Easy → full stability-based interval (issue 4+5)
  // Forgot/Hard → short interval
  const next_review_at = now + stabilityToMs(newStab, newDiff)

  // Save to Firestore on every interaction (issue 1)
  card._box        = newBox
  card._stability  = newStab
  card._difficulty = newDiff

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
    totalReviews:  (card.totalReviews  || 0) + 1,
    totalFailures: rating === 1 ? (card.totalFailures || 0) + 1 : (card.totalFailures || 0),
  })

  // ── THE ROOT RULE ──────────────────────────────────────────────────────────
  // Good/Easy → REMOVE immediately. No reinsert. No second pass. (issues 1-3,7,9,12,14,17,19,21)
  if (rating >= 3) {
    // Quiz gate only for genuinely difficult words (issue 8)
    if (card._difficulty > QUIZ_DIFFICULTY) {
      card._pendingBox = newBox
      quizWord.value   = card
      mode.value       = 'quiz'
      return  // quiz result will remove or reinsert
    }
    // Trust the user — blacklist and remove
    sessionBlacklist.add(card.id)
    removeFromDeck()
    checkFinished()
    return
  }

  // ── Hard ──────────────────────────────────────────────────────────────────
  if (rating === 2) {
    card._repsHard++
    if (card._repsHard >= MAX_REPS_HARD || card._repsTotal >= MAX_REPS_FORGOT) {
      // Hit hard-rep limit → force remove (issue 8+10)
      sessionBlacklist.add(card.id)
      removeFromDeck()
      checkFinished()
      return
    }
    reinsert(randBetween(...OFFSET_HARD))  // only Forgot and Hard reinsert (issue 2+7)
    return
  }

  // ── Forgot ────────────────────────────────────────────────────────────────
  card._failStreak++
  if (card._repsTotal >= MAX_REPS_FORGOT) {
    // Hard stop (issue 10)
    sessionBlacklist.add(card.id)
    removeFromDeck()
    checkFinished()
    return
  }
  reinsert(randBetween(...OFFSET_FORGOT))
}

// ═══════════════════════════════════════════════════════════════════
// QUIZ HANDLERS
// ═══════════════════════════════════════════════════════════════════
const handleQuizPass = async () => {
  sessionStats.value.graduated++
  if (quizWord.value) {
    sessionBlacklist.add(quizWord.value.id)  // issue 3: blacklist on quiz pass
    // Remove from deck — quiz was triggered before removal (issue 1 fix)
    const idx = deck.value.findIndex(w => w.id === quizWord.value.id)
    if (idx !== -1) deck.value.splice(idx, 1)
    if (pos.value >= deck.value.length) pos.value = 0
    quizWord.value = null
  }
  checkFinished()
  if (mode.value !== 'finished') mode.value = 'session'
}

const handleQuizFail = async () => {
  sessionStats.value.forgot++
  const card = quizWord.value

  const newDiff    = computeNewDifficulty(card._difficulty, 1)
  card._difficulty = newDiff
  card._failStreak++
  card._goodStreak = 0

  await saveWord(card.id, {
    difficulty:    newDiff,
    totalFailures: (card.totalFailures || 0) + 1,
  })

  // Card goes back into session as a Forgot card — reinsert near front
  const idx = deck.value.findIndex(w => w.id === card.id)
  if (idx !== -1) {
    deck.value[idx]._difficulty = newDiff
    deck.value[idx]._goodStreak = 0
    const extracted = deck.value.splice(idx, 1)[0]
    const insertAt  = Math.min(pos.value + randBetween(...OFFSET_FORGOT), deck.value.length)
    deck.value.splice(insertAt, 0, extracted)
    if (pos.value >= deck.value.length) pos.value = 0
  }

  quizWord.value = null
  mode.value     = 'session'
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
const saveWord = async (id, data) => {
  try { await updateDoc(doc(db, 'words', id), data) }
  catch (e) { console.error('Firestore save failed', e) }
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

const checkFinished = () => {
  if (deck.value.length === 0) mode.value = 'finished'
}

const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const returnToLibrary = () => {
  emit('refresh')
  emit('update:currentTab', 'library')
}

// ═══════════════════════════════════════════════════════════════════
// DERIVED UI
// ═══════════════════════════════════════════════════════════════════
const boxColor    = computed(() => BOX_COLORS[currentCard.value?._box] || '#94a3b8')
const boxLabel    = computed(() => BOX_LABELS[currentCard.value?._box] || '')
const progressPct = computed(() =>
  currentCard.value ? Math.round((currentCard.value._box / MAX_BOX) * 100) : 0)

const uniqueRemaining = computed(() => new Set(deck.value.map(c => c.id)).size)

const deckPreview = computed(() => {
  const out = []
  for (let i = 1; i <= 5; i++) {
    const c = deck.value[pos.value + i]
    if (!c) break
    out.push({ box: c._box, color: BOX_COLORS[c._box], fail: c._failStreak })
  }
  return out
})

const longGapWarning = computed(() => {
  if (!currentCard.value) return false
  return (Date.now() - (currentCard.value._lastReviewAt || Date.now())) / 86400000 > 3
})

const cardTypeBadge = computed(() =>
  currentCard.value?._type === 'review' ? '📅 Review' : '🌱 Learning')

const streakPips = computed(() => currentCard.value?._goodStreak ?? 0)
</script>

<template>
  <div class="shell">

    <!-- SESSION HEADER -->
    <div v-if="mode === 'session'" class="top-bar">

      <div class="header-row">
        <div class="queue-info">
          <span class="q-num">{{ uniqueRemaining }}</span>
          <span class="q-label">left</span>
          <span class="sep">·</span>
          <span class="type-badge">{{ cardTypeBadge }}</span>
        </div>
        <span class="box-pill" :style="{ background: boxColor + '22', color: boxColor }">
          Box {{ currentCard?._box }} · {{ boxLabel }}
        </span>
      </div>

      <div v-if="longGapWarning" class="gap-warn">
        ⏰ You've been away — memory may have faded.
      </div>

      <div class="box-progress-wrap">
        <div class="box-progress-fill" :style="{ width: progressPct + '%', background: boxColor }"></div>
      </div>

      <div class="mem-row" v-if="currentCard">
        <div class="mi">
          <span class="mi-lbl">Stability</span>
          <span class="mi-val" :style="{
            color: currentCard._stability < 1 ? '#ef4444'
                 : currentCard._stability < 7 ? '#f97316' : '#22c55e'
          }">{{ currentCard._stability < 1 ? '<1d' : Math.round(currentCard._stability) + 'd' }}</span>
        </div>
        <div class="mi-sep"></div>
        <div class="mi">
          <span class="mi-lbl">Difficulty</span>
          <span class="mi-val" :style="{
            color: currentCard._difficulty > 0.7 ? '#ef4444'
                 : currentCard._difficulty > 0.4 ? '#f97316' : '#22c55e'
          }">{{ currentCard._difficulty > 0.7 ? 'Hard' : currentCard._difficulty > 0.4 ? 'Mid' : 'Easy' }}</span>
        </div>
        <div class="mi-sep"></div>
        <!-- Streak pips toward GOOD_STREAK_REQ -->
        <div class="mi">
          <span class="mi-lbl">Streak</span>
          <div class="streak-pips">
            <span
              v-for="n in GOOD_STREAK_REQ" :key="n"
              class="spip"
              :class="{ on: n <= streakPips }"
            ></span>
          </div>
        </div>
        <div v-if="currentCard._failStreak >= 2" class="hot-badge">🔥 Struggling</div>
      </div>

      <div class="deck-map">
        <span class="dm-label">UP NEXT</span>
        <div class="dm-dots">
          <div
            v-for="(c, i) in deckPreview" :key="i"
            class="dm-dot"
            :class="{ 'dm-hot': c.fail >= 2 }"
            :style="{ background: c.color }"
          ></div>
          <div v-for="i in (5 - deckPreview.length)" :key="'e'+i" class="dm-dot dm-empty"></div>
        </div>
      </div>

    </div>

    <!-- QUIZ HEADER -->
    <div v-if="mode === 'quiz'" class="top-bar quiz-bar">
      <div class="queue-info">
        <span class="q-num">{{ deck.length }}</span>
        <span class="q-label">left</span>
      </div>
      <div class="stage-tag quiz-tag">🎯 Box-Up Quiz</div>
    </div>

    <!-- CARD AREA -->
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

      <div v-else-if="mode === 'finished'" class="done">
        <div class="done-glow"></div>
        <div class="done-icon">🧘</div>
        <h2 class="done-title">Session Complete</h2>
        <p class="done-sub">All due cards cleared. Check back later.</p>

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
          Good × 2 → scheduled ✓ &nbsp;·&nbsp; Forgot/Hard → looped until limit
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

.top-bar    { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
.queue-info { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; }
.q-num      { font-weight: 800; color: #334155; font-size: 0.95rem; }
.q-label    { color: #94a3b8; font-weight: 600; }
.sep        { color: #cbd5e1; }
.type-badge { font-size: 0.63rem; font-weight: 800; background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; padding: 3px 8px; border-radius: 20px; }
.box-pill   { font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 20px; }

.gap-warn { font-size: 0.68rem; font-weight: 700; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 5px 10px; }

.box-progress-wrap { height: 4px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.box-progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease, background 0.4s ease; }

.mem-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mi      { display: flex; align-items: center; gap: 5px; }
.mi-lbl  { font-size: 0.6rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.mi-val  { font-size: 0.75rem; font-weight: 800; }
.mi-sep  { width: 1px; height: 12px; background: #e2e8f0; }

.streak-pips { display: flex; gap: 4px; align-items: center; }
.spip { width: 10px; height: 10px; border-radius: 50%; background: #e2e8f0; transition: background 0.2s, transform 0.2s; }
.spip.on { background: #22c55e; transform: scale(1.2); }

.hot-badge { font-size: 0.62rem; font-weight: 700; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 20px; margin-left: auto; }

.deck-map { display: flex; align-items: center; gap: 8px; }
.dm-label { font-size: 0.55rem; font-weight: 800; letter-spacing: 1px; color: #cbd5e1; flex-shrink: 0; }
.dm-dots  { display: flex; gap: 4px; }
.dm-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
.dm-dot.dm-empty { background: #e2e8f0; }
.dm-dot.dm-hot   { animation: pulse-hot 0.9s ease-in-out infinite alternate; }
@keyframes pulse-hot { from { transform:scale(1); opacity:1; } to { transform:scale(1.35); opacity:0.7; } }

.quiz-bar  { flex-direction: row !important; justify-content: space-between; align-items: center; }
.stage-tag { font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 12px; border-radius: 20px; }
.quiz-tag  { background: #fef9ee; color: #92400e; border: 1px solid #fde68a; }

.card-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }

.box-ladder { display: flex; gap: 5px; justify-content: center; padding: 4px 0; flex-shrink: 0; }
.box-step   { flex: 1; height: 6px; border-radius: 4px; transition: background 0.4s, transform 0.2s; }
.box-step.current { transform: scaleY(1.8); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }

.done {
  position: relative; background: white; border-radius: 24px; height: 100%;
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; text-align: center; padding: 40px 24px; overflow: hidden;
  border: 1px solid #f1f5f9; box-shadow: 0 10px 40px -10px rgba(15,23,42,0.08);
}
.done-glow  { position: absolute; inset: 0; background: radial-gradient(circle at top center,#f0fdf4 0%,transparent 60%); z-index: 0; }
.done-icon  { font-size: 3.2rem; z-index: 1; background: white; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 8px 24px rgba(21,128,61,0.12); margin-bottom: 18px; }
.done-title { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; z-index: 1; }
.done-sub   { color: #64748b; margin: 0 0 20px; font-size: 0.95rem; z-index: 1; }
.done-hint  { font-size: 0.72rem; color: #94a3b8; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 14px; margin-bottom: 24px; z-index: 1; line-height: 1.6; }
.done-stats { display: flex; gap: 8px; margin-bottom: 20px; z-index: 1; flex-wrap: wrap; justify-content: center; }
.ds         { padding: 10px 14px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; }
.ds-easy    { background: #eff6ff; border: 1px solid #93c5fd; }
.ds-good    { background: #f0fdf4; border: 1px solid #bbf7d0; }
.ds-hard    { background: #fff7ed; border: 1px solid #fed7aa; }
.ds-forgot  { background: #fef2f2; border: 1px solid #fecaca; }
.ds-num     { font-size: 1.7rem; font-weight: 800; line-height: 1; }
.ds-easy .ds-num   { color: #1d4ed8; }
.ds-good .ds-num   { color: #16a34a; }
.ds-hard .ds-num   { color: #c2410c; }
.ds-forgot .ds-num { color: #dc2626; }
.ds-lbl     { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
.done-btn   { padding: 15px 44px; background: #0f172a; color: white; border: none; border-radius: 16px; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 1rem; cursor: pointer; box-shadow: 0 8px 20px -6px rgba(15,23,42,0.3); z-index: 1; transition: transform 0.2s; }
.done-btn:active { transform: scale(0.97); }
</style>
