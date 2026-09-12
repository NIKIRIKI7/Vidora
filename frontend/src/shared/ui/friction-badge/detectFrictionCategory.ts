export type FrictionCategory = 'question' | 'problem' | 'debate' | 'mechanism' | 'general'

export const detectFrictionCategory = (commentText: string): FrictionCategory => {
  const lower = commentText.toLowerCase()
  if (/как (правильно|сделать|настроить)|how to|how do i|\?/i.test(lower)) return 'question'
  if (/не работает|ошибка|баг|сломалось|doesn't work|bug|failed|error/i.test(lower)) return 'problem'
  if (/на самом деле|не согласен|вранье|лучше бы|instead of|disagree|wrong/i.test(lower)) return 'debate'
  if (/почему|в чем причина|зачем|why does|nobody explains/i.test(lower)) return 'mechanism'
  return 'general'
}
