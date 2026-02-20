<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// 🚨 THESE IMPORTS FIX YOUR ERROR 🚨
import ReviewCard from './ReviewCard.vue'
import ReinforcementCard from './ReinforcementCard.vue'
import QuizCard from './QuizCard.vue'

const props = defineProps(['words'])
const emit = defineEmits(['refresh', 'update:currentTab'])

// --- STATE ---
const mode = ref('review') // 'review' | 'reinforcement' | 'finished'
const reviewQueue = ref([])
const reinforcementQueue = ref([]) 
const currentIndex = ref(0) 
const dailyGoal = 20
const TARGET_REPS = 5 // User must remember the word 5 times!
const INTERVALS = [1, 3, 7, 14, 30, 60]

// --- QUEUE BUILDING ---
const buildQueue = () => {
  mode.value = 'review'
  currentIndex.value = 0
  reviewQueue.value = []
  reinforcementQueue.value = []

  if (!props.words?.length) { mode.value = 'finished'; return }

  const now = Date.now()
  const due = props.words.filter(w => w.nextReview && w.nextReview <= now)
  const newWords = props.words.filter(w => !w.nextReview).slice(0, Math.max(0, dailyGoal - due.length))
  
  reviewQueue.value = [...due, ...newWords]
  if (reviewQueue.value.length === 0) mode.value = 'finished'
}

onMounted(buildQueue)
watch(() => props.words, buildQueue, { deep: true })

// --- COMPUTE CURRENT WORD ---
const currentWord = computed(() => {
  if (mode.value === 'review') {
    return reviewQueue.value[currentIndex.value]
  } else {
    // In Reinforcement, we ALWAYS look at the front of the queue
    return reinforcementQueue.value[0]
  }
})

// --- LOGIC: STANDARD REVIEW ---
const handleReviewResult = (result) => {
  const word = currentWord.value

  if (mode.value === 'review') {
    if (result === 'remember') {
      const newStreak = (word.streak || 0) + 1
      const newInterval = INTERVALS[Math.min(newStreak - 1, INTERVALS.length - 1)]
      saveToFirebase(word.id, newStreak, newInterval)
      nextReviewCard()
    } else {
      reinforcementQueue.value.push({ ...word, drillStep: 0, repsCompleted: 0 })
      nextReviewCard()
    }
  } else {
    // Repetition / Drill Mode (ReviewCard Steps)
    if (result === 'remember') {
      advanceDrillStep()
    } else {
      resetDrillStep()
    }
  }
}

// --- LOGIC: REINFORCEMENT DRILL ---
const handleStudyComplete = () => advanceDrillStep()

const handleQuizResult = (isCorrect) => {
  if (isCorrect) advanceDrillStep()
  else {
    alert("Incorrect. Back to study.")
    resetDrillStep()
  }
}

const advanceDrillStep = async () => {
  const word = reinforcementQueue.value[0]

  if (word.drillStep < 3) {
    word.drillStep++
  } else {
    // PHASE 2: The 5-Repetition Loop
    word.repsCompleted = (word.repsCompleted || 0) + 1

    if (word.repsCompleted >= TARGET_REPS) {
      // 🎓 GRADUATE! 
      await saveToFirebase(word.id, 0, 1) 
      reinforcementQueue.value.shift() 
    } else {
      // Move word to the BACK of the queue to space out the repetition
      const movedWord = reinforcementQueue.value.shift()
      reinforcementQueue.value.push(movedWord)
    }

    if (reinforcementQueue.value.length === 0) {
      mode.value = 'finished'
    }
  }
}

const resetDrillStep = () => {
  const word = reinforcementQueue.value[0]
  word.drillStep = 0 
  word.repsCompleted = 0 
  
  // Move to back of queue
  const movedWord = reinforcementQueue.value.shift()
  reinforcementQueue.value.push(movedWord)
}

// --- NAVIGATION ---
const nextReviewCard = () => {
  if (currentIndex.value < reviewQueue.value.length - 1) {
    currentIndex.value++
  } else {
    if (reinforcementQueue.value.length > 0) {
      mode.value = 'reinforcement'
    } else {
      mode.value = 'finished'
    }
  }
}

const returnToLibrary = () => {
  emit('refresh') 
  emit('update:currentTab', 'library') 
}

const saveToFirebase = async (id, streak, interval) => {
  try {
    const nextDate = Date.now() + (interval * 24 * 60 * 60 * 1000)
    await updateDoc(doc(db, "words", id), {
      streak,
      interval,
      nextReview: nextDate,
      lastReviewed: Date.now()
    })
  } catch (e) { console.error("Save failed", e) }
}
</script>

<template>
  <div class="game-wrapper">
    
    <div v-if="mode !== 'finished'" class="modern-header">
      <div class="badge" :class="mode">
        {{ mode === 'review' ? '🧠 Review Mode' : '🔥 Deep Drill' }}
      </div>
      
      <div v-if="mode === 'reinforcement'" class="drill-progress">
        <template v-if="currentWord.drillStep < 3">
          <span :class="{ active: currentWord.drillStep >= 0 }">Study</span>
          <div class="dot"></div>
          <span :class="{ active: currentWord.drillStep >= 1 }">Recall</span>
          <div class="dot"></div>
          <span :class="{ active: currentWord.drillStep >= 2 }">Match</span>
        </template>
        <template v-else>
          <div class="rep-pill">
            <span class="pulse-dot"></span> Repetition: {{ currentWord.repsCompleted || 0 }} / {{ TARGET_REPS }}
          </div>
        </template>
      </div>
    </div>

    <div class="card-area">
      
      <ReviewCard 
        v-if="mode === 'review' && currentWord"
        :word="currentWord"
        @result="handleReviewResult"
      />

      <template v-else-if="mode === 'reinforcement' && currentWord">
        <ReinforcementCard
          v-if="currentWord.drillStep === 0"
          :word="currentWord"
          @complete="handleStudyComplete"
        />
        <ReviewCard
          v-else-if="currentWord.drillStep === 1 || currentWord.drillStep === 3"
          :word="currentWord"
          @result="handleReviewResult"
        />
        <QuizCard 
          v-else-if="currentWord.drillStep === 2"
          :word="currentWord"
          :allWords="props.words"
          @result="handleQuizResult"
        />
      </template>

      <div v-else-if="mode === 'finished'" class="success-state">
        <div class="success-bg"></div>
        <div class="icon-container">
          <span class="icon">🧘</span>
        </div>
        <h2>Session Complete</h2>
        <p>Your mind is stronger today.</p>
        <button @click="returnToLibrary" class="success-btn">Return to Library</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* REDUCED PADDING = WIDER CARD ON MOBILE */
.game-wrapper { 
  height: calc(100vh - 100px);
  display: flex; 
  flex-direction: column; 
  padding: 8px 12px;
  max-width: 500px; 
  margin: 0 auto; 
}

/* SLEEK TOP HEADER */
.modern-header { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  margin-bottom: 12px; 
  flex-shrink: 0; 
  gap: 8px; 
}
.badge { 
  background: white; 
  padding: 6px 14px; 
  border-radius: 20px; 
  font-size: 0.75rem; 
  font-weight: 800; 
  color: #475569; 
  text-transform: uppercase; 
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #f1f5f9;
}
.badge.reinforcement { background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; }

/* PROGRESS INDICATOR */
.drill-progress { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  font-size: 0.65rem; 
  color: #cbd5e1; 
  font-weight: 700; 
  text-transform: uppercase; 
  letter-spacing: 0.5px; 
}
.drill-progress span { transition: color 0.3s; }
.drill-progress span.active { color: #ea580c; }
.dot { width: 4px; height: 4px; border-radius: 50%; background: #e2e8f0; }

.rep-pill { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  background: #ffedd5; 
  color: #c2410c; 
  padding: 6px 12px; 
  border-radius: 12px; 
  font-size: 0.75rem; 
}
.pulse-dot { width: 6px; height: 6px; background: #ea580c; border-radius: 50%; animation: pulse 1.5s infinite; }

.card-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }

/* 🌟 NEW SUCCESS STATE */
.success-state { 
  position: relative;
  text-align: center; 
  padding: 40px 20px; 
  background: white; 
  border-radius: 24px; 
  box-shadow: 0 10px 40px -10px rgba(15, 23, 42, 0.1); 
  height: 100%; 
  display: flex; 
  flex-direction: column; 
  justify-content: center; 
  align-items: center; 
  overflow: hidden;
  border: 1px solid #f1f5f9;
}
.success-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at top, #f0fdf4 0%, transparent 60%);
  opacity: 0.7;
  z-index: 0;
}
.icon-container {
  background: white;
  width: 80px; height: 80px;
  border-radius: 50%;
  display: flex; justify-content: center; align-items: center;
  box-shadow: 0 8px 24px rgba(21, 128, 61, 0.15);
  margin-bottom: 24px;
  z-index: 1;
}
.icon { font-size: 3rem; }
.success-state h2 { margin: 0 0 8px 0; color: #0f172a; font-size: 1.8rem; font-weight: 800; z-index: 1;}
.success-state p { margin: 0; color: #64748b; font-size: 1.05rem; z-index: 1; }

.success-btn { 
  margin-top: 40px; 
  padding: 16px 40px; 
  background: #0f172a; 
  color: white; 
  border: none; 
  border-radius: 16px; 
  font-weight: bold; 
  font-size: 1.05rem; 
  cursor: pointer; 
  box-shadow: 0 8px 20px -6px rgba(15, 23, 42, 0.3);
  z-index: 1;
  transition: transform 0.2s;
}
.success-btn:active { transform: scale(0.96); }

@keyframes pulse { 0% { opacity: 1; box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); } 70% { opacity: 0.5; box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); } 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); } }
</style>
