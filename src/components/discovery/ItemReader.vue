<script setup>
import SectionRenderer from './SectionRenderer.vue'

const props = defineProps({
  item:          { type: Object,  required: true },
  completed:     { type: Boolean, default: false },
  libraryWords:  { type: Set,     default: () => new Set() },
  exerciseState: { type: Object,  default: () => ({}) },
})
const emit = defineEmits(['close', 'delete', 'complete', 'answer', 'wordTap'])

const TYPE = {
  grammar: { label: 'Grammar', color: '#6366f1', bg: '#eef2ff', icon: '' },
  story:   { label: 'Story',   color: '#16a34a', bg: '#f0fdf4', icon: '&#10022' },
  lesson:  { label: 'Lesson',  color: '#d97706', bg: '#fffbeb', icon: '&#10022' },
  fact:    { label: 'Fact',    color: '#ea580c', bg: '#fff7ed', icon: '&#10022' },
}
const t = (type) => TYPE[type] || { label: type, color: '#64748b', bg: '#f8fafc', icon: '&#10022' }

const formatDate = (str) => {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="reader" @click="$emit('wordTap', null)">

    <!-- Nav bar -->
    <div class="nav">
      <button class="back-btn" @click.stop="$emit('close')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back
      </button>

      <div class="type-chip" :style="{ background: t(item.type).bg, color: t(item.type).color }">
        {{ t(item.type).icon }} {{ t(item.type).label }}
      </div>

      <button class="del-btn" @click.stop="$emit('delete', item.id)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>

    <!-- Body -->
    <div class="body">

      <!-- Title area -->
      <div class="title-area">
        <div class="chips-row">
          <span v-if="item.level" class="level-chip">{{ item.level }}</span>
          <span class="date-chip">{{ formatDate(item.dateAdded) }}</span>
        </div>

        <h1 class="reader-title">{{ item.title }}</h1>

        <div v-if="item.words?.length" class="word-chips">
          <span
            v-for="w in item.words" :key="w"
            class="wchip"
            :class="{ 'wchip-lib': libraryWords.has(w.toLowerCase()) }"
          >{{ w }}</span>
        </div>
      </div>

      <!-- Sections -->
      <div class="sections">
        <SectionRenderer
          v-for="(sec, idx) in item.sections"
          :key="idx"
          :section="sec"
          :itemId="item.id"
          :itemWords="item.words || []"
          :exerciseState="exerciseState"
          @answer="$emit('answer', $event)"
          @wordTap="$emit('wordTap', $event)"
        />
      </div>

      <!-- Footer -->
      <div v-if="item.footer" class="footer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        {{ item.footer }}
      </div>

      <!-- Mark complete -->
      <div class="complete-row">
        <button
          class="complete-btn"
          :class="{ done: completed }"
          @click.stop="$emit('complete', item)"
        >
          <template v-if="completed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
            Completed
          </template>
          <template v-else>
            Mark as Complete
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </template>
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

* { box-sizing: border-box; }

.reader {
  position: fixed; inset: 0;
  background: #fafaf9; z-index: 200; overflow-y: auto;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* Nav */
.nav {
  display: flex; justify-content: space-between; align-items: center;
  padding: 13px 16px; position: sticky; top: 0; z-index: 10;
  background: rgba(250,250,249,0.95); backdrop-filter: blur(10px);
  border-bottom: 1px solid #f1f5f9;
}
.back-btn {
  display: flex; align-items: center; gap: 6px;
  background: #f8fafc; border: 1px solid #e2e8f0; color: #475569;
  padding: 7px 12px; border-radius: 10px;
  font-size: 0.75rem; font-weight: 700; cursor: pointer;
  font-family: inherit; transition: background 0.12s;
}
.back-btn:hover { background: #f1f5f9; }

.type-chip {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  padding: 5px 12px; border-radius: 20px;
}
.del-btn {
  background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
  padding: 7px; border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

/* Body */
.body { max-width: 600px; margin: 0 auto; padding: 26px 18px 100px; }

.title-area { margin-bottom: 28px; }

.chips-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.level-chip {
  background: #fffbeb; color: #d97706; border: 1px solid #fde68a;
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
  padding: 3px 9px; border-radius: 7px;
}
.date-chip { font-size: 0.68rem; color: #94a3b8; }

.reader-title {
  font-family: 'Lora', serif;
  font-size: clamp(1.5rem, 6vw, 2.1rem);
  font-weight: 700; color: #0f172a; margin: 0 0 14px;
  line-height: 1.2; letter-spacing: -0.3px;
}

.word-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.wchip {
  padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600;
  background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;
}
.wchip-lib { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }

/* Sections */
.sections { display: flex; flex-direction: column; gap: 24px; }

/* Footer */
.footer {
  display: flex; align-items: flex-start; gap: 8px;
  margin-top: 32px; padding: 14px 16px;
  background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 13px;
  font-size: 0.8rem; color: #94a3b8; font-style: italic; line-height: 1.6;
}
.footer svg { flex-shrink: 0; color: #fbbf24; margin-top: 2px; }

/* Complete */
.complete-row { margin-top: 26px; display: flex; justify-content: center; }
.complete-btn {
  display: flex; align-items: center; gap: 8px;
  background: #0f172a; border: none; color: white;
  padding: 13px 30px; border-radius: 14px;
  font-family: inherit; font-size: 0.88rem; font-weight: 800;
  cursor: pointer; letter-spacing: 0.3px;
  box-shadow: 0 8px 20px -6px rgba(15,23,42,0.25);
  transition: transform 0.12s;
}
.complete-btn:active { transform: scale(0.96); }
.complete-btn.done {
  background: #f0fdf4; border: 1px solid #86efac; color: #16a34a;
  box-shadow: none; cursor: default;
}
</style>