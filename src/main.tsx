import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyDomTranslations, onLocaleChange } from './i18n'

// Apply i18n cho rotate-to-landscape prompt (DOM tĩnh trong index.html, không
// thuộc React tree). Chạy 1 lần ngay sau load + re-apply khi locale đổi
// runtime (vd user đổi ngôn ngữ ở Settings sau đó gập màn hình portrait).
const rotatePrompt = document.getElementById('rotate-prompt')
applyDomTranslations(rotatePrompt)
onLocaleChange(() => applyDomTranslations(rotatePrompt))

createRoot(document.getElementById('root')!).render(
  <App />,
)
