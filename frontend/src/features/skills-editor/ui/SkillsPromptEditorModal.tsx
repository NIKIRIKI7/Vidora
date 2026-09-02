import React, { useState, useEffect } from 'react';
import { useSkillsStore } from '@/entities/skills/model/skillsStore';
import type { SkillItem } from '@/entities/skills/model/skillsStore';
import { Sparkles, RotateCcw, Save, Check, Search, Filter } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SkillsPromptEditorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { skills, fetchSkills, updateSkillPrompt, resetSkillToSeed } = useSkillsStore();
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchSkills();
    }
  }, [isOpen, fetchSkills]);

  useEffect(() => {
    if (skills.length > 0 && !selectedSkillId) {
      setSelectedSkillId(skills[0].id);
      setCurrentPrompt(skills[0].prompt);
    }
  }, [skills, selectedSkillId]);

  const handleSelectSkill = (skill: SkillItem) => {
    setSelectedSkillId(skill.id);
    setCurrentPrompt(skill.prompt);
    setIsSaved(false);
  };

  const handleSave = async () => {
    if (!selectedSkillId) return;
    const ok = await updateSkillPrompt(selectedSkillId, currentPrompt);
    if (ok) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleReset = async () => {
    if (!selectedSkillId) return;
    if (window.confirm('Сбросить этот системный промпт к эталонному значению из базы?')) {
      const ok = await resetSkillToSeed(selectedSkillId);
      if (ok) {
        const updated = useSkillsStore.getState().skills.find((s) => s.id === selectedSkillId);
        if (updated) setCurrentPrompt(updated.prompt);
      }
    }
  };

  if (!isOpen) return null;

  const filteredSkills = skills.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = stageFilter === 'all' || s.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const selectedSkill = skills.find((s) => s.id === selectedSkillId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="flex h-[85vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-indigo-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Редактор системных промптов и скилов (SQLite)</h2>
              <p className="text-xs text-slate-400">Все изменения сохраняются в базу данных бэкенда и мгновенно применяются в пайплайне</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            Закрыть
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="flex w-80 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск промпта..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 px-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="all">Все стадии</option>
                  <option value="scene_generation">Генерация сцен</option>
                  <option value="script_drafting">Сценарий</option>
                  <option value="hook_analysis">Хуки</option>
                  <option value="viral_ideas">Вирусные идеи</option>
                  <option value="thumbnail_concept">Обложки</option>
                  <option value="auto_broll">B-Roll</option>
                  <option value="voice_rules">Голосовые правила</option>
                  <option value="tts">TTS</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredSkills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleSelectSkill(skill)}
                  className={`w-full rounded-xl p-3 text-left transition-all ${
                    selectedSkillId === skill.id
                      ? 'bg-indigo-600/20 border border-indigo-500/50 text-white'
                      : 'border border-transparent bg-slate-900/50 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{skill.name}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      {skill.stage}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{skill.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Editor Body */}
          <div className="flex flex-1 flex-col bg-slate-950 p-6 overflow-hidden">
            {selectedSkill ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedSkill.name}</h3>
                    <p className="font-mono text-xs text-slate-500">ID: {selectedSkill.id} | Stage: {selectedSkill.stage}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Сброс к дефолту
                    </button>
                    <button
                      onClick={handleSave}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                        isSaved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'
                      }`}
                    >
                      {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                      {isSaved ? 'Сохранено!' : 'Сохранить в SQLite'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  <textarea
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    className="h-full w-full resize-none bg-transparent p-3 font-mono text-xs text-slate-200 focus:outline-none leading-relaxed"
                    placeholder="Введите текст системного промпта..."
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-600 text-sm">
                Выберите скил из списка слева
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
