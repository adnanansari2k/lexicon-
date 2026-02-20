<script setup>
import { ref, computed } from 'vue'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  words: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

const selectedWord = ref(null)
const isDeleting = ref(false)

// --- TOP STATS LOGIC ---
const totalWords = computed(() => props.words.length)
const learningCount = computed(() => props.words.filter(w => !w.streak || w.streak === 0).length)
const learnedCount = computed(() => props.words.filter(w => w.streak > 0).length)

// --- PIPELINE LOGIC (BAR CHART) ---
// Calculates how many words are in each streak/level (0 to 6)
const pipelineCounts = computed(() => {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  props.words.forEach(w => {
    const streak = w.streak || 0
    const level = Math.min(streak, 6) // Max level is 6
    counts[level]++
  })
  return counts
})

// Calculate the maximum count to scale the bar chart heights dynamically
const maxPipelineCount = computed(() => {
  const max = Math.max(...pipelineCounts.value)
  return max === 0 ? 1 : max // Prevent division by zero
})

// --- LEARNING GRID LOGIC ---
const learningWords = computed(() => {
  return props.words
    .filter(w => !w.streak || w.streak === 0)
    .slice(0, 30)
})

const cardColors = [
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  { bg: '#fdf4ff', border: '#fbcfe8', text: '#831843' },
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95' },
  { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' }
]

const getCardStyle = (index) => {
  const color = cardColors[index % cardColors.length]
  return {
    backgroundColor: color.bg,
    borderColor: color.border,
    color: color.text
  }
}

// --- DELETE LOGIC ---
const deleteSelectedWord = async () => {
  if (!selectedWord.value) return
  
  const confirmDelete = confirm(`Are you sure you want to permanently delete "${selectedWord.value.word}"?`)
  if (!confirmDelete) return

  isDeleting.value = true
  try {
    await deleteDoc(doc(db, 'words', selectedWord.value.id))
    selectedWord.value = null // Close the modal
    emit('refresh') // Refresh the list from App.vue
  } catch (error) {
    console.error("Error deleting word:", error)
    alert("Failed to delete word.")
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="library-wrapper">
    
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading your library...</p>
    </div>

    <div v-else class="content-container">
      
      <header class="library-header">
        <h1 class="main-title">📚 Your Library</h1>
        <p class="subtitle">Track your vocabulary mastery.</p>
        
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-num">{{ totalWords }}</span>
            <span class="stat-label">All Words</span>
          </div>
          <div class="stat-card learning-stat">
            <span class="stat-num">{{ learningCount }}</span>
            <span class="stat-label">Learning</span>
          </div>
          <div class="stat-card learned-stat">
            <span class="stat-num">{{ learnedCount }}</span>
            <span class="stat-label">Learned</span>
          </div>
        </div>
      </header>

      <section class="pipeline-section">
        <h2 class="section-title">Memory Pipeline</h2>
        <p class="section-subtitle">Words moving into long-term memory.</p>
        
        <div class="bar-chart">
          <div v-for="(count, level) in pipelineCounts" :key="level" class="bar-column">
            <span class="bar-value" :class="{ 'active': count > 0 }">{{ count }}</span>
            
            <div class="bar-track">
              <div 
                class="bar-fill" 
                :class="'level-' + level"
                :style="{ height: count === 0 ? '4px' : ((count / maxPipelineCount) * 100) + '%' }"
              ></div>
            </div>
            
            <span class="bar-label">L{{ level }}</span>
          </div>
        </div>
      </section>

      <section class="learning-section">
        <div class="section-header">
          <h2 class="section-title">Currently Learning</h2>
          <span class="count-badge">{{ learningWords.length }} / 30</span>
        </div>
        
        <div v-if="learningWords.length === 0" class="empty-state">
          You have mastered everything for now. Add new words to start learning!
        </div>

        <div v-else class="word-grid">
          <div 
            v-for="(word, index) in learningWords" 
            :key="word.id" 
            class="grid-card"
            :style="getCardStyle(index)"
            @click="selectedWord = word"
          >
            <h3 class="grid-word">{{ word.word }}</h3>
            <p class="grid-meaning urdu-font">{{ word.meanings?.urdu }}</p>
          </div>
        </div>
      </section>

    </div>

    <Transition name="fade-scale">
      <div v-if="selectedWord" class="modal-overlay" @click.self="selectedWord = null">
        <div class="modal-content modern-card">
          
          <button class="close-btn" @click="selectedWord = null">✕</button>

          <div class="modal-scroll">
            <h1 class="target-word">{{ selectedWord.word }}</h1>
            
            <div class="meaning-row">
              <div class="meaning-item urdu-box">
                <span>{{ selectedWord.meanings?.urdu }}</span>
              </div>
              <div class="meaning-item hindi-box">
                <span>{{ selectedWord.meanings?.hindi }}</span>
              </div>
            </div>

            <div v-if="selectedWord.scenario" class="scenario-section">
              <span class="scenario-label">Scenario</span>
              <div class="scenario-text">"{{ selectedWord.scenario }}"</div>
              
              <div v-if="selectedWord.focusPoint" class="focus-box">
                <span class="focus-icon">👉</span>
                <p class="focus-text">{{ selectedWord.focusPoint }}</p>
              </div>
            </div>

            <div v-if="selectedWord.examples?.length" class="examples-list">
              <span class="examples-label">Examples</span>
              <div v-for="(ex, i) in selectedWord.examples" :key="i" class="ex-item">
                {{ ex }}
              </div>
            </div>

            <div v-if="selectedWord.synonyms?.length" class="synonym-row">
              <span v-for="syn in selectedWord.synonyms" :key="syn" class="pill">{{ syn }}</span>
            </div>

            <button 
              class="delete-btn" 
              @click="deleteSelectedWord" 
              :disabled="isDeleting"
            >
              {{ isDeleting ? 'Deleting...' : '🗑️ Delete Word' }}
            </button>

          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.library-wrapper {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  min-height: 100%;
}

/* TOP HEADER & STATS */
.library-header { margin-bottom: 24px; text-align: center; }
.main-title { font-size: 1.8rem; color: #0f172a; margin: 0 0 4px 0; font-weight: 800; letter-spacing: -0.5px; }
.subtitle { font-size: 0.95rem; color: #64748b; margin: 0 0 20px 0; }

.stats-row { display: flex; gap: 12px; justify-content: space-between; }
.stat-card { 
  flex: 1; background: white; padding: 16px 12px; border-radius: 16px; 
  box-shadow: 0 4px 15px -5px rgba(15, 23, 42, 0.05); border: 1px solid #f1f5f9; 
  display: flex; flex-direction: column; align-items: center; 
}
.learning-stat { background: #fff7ed; border-color: #ffedd5; }
.learned-stat { background: #f0fdf4; border-color: #dcfce3; }
.stat-num { font-size: 1.6rem; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
.learning-stat .stat-num { color: #ea580c; }
.learned-stat .stat-num { color: #16a34a; }
.stat-label { font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px; }

/* TYPOGRAPHY & SECTION HEADERS */
.section-title { font-size: 1.3rem; color: #0f172a; margin: 0; font-weight: 800; }
.section-subtitle { font-size: 0.85rem; color: #64748b; margin: 4px 0 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.count-badge { background: #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; }

/* 2. PIPELINE BAR CHART */
.pipeline-section {
  background: white; padding: 20px 16px; border-radius: 20px;
  box-shadow: 0 4px 20px -10px rgba(15, 23, 42, 0.08); margin-bottom: 24px; border: 1px solid #f1f5f9;
}
.bar-chart {
  display: flex; justify-content: space-between; align-items: flex-end; 
  height: 140px; margin-top: 10px; padding: 0 5px;
}
.bar-column {
  display: flex; flex-direction: column; align-items: center; flex: 1; gap: 6px;
}
.bar-value {
  font-size: 0.85rem; font-weight: 800; color: #cbd5e1; transition: color 0.3s ease;
}
.bar-value.active { color: #475569; }
.bar-track {
  width: 28px; height: 90px; background: #f1f5f9; border-radius: 8px;
  display: flex; align-items: flex-end; overflow: hidden;
}
.bar-fill {
  width: 100%; border-radius: 8px; transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
/* Level Colors for Bar Chart */
.level-0 { background: #f97316; } 
.level-1 { background: #f59e0b; }
.level-2 { background: #eab308; }
.level-3 { background: #84cc16; }
.level-4 { background: #22c55e; }
.level-5 { background: #10b981; }
.level-6 { background: #14b8a6; } 

.bar-label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; }

/* 3. LEARNING GRID */
.word-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.grid-card {
  padding: 16px; border-radius: 16px; border-width: 1px; border-style: solid; cursor: pointer;
  display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease; min-height: 100px;
}
.grid-card:active { transform: scale(0.96); }
.grid-word { margin: 0 0 6px 0; font-size: 1.1rem; font-weight: 800; }
.grid-meaning { margin: 0; font-size: 0.95rem; opacity: 0.9; }
.urdu-font { font-family: 'Noto Nastaliq Urdu'; font-size: 1.2rem; }
.empty-state { text-align: center; padding: 30px; color: #64748b; background: white; border-radius: 16px; border: 1px dashed #cbd5e1; }

/* 4. CENTERED MODAL DESIGN */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
  background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
  z-index: 100; display: flex; justify-content: center; align-items: center; /* Centered */
  padding: 20px;
}
.modal-content {
  background: #fafaf9; width: 100%; max-width: 450px; max-height: 85vh; 
  border-radius: 24px; /* Fully rounded corners */
  padding: 24px; position: relative; display: flex; flex-direction: column; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.15);
}
.close-btn { 
  position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; 
  width: 32px; height: 32px; border-radius: 50%; font-size: 1rem; color: #475569; 
  font-weight: bold; cursor: pointer; z-index: 10; transition: background 0.2s;
}
.close-btn:hover { background: #e2e8f0; }
.modal-scroll { overflow-y: auto; padding-bottom: 10px; }

/* Word Details */
.target-word { font-size: 2.2rem; color: #0f172a; margin: 0 0 16px 0; font-weight: 800; text-align: center; }
.meaning-row { display: flex; justify-content: center; gap: 8px; margin-bottom: 24px; }
.meaning-item { padding: 8px 16px; border-radius: 12px; }
.urdu-box { background: #f0fdf4; border: 1px solid #bbf7d0; font-family: 'Noto Nastaliq Urdu'; font-size: 1.2rem; color: #166534; }
.hindi-box { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; font-weight: 500; }

.scenario-section { background: linear-gradient(145deg, #fff7ed 0%, #ffedd5 100%); padding: 20px; border-radius: 16px; border: 1px solid #fed7aa; margin-bottom: 24px; }
.scenario-label, .examples-label { display: block; font-size: 0.75rem; text-transform: uppercase; font-weight: 800; color: #9a3412; margin-bottom: 8px; letter-spacing: 1px; }
.scenario-text { font-family: 'Georgia', serif; font-size: 1.05rem; line-height: 1.6; color: #7c2d12; margin-bottom: 16px; }

.focus-box { display: flex; gap: 12px; align-items: flex-start; background: rgba(255,255,255,0.85); padding: 14px; border-radius: 12px; }
.focus-icon { font-size: 1.2rem; margin-top: -2px; }
.focus-text { font-size: 0.9rem; color: #9a3412; font-weight: 600; margin: 0; line-height: 1.4; }

.examples-label { color: #64748b; margin-top: 10px; }
.examples-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.ex-item { background: white; padding: 14px; border-radius: 0 12px 12px 0; color: #334155; font-size: 0.95rem; border-left: 4px solid #cbd5e1; line-height: 1.5; }

.synonym-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 24px;}
.pill { background: white; border: 1px solid #e2e8f0; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; color: #64748b; font-weight: 600; }

/* DELETE BUTTON */
.delete-btn {
  width: 100%; padding: 14px; margin-top: 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;
  color: #dc2626; font-size: 1rem; font-weight: bold; cursor: pointer;
  transition: all 0.2s ease;
}
.delete-btn:hover { background: #fee2e2; }
.delete-btn:active { transform: scale(0.98); }
.delete-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Modal Transition */
.fade-scale-enter-active, .fade-scale-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.95); }

/* Loading State */
.loading-state { height: 60vh; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #64748b; }
.spinner { border: 4px solid #e2e8f0; border-top: 4px solid #0f172a; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 16px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
