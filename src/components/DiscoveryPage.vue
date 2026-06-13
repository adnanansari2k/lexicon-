<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import DailyGoalHeader from './discovery/DailyGoalHeader.vue'
import FeedCard        from './discovery/FeedCard.vue'
import ItemReader      from './discovery/ItemReader.vue'

const props = defineProps(['discoveryItems', 'loading', 'words', 'currentTab'])
const emit  = defineEmits(['refresh', 'update:currentTab'])

// ─── STATE ─────────────────────────────────────────────────────────────────
const selectedItem   = ref(null)
const wordsToday     = ref(0)
const dailyGoal      = 10
const todaysFeed     = ref([])
const exerciseState  = ref({})
const completedItems = ref(new Set())

// Word quiz popup — 3 phases: 'prompt' | 'reveal' | 'rated'
const wordQuiz = ref(null)
// { word, meaning, urdu, simple_meaning, wordObj, phase }

// Words that were forgotten this session → go into a re-loop deck
const forgottenWords = ref([])  // array of word objects
const forgotDeckIdx  = ref(0)
const forgotDeckMode = ref(false)

// ─── FSRS-LITE (same as FlashCardGame) ────────────────────────────────────
const MIN_STABILITY     = 0.04
const MAX_INTERVAL_DAYS = 60

const computeNewStability = (s, d, rating, gapDays) => {
  let newS
  if      (rating === 4) newS = s * 3.5 * Math.max(0.6, 2.0 - d)
  else if (rating === 3) newS = s * 2.5 * Math.max(0.6, 1.5 - d)
  else if (rating === 2) newS = s * 1.2
  else {
    const decayFactor = gapDays > 0 ? Math.min(3, gapDays / Math.max(s, 0.1)) : 1
    newS = (s * 0.2) / decayFactor
  }
  return Math.max(MIN_STABILITY, Math.min(newS, MAX_INTERVAL_DAYS))
}

const computeNewDifficulty = (d, rating) => {
  if (rating === 4) return Math.max(0, d - 0.25)
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

const legacyToBox = (lvl) => {
  if (lvl <= 2) return 1; if (lvl <= 4) return 2; if (lvl <= 6) return 3
  if (lvl <= 8) return 4; if (lvl <= 10) return 5; if (lvl === 11) return 6
  return 7
}
const resolveBox        = (w) => w?.leitner_box
  ? Math.min(Math.max(w.leitner_box, 1), 7)
  : legacyToBox(w?.mastery_level ?? w?.masteryLevel ?? 0)
const resolveStability  = (w) => w?.stability  ?? [0,0.04,0.5,1,3,7,21,60][resolveBox(w)]
const resolveDifficulty = (w) => typeof w?.difficulty === 'number' ? w.difficulty : 0.3

// ─── SAVE TO FIRESTORE ─────────────────────────────────────────────────────
const saveWord = async (wordObj, rating) => {
  if (!wordObj?.id) return
  const now       = Date.now()
  const s         = resolveStability(wordObj)
  const d         = resolveDifficulty(wordObj)
  const gapDays   = wordObj.next_review_at
    ? Math.max(0, (now - wordObj.next_review_at) / 86400000) : 0
  const newStab   = computeNewStability(s, d, rating, gapDays)
  const newDiff   = computeNewDifficulty(d, rating)
  const curBox    = resolveBox(wordObj)
  let   newBox    = curBox

  if (rating === 1)      newBox = Math.max(1, curBox - 1)
  else if (rating >= 3)  newBox = Math.min(7, curBox + 1)

  const next_review_at = now + stabilityToMs(newStab, newDiff)

  try {
    await updateDoc(doc(db, 'words', wordObj.id), {
      leitner_box:   newBox,
      stability:     newStab,
      difficulty:    newDiff,
      next_review_at,
      nextReview:    next_review_at,
      lastReviewed:  now,
      mastery_level: Math.round((newBox / 7) * 12),
      masteryLevel:  Math.round((newBox / 7) * 12),
      stage:         newBox >= 7 ? 'mastered' : 'spaced',
      totalReviews:  (wordObj.totalReviews  || 0) + 1,
      totalFailures: rating === 1 ? (wordObj.totalFailures || 0) + 1 : (wordObj.totalFailures || 0),
    })
  } catch (e) { console.error('Save failed', e) }
}

// ─── WORD QUIZ FLOW ────────────────────────────────────────────────────────
const libraryWords = computed(() =>
  new Set(props.words?.map(w => w.word?.toLowerCase()) || [])
)

const onWordTap = (payload) => {
  if (!payload) { wordQuiz.value = null; return }
  const found = props.words?.find(w => w.word?.toLowerCase() === payload.word?.toLowerCase())
  if (!found) return

  // Start quiz at 'prompt' phase
  wordQuiz.value = {
    word:          found.word,
    meaning:       found.simple_meaning || found.meanings?.en || found.meaning || '',
    urdu:          found.urdu_meaning || '',
    hindi:         found.hindi_meaning || '',
    scenario:      Array.isArray(found.scenarios) ? found.scenarios[0] : found.scenario || '',
    example:       Array.isArray(found.examples) ? found.examples[0] : found.example_sentence || '',
    pos:           found.part_of_speech || '',
    synonyms:      found.synonyms || [],
    stability:     resolveStability(found),
    difficulty:    resolveDifficulty(found),
    box:           resolveBox(found),
    wordObj:       found,
    phase:         'prompt',  // prompt → reveal → done
  }
}

const showAnswer = () => {
  if (wordQuiz.value) wordQuiz.value.phase = 'reveal'
}

const closeQuiz = () => { wordQuiz.value = null }

// Rating handler — mirrors FlashCardGame logic exactly
const rateWord = async (rating) => {
  const q = wordQuiz.value
  if (!q) return

  await saveWord(q.wordObj, rating)

  if (rating === 1) {
    // Forgot → add to forgotten deck loop
    const alreadyIn = forgottenWords.value.find(w => w.id === q.wordObj.id)
    if (!alreadyIn) {
      forgottenWords.value.push({ ...q.wordObj, _failStreak: 1, _repsTotal: 1 })
    }
  }

  wordQuiz.value = { ...q, phase: 'done', lastRating: rating }

  // Auto-close after rating (brief pause so user sees feedback)
  setTimeout(() => {
    wordQuiz.value = null

    // If there are forgotten words and we're not already in forgot-deck mode
    if (forgottenWords.value.length > 0 && !forgotDeckMode.value) {
      // Prompt forgotten deck session after reading is done
    }
  }, 800)
}

// ─── FORGOT DECK (re-loop for forgotten words) ─────────────────────────────
const forgotDeckWord = computed(() =>
  forgotDeckMode.value ? forgottenWords.value[forgotDeckIdx.value] : null
)

const startForgotDeck = () => {
  if (!forgottenWords.value.length) return
  forgotDeckIdx.value  = 0
  forgotDeckMode.value = true

  // Open as a quiz prompt immediately
  const w = forgottenWords.value[0]
  openForgotCard(w)
}

const openForgotCard = (w) => {
  wordQuiz.value = {
    word:       w.word,
    meaning:    w.simple_meaning || w.meanings?.en || w.meaning || '',
    urdu:       w.urdu_meaning || '',
    pos:        w.part_of_speech || '',
    synonyms:   w.synonyms || [],
    scenario:   Array.isArray(w.scenarios) ? w.scenarios[0] : w.scenario || '',
    example:    Array.isArray(w.examples) ? w.examples[0] : w.example_sentence || '',
    stability:  resolveStability(w),
    difficulty: resolveDifficulty(w),
    box:        resolveBox(w),
    wordObj:    w,
    phase:      'prompt',
    isForgotDeck: true,
  }
}

const rateForgotWord = async (rating) => {
  const q = wordQuiz.value
  if (!q) return

  await saveWord(q.wordObj, rating)

  wordQuiz.value = { ...q, phase: 'done', lastRating: rating }

  setTimeout(async () => {
    wordQuiz.value = null

    if (rating === 1) {
      // Still forgot — rotate to back of forgotten deck
      const w = forgottenWords.value.splice(forgotDeckIdx.value, 1)[0]
      w._repsTotal = (w._repsTotal || 0) + 1
      if (w._repsTotal < 4) {
        forgottenWords.value.push(w)
      }
      // else hard cap — drop it
    } else {
      // Remembered — remove from forgot deck
      forgottenWords.value.splice(forgotDeckIdx.value, 1)
    }

    // Advance or finish
    if (forgottenWords.value.length === 0) {
      forgotDeckMode.value = false
    } else {
      forgotDeckIdx.value = forgotDeckIdx.value % forgottenWords.value.length
      openForgotCard(forgottenWords.value[forgotDeckIdx.value])
    }
  }, 700)
}

// ─── BOX / STABILITY UI HELPERS ───────────────────────────────────────────
const BOX_LABELS = ['','Just Learned','Short-Term','Reinforcing','Solidifying','Long-Term','Deep Memory','Mastered']
const BOX_COLORS = ['','#fbbf24','#f97316','#34d399','#60a5fa','#818cf8','#c084fc','#f43f5e']

// ─── DAILY FEED LOGIC ──────────────────────────────────────────────────────
const today = () => new Date().toDateString()

const loadFeed = () => {
  const t = today()
  if (localStorage.getItem('goalDate') === t) {
    wordsToday.value = parseInt(localStorage.getItem('dailyCount') || 0)
  } else {
    localStorage.setItem('goalDate', t)
    localStorage.setItem('dailyCount', 0)
    wordsToday.value = 0
  }
  const done = localStorage.getItem('completedItems_' + t)
  if (done) completedItems.value = new Set(JSON.parse(done))
  todaysFeed.value = props.discoveryItems || []
}

onMounted(loadFeed)
watch(() => props.discoveryItems, loadFeed)

const progressPct = computed(() =>
  Math.min(Math.round((wordsToday.value / dailyGoal) * 100), 100)
)

const markCompleted = (item) => {
  if (completedItems.value.has(item.id)) return
  completedItems.value.add(item.id)
  wordsToday.value += item.words?.length || 2
  localStorage.setItem('dailyCount', wordsToday.value)
  localStorage.setItem('completedItems_' + today(), JSON.stringify([...completedItems.value]))
  closeReader()
}

// ─── READER ────────────────────────────────────────────────────────────────
const openReader = (item) => {
  selectedItem.value = item
  document.body.style.overflow = 'hidden'
}

const closeReader = () => {
  selectedItem.value = null
  document.body.style.overflow = ''
  wordQuiz.value = null

  // Prompt forgot deck if any forgotten words accumulated
  if (forgottenWords.value.length > 0 && !forgotDeckMode.value) {
    setTimeout(startForgotDeck, 300)
  }
}

const deleteItem = async (id) => {
  if (!confirm('Remove this from your feed?')) return
  if (selectedItem.value?.id === id) closeReader()
  try {
    await deleteDoc(doc(db, 'discovery', id))
    emit('refresh')
  } catch (e) { console.error(e) }
}

const onAnswer = ({ key, option }) => {
  exerciseState.value = { ...exerciseState.value, [key]: option }
}

// Rating labels
const RATING_CONFIG = [
  { rating: 1, label: 'Forgot',  sub: 'Blackout',    cls: 'r1', icon: '✕' },
  { rating: 2, label: 'Hard',    sub: 'Barely got it', cls: 'r2', icon: '≈' },
  { rating: 3, label: 'Good',    sub: 'Remembered',  cls: 'r3', icon: '✓' },
  { rating: 4, label: 'Easy',    sub: 'Instant',     cls: 'r4', icon: '★' },
]
</script>

<template>
  <div class="dp" @click="wordQuiz && wordQuiz.phase === 'prompt' ? null : (wordQuiz = null)">

    <!-- FEED -->
    <div class="feed-wrap" :class="{ blurred: selectedItem }">
      <DailyGoalHeader
        :wordsToday="wordsToday"
        :dailyGoal="dailyGoal"
        :progressPct="progressPct"
      />

      <div class="feed-label">
        <span class="feed-dot"></span>
        Today's Selection
      </div>

      <div v-if="loading" class="shimmer-list">
        <div v-for="i in 3" :key="i" class="shimmer"></div>
      </div>
      <div v-else-if="todaysFeed.length === 0" class="empty">
        <span class="empty-icon">•</span>
        <p>No content today.<br>Check back tomorrow.</p>
      </div>
      <div v-else class="feed-list">
        <FeedCard
          v-for="item in todaysFeed" :key="item.id"
          :item="item" :completed="completedItems.has(item.id)"
          @open="openReader"
        />
      </div>

      <!-- Forgotten deck banner (shown on feed after reader closes) -->
      <Transition name="slide-down">
        <div v-if="forgottenWords.length > 0 && !forgotDeckMode && !selectedItem && !wordQuiz" class="forgot-banner">
          <div class="fb-left">
            <span class="fb-icon">🔁</span>
            <div>
              <div class="fb-title">{{ forgottenWords.length }} word{{ forgottenWords.length > 1 ? 's' : '' }} to revisit</div>
              <div class="fb-sub">You forgot these — quick review?</div>
            </div>
          </div>
          <button class="fb-btn" @click.stop="startForgotDeck">Review</button>
        </div>
      </Transition>
    </div>

    <!-- READER -->
    <Transition name="slide-up">
      <ItemReader
        v-if="selectedItem"
        :item="selectedItem"
        :completed="completedItems.has(selectedItem.id)"
        :libraryWords="libraryWords"
        :exerciseState="exerciseState"
        @close="closeReader"
        @delete="deleteItem"
        @complete="markCompleted"
        @answer="onAnswer"
        @wordTap="onWordTap"
      />
    </Transition>

    <!-- ═══════════════════════════════════════
         WORD QUIZ OVERLAY
    ════════════════════════════════════════ -->
    <Transition name="quiz-pop">
      <div
        v-if="wordQuiz"
        class="quiz-backdrop"
        @click.self="wordQuiz.phase !== 'prompt' ? closeQuiz() : null"
      >
        <div class="quiz-sheet" @click.stop>

          <!-- Box + stability pill -->
          <div class="quiz-meta">
            <span
              class="quiz-box-pill"
              :style="{ background: BOX_COLORS[wordQuiz.box] + '22', color: BOX_COLORS[wordQuiz.box] }"
            >
              {{ BOX_LABELS[wordQuiz.box] }}
            </span>
            <span class="quiz-stab">
              🧠 {{ wordQuiz.stability < 1 ? '&lt;1d' : Math.round(wordQuiz.stability) + 'd' }} stability
            </span>
            <button class="quiz-x" @click="closeQuiz">×</button>
          </div>

          <!-- ── PHASE: PROMPT ── -->
          <template v-if="wordQuiz.phase === 'prompt'">
            <div class="quiz-question">
              What does <span class="quiz-wordspan">"{{ wordQuiz.word }}"</span> mean?
            </div>
            <p class="quiz-think-hint">Think of the meaning, then reveal.</p>
            <div class="quiz-actions-single">
              <button class="reveal-btn" @click="showAnswer">
                <span>Show Answer</span>
                <span class="reveal-icon">↓</span>
              </button>
            </div>
          </template>

          <!-- ── PHASE: REVEAL ── -->
          <template v-else-if="wordQuiz.phase === 'reveal'">
            <div class="quiz-word-big">{{ wordQuiz.word }}</div>
            <div v-if="wordQuiz.pos" class="quiz-pos">{{ wordQuiz.pos }}</div>

            <div class="quiz-meanings">
              <p class="qm-primary">{{ wordQuiz.meaning }}</p>
              <p v-if="wordQuiz.urdu" class="qm-urdu urdu-font">{{ wordQuiz.urdu }}</p>
            </div>

            <div v-if="wordQuiz.scenario || wordQuiz.example" class="quiz-extra">
              <div v-if="wordQuiz.scenario" class="qe-block scene">
                <span class="qe-label">SCENARIO</span>
                <p class="qe-text">{{ wordQuiz.scenario }}</p>
              </div>
              <div v-if="wordQuiz.example" class="qe-block eg">
                <span class="qe-label">EXAMPLE</span>
                <p class="qe-text">{{ wordQuiz.example }}</p>
              </div>
            </div>

            <div v-if="wordQuiz.synonyms?.length" class="quiz-syns">
              <span class="syn-label">≈</span>
              <span v-for="s in wordQuiz.synonyms.slice(0,4)" :key="s" class="syn-pill">{{ s }}</span>
            </div>

            <div class="quiz-did-you">Did you actually know this?</div>

            <!-- 4-button rating -->
            <div class="quiz-ratings">
              <button
                v-for="cfg in RATING_CONFIG"
                :key="cfg.rating"
                class="qbtn"
                :class="cfg.cls"
                @click="wordQuiz.isForgotDeck ? rateForgotWord(cfg.rating) : rateWord(cfg.rating)"
              >
                <span class="qbtn-icon">{{ cfg.icon }}</span>
                <span class="qbtn-label">{{ cfg.label }}</span>
                <span class="qbtn-sub">{{ cfg.sub }}</span>
              </button>
            </div>
          </template>

          <!-- ── PHASE: DONE ── -->
          <template v-else-if="wordQuiz.phase === 'done'">
            <div class="quiz-done">
              <span class="qd-icon">
                {{ wordQuiz.lastRating >= 3 ? '✅' : wordQuiz.lastRating === 2 ? '🔶' : '🔁' }}
              </span>
              <p class="qd-msg">
                {{ wordQuiz.lastRating === 4 ? 'Perfect! Scheduled far ahead.' :
                   wordQuiz.lastRating === 3 ? 'Good. See you next review.' :
                   wordQuiz.lastRating === 2 ? 'Hard. Coming back soon.' :
                   'Added to revisit list.' }}
              </p>
            </div>
          </template>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;1,500&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');
* { box-sizing: border-box; }

.dp {
  min-height: 100vh; background: #f8fafc;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.feed-wrap {
  max-width: 500px; margin: 0 auto;
  padding: 20px 16px 100px;
  transition: filter 0.3s;
}
.feed-wrap.blurred { filter: blur(5px); pointer-events: none; }

.feed-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 2px; color: #94a3b8; margin-bottom: 14px;
}
.feed-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #16a34a;
  box-shadow: 0 0 6px rgba(22,163,74,0.5); animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.75)} }

.feed-list { display: flex; flex-direction: column; gap: 10px; }

.shimmer-list { display: flex; flex-direction: column; gap: 10px; }
.shimmer { height: 120px; border-radius: 20px; background: linear-gradient(90deg,#f1f5f9 25%,#e8edf2 50%,#f1f5f9 75%); background-size: 200% 100%; animation: shim 1.4s infinite; }
@keyframes shim { to { background-position: -200% 0; } }

.empty { text-align: center; padding: 48px 20px; background: white; border-radius: 20px; border: 1px dashed #e2e8f0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon { font-size: 2rem; color: #cbd5e1; }
.empty p { color: #94a3b8; font-size: 0.88rem; line-height: 1.6; margin: 0; }

/* ─── Forgot banner ─────────────────────────────── */
.forgot-banner {
  margin-top: 20px; background: white; border: 1px solid #fecaca;
  border-radius: 18px; padding: 14px 16px;
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 4px 16px -4px rgba(220,38,38,0.12);
}
.fb-left  { display: flex; align-items: center; gap: 10px; }
.fb-icon  { font-size: 1.4rem; }
.fb-title { font-size: 0.85rem; font-weight: 800; color: #0f172a; }
.fb-sub   { font-size: 0.72rem; color: #94a3b8; margin-top: 2px; }
.fb-btn   { padding: 9px 18px; background: #dc2626; color: white; border: none; border-radius: 12px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.8rem; font-weight: 800; cursor: pointer; }

/* ─── Quiz Backdrop ─────────────────────────────── */
.quiz-backdrop {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(15,23,42,0.55);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-end; justify-content: center;
}

.quiz-sheet {
  background: white;
  border-radius: 28px 28px 0 0;
  padding: 20px 20px 36px;
  width: 100%; max-width: 500px;
  max-height: 88vh; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex; flex-direction: column; gap: 14px;
}

/* Quiz meta row */
.quiz-meta {
  display: flex; align-items: center; gap: 8px;
}
.quiz-box-pill {
  font-size: 0.62rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 3px 10px; border-radius: 20px;
}
.quiz-stab {
  font-size: 0.62rem; font-weight: 700; color: #94a3b8;
}
.quiz-x {
  margin-left: auto; background: #f1f5f9; border: none; color: #64748b;
  font-size: 1rem; width: 28px; height: 28px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

/* ── Prompt phase ── */
.quiz-question {
  font-size: 1.25rem; font-weight: 800; color: #0f172a; line-height: 1.35;
}
.quiz-wordspan {
  font-family: 'Lora', serif; color: #818cf8;
  font-style: italic;
}
.quiz-think-hint { font-size: 0.78rem; color: #94a3b8; margin: 0; }
.quiz-actions-single { margin-top: 4px; }
.reveal-btn {
  width: 100%; padding: 16px; background: #0f172a; color: white;
  border: none; border-radius: 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 1rem; font-weight: 800; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  transition: transform 0.15s;
}
.reveal-btn:active { transform: scale(0.97); }
.reveal-icon { font-size: 1.1rem; }

/* ── Reveal phase ── */
.quiz-word-big { font-family: 'Lora', serif; font-size: 2rem; font-weight: 700; color: #0f172a; }
.quiz-pos { font-size: 0.68rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-top: -8px; }

.quiz-meanings { display: flex; flex-direction: column; gap: 5px; }
.qm-primary { font-size: 1rem; color: #334155; font-weight: 600; margin: 0; line-height: 1.4; }
.qm-urdu { font-family: 'Noto Nastaliq Urdu', serif; font-size: 1.1rem; color: #166534; margin: 0; }

.quiz-extra { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.qe-block { padding: 10px; border-radius: 12px; }
.qe-block.scene { background: #fff7ed; border: 1px solid #fed7aa; }
.qe-block.eg    { background: #eff6ff; border: 1px solid #bfdbfe; }
.qe-label { font-size: 0.55rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; }
.scene .qe-label { color: #9a3412; }
.eg    .qe-label { color: #1e40af; }
.qe-text { font-size: 0.75rem; color: #334155; margin: 4px 0 0; line-height: 1.4; }

.quiz-syns { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.syn-label { font-size: 0.75rem; color: #16a34a; font-weight: 800; }
.syn-pill  { font-size: 0.7rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 3px 10px; border-radius: 20px; font-weight: 600; }

.quiz-did-you {
  font-size: 0.78rem; font-weight: 800; color: #64748b;
  text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px;
}

/* 4-button rating row */
.quiz-ratings {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;
}
.qbtn {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 10px 4px; border: 1.5px solid transparent;
  border-radius: 14px; cursor: pointer;
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: transform 0.12s; background: transparent;
}
.qbtn:active { transform: scale(0.91); }
.qbtn-icon  { font-size: 1.1rem; line-height: 1; }
.qbtn-label { font-size: 0.72rem; font-weight: 800; }
.qbtn-sub   { font-size: 0.55rem; font-weight: 600; opacity: 0.7; }
.r1 { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.r2 { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.r3 { background: #f0fdf4; border-color: #86efac; color: #16a34a; }
.r4 { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }

/* ── Done phase ── */
.quiz-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0 8px; }
.qd-icon   { font-size: 2.6rem; }
.qd-msg    { font-size: 0.95rem; font-weight: 700; color: #334155; text-align: center; margin: 0; }

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
.slide-up-enter-from,   .slide-up-leave-to     { transform: translateY(100%); }

.quiz-pop-enter-active, .quiz-pop-leave-active { transition: opacity 0.25s, transform 0.3s cubic-bezier(0.16,1,0.3,1); }
.quiz-pop-enter-from   { opacity: 0; }
.quiz-pop-leave-to     { opacity: 0; }
.quiz-pop-enter-from .quiz-sheet { transform: translateY(60px); }

.slide-down-enter-active, .slide-down-leave-active { transition: opacity 0.3s, transform 0.3s; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
