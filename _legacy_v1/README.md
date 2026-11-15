# JobMech — Tailored International CV & Cover Letter Studio

**JobMech** is an English-language desktop application for Windows that crafts deeply tailored, 100% authentic, non-generic **Curriculum Vitae (CVs)** and **Cover Letters** adapted to the cultural format of the job's country while keeping the text in the language required by the job posting.

## 🚀 How to Open JobMech

Simply double-click either:
- **`JobMech.exe`**
- **`Start-JobMech.bat`** (compiles `JobMech.exe` from `src\JobMechServer.cs` on first use)

It starts the local desktop engine quietly in the **Windows System Tray** (no Command Prompt window stays open!) and opens the **JobMech Studio** interface automatically. Right-click the **JobMech** tray icon or click **`⏻ Quit`** in the top bar anytime to shut down cleanly.

---

## ✨ Key Features

1. **AI Engine Setup (Cloud API or Local AI Downloader)**:
   - **Local AI (Ollama / LM Studio)**: 1-click installer for Ollama and 1-click downloader for top local models (`qwen2.5:7b`, `llama3.1:8b`, `gemma3:12b`, `llama3.2:3b`). Also includes a **Smart Built-in Offline Assisted Mode** that works immediately even before downloading a model.
   - **Cloud APIs**: Supports **Google Gemini**, **OpenAI (GPT-4o)**, **Anthropic Claude**, **Groq**, and **OpenRouter**.
2. **Natural Language CV / Story, File Attachments & Targeted Gap Analysis**:
   - Write or paste your career story in natural language **and/or attach existing `.pdf`, `.docx`, `.md`, or `.txt` files** (old CVs, old Cover Letters, AI-written profile notes) via drag-and-drop or file picker.
   - Paste the target Job Description.
   - Before generating anything generic, JobMech analyzes what the job requires against your story and **`data/memory.md`** and asks **specific per-question gap cards** (with a one-click **"Haven't used / Skip"** toggle so irrelevant tools aren't claimed and don't clutter memory).
3. **Strict Anti-AI Humanizer**:
   - Zero em-dashes (`—`) or robotic punctuation patterns.
   - Zero AI clichés (*"delve", "tapestry", "testament", "spearheaded", "thrilled", "synergy", "seamlessly"*).
4. **Country-Specific CV Architecture vs. Document Language**:
   - Example: If a job is located in **Germany** (`DE`) and the job posting is in **English**, JobMech writes the CV and Cover Letter in **English** while formatting the layout as a **German *Tabellarischer Lebenslauf*** (portrait photo in top-right header, nationality/work permit, CEFR language levels, city/date signature line) and a **DIN 5008 Cover Letter**.
   - Automatically includes your saved portrait photo for countries where photos are expected (**Germany, Austria, Switzerland, France, Spain, Italy, Brazil, Portugal, Japan**) and automatically omits it where prohibited (**USA, UK, Canada, Australia**).
5. **Curated Professional Color Palettes**:
   - Choose between **Executive Navy**, **Charcoal & Slate**, **Alpine Forest**, **Oxford Burgundy**, **Nordic Steel Teal**, and **Warm Espresso** within the target country's structural design.
6. **Persistent Context-Rich Memory (`data/memory.md`) & Auto-Save Sync**:
   - Click **`💾 Save to Memory`** directly on the Home page, check **"Save my story & these new answers to Memory (`data/memory.md`)"** in Step 2/3, or enable **"Auto-Save to Memory Always"**. Saving automatically syncs your Career Story into `data/memory.md` and the Home page, storing each constructive answer paired with its **Question Context** while automatically filtering out *"No / Never Used"* clutter.
7. **Application History, Step 3 Mini-Dashboard & Direct Save-As (`.PDF` & `.DOCX`)**:
   - Every job application is saved in the left sidebar by **Role @ Company**.
   - Click any past application to open its **Mini-Dashboard** with responsive side-by-side preview (`Fit / 85% / 100%` zoom), switch color palettes, edit text inline (edits carry directly into `.PDF` and `.DOCX` exports), and download via the **`⬇️ Download as .PDF or .DOCX`** dropdown or bottom **`Save Both as .PDF` / `.DOCX`** buttons (picking a folder once saves **`..._CV`** and **`..._CoverLetter`** as two separate files).
   - Click **`← Back to Home`** or **`← Return to Start`** at any time to start a fresh application.
