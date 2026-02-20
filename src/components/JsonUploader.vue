<script setup>
import { ref, computed } from 'vue'
import { collection, getDocs, addDoc } from 'firebase/firestore'
import { db } from '../firebase'

const emit = defineEmits(['refresh'])

// STATE
const uploadType = ref('words') // 'words' or 'discovery'
const jsonInput = ref('')
const isUploading = ref(false)
const statusMessage = ref('')
const statusType = ref('') // 'success', 'error', or 'info'

// DYNAMIC PLACEHOLDER BASED ON UPLOAD TYPE
const placeholderText = computed(() => {
  if (uploadType.value === 'words') {
    return `[
  {
    "word": "Nostalgia",
    "meanings": { "urdu": "...", "hindi": "..." },
    "scenario": "...",
    "focusPoint": "..."
  }
]`
  } else {
    return `[
  {
    "type": "fact", // can be: news, story, fact, lesson
    "title": "Honey Never Expires",
    "content": "Archaeologists found 3,000-year-old honey..."
  }
]`
  }
})

const processUpload = async () => {
  if (!jsonInput.value.trim()) {
    showStatus("Please paste some JSON data first.", "error")
    return
  }

  try {
    isUploading.value = true
    showStatus(`Analyzing your ${uploadType.value}...`, "info")

    const parsedData = JSON.parse(jsonInput.value)
    if (!Array.isArray(parsedData)) {
      throw new Error("The JSON format must be an array [ { ... } ].")
    }

    let addedCount = 0
    let skippedCount = 0

    // ==========================================
    // 1. VOCABULARY WORDS UPLOAD LOGIC
    // ==========================================
    if (uploadType.value === 'words') {
      const snapshot = await getDocs(collection(db, 'words'))
      const existingWords = new Set(snapshot.docs.map(doc => doc.data().word?.toLowerCase().trim()))

      for (const item of parsedData) {
        if (!item.word) continue 

        const wordKey = item.word.toLowerCase().trim()
        if (existingWords.has(wordKey)) {
          skippedCount++
          continue
        }

        await addDoc(collection(db, 'words'), {
          word: item.word,
          meanings: item.meanings || { urdu: "", hindi: "" },
          scenario: item.scenario || "",
          focusPoint: item.focusPoint || "",
          examples: item.examples || [],
          synonyms: item.synonyms || [],
          streak: 0,
          interval: 1,
          nextReview: null,
          dateAdded: Date.now()
        })
        existingWords.add(wordKey)
        addedCount++
      }
    } 
    // ==========================================
    // 2. DISCOVERY CONTENT UPLOAD LOGIC
    // ==========================================
    else {
      const snapshot = await getDocs(collection(db, 'discovery'))
      const existingTitles = new Set(snapshot.docs.map(doc => doc.data().title?.toLowerCase().trim()))

      for (const item of parsedData) {
        if (!item.title || !item.type) continue 

        const titleKey = item.title.toLowerCase().trim()
        if (existingTitles.has(titleKey)) {
          skippedCount++
          continue
        }

        await addDoc(collection(db, 'discovery'), {
          type: item.type, // 'news', 'story', 'fact', or 'lesson'
          title: item.title,
          content: item.content || "",
          intro: item.intro || "",
          points: item.points || [],
          dateAdded: Date.now()
        })
        existingTitles.add(titleKey)
        addedCount++
      }
    }

    // FINAL RESULTS
    if (addedCount > 0) {
      showStatus(`Success! Added ${addedCount} new items. (Skipped ${skippedCount} duplicates).`, "success")
      jsonInput.value = '' 
      emit('refresh') 
    } else {
      showStatus(`No new items added. Skipped ${skippedCount} duplicates.`, "info")
    }

  } catch (err) {
    console.error(err)
    showStatus("Error: Invalid JSON format. Please check your data.", "error")
  } finally {
    isUploading.value = false
  }
}

const showStatus = (msg, type) => {
  statusMessage.value = msg
  statusType.value = type
}
</script>

<template>
  <div class="uploader-wrapper">
    
    <div class="modern-card">
      <div class="header">
        <h1 class="main-title">➕ Add Content</h1>
        <p class="subtitle">Paste your AI-generated JSON data below.</p>
      </div>

      <div class="toggle-container">
        <button 
          class="toggle-btn" 
          :class="{ active: uploadType === 'words' }"
          @click="uploadType = 'words'; statusMessage = ''"
        >
          📚 Vocab Words
        </button>
        <button 
          class="toggle-btn" 
          :class="{ active: uploadType === 'discovery' }"
          @click="uploadType = 'discovery'; statusMessage = ''"
        >
          🌍 Discovery (News/Facts)
        </button>
      </div>

      <div class="input-area">
        <textarea 
          v-model="jsonInput" 
          class="json-textarea" 
          :placeholder="placeholderText"
          :disabled="isUploading"
        ></textarea>
      </div>

      <div v-if="statusMessage" class="status-box" :class="statusType">
        {{ statusMessage }}
      </div>

      <button 
        class="upload-btn" 
        @click="processUpload" 
        :disabled="isUploading"
      >
        <span v-if="isUploading" class="spinner"></span>
        {{ isUploading ? 'Processing...' : 'Upload Data' }}
      </button>

      <div class="info-footer">
        <span class="info-icon">💡</span>
        <p>Duplicates are automatically ignored. Ensure your JSON format matches the placeholder example.</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.uploader-wrapper {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  min-height: 100%;
}

.modern-card {
  background: white;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 10px 40px -10px rgba(15, 23, 42, 0.08);
  border: 1px solid #f1f5f9;
}

.header { text-align: center; margin-bottom: 20px; }
.main-title { font-size: 1.8rem; color: #0f172a; margin: 0 0 4px 0; font-weight: 800; letter-spacing: -0.5px; }
.subtitle { font-size: 0.95rem; color: #64748b; margin: 0; }

/* TYPE TOGGLE */
.toggle-container {
  display: flex;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 16px;
  margin-bottom: 20px;
  gap: 6px;
}
.toggle-btn {
  flex: 1;
  padding: 12px;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 700;
  font-size: 0.95rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-btn.active {
  background: white;
  color: #0f172a;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
}

.input-area { margin-bottom: 20px; }
.json-textarea {
  width: 100%;
  height: 250px;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  color: #334155;
  resize: vertical;
  transition: border-color 0.2s;
}
.json-textarea:focus { outline: none; border-color: #cbd5e1; background: white; }
.json-textarea:disabled { opacity: 0.6; cursor: not-allowed; }

.status-box {
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}
.status-box.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.status-box.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.status-box.info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

.upload-btn {
  width: 100%;
  background: #0f172a;
  color: white;
  padding: 16px;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  box-shadow: 0 8px 20px -6px rgba(15, 23, 42, 0.3);
  transition: all 0.2s ease;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}
.upload-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 4px 10px -4px rgba(15, 23, 42, 0.4); }
.upload-btn:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }

.info-footer {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #f8fafc;
  padding: 16px;
  border-radius: 16px;
}
.info-icon { font-size: 1.2rem; }
.info-footer p { margin: 0; font-size: 0.85rem; color: #64748b; line-height: 1.5; }

.spinner {
  width: 18px; height: 18px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
