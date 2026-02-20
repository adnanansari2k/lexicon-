<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['word'])
const emit = defineEmits(['result']) // 'remember' or 'forgot'

const isRevealed = ref(false)

// Reset state when word changes
watch(() => props.word, () => {
  isRevealed.value = false
})

const reveal = () => isRevealed.value = true
</script>

<template>
  <div class="review-card">
    
    <div class="card-body">
      <h1 class="target-word">{{ word.word }}</h1>

      <div v-if="isRevealed" class="revealed-content">
        <div class="meanings">
          <p class="urdu">{{ word.meanings?.urdu }}</p>
          <p class="hindi">{{ word.meanings?.hindi }}</p>
        </div>
        <div v-if="word.examples?.length" class="example">
          "{{ word.examples[0] }}"
        </div>
      </div>

      <div v-else class="thinking-state">
        <span class="pulse">Thinking...</span>
      </div>
    </div>

    <div class="action-bar">
      <button v-if="!isRevealed" @click="reveal" class="reveal-btn">Show Meaning</button>
      
      <div v-else class="decision-row">
        <button @click="$emit('result', 'forgot')" class="btn-forgot">
          Forgot
          <span class="sub">Study Now</span>
        </button>
        <button @click="$emit('result', 'remember')" class="btn-remember">
          Remember
          <span class="sub">Next +</span>
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.review-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; height: 100%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; }
.card-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }

.target-word { font-size: 2rem; font-weight: 800; color: #1e293b; margin-bottom: 20px; }
.thinking-state { color: #94a3b8; font-style: italic; font-size: 0.9rem; }

.revealed-content { animation: fadeUp 0.3s ease; }
.meanings { margin-bottom: 15px; }
.urdu { font-family: 'Noto Nastaliq Urdu'; font-size: 1.4rem; color: #15803d; margin: 0; }
.hindi { font-size: 1rem; color: #64748b; margin: 5px 0 0; }
.example { font-style: italic; color: #475569; font-size: 0.9rem; background: #f8fafc; padding: 10px; border-radius: 8px; margin-top: 15px; }

.action-bar { padding: 15px; border-top: 1px solid #f1f5f9; background: #f8fafc; }
.reveal-btn { width: 100%; padding: 14px; background: #1e293b; color: white; border-radius: 12px; font-weight: 600; border: none; }
.decision-row { display: flex; gap: 10px; }
.decision-row button { flex: 1; padding: 12px; border-radius: 12px; border: none; font-weight: 600; display: flex; flex-direction: column; align-items: center; }
.btn-forgot { background: #fee2e2; color: #991b1b; }
.btn-remember { background: #dcfce7; color: #166534; }
.sub { font-size: 0.65rem; opacity: 0.8; margin-top: 2px; text-transform: uppercase; }

@keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>
