<script setup>
import { computed } from 'vue'

const props = defineProps(['word', 'allWords'])
const emit = defineEmits(['result'])

// Generate 3 Options (1 Correct + 2 Wrong)
const options = computed(() => {
  if (!props.allWords || props.allWords.length < 3) return []
  
  // 1. Get Wrong Answers (Filter out current word)
  const distractors = props.allWords
    .filter(w => w.id !== props.word.id)
    .sort(() => 0.5 - Math.random()) // Shuffle
    .slice(0, 2)

  // 2. Combine with Correct Answer
  const choices = [props.word, ...distractors]

  // 3. Shuffle the final list so correct answer isn't always first
  return choices.sort(() => 0.5 - Math.random())
})

const selectOption = (selectedWord) => {
  if (selectedWord.id === props.word.id) {
    emit('result', true) // Correct
  } else {
    emit('result', false) // Wrong
  }
}
</script>

<template>
  <div class="quiz-card">
    <div class="header">
      <span class="tag">Step 2: Matching Drill</span>
      <h1 class="target-word">{{ word.word }}</h1>
    </div>

    <div class="options-container">
      <p class="instruction">Select the correct meaning:</p>
      
      <button 
        v-for="opt in options" 
        :key="opt.id" 
        class="option-btn"
        @click="selectOption(opt)"
      >
        <div class="meanings">
          <span class="urdu">{{ opt.meanings?.urdu }}</span>
          <span class="hindi">{{ opt.meanings?.hindi }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.quiz-card { background: white; border-radius: 24px; height: 100%; display: flex; flex-direction: column; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center; border: 1px solid #f1f5f9; }
.header { margin-bottom: 30px; }
.tag { font-size: 0.7rem; text-transform: uppercase; color: #f59e0b; font-weight: 800; letter-spacing: 1px; }
.target-word { font-size: 2.2rem; color: #1e293b; margin: 10px 0 0; font-weight: 800; }
.instruction { color: #64748b; font-size: 0.9rem; margin-bottom: 15px; }

.options-container { display: flex; flex-direction: column; gap: 12px; flex: 1; justify-content: center; }
.option-btn { background: #f8fafc; border: 2px solid #e2e8f0; padding: 15px; border-radius: 16px; cursor: pointer; transition: 0.1s; text-align: center; }
.option-btn:active { background: #e2e8f0; transform: scale(0.98); }
.meanings { display: flex; flex-direction: column; gap: 2px; }
.urdu { font-family: 'Noto Nastaliq Urdu'; font-size: 1.1rem; color: #166534; }
.hindi { font-size: 0.9rem; color: #64748b; }
</style>
