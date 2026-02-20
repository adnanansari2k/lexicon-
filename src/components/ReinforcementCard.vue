<script setup>
import { defineProps, defineEmits } from 'vue'
const props = defineProps(['word'])
const emit = defineEmits(['complete']) 

const finishLearning = () => {
  emit('complete', true) 
}
</script>

<template>
  <div class="modern-card">
    
    <div class="header">
      <span class="calm-tag">Reinforcement</span>
      <h2 class="subtitle">Let’s understand this calmly.</h2>
    </div>

    <div class="scroll-content">
      
      <div v-if="word.scenario" class="scenario-section">
        <div class="scenario-text">
          "{{ word.scenario }}"
        </div>
        
        <div class="focus-box">
          <span class="focus-icon">👉</span>
          <p class="focus-text">
            {{ word.focusPoint || "Observe the feeling in this situation." }}
          </p>
        </div>
      </div>

      <div class="knowledge-section">
        <h1 class="target-word">{{ word.word }}</h1>
        
        <div class="meaning-row">
          <div class="meaning-item urdu-box">
            <span>{{ word.meanings?.urdu }}</span>
          </div>
          <div class="meaning-item hindi-box">
            <span>{{ word.meanings?.hindi }}</span>
          </div>
        </div>

        <div class="examples-list">
          <div v-for="(ex, i) in word.examples" :key="i" class="ex-item">
            {{ ex }}
          </div>
        </div>

        <div v-if="word.synonyms?.length" class="synonym-row">
          <span v-for="syn in word.synonyms" :key="syn" class="pill">{{ syn }}</span>
        </div>
      </div>

    </div>

    <div class="footer">
      <button @click="finishLearning" class="modern-btn">
        I Understand This Now
      </button>
    </div>

  </div>
</template>

<style scoped>
/* CONTAINER */
.modern-card { 
  background: white; 
  height: 100%; 
  display: flex; 
  flex-direction: column; 
  border-radius: 20px; 
  box-shadow: 0 12px 35px -10px rgba(15, 23, 42, 0.08), 0 4px 10px -4px rgba(15, 23, 42, 0.04);
  overflow: hidden; 
  border: 1px solid rgba(226, 232, 240, 0.8);
}

/* HEADER */
.header { 
  padding: 16px 20px; 
  text-align: center; 
  flex-shrink: 0; 
  background: white;
  border-bottom: 1px dashed #e2e8f0;
}
.calm-tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; font-weight: 800; display: block; margin-bottom: 4px; }
.subtitle { font-size: 1.05rem; color: #64748b; margin: 0; font-family: 'Georgia', serif; font-style: italic; }

/* SCROLL AREA - Reduced side padding to give more width! */
.scroll-content { 
  flex: 1; 
  overflow-y: auto; 
  padding: 16px; /* Reduced from 20px */
  display: flex; 
  flex-direction: column; 
  gap: 24px; 
  background: #fafaf9; /* Extremely subtle warm off-white */
}

/* SCENARIO SECTION */
.scenario-section { 
  background: linear-gradient(145deg, #fff7ed 0%, #ffedd5 100%); 
  padding: 20px 16px; 
  border-radius: 16px; 
  box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.6);
  border: 1px solid #fed7aa;
}
.scenario-text { font-family: 'Georgia', serif; font-size: 1.1rem; line-height: 1.6; color: #7c2d12; margin-bottom: 16px; }

.focus-box { 
  display: flex; 
  gap: 12px; 
  align-items: flex-start; 
  background: rgba(255,255,255,0.85); 
  padding: 14px; 
  border-radius: 12px; 
  box-shadow: 0 4px 10px rgba(153, 27, 27, 0.04);
}
.focus-icon { font-size: 1.2rem; margin-top: -2px; }
.focus-text { font-size: 0.95rem; color: #9a3412; font-weight: 600; margin: 0; line-height: 1.45; }

/* KNOWLEDGE SECTION */
.knowledge-section { text-align: center; padding: 0 4px 20px; }
.target-word { font-size: 2.6rem; color: #0f172a; margin: 0 0 16px 0; font-weight: 800; letter-spacing: -0.5px; }

.meaning-row { display: flex; justify-content: center; align-items: stretch; gap: 8px; margin-bottom: 24px; }
.meaning-item { padding: 8px 16px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.urdu-box { background: #f0fdf4; border: 1px solid #bbf7d0; font-family: 'Noto Nastaliq Urdu'; font-size: 1.3rem; color: #166534; }
.hindi-box { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; font-size: 1.05rem; font-weight: 500;}

.examples-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
.ex-item { 
  background: white; 
  padding: 16px; 
  border-radius: 0 16px 16px 0; 
  color: #334155; 
  font-size: 1rem; 
  border-left: 4px solid #cbd5e1; 
  text-align: left; 
  line-height: 1.5;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
}

.synonym-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.pill { background: white; border: 1px solid #e2e8f0; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; color: #64748b; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.02);}

/* STICKY FOOTER */
.footer { 
  padding: 16px; 
  background: rgba(255, 255, 255, 0.9); 
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(226, 232, 240, 0.6); 
  flex-shrink: 0; 
  z-index: 10;
}
.modern-btn { 
  width: 100%; 
  background: #0f172a; 
  color: white; 
  padding: 18px; 
  border-radius: 14px; 
  font-size: 1.05rem; 
  font-weight: 700; 
  border: none; 
  cursor: pointer; 
  box-shadow: 0 8px 20px -6px rgba(15, 23, 42, 0.4); 
  transition: all 0.2s ease; 
}
.modern-btn:active { transform: translateY(2px); box-shadow: 0 4px 10px -4px rgba(15, 23, 42, 0.4); }
</style>
