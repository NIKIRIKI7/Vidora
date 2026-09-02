import React from 'react';

const CurrentScene: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#08020f] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute w-[800px] h-[500px] rounded-full bg-purple-700/25 blur-[120px] pointer-events-none" />
      <h1 className="text-white text-6xl font-bold font-sans">
        Vidora Render Engine
      </h1>
    </div>
  );
};

(CurrentScene as any).durationInFrames = 300;
(CurrentScene as any).isVertical = false;

export default CurrentScene;
