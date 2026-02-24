<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import DailyGoalHeader from './discovery/DailyGoalHeader.vue'
import FeedCard        from './discovery/FeedCard.vue'
import ItemReader      from './discovery/ItemReader.vue'

const props = defineProps(['discoveryItems', 'loading', 'words', 'currentTab'])
const emit  = defineEmits(['refresh', 'update:currentTab'])

// ---------------- STATE ----------------
const selectedItem   = ref(null)
const wordsToday     = ref(0)
const dailyGoal      = 10
const todaysFeed     = ref([])
const exerciseState  = ref({})
const completedItems = ref(new Set())
const wordPopup      = ref(null)

// ---------------- UTIL ----------------
const today = () => new Date().toDateString()

const getRandomItem = (arr) => {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------------- DAILY FEED LOGIC ----------------
const loadFeed = () => {
  const t = today()

  // ---------- PROGRESS ----------
  if (localStorage.getItem('goalDate') === t) {
    wordsToday.value = parseInt(localStorage.getItem('dailyCount') || 0)
  } else {
    localStorage.setItem('goalDate', t)
    localStorage.setItem('dailyCount', 0)
    wordsToday.value = 0
  }

  const done = localStorage.getItem('completedItems_' + t)
  if (done) completedItems.value = new Set(JSON.parse(done))

  // ---------- FILTER BY DATE ----------
  const validItems = (props.discoveryItems || []).filter(item => {
    if (!item.availableFrom || !item.availableTo) return true
    const now = new Date()
    return new Date(item.availableFrom) <= now &&
           new Date(item.availableTo) >= now
  })

  const stories  = validItems.filter(i => i.type === 'story')
  const grammars = validItems.filter(i => i.type === 'grammar')

  // ---------- DAILY CACHE ----------
  const cachedDate = localStorage.getItem('discoveryFeedDate')
  const cachedIds  = JSON.parse(localStorage.getItem('discoveryFeed') || '[]')

  if (cachedDate === t && cachedIds.length) {
    todaysFeed.value = validItems.filter(i => cachedIds.includes(i.id))
  } else {
    const randomStory  = getRandomItem(stories)
    const randomGrammar = getRandomItem(grammars)

    const feed = []
    if (randomStory) feed.push(randomStory)
    if (randomGrammar) feed.push(randomGrammar)

    todaysFeed.value = feed

    localStorage.setItem('discoveryFeedDate', t)
    localStorage.setItem('discoveryFeed', JSON.stringify(feed.map(i => i.id)))
  }
}

onMounted(loadFeed)
watch(() => props.discoveryItems, loadFeed)

// ---------------- PROGRESS ----------------
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

// ---------------- READER ----------------
const openReader = (item) => {
  selectedItem.value = item
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = 'hidden'
  }
}

const closeReader = () => {
  selectedItem.value = null
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = ''
  }
  wordPopup.value = null
}

const deleteItem = async (id) => {
  if (!confirm('Remove this from your feed?')) return
  if (selectedItem.value?.id === id) closeReader()
  try {
    await deleteDoc(doc(db, 'discovery', id))
    emit('refresh')
  } catch (e) { console.error(e) }
}

// ---------------- EXERCISE ----------------
const onAnswer = ({ key, option }) => {
  exerciseState.value = { ...exerciseState.value, [key]: option }
}

// ---------------- WORD POPUP ----------------
const libraryWords = computed(() =>
  new Set(props.words?.map(w => w.word?.toLowerCase()) || [])
)

const onWordTap = (payload) => {
  if (!payload) { wordPopup.value = null; return }
  const found = props.words?.find(w => w.word?.toLowerCase() === payload.word.toLowerCase())
  if (!found) return
  wordPopup.value = {
    word:    payload.word,
    meaning: found.simple_meaning || found.meaning || '',
    urdu:    found.urdu_meaning || '',
  }
}
</script>

<template>
  <div class="dp" @click="wordPopup = null">

    <!-- ---------------- FEED ---------------- -->
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

      <!-- Loading -->
      <div v-if="loading" class="shimmer-list">
        <div v-for="i in 3" :key="i" class="shimmer"></div>
      </div>

      <!-- Empty -->
      <div v-else-if="todaysFeed.length === 0" class="empty">
        <span class="empty-icon">•</span>
        <p>No content today.<br>Check back tomorrow.</p>
      </div>

      <!-- Cards -->
      <div v-else class="feed-list">
        <FeedCard
          v-for="item in todaysFeed"
          :key="item.id"
          :item="item"
          :completed="completedItems.has(item.id)"
          @open="openReader"
        />
      </div>

    </div>

    <!-- ---------------- READER ---------------- -->
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

    <!-- ---------------- WORD POPUP ---------------- -->
    <Transition name="pop">
      <div v-if="wordPopup" class="word-popup" @click.stop>
        <span class="wp-word">{{ wordPopup.word }}</span>
        <p class="wp-meaning">{{ wordPopup.meaning }}</p>
        <p v-if="wordPopup.urdu" class="wp-urdu urdu-font">{{ wordPopup.urdu }}</p>
        <button class="wp-close" @click="wordPopup = null">×</button>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');

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

/* Label */
.feed-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 2px; color: #94a3b8; margin-bottom: 14px;
}
.feed-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #16a34a;
  box-shadow: 0 0 6px rgba(22,163,74,0.5);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.75); }
}

.feed-list { display: flex; flex-direction: column; gap: 10px; }

/* Shimmer */
.shimmer-list { display: flex; flex-direction: column; gap: 10px; }
.shimmer {
  height: 120px; border-radius: 20px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%);
  background-size: 200% 100%; animation: shim 1.4s infinite;
}
@keyframes shim { to { background-position: -200% 0; } }

/* Empty */
.empty {
  text-align: center; padding: 48px 20px;
  background: white; border-radius: 20px; border: 1px dashed #e2e8f0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.empty-icon { font-size: 2rem; color: #cbd5e1; }
.empty p    { color: #94a3b8; font-size: 0.88rem; line-height: 1.6; margin: 0; }

/* Word popup */
.word-popup {
  position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
  background: white; border: 1px solid #e2e8f0; border-radius: 16px;
  padding: 14px 16px 12px; width: calc(100% - 40px); max-width: 340px;
  z-index: 300; box-shadow: 0 16px 40px -8px rgba(15,23,42,0.15);
}
.wp-word    { font-size: 1.05rem; font-weight: 800; color: #0f172a; display: block; margin-bottom: 4px; }
.wp-meaning { font-size: 0.84rem; color: #475569; margin: 0 0 4px; line-height: 1.4; }
.wp-urdu    { font-size: 0.88rem; color: #166534; margin: 0; }
.urdu-font  { font-family: 'Noto Nastaliq Urdu', serif; }
.wp-close {
  position: absolute; top: 10px; right: 12px;
  background: #f1f5f9; border: none; color: #64748b;
  font-size: 0.85rem; cursor: pointer; padding: 2px 6px; border-radius: 5px;
}

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
.slide-up-enter-from,   .slide-up-leave-to     { transform: translateY(100%); }

.pop-enter-active, .pop-leave-active { transition: opacity 0.2s, transform 0.2s; }
.pop-enter-from,   .pop-leave-to     { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>