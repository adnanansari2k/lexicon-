<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  words: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

const selectedWord = ref(null)
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)
const activeFilter = ref('all')
const animatedTotal = ref(0)
const animatedLearning = ref(0)
const animatedLearned = ref(0)

// â”€â”€â”€ 13 INTERNAL â†’ 8 VISIBLE MASTERY SYSTEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MASTERY_LEVELS = [
  { label: 'New',         color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', internal: [0]      },
  { label: 'Learning',    color: '#fbbf24', bg: '#fffbeb', border: '#fde68a', internal: [1, 2]   },
  { label: 'Reinforcing', color: '#34d399', bg: '#f0fdf4', border: '#bbf7d0', internal: [3, 4]   },
  { label: 'Stabilizing', color: '#60a5fa', bg: '#eff6ff', border: '#bfdbfe', internal: [5, 6]   },
  { label: 'Strong',      color: '#818cf8', bg: '#f5f3ff', border: '#ddd6fe', internal: [7, 8]   },
  { label: 'Long-Term',   color: '#c084fc', bg: '#fdf4ff', border: '#e9d5ff', internal: [9, 10]  },
  { label: 'Mastered',    color: '#fb923c', bg: '#fff7ed', border: '#fed7aa', internal: [11]     },
  { label: 'Elite',       color: '#f43f5e', bg: '#fff1f2', border: '#fecdd3', internal: [12]     },
]

const iml = (w) => Math.min(w.mastery_level ?? w.masteryLevel ?? w.streak ?? 0, 12)
const getWordLevel = (w) => MASTERY_LEVELS.find(l => l.internal.includes(iml(w))) || MASTERY_LEVELS[0]

// â”€â”€â”€ STATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const totalWords    = computed(() => props.words.length)
const learningCount = computed(() => props.words.filter(w => iml(w) < 7).length)
const learnedCount  = computed(() => props.words.filter(w => iml(w) >= 7).length)
const progressPercent = computed(() => totalWords.value ? Math.round((learnedCount.value / totalWords.value) * 100) : 0)

const masteryBreakdown = computed(() =>
  MASTERY_LEVELS.map(level => ({
    ...level,
    count: props.words.filter(w => level.internal.includes(iml(w))).length
  }))
)

const maxPipelineCount = computed(() => Math.max(...masteryBreakdown.value.map(l => l.count), 1))

// â”€â”€â”€ ANIMATED COUNTERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const animateCounter = (to, setter, duration = 700) => {
  const steps = 35
  const step = to / steps
  let current = 0; let n = 0
  const t = setInterval(() => {
    n++; current += step
    setter(Math.min(Math.round(current), to))
    if (n >= steps) { setter(to); clearInterval(t) }
  }, duration / steps)
}

const runAnimations = () => {
  animateCounter(totalWords.value, v => animatedTotal.value = v)
  animateCounter(learningCount.value, v => animatedLearning.value = v)
  animateCounter(learnedCount.value, v => animatedLearned.value = v)
}

onMounted(() => setTimeout(runAnimations, 150))
watch(() => props.words.length, runAnimations)

// â”€â”€â”€ FILTER + GRID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const filteredWords = computed(() => {
  if (activeFilter.value === 'all') return props.words
  return props.words.filter(w => getWordLevel(w).label === activeFilter.value)
})
const displayWords = computed(() => filteredWords.value.slice(0, 60))

// â”€â”€â”€ CARD COLORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const cardColors = [
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#6b21a8' },
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95' },
  { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239' }
]
const getCardStyle = (i) => {
  const c = cardColors[i % cardColors.length]
  return { backgroundColor: c.bg, borderColor: c.border, color: c.text }
}

// â”€â”€â”€ EXPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const exportWords = () => {
  const data = props.words.map(w => ({
    word: w.word,
    simple_meaning: w.simple_meaning || w.meaning || '',
    urdu: w.urdu_meaning || w.meanings?.urdu || '',
    hindi: w.hindi_meaning || w.meanings?.hindi || '',
    synonyms: (w.synonyms || []).join(', '),
    antonyms: (w.antonyms || []).join(', '),
    mastery_level: iml(w),
    mastery_label: getWordLevel(w).label,
  }))
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'vocabulary.json'; a.click()
  URL.revokeObjectURL(url)
}

// â”€â”€â”€ DELETE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const deleteSelectedWord = async () => {
  if (!selectedWord.value) return
  isDeleting.value = true
  try {
    await deleteDoc(doc(db, 'words', selectedWord.value.id))
    showDeleteConfirm.value = false
    selectedWord.value = null
    emit('refresh')
  } catch (e) { console.error('Delete failed:', e) }
  finally { isDeleting.value = false }
}

// â”€â”€â”€ MODAL FIELD HELPERS (supports old + new schema) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const plainMeaning = (w) => w.simple_meaning || w.meanings?.en || w.meaning || ''
const urduMeaning  = (w) => w.urdu_meaning   || w.meanings?.urdu || ''
const hindiMeaning = (w) => w.hindi_meaning  || w.meanings?.hindi || ''
const scenarios    = (w) => Array.isArray(w.scenarios) ? w.scenarios : (w.scenario ? [w.scenario] : [])
const examples     = (w) => Array.isArray(w.examples) ? w.examples : (w.example_sentence ? [w.example_sentence] : [])
</script>

<template>
  <div class="lib">

    <!-- LOADING -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading your library...</p>
    </div>

    <div v-else class="content">

      <!-- â•â• HEADER â•â• -->
      <header class="lib-header">
        <div class="header-top">
          <div>
            <h1 class="main-title">Moin Library</h1>
            <p class="subtitle">Track your vocabulary mastery</p>
          </div>
          <button class="export-btn" @click="exportWords">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>

        <!-- Animated Stats -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-num">{{ animatedTotal }}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat-card learning-stat">
            <span class="stat-num">{{ animatedLearning }}</span>
            <span class="stat-label">In Progress</span>
          </div>
          <div class="stat-card learned-stat">
            <span class="stat-num">{{ animatedLearned }}</span>
            <span class="stat-label">Mastered</span>
          </div>
          <!-- Progress Ring -->
          <div class="stat-card ring-card">
            <div class="ring-wrap">
              <svg viewBox="0 0 36 36" class="ring-svg">
                <circle class="ring-bg" cx="18" cy="18" r="14"/>
                <circle
                  class="ring-fg"
                  cx="18" cy="18" r="14"
                  :style="{ strokeDasharray: progressPercent + ' 100' }"
                />
              </svg>
              <span class="ring-pct">{{ progressPercent }}%</span>
            </div>
            <span class="stat-label">Done</span>
          </div>
        </div>
      </header>

      <!-- â•â• MASTERY BREAKDOWN â•â• -->
      <section class="breakdown-section">
        <div class="section-header-row">
          <h2 class="section-title">Mastery Levels</h2>
        </div>
        <div class="breakdown-grid">
          <div
            v-for="level in masteryBreakdown"
            :key="level.label"
            class="bk-card"
            :class="{ 'bk-active': activeFilter === level.label }"
            :style="{ background: level.bg, borderColor: activeFilter === level.label ? level.color : level.border }"
            @click="activeFilter = activeFilter === level.label ? 'all' : level.label"
          >
            <span class="bk-dot" :style="{ background: level.color, boxShadow: level.count > 0 ? '0 0 6px ' + level.color + '88' : 'none' }"></span>
            <span class="bk-count" :style="{ color: level.color }">{{ level.count }}</span>
            <span class="bk-label">{{ level.label }}</span>
          </div>
        </div>
      </section>

      <!-- â•â• PIPELINE BAR CHART â•â• -->
      <section class="pipeline-section">
        <h2 class="section-title">Memory Pipeline</h2>
        <p class="section-subtitle">Words progressing through memory stages</p>

        <div class="bar-chart">
          <div
            v-for="level in masteryBreakdown"
            :key="'bar-' + level.label"
            class="bar-col"
            @click="activeFilter = activeFilter === level.label ? 'all' : level.label"
          >
            <span class="bar-val" :class="{ active: level.count > 0 }">{{ level.count }}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{
                  height: level.count === 0 ? '3px' : ((level.count / maxPipelineCount) * 100) + '%',
                  background: level.count === 0 ? '#f1f5f9' : level.color,
                  boxShadow: level.count > 0 ? '0 0 10px ' + level.color + '55' : 'none'
                }"
              ></div>
            </div>
            <span class="bar-lbl" :style="{ color: level.count > 0 ? level.color : '#cbd5e1' }">
              {{ level.label.slice(0, 3) }}
            </span>
            <span class="bar-pct">
              {{ totalWords > 0 ? Math.round((level.count / totalWords) * 100) : 0 }}%
            </span>
          </div>
        </div>
      </section>

      <!-- â•â• WORD GRID â•â• -->
      <section class="grid-section">
        <div class="section-header-row">
          <h2 class="section-title">{{ activeFilter === 'all' ? 'All Words' : activeFilter }}</h2>
          <div class="header-actions">
            <span class="count-badge">{{ displayWords.length }}</span>
            <button v-if="activeFilter !== 'all'" class="clear-btn" @click="activeFilter = 'all'">&times; Clear</button>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="filter-pills">
          <button class="fpill" :class="{ 'fp-active': activeFilter === 'all' }" @click="activeFilter = 'all'">All</button>
          <button
            v-for="level in masteryBreakdown.filter(l => l.count > 0)"
            :key="'fp-' + level.label"
            class="fpill"
            :class="{ 'fp-active': activeFilter === level.label }"
            :style="activeFilter === level.label ? { background: level.color + '22', borderColor: level.color, color: level.color } : {}"
            @click="activeFilter = activeFilter === level.label ? 'all' : level.label"
          >{{ level.label }}</button>
        </div>

        <div v-if="displayWords.length === 0" class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <p>No words in this level yet</p>
        </div>

        <div v-else class="word-grid">
          <div
            v-for="(word, index) in displayWords"
            :key="word.id"
            class="grid-card"
            :style="getCardStyle(index)"
            @click="selectedWord = word; showDeleteConfirm = false"
          >
            <div class="grid-badge" :style="{ background: getWordLevel(word).color + '20', color: getWordLevel(word).color }">
              {{ getWordLevel(word).label }}
            </div>
            <h3 class="grid-word">{{ word.word }}</h3>
            <p class="grid-urdu urdu-font" v-if="urduMeaning(word)">{{ urduMeaning(word) }}</p>
            <p class="grid-hindi" v-if="hindiMeaning(word)">{{ hindiMeaning(word) }}</p>
          </div>
        </div>
      </section>

    </div>

    <!-- â•â•â•â•â•â•â•â•â•â• MODAL â•â•â•â•â•â•â•â•â•â• -->
    <Transition name="fade-scale">
      <div v-if="selectedWord" class="modal-overlay" @click.self="selectedWord = null; showDeleteConfirm = false">
        <div class="modal-box">
          <button class="close-btn" @click="selectedWord = null; showDeleteConfirm = false">&times;</button>

          <div class="modal-scroll">

            <!-- Word header -->
            <div class="modal-head">
              <span
                class="modal-level-tag"
                :style="{ background: getWordLevel(selectedWord).bg, color: getWordLevel(selectedWord).color, borderColor: getWordLevel(selectedWord).border }"
              >{{ getWordLevel(selectedWord).label }}</span>
              <h1 class="modal-word">{{ selectedWord.word }}</h1>
              <span v-if="selectedWord.part_of_speech" class="modal-pos">{{ selectedWord.part_of_speech }}</span>
            </div>

            <!-- Meanings -->
            <div class="modal-meanings">
              <div v-if="plainMeaning(selectedWord)" class="m-chip m-en">
                <span class="m-flag">EN</span><span>{{ plainMeaning(selectedWord) }}</span>
              </div>
              <div v-if="urduMeaning(selectedWord)" class="m-chip m-ur">
                <span class="m-flag">UR</span><span class="urdu-font">{{ urduMeaning(selectedWord) }}</span>
              </div>
              <div v-if="hindiMeaning(selectedWord)" class="m-chip m-hi">
                <span class="m-flag">HI</span><span>{{ hindiMeaning(selectedWord) }}</span>
              </div>
            </div>

            <!-- Synonyms + Antonyms -->
            <div v-if="selectedWord.synonyms?.length || selectedWord.antonyms?.length" class="modal-block pill-block">
              <div v-if="selectedWord.synonyms?.length" class="pill-group">
                <span class="pill-lbl syn-lbl">Synonyms</span>
                <div class="pill-row">
                  <span v-for="s in selectedWord.synonyms" :key="s" class="pill syn-pill">{{ s }}</span>
                </div>
              </div>
              <div v-if="selectedWord.antonyms?.length" class="pill-group">
                <span class="pill-lbl ant-lbl">Antonyms</span>
                <div class="pill-row">
                  <span v-for="a in selectedWord.antonyms" :key="a" class="pill ant-pill">{{ a }}</span>
                </div>
              </div>
            </div>

            <!-- Focus point (legacy) -->
            <div v-if="selectedWord.focusPoint" class="focus-box">
              <span>ðŸ‘‰</span>
              <p>{{ selectedWord.focusPoint }}</p>
            </div>

            <!-- DELETE -->
            <template v-if="!showDeleteConfirm">
              <button class="delete-btn" @click="showDeleteConfirm = true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Delete Word
              </button>
            </template>
            <template v-else>
              <div class="confirm-box">
                <p>Permanently delete <strong>"{{ selectedWord.word }}"</strong>?</p>
                <div class="confirm-btns">
                  <button class="confirm-cancel" @click="showDeleteConfirm = false">Cancel</button>
                  <button class="confirm-delete" @click="deleteSelectedWord" :disabled="isDeleting">
                    {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
                  </button>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

* { box-sizing: border-box; }

.lib {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  min-height: 100%;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* â”€â”€ LOADING â”€â”€ */
.loading-state { height: 60vh; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #64748b; gap: 12px; }
.spinner { border: 3px solid #e2e8f0; border-top-color: #0f172a; border-radius: 50%; width: 36px; height: 36px; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* â”€â”€ HEADER â”€â”€ */
.lib-header { margin-bottom: 20px; }
.header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.main-title { font-size: 1.75rem; color: #0f172a; margin: 0 0 2px; font-weight: 800; letter-spacing: -0.5px; }
.subtitle { font-size: 0.82rem; color: #94a3b8; margin: 0; }

.export-btn {
  display: flex; align-items: center; gap: 5px;
  background: #f8fafc; border: 1px solid #e2e8f0; color: #475569;
  font-size: 0.72rem; font-weight: 700; padding: 7px 11px; border-radius: 10px;
  cursor: pointer; font-family: inherit; transition: background 0.15s; flex-shrink: 0;
}
.export-btn:hover { background: #f1f5f9; }

/* Stats */
.stats-row { display: flex; gap: 9px; }
.stat-card {
  flex: 1; background: white; padding: 13px 8px; border-radius: 16px;
  border: 1px solid #f1f5f9; box-shadow: 0 2px 10px -4px rgba(15,23,42,0.05);
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.learning-stat { background: #fff7ed; border-color: #ffedd5; }
.learned-stat  { background: #f0fdf4; border-color: #dcfce7; }
.stat-num { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1; }
.learning-stat .stat-num { color: #ea580c; }
.learned-stat .stat-num  { color: #16a34a; }
.stat-label { font-size: 0.6rem; text-transform: uppercase; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; text-align: center; }

/* Ring card */
.ring-card { background: white; border-color: #f1f5f9; }
.ring-wrap { position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; }
.ring-svg { width: 42px; height: 42px; transform: rotate(-90deg); }
.ring-bg  { fill: none; stroke: #f1f5f9; stroke-width: 4; stroke-dasharray: 100 100; }
.ring-fg  {
  fill: none; stroke: #6366f1; stroke-width: 4; stroke-linecap: round;
  stroke-dasharray: 0 100;
  transition: stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1);
}
.ring-pct {
  position: absolute; font-size: 0.56rem; font-weight: 800; color: #6366f1;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
}

/* â”€â”€ MASTERY BREAKDOWN â”€â”€ */
.breakdown-section { margin-bottom: 20px; }
.section-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-title { font-size: 1.05rem; color: #0f172a; margin: 0; font-weight: 800; }
.section-subtitle { font-size: 0.75rem; color: #94a3b8; margin: 2px 0 12px; }

.breakdown-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px;
}
.bk-card {
  border: 1.5px solid; border-radius: 14px; padding: 10px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
}
.bk-card:active { transform: scale(0.94); }
.bk-active { box-shadow: 0 0 0 2px var(--level-color, #6366f1); }
.bk-dot { width: 7px; height: 7px; border-radius: 50%; transition: box-shadow 0.3s; }
.bk-count { font-size: 1.15rem; font-weight: 800; line-height: 1; }
.bk-label { font-size: 0.54rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; text-align: center; line-height: 1.2; }

/* â”€â”€ PIPELINE â”€â”€ */
.pipeline-section {
  background: white; padding: 16px 14px 12px; border-radius: 20px;
  border: 1px solid #f1f5f9; box-shadow: 0 4px 20px -10px rgba(15,23,42,0.07);
  margin-bottom: 22px;
}
.bar-chart {
  display: flex; justify-content: space-between; align-items: flex-end;
  height: 130px; gap: 3px;
}
.bar-col {
  display: flex; flex-direction: column; align-items: center; flex: 1; gap: 4px;
  cursor: pointer;
}
.bar-val { font-size: 0.65rem; font-weight: 800; color: #e2e8f0; transition: color 0.3s; }
.bar-val.active { color: #334155; }
.bar-track {
  width: 100%; max-width: 26px; height: 80px; background: #f8fafc; border-radius: 6px;
  display: flex; align-items: flex-end; overflow: hidden; border: 1px solid #f1f5f9;
}
.bar-fill { width: 100%; border-radius: 6px; transition: height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1); }
.bar-lbl { font-size: 0.52rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
.bar-pct { font-size: 0.5rem; color: #cbd5e1; font-weight: 600; }

/* â”€â”€ GRID SECTION â”€â”€ */
.grid-section { }
.header-actions { display: flex; align-items: center; gap: 7px; }
.count-badge { background: #e2e8f0; color: #475569; padding: 3px 9px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; }
.clear-btn {
  background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
  font-size: 0.68rem; font-weight: 700; padding: 3px 9px; border-radius: 8px;
  cursor: pointer; font-family: inherit;
}

.filter-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.fpill {
  padding: 4px 11px; border-radius: 20px;
  background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;
  font-size: 0.7rem; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.fp-active { background: #0f172a; border-color: #0f172a; color: white; }

.word-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; }
.grid-card {
  padding: 13px 11px; border-radius: 16px; border-width: 1px; border-style: solid;
  cursor: pointer; display: flex; flex-direction: column; align-items: center;
  text-align: center; min-height: 90px; gap: 4px;
  transition: transform 0.12s;
}
.grid-card:active { transform: scale(0.95); }

.grid-badge {
  font-size: 0.5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px;
  padding: 2px 7px; border-radius: 6px;
}
.grid-word { margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.2; }
.grid-urdu { margin: 0; font-size: 0.9rem; opacity: 0.85; }
.grid-hindi { margin: 0; font-size: 0.7rem; opacity: 0.55; }
.urdu-font { font-family: 'Noto Nastaliq Urdu', serif; font-size: 0.95rem !important; }

.empty-state {
  text-align: center; padding: 32px 20px; color: #94a3b8;
  background: white; border-radius: 16px; border: 1px dashed #e2e8f0;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.empty-state p { margin: 0; font-size: 0.85rem; font-weight: 500; }

/* â”€â”€ MODAL â”€â”€ */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15,23,42,0.55); backdrop-filter: blur(6px);
  z-index: 100; display: flex; justify-content: center; align-items: center; padding: 18px;
}
.modal-box {
  background: #fafaf9; width: 100%; max-width: 450px; max-height: 90vh;
  border-radius: 24px; padding: 22px;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(0,0,0,0.18);
}
.close-btn {
  position: absolute; top: 14px; right: 14px;
  background: #f1f5f9; border: none; width: 30px; height: 30px;
  border-radius: 50%; font-size: 0.85rem; color: #475569; font-weight: bold;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; z-index: 2;
}
.close-btn:hover { background: #e2e8f0; }
.modal-scroll { overflow-y: auto; flex: 1; }

.modal-head { text-align: center; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; }
.modal-level-tag {
  display: inline-block; font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1px; padding: 3px 10px; border-radius: 20px; border: 1px solid;
  margin-bottom: 8px;
}
.modal-word { font-size: 2rem; color: #0f172a; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.5px; }
.modal-pos  { font-size: 0.7rem; color: #94a3b8; font-style: italic; }

/* Meanings */
.modal-meanings { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.m-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 11px; border: 1px solid;
  font-size: 0.85rem; font-weight: 500;
}
.m-flag {
  font-size: 0.5rem; font-weight: 800; letter-spacing: 0.5px;
  padding: 2px 5px; border-radius: 4px; background: rgba(0,0,0,0.07);
  flex-shrink: 0; min-width: 22px; text-align: center;
}
.m-en { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.m-ur { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.m-hi { background: #f8fafc; border-color: #e2e8f0; color: #475569; }

/* Blocks */
.modal-block { margin-bottom: 16px; }
.block-tag {
  display: block; font-size: 0.62rem; text-transform: uppercase; font-weight: 800;
  letter-spacing: 1px; margin-bottom: 8px; color: #9a3412;
}
.ex-tag { color: #1e40af; }

.scenario-block { background: linear-gradient(145deg, #fff7ed, #ffedd5); padding: 14px; border-radius: 14px; border: 1px solid #fed7aa; }
.scenario-text { font-family: 'Georgia', serif; font-size: 0.92rem; line-height: 1.65; color: #7c2d12; margin: 0 0 8px; }
.scenario-text:last-child { margin: 0; }

.ex-item { background: white; padding: 10px 13px; border-radius: 0 11px 11px 0; border-left: 3px solid #bfdbfe; color: #334155; font-size: 0.88rem; line-height: 1.5; margin-bottom: 7px; }
.ex-item:last-child { margin: 0; }

.pill-block { }
.pill-group { margin-bottom: 10px; }
.pill-group:last-child { margin: 0; }
.pill-lbl { display: block; font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
.syn-lbl { color: #16a34a; }
.ant-lbl { color: #dc2626; }
.pill-row { display: flex; flex-wrap: wrap; gap: 5px; }
.pill { padding: 3px 11px; border-radius: 20px; font-size: 0.76rem; font-weight: 600; }
.syn-pill { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.ant-pill { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

.focus-box {
  display: flex; gap: 10px; align-items: flex-start;
  background: white; padding: 11px 13px; border-radius: 11px; border: 1px solid #f1f5f9;
  margin-bottom: 14px; font-size: 0.85rem; color: #9a3412; font-weight: 600; line-height: 1.4;
}
.focus-box p { margin: 0; }

/* Delete */
.delete-btn {
  width: 100%; padding: 12px; margin-top: 8px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;
  color: #dc2626; font-size: 0.88rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-family: inherit; transition: background 0.15s;
}
.delete-btn:hover { background: #fee2e2; }

.confirm-box {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px;
  padding: 14px; margin-top: 8px;
}
.confirm-box p { font-size: 0.86rem; color: #7f1d1d; text-align: center; margin: 0 0 12px; font-weight: 600; }
.confirm-btns { display: flex; gap: 8px; }
.confirm-cancel {
  flex: 1; padding: 10px; border-radius: 10px;
  background: white; border: 1px solid #e2e8f0; color: #475569;
  font-size: 0.83rem; font-weight: 700; cursor: pointer; font-family: inherit;
}
.confirm-delete {
  flex: 1; padding: 10px; border-radius: 10px;
  background: #dc2626; border: none; color: white;
  font-size: 0.83rem; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.confirm-delete:hover { background: #b91c1c; }
.confirm-delete:disabled { opacity: 0.6; cursor: not-allowed; }
/* Transition */
.fade-scale-enter-active, .fade-scale-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform:scale(0.96)
}
</style>