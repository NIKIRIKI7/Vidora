import React from 'react'
import { Eye, Users, Flame, Zap, BarChart2 } from 'lucide-react'
import { useVideoInspectorStore } from '@features/inspect-video/model/useVideoInspectorStore'
import type { VideoCandidateMeta } from '@shared/api/youtube/types'

interface VideoCandidateCardProps {
  video: VideoCandidateMeta
}

export const VideoCandidateCard: React.FC<VideoCandidateCardProps> = ({ video }) => {
  const openInspector = useVideoInspectorStore((s) => s.openInspector)

  return (
    <div className="flex flex-col bg-[#171f33]/70 hover:bg-[#171f33] border border-white/10 hover:border-[#ddb7ff]/40 rounded-xl overflow-hidden shadow-lg transition-all group">
      <div className="relative aspect-video bg-black overflow-hidden">
        <img
          src={video.thumbnailUrl || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {video.isRocket && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold text-[10px] rounded-full flex items-center gap-1 shadow-md">
            <Zap className="w-3 h-3 fill-black" /> ROCKET
          </span>
        )}
        {video.ratio && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-[#4fdbc8] text-[11px] font-mono rounded border border-white/10">
            {video.ratio}x Ratio
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div>
          <span className="text-[11px] text-[#cfc2d6]/70 block truncate">{video.channelTitle}</span>
          <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-[#ddb7ff] transition-colors">
            {video.title}
          </h3>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-white/70 border-t border-white/5 pt-2">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3 text-[#4fdbc8]" />
            {video.viewCount >= 1000 ? `${(video.viewCount / 1000).toFixed(1)}k` : video.viewCount}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3 text-[#ddb7ff]" />
            {video.subscriberCount ? `${(video.subscriberCount / 1000).toFixed(0)}k` : 'N/A'}
          </span>
          {video.vph && (
            <span className="flex items-center gap-0.5 text-amber-300 font-bold">
              <Flame className="w-3 h-3" />
              {video.vph} VPH
            </span>
          )}
        </div>

        <button
          onClick={() => openInspector(video)}
          className="w-full mt-1 py-1.5 bg-[#ddb7ff]/10 hover:bg-[#ddb7ff] text-[#ddb7ff] hover:text-[#490080] font-bold text-xs rounded-lg border border-[#ddb7ff]/30 transition-all flex items-center justify-center gap-1.5"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Разбор удержания & Хуков
        </button>
      </div>
    </div>
  )
}
