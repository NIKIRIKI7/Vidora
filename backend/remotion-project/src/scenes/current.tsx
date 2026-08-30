import React from 'react';
import { FlickerNeonTitle16x9 } from '../widgets';

export const CurrentScene: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#08020f] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute w-[800px] h-[500px] rounded-full bg-purple-700/25 blur-[120px] pointer-events-none" />
      <FlickerNeonTitle16x9 topText="HOW TO CREATE THIS" mainText="FLICKER" scriptText="effect" showAppIcon={true} appIconText="Pr" mainTextColor="#ffffff" scriptTextColor="#00f2fe" glowColor="#00f2fe" appIconBgColor="#00005c" appIconTextColor="#9999ff" flickerMode="staggered-tubes" flickerIntensity={1} fontSize={160} durationFrames={300} delayFrames={0} scale={1} />
    </div>
  );
};

(CurrentScene as any).durationInFrames = 300;
(CurrentScene as any).isVertical = false;
