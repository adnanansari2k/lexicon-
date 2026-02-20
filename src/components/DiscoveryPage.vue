<script setup>
import { ref, computed, onMounted } from 'vue'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import BottomNav from './BottomNav.vue'

const props = defineProps(['discoveryItems', 'loading', 'words', 'currentTab'])
const emit = defineEmits(['refresh', 'update:currentTab'])

const filter = ref('all')
const selectedItem = ref(null)
const wordsReviewedToday = ref(0)
const dailyGoal = 20

// --- FULL SCREEN READER LOGIC ---
const openItem = (item) => {
  selectedItem.value = item
  document.body.style.overflow = 'hidden' // Prevent background scroll
}

const closeItem = () => {
  selectedItem.value = null
  document.body.style.overflow = ''
}

const deleteItem = async (id) => {
  if (confirm("Delete this from your feed?")) {
    if (selectedItem.value?.id === id) closeItem()
    try {
      await deleteDoc(doc(db, 'discovery', id))
      emit('refresh')
    } catch (e) {
      console.error("Delete failed:", e)
    }
  }
}

// --- PROGRESS LOGIC ---
const getProgress = () => {
  const today = new Date().toDateString()
  if (localStorage.getItem('goalDate') === today) {
    wordsReviewedToday.value = parseInt(localStorage.getItem('dailyCount') || 0)
  } else {
    localStorage.setItem('goalDate', today)
    localStorage.setItem('dailyCount', 0)
    wordsReviewedToday.value = 0
  }
}

onMounted(() => getProgress())

const progressPercentage = computed(() => Math.min(Math.round((wordsReviewedToday.value / dailyGoal) * 100), 100))

const filteredItems = computed(() => {
  if (!props.discoveryItems) return []
  let items = props.discoveryItems
  if (filter.value !== 'all') {
    items = items.filter(item => item.type === filter.value)
  }
  return [...items].sort((a, b) => (b.date || 0) - (a.date || 0))
})

const getTypeIcon = (type) => {
  const map = { news: '📰', story: '📖', fact: '💡', lesson: '🎓' }
  return map[type] || '📄'
}

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="discovery-page">
    
    <div class="catalog-view" :class="{ 'blurred': selectedItem }">
      
      <div class="header-section">
        <div class="goal-card">
          <div class="goal-text">
            <h3>Daily Goal</h3>
            <p v-if="progressPercentage < 100">{{ dailyGoal - wordsReviewedToday }} words left</p>
            <p v-else class="done">Goal Reached! 🔥</p>
          </div>
          <div class="ring-box">
            <svg viewBox="0 0 36 36" class="ring">
              <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="ring-fill" :style="{ strokeDasharray: progressPercentage + ', 100' }" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <text x="18" y="20.5" class="ring-text">{{ progressPercentage }}%</text>
            </svg>
          </div>
        </div>

        <div class="filter-chips">
          <button v-for="t in ['all', 'story', 'lesson', 'fact']" :key="t" 
                  @click="filter = t" :class="{ active: filter === t }">
            {{ t.charAt(0).toUpperCase() + t.slice(1) }}
          </button>
        </div>
      </div>

      <div class="catalog-list">
        <div v-if="loading" class="loading-state">Loading your feed...</div>
        <div v-for="item in filteredItems" :key="item.id" class="catalog-item" @click="openItem(item)">
          <div class="item-icon">{{ getTypeIcon(item.type) }}</div>
          <div class="item-content">
            <h3 class="item-title">{{ item.title }}</h3>
            <span class="item-type">{{ item.type }}</span>
          </div>
          <div class="item-arrow">→</div>
        </div>
      </div>
      
      <BottomNav :currentTab="currentTab" @update:currentTab="$emit('update:currentTab', $event)" />
    </div>

    <Transition name="slide-up">
      <div v-if="selectedItem" class="full-screen-reader">
        
        <div class="reader-header">
          <button @click="closeItem" class="back-btn">← Back</button>
          <div class="reader-meta">
            <span class="reader-type">{{ getTypeIcon(selectedItem.type) }} {{ selectedItem.type }}</span>
            <span class="reader-date">{{ formatDate(selectedItem.date) }}</span>
          </div>
          <button @click="deleteItem(selectedItem.id)" class="delete-btn">🗑️</button>
        </div>
        
        <div class="reader-body">
          <h1 class="reader-title">{{ selectedItem.title }}</h1>
          
          <div v-if="selectedItem.sections" class="article-sections">
            <div v-for="(sec, idx) in selectedItem.sections" :key="idx" class="section-block" :class="sec.style">
              <h3 v-if="sec.heading" class="section-heading">{{ sec.heading }}</h3>
              
              <div v-if="sec.style === 'highlight'" class="highlight-box">
                <p v-for="p in sec.points" :key="p">{{ p }}</p>
              </div>

              <div v-if="sec.style === 'grid'" class="card-grid">
                <div v-for="card in sec.cards" :key="card.title" class="mini-card">
                  <strong>{{ card.title }}</strong>
                  <p>{{ card.text }}</p>
                </div>
              </div>

              <ul v-if="['list', 'steps'].includes(sec.style)" class="point-list">
                <li v-for="p in sec.points" :key="p">{{ p }}</li>
              </ul>

              <div v-if="sec.style === 'advice'" class="advice-block">
                <p v-for="p in sec.points" :key="p">{{ p }}</p>
              </div>

              <p v-if="!sec.style" class="plain-text">{{ sec.content }}</p>
            </div>
          </div>

          <p v-else class="reader-text">{{ selectedItem.content }}</p>
          
          <div v-if="selectedItem.footer" class="reader-footer">{{ selectedItem.footer }}</div>
        </div>
        
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;700&display=swap');

.discovery-page { min-height: 100vh; background: #f8fafc; font-family: 'Inter', sans-serif; }

/* CATALOG STYLES */
.catalog-view { padding: 20px 20px 100px; transition: filter 0.3s; }
.catalog-view.blurred { filter: blur(5px); pointer-events: none; }

.goal-card { background: white; border-radius: 20px; padding: 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
.goal-text h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }
.goal-text p { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
.done { color: #10b981 !important; font-weight: bold; }
.ring-box { width: 65px; height: 65px; }
.ring-bg { fill: none; stroke: #f1f5f9; stroke-width: 3; }
.ring-fill { fill: none; stroke: #10b981; stroke-width: 3; stroke-linecap: round; transition: 0.5s; }
.ring-text { fill: #1e293b; font-size: 8px; text-anchor: middle; font-weight: bold; }

.filter-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 15px; scrollbar-width: none; }
.filter-chips::-webkit-scrollbar { display: none; }
.filter-chips button { border: none; padding: 8px 18px; border-radius: 20px; background: white; color: #64748b; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; white-space: nowrap; }
.filter-chips button.active { background: #1e293b; color: white; border-color: #1e293b; }

.catalog-list { display: flex; flex-direction: column; gap: 10px; }
.catalog-item { display: flex; align-items: center; gap: 15px; background: white; padding: 15px; border-radius: 18px; border: 1px solid #f1f5f9; cursor: pointer; transition: 0.1s; }
.catalog-item:active { transform: scale(0.97); background: #f1f5f9; }
.item-icon { font-size: 1.4rem; background: #f8fafc; padding: 10px; border-radius: 12px; }
.item-content { flex: 1; }
.item-title { margin: 0 0 2px 0; font-size: 1.05rem; color: #1e293b; font-weight: 700; }
.item-type { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; }
.item-arrow { color: #cbd5e1; font-weight: bold; }

/* JOURNAL READER STYLES */
.full-screen-reader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: white; z-index: 200; overflow-y: auto; }
.reader-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #f1f5f9; position: sticky; top: 0; background: white; z-index: 10; }
.back-btn { background: none; border: none; font-weight: 700; color: #3b82f6; cursor: pointer; }
.delete-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; }
.reader-meta { text-align: center; }
.reader-type { display: block; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; }
.reader-date { font-size: 0.7rem; color: #cbd5e1; }

.reader-body { max-width: 680px; margin: 0 auto; padding: 40px 20px 100px; }
.reader-title { font-family: 'Playfair Display', serif; font-size: 2.2rem; line-height: 1.2; margin-bottom: 35px; color: #0f172a; font-weight: 800; }

/* SECTION STYLES */
.section-block { margin-bottom: 40px; }
.section-heading { font-size: 1.1rem; font-weight: 700; color: #334155; margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; display: flex; align-items: center; gap: 8px; }

.highlight-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 0 12px 12px 0; }
.highlight-box p { margin-bottom: 8px; color: #92400e; font-weight: 500; font-size: 0.95rem; }

.card-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 480px) { .card-grid { grid-template-columns: 1fr 1fr; } }
.mini-card { background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; }
.mini-card strong { display: block; margin-bottom: 4px; color: #1e293b; font-size: 0.95rem; }
.mini-card p { font-size: 0.85rem; color: #64748b; line-height: 1.4; }

.point-list { padding-left: 20px; color: #475569; line-height: 1.7; font-size: 1rem; }
.point-list li { margin-bottom: 10px; }

.advice-block { background: #1e293b; color: #f8fafc; padding: 25px; border-radius: 20px; }
.advice-block p { margin-bottom: 12px; font-weight: 500; opacity: 0.9; font-size: 0.95rem; }
.advice-block p:last-child { color: #38bdf8; font-weight: 800; font-size: 1.1rem; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; }

.reader-text, .plain-text { font-size: 1.1rem; line-height: 1.8; color: #334155; }
.reader-footer { margin-top: 40px; padding-top: 20px; border-top: 1px dashed #e2e8f0; font-size: 0.8rem; color: #94a3b8; font-style: italic; }

.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
</style>
