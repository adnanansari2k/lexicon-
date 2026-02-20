<script setup>
import { ref } from 'vue'
import { collection, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  books: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

// Modals State
const selectedBook = ref(null)
const showAddBookModal = ref(false)

// Forms State
const newBookTitle = ref('')
const newBookAuthor = ref('')
const isAddingBook = ref(false)

const newQuoteText = ref('')
const isAddingQuote = ref(false)

// --- ACTIONS ---

const addNewBook = async () => {
  if (!newBookTitle.value.trim()) return
  isAddingBook.value = true
  try {
    await addDoc(collection(db, 'books'), {
      title: newBookTitle.value,
      author: newBookAuthor.value || 'Unknown Author',
      quotes: [],
      dateAdded: Date.now()
    })
    newBookTitle.value = ''
    newBookAuthor.value = ''
    showAddBookModal.value = false
    emit('refresh')
  } catch (e) {
    console.error("Error adding book:", e)
  } finally {
    isAddingBook.value = false
  }
}

const addNewQuote = async () => {
  if (!newQuoteText.value.trim() || !selectedBook.value) return
  isAddingQuote.value = true
  try {
    const bookRef = doc(db, 'books', selectedBook.value.id)
    const quoteData = {
      text: newQuoteText.value,
      dateAdded: Date.now()
    }
    
    // Update Firebase
    await updateDoc(bookRef, {
      quotes: arrayUnion(quoteData)
    })
    
    // Update local state instantly so we don't have to wait for refresh
    selectedBook.value.quotes.push(quoteData)
    newQuoteText.value = ''
    emit('refresh') // Refresh in background
  } catch (e) {
    console.error("Error adding quote:", e)
  } finally {
    isAddingQuote.value = false
  }
}
</script>

<template>
  <div class="books-wrapper">
    
    <header class="page-header">
      <div class="title-row">
        <div>
          <h1 class="main-title">📖 Library of Quotes</h1>
          <p class="subtitle">Your personal collection of profound thoughts.</p>
        </div>
        <button class="add-btn" @click="showAddBookModal = true">+ Add Book</button>
      </div>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else class="books-grid">
      <div v-if="books.length === 0" class="empty-state">
        <span class="icon">📚</span>
        <p>You haven't added any books yet.</p>
      </div>

      <div 
        v-for="book in books" 
        :key="book.id" 
        class="book-card modern-card"
        @click="selectedBook = book"
      >
        <div class="book-info">
          <h2 class="book-title">{{ book.title }}</h2>
          <span class="book-author">by {{ book.author }}</span>
        </div>
        <div class="quote-count">
          <span>{{ book.quotes?.length || 0 }}</span>
          <small>Quotes</small>
        </div>
      </div>
    </div>

    <Transition name="fade-scale">
      <div v-if="showAddBookModal" class="modal-overlay" @click.self="showAddBookModal = false">
        <div class="modal-content add-modal">
          <h2>Add a New Book</h2>
          <input v-model="newBookTitle" type="text" placeholder="Book Title (e.g. Atomic Habits)" class="modern-input" />
          <input v-model="newBookAuthor" type="text" placeholder="Author Name" class="modern-input" />
          
          <div class="modal-actions">
            <button class="cancel-btn" @click="showAddBookModal = false">Cancel</button>
            <button class="save-btn" @click="addNewBook" :disabled="isAddingBook">
              {{ isAddingBook ? 'Saving...' : 'Save Book' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="selectedBook" class="modal-overlay" @click.self="selectedBook = null">
        <div class="modal-content full-modal">
          <button class="close-btn" @click="selectedBook = null">✕</button>
          
          <div class="modal-header">
            <h1 class="book-title-large">{{ selectedBook.title }}</h1>
            <p class="book-author-large">{{ selectedBook.author }}</p>
          </div>

          <div class="quotes-scroll">
            <div v-if="!selectedBook.quotes || selectedBook.quotes.length === 0" class="no-quotes">
              No quotes added yet. Add your first one below!
            </div>
            
            <div v-for="(quote, index) in selectedBook.quotes" :key="index" class="quote-item">
              <span class="quote-mark">"</span>
              <p class="quote-text">{{ quote.text || quote }}</p>
            </div>
          </div>

          <div class="add-quote-section">
            <textarea 
              v-model="newQuoteText" 
              placeholder="Paste or type a profound quote from this book..." 
              class="quote-input"
              rows="3"
            ></textarea>
            <button class="submit-quote-btn" @click="addNewQuote" :disabled="isAddingQuote || !newQuoteText">
              {{ isAddingQuote ? 'Adding...' : 'Add Quote' }}
            </button>
          </div>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.books-wrapper { padding: 16px; max-width: 600px; margin: 0 auto; min-height: 100%; padding-bottom: 40px; }

/* HEADER */
.page-header { margin-bottom: 24px; }
.title-row { display: flex; justify-content: space-between; align-items: center; }
.main-title { font-size: 1.8rem; color: #0f172a; margin: 0 0 4px 0; font-weight: 800; letter-spacing: -0.5px; }
.subtitle { font-size: 0.95rem; color: #64748b; margin: 0; }
.add-btn { background: #0f172a; color: white; border: none; padding: 10px 16px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: transform 0.2s; box-shadow: 0 4px 10px rgba(15,23,42,0.2); }
.add-btn:active { transform: scale(0.95); }

/* GRID */
.books-grid { display: flex; flex-direction: column; gap: 16px; }
.book-card { display: flex; justify-content: space-between; align-items: center; padding: 20px; background: white; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(15,23,42,0.05); border: 1px solid #f1f5f9; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.book-card:active { transform: scale(0.98); background: #f8fafc; }
.book-title { font-size: 1.2rem; margin: 0 0 4px 0; color: #1e293b; font-weight: 800; }
.book-author { font-size: 0.9rem; color: #64748b; font-style: italic; }
.quote-count { display: flex; flex-direction: column; align-items: center; background: #f0fdf4; color: #166534; padding: 10px 14px; border-radius: 14px; border: 1px solid #bbf7d0; min-width: 65px; }
.quote-count span { font-size: 1.2rem; font-weight: 800; line-height: 1; }
.quote-count small { font-size: 0.65rem; text-transform: uppercase; font-weight: 700; margin-top: 4px; }
.empty-state { text-align: center; padding: 40px; color: #64748b; background: white; border-radius: 20px; border: 1px dashed #cbd5e1; }
.empty-state .icon { font-size: 2.5rem; display: block; margin-bottom: 10px; }

/* MODALS (Shared) */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index:9999; display: flex; justify-content: center; align-items: center; padding: 20px; }
.close-btn { position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 1rem; color: #475569; font-weight: bold; cursor: pointer; z-index: 10; }

/* ADD BOOK MODAL */
.add-modal { background: white; width: 100%; max-width: 400px; padding: 24px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
.add-modal h2 { margin: 0 0 20px 0; font-size: 1.4rem; color: #0f172a; }
.modern-input { width: 100%; padding: 14px; border: 2px solid #e2e8f0; border-radius: 12px; margin-bottom: 16px; font-size: 1rem; transition: border-color 0.2s; box-sizing: border-box;}
.modern-input:focus { outline: none; border-color: #0f172a; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
.cancel-btn { padding: 12px 20px; background: #f1f5f9; color: #64748b; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }
.save-btn { padding: 12px 20px; background: #0f172a; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }

/* FULL QUOTES MODAL */
.full-modal { background: #fafaf9; width: 100%; max-width: 500px; height: 85vh; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
.modal-header { padding: 24px 24px 16px; background: white; border-bottom: 1px solid #e2e8f0; }
.book-title-large { font-size: 1.6rem; color: #0f172a; margin: 0 0 4px 0; font-weight: 800; padding-right: 30px; }
.book-author-large { font-size: 1rem; color: #64748b; font-style: italic; margin: 0; }

.quotes-scroll { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; background: #fafaf9; }
.no-quotes { text-align: center; color: #94a3b8; font-style: italic; margin-top: 40px; }
.quote-item { background: white; padding: 20px; border-radius: 16px; position: relative; box-shadow: 0 4px 10px rgba(15,23,42,0.03); border: 1px solid #f1f5f9; }
.quote-mark { position: absolute; top: -5px; left: 10px; font-size: 4rem; color: #fef08a; font-family: Georgia, serif; opacity: 0.5; line-height: 1; pointer-events: none; }
.quote-text { margin: 0; font-size: 1.1rem; color: #334155; line-height: 1.6; font-family: 'Georgia', serif; font-style: italic; position: relative; z-index: 1; }

.add-quote-section { padding: 16px; background: white; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 10px; }
.quote-input { width: 100%; padding: 14px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 0.95rem; resize: none; font-family: inherit; transition: border-color 0.2s; box-sizing: border-box;}
.quote-input:focus { outline: none; border-color: #cbd5e1; }
.submit-quote-btn { background: #16a34a; color: white; padding: 14px; border: none; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
.submit-quote-btn:disabled { background: #94a3b8; cursor: not-allowed; }
.submit-quote-btn:active:not(:disabled) { transform: scale(0.98); }

/* TRANSITIONS */
.fade-scale-enter-active, .fade-scale-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.95); }
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.3s, transform 0.3s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(50px); }
.spinner { width: 30px; height: 30px; border: 3px solid #e2e8f0; border-top: 3px solid #0f172a; border-radius: 50%; animation: spin 1s linear infinite; margin: 40px auto; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
