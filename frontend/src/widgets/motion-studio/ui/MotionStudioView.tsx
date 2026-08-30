import React, { useEffect } from 'react'
import {
  WidgetCatalogSidebar,
  VirtualMotionCanvas,
  WidgetPropsInspector,
  WidgetImportExportModal,
  WidgetCreateModal,
  useWidgetManagementStore,
} from '@features/widgets'

export const MotionStudioView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { fetchWidgets } = useWidgetManagementStore()

  useEffect(() => {
    fetchWidgets()
  }, [fetchWidgets])

  return (
    <div className="w-screen h-screen flex bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Левая панель: Каталог */}
      <WidgetCatalogSidebar onBack={onBack} />

      {/* Центральная панель: Виртуальный Холст с таймлайном */}
      <VirtualMotionCanvas />

      {/* Правая панель: Инспектор пропсов */}
      <WidgetPropsInspector />

      {/* Модальные окна */}
      <WidgetImportExportModal />
      <WidgetCreateModal />
    </div>
  )
}
