import { useState } from 'react'
import { Brain, Check, Key, Server, Settings, X } from 'lucide-react'
import { useDashboardStore } from '../model/useDashboardStore'
import { SkillsSettingsView } from '@features/settings'

export const GlobalSettingsModal: React.FC = () => {
  const { activeModal, settings, closeModal, saveSettings } = useDashboardStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'settings' | 'skills'>('settings')

  if (activeModal !== 'settings') return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveSettings(form)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      closeModal()
    }, 1000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-white text-lg">
            <Settings className="text-sky-400" size={20} />
            <span>Глобальные настройки Vidora</span>
          </div>
          <button onClick={closeModal} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setTab('settings')}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              tab === 'settings' ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Настройки
          </button>
          <button
            onClick={() => setTab('skills')}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              tab === 'skills' ? 'border-fuchsia-400 text-fuchsia-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Brain size={13} />
              AI Skills
            </span>
          </button>
        </div>

        {tab === 'settings' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Key size={14} className="text-sky-400" />
                <span>API Ключи Провайдеров</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">RouterAI API Key</label>
                  <input
                    type="password"
                    value={form.routerai_api_key}
                    onChange={(e) => setForm({ ...form, routerai_api_key: e.target.value })}
                    placeholder="sk-routerai-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">AITunnel API Key</label>
                  <input
                    type="password"
                    value={form.aitunnel_api_key}
                    onChange={(e) => setForm({ ...form, aitunnel_api_key: e.target.value })}
                    placeholder="aitunnel-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Anthropic Claude Key</label>
                  <input
                    type="password"
                    value={form.anthropic_api_key}
                    onChange={(e) => setForm({ ...form, anthropic_api_key: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">OpenAI API Key</label>
                  <input
                    type="password"
                    value={form.openai_api_key}
                    onChange={(e) => setForm({ ...form, openai_api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Server size={14} className="text-emerald-400" />
                <span>Локальные AI сервисы</span>
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Ollama URL</label>
                  <input
                    type="text"
                    value={form.ollama_url}
                    onChange={(e) => setForm({ ...form, ollama_url: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">GPU Layers (Llama.cpp)</label>
                  <input
                    type="number"
                    value={form.gpu_layers}
                    onChange={(e) => setForm({ ...form, gpu_layers: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-500/20"
              >
                {saved ? <Check size={14} /> : null}
                <span>{saved ? 'Сохранено!' : 'Сохранить настройки'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 overflow-y-auto flex-1">
            <SkillsSettingsView />
          </div>
        )}
      </div>
    </div>
  )
}
