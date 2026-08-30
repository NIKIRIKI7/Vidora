import React from 'react'
import * as remotion from 'remotion'
import * as LucideIcons from 'lucide-react'
import { transform } from 'sucrase'

export interface CompileResult {
  Component: React.ComponentType<Record<string, unknown>> | null
  error: string | null
}

const compilationCache = new Map<string, React.ComponentType<Record<string, unknown>>>()

const REMOTION_EXPORTS = [
  'AbsoluteFill',
  'Sequence',
  'Series',
  'interpolate',
  'spring',
  'useCurrentFrame',
  'useVideoConfig',
  'Easing',
  'freeze',
  'random',
  'delayRender',
  'continueRender',
  'staticFile',
  'OffthreadVideo',
  'Audio',
  'Img',
  'IFrame',
  'Loop',
]

/**
 * Компилирует сырой tsx_code из БД в живой React-компонент прямо в браузере.
 * Кэшируется по id+коду. Никаких запросов на сервер и перезагрузок.
 */
export function compileTsxWidget(tsxCode: string, widgetId: string): CompileResult {
  if (!tsxCode || !tsxCode.trim()) {
    return { Component: null, error: 'Код виджета пуст' }
  }

  const cacheKey = `${widgetId}_${tsxCode.length}_${tsxCode.slice(0, 80)}`
  const cached = compilationCache.get(cacheKey)
  if (cached) return { Component: cached, error: null }

  try {
    const compiled = transform(tsxCode, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxPragma: 'React.createElement',
      jsxFragmentPragma: 'React.Fragment',
      production: true,
    }).code

    // Модуль-обёртка для ESM-импортов, скомпилированных в require(...)
    const moduleMap: Record<string, unknown> = {
      react: React,
      'remotion': remotion,
      'lucide-react': LucideIcons,
    }
    const makeRequire = (spec: string) => {
      if (spec in moduleMap) return moduleMap[spec]
      if (spec.startsWith('./') || spec.startsWith('../')) {
        throw new Error(`Локальные импорты в виджете не поддерживаются: ${spec}`)
      }
      throw new Error(`Неизвестный модуль в виджете: ${spec}`)
    }

    const exportsObj: Record<string, unknown> = {}
    const moduleObj = { exports: exportsObj }

    // Инжектируем remotion-имена верхнего уровня (используются без импорта в части виджетов).
    // Распаковка React/remotion/lucide — fallback на случай, если ИИ-код вызывает хуки/иконки
    // без явного импорта (напр. useState() вместо React.useState(), <Trophy /> без import).
    const scope: Record<string, unknown> = {
      React,
      ...(React as unknown as Record<string, unknown>),
      remotion,
      ...(remotion as unknown as Record<string, unknown>),
      LucideIcons,
      ...(LucideIcons as unknown as Record<string, unknown>),
      require: makeRequire,
      module: moduleObj,
      exports: exportsObj,
      ...Object.fromEntries(REMOTION_EXPORTS.map((n) => [n, (remotion as Record<string, unknown>)[n]])),
    }

    const runner = new Function(
      ...Object.keys(scope),
      `"use strict";
      ${compiled}
      return module.exports;
      `
    )
    const result = runner(...Object.values(scope)) as Record<string, unknown>

    // Экспорты по имени: берём компонент (исключая интерфейсы/утилиты)
    const candidate = (
      result.default ??
      Object.values(result).find((v) => typeof v === 'function')
    ) as React.ComponentType<Record<string, unknown>> | undefined

    if (typeof candidate !== 'function') {
      throw new Error('Скомпилированный TSX не вернул React-компонент')
    }

    compilationCache.set(cacheKey, candidate)
    return { Component: candidate, error: null }
  } catch (err) {
    console.error(`[DynamicCompiler] Widget "${widgetId}" compile failed:`, err)
    return { Component: null, error: err instanceof Error ? err.message : String(err) }
  }
}
