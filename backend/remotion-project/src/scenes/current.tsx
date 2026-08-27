import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile } from 'remotion';

export const compositionConfig = {
  id: 'Scene_455b7d',
  durationInFrames: 1297,
  fps: 60,
  width: 1920,
  height: 1080,
};

export const Scene: React.FC = () => {
  return (
    <AbsoluteFill className="bg-black">
      <Sequence from={0} durationInFrames={294}>
        <AbsoluteFill className="bg-black">
          <OffthreadVideo src={staticFile("assets/b-roll/02_harness_diagram.webm")} className="w-full h-full object-cover" />
                    <AbsoluteFill className="flex items-end justify-center p-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
            <p className="text-3xl font-bold text-white text-center drop-shadow-xl max-w-4xl">{"Но это не новая языковая модель. Это платформа, которая этой моделью управляет."}</p>
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={294} durationInFrames={371}>
        <AbsoluteFill className="bg-black">
          <OffthreadVideo src={staticFile("assets/b-roll/02_harness_diagram.webm")} className="w-full h-full object-cover" />
                    <AbsoluteFill className="flex items-end justify-center p-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
            <p className="text-3xl font-bold text-white text-center drop-shadow-xl max-w-4xl">{"Та самая прослойка, которая читает ваши файлы, запускает команды в терминале и делает работу за вас."}</p>
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={664} durationInFrames={289}>
        <AbsoluteFill className="flex flex-col items-center justify-center p-16 bg-[#0b1326]">
          <h2 className="text-5xl font-black text-white text-center mb-4">{"Схема: стикмен бросает золотые монеты с надписью «SUBSCRIPTION» в вендинговый аппарат"}</h2>
                    <p className="text-2xl text-slate-300 text-center max-w-3xl">{"Раньше за подобные агентские надстройки все платили ежемесячную подписку."}</p>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={953} durationInFrames={343}>
        <AbsoluteFill className="flex flex-col items-center justify-center p-16 bg-[#0b1326]">
          <h2 className="text-5xl font-black text-white text-center mb-4">{"B-roll: стикмен разводит руками перед синим китом — маскотом DeepSeek"}</h2>
                    <p className="text-2xl text-slate-300 text-center max-w-3xl">{"А ДипСик просто отдали этот инструмент бесплатно. Неужели это навсегда изменит индустрию?"}</p>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;
