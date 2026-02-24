<script setup>
const props = defineProps({
  item:      { type: Object, required: true },
  completed: { type: Boolean, default: false },
})
defineEmits(['open'])

const TYPE = {
  grammar: { label: 'Grammar', color: '#6366f1', bg: '#eef2ff', icon: 'âœ¦' },
  story:   { label: 'Story',   color: '#16a34a', bg: '#f0fdf4', icon: 'â—ˆ' },
  lesson:  { label: 'Lesson',  color: '#d97706', bg: '#fffbeb', icon: 'â—‰' },
  fact:    { label: 'Fact',    color: '#ea580c', bg: '#fff7ed', icon: 'â—†' },
}
const t = (type) => TYPE[type] || { label: type, color: '#64748b', bg: '#f8fafc', icon: 'â—¦' }

const readTime = (item) => {
  const w = item.sections?.reduce((a, s) =>
    a + (s.content?.split(' ').length || 0) + (s.points?.join(' ').split(' ').length || 0), 0) || 80
  return Math.max(1, Math.ceil(w / 200)) + ' min'
}

const exCount = (item) =>
  item.sections?.filter(s => s.style === 'example')
    .reduce((a, s) => a + (s.examples?.length || 0), 0) || 0
</script>

<template>
  <div class="card" :class="{ done: completed }" @click="$emit('open', item)">

    <div class="type-badge" :style="{ background: t(item.type).bg, color: t(item.type).color }">
      {{ t(item.type).icon }} {{ t(item.type).label }}
    </div>

    <h3 class="card-title">{{ item.title }}</h3>

    <div class="meta">
      <span v-if="item.level" class="level-chip">{{ item.level }}</span>
      <span v-if="item.level" class="sep">Â·</span>
      <span class="stat">{{ item.type === 'grammar' ? exCount(item) + ' examples' : readTime(item) + ' read' }}</span>
      <template v-if="item.words?.length">
        <span class="sep">Â·</span>
        <span class="stat">{{ item.words.length }} words</span>
      </template>
    </div>

    <div v-if="item.tags?.length" class="tags">
      <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <div v-if="completed" class="done-badge">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>
      Done
    </div>

    <div class="arrow">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

.card {
  background: white; border: 1px solid #f1f5f9; border-radius: 20px;
  padding: 18px 16px; cursor: pointer; position: relative;
  box-shadow: 0 2px 12px -4px rgba(15,23,42,0.06);
  transition: transform 0.12s; font-family: 'Plus Jakarta Sans', sans-serif;
}
.card:active { transform: scale(0.982); }
.card.done   { opacity: 0.5; }

.type-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
  padding: 3px 9px; border-radius: 8px; margin-bottom: 10px;
}
.card-title {
  font-family: 'Lora', serif; font-size: 1.1rem; font-weight: 700;
  color: #0f172a; margin: 0 0 8px; line-height: 1.3; padding-right: 24px;
}
.meta {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  font-size: 0.7rem; color: #94a3b8; font-weight: 500; margin-bottom: 10px;
}
.sep { color: #e2e8f0; }
.level-chip {
  background: #fffbeb; color: #d97706; border: 1px solid #fde68a;
  padding: 1px 7px; border-radius: 6px; font-size: 0.62rem; font-weight: 700;
}
.tags { display: flex; flex-wrap: wrap; gap: 5px; }
.tag {
  background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;
  padding: 2px 8px; border-radius: 6px; font-size: 0.62rem; font-weight: 600;
}
.done-badge {
  display: inline-flex; align-items: center; gap: 4px;
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a;
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  padding: 2px 8px; border-radius: 6px; margin-top: 8px;
}
.arrow { position: absolute; top: 18px; right: 16px; color: #cbd5e1; }
</style>