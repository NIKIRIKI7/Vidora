import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'AIAndAutomation',
  durationInSeconds: 16,
  fps: 30,
  width: 1080,
  height: 1920,
};

const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  accent: '#ffb4ab',
  background: '#0b1326',
  text: '#dae2fd',
  surface: '#171f33',
} as const;

const TYPOGRAPHY = {
  heading: 'Inter, system-ui, sans-serif',
  body: 'Geist, system-ui, sans-serif',
} as const;

const Fragment1PromptToGPT: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 200, 216], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 60], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const pulse = interpolate(frame, [0, 30, 60], [1, 1.05, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '28%', left: 100, right: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30,
      }}>
        <div style={{
          padding: '20 50', backgroundColor: COLORS.primary, borderRadius: 16,
          transform: `scale(${pulse})`,
          cursor: 'pointer',
        }}>
          <span style={{
            fontFamily: TYPOGRAPHY.heading, fontSize: 28, fontWeight: 600, color: COLORS.background,
          }}>
            ✦ Prompt
          </span>
        </div>
        <div style={{
          width: 2, height: 40, backgroundColor: COLORS.primary, opacity: 0.4,
        }} />
        <div style={{
          backgroundColor: COLORS.surface, borderRadius: 20, padding: 24,
          border: `1px solid ${COLORS.primary}33`, width: '100%',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 15, color: COLORS.text, lineHeight: 1.8, opacity: 0.8 }}>
            <span style={{ color: COLORS.primary }}>Generate</span> a Remotion scene<br />
            with fade-in text and gradient background...
          </div>
        </div>
        <div style={{
          width: 2, height: 30, backgroundColor: COLORS.secondary, opacity: 0.4,
        }} />
        <div style={{
          backgroundColor: COLORS.surface, borderRadius: 20, padding: 24,
          border: `1px solid ${COLORS.secondary}33`, width: '100%',
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: COLORS.secondary, opacity: 0.6 }}>
            ChatGPT → готовый TSX
          </div>
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 80,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 26, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Написал сценарий? Нажми Prompt —<br />Vidora скопирует идеальный промпт<br />для Remotion. Вставь в ChatGPT<br />и получи готовый TSX.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2CodePaste: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 88, 102], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const codeSlide = interpolate(frame, [0, 40], [200, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '30%', left: 80, right: 80,
        backgroundColor: COLORS.surface, borderRadius: 20,
        border: `1px solid ${COLORS.primary}33`, padding: 30, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>
        <div style={{
          transform: `translateX(${codeSlide}px)`,
          fontFamily: 'monospace', fontSize: 16, color: COLORS.primary, lineHeight: 2,
        }}>
          {'import { Scene } from "./scenes";'}
          <br />
          {'export const MyVideo = () => <Scene />;'}
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 200,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 32, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Вставил код обратно —<br />он сразу сохраняется<br />в структуру проекта.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3FolderStructure: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 132, 144], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 40], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const folders = [
    { name: 'code/', items: ['a-roll/', 'scenes/'], color: COLORS.secondary },
    { name: 'assets/', items: ['b-roll/', 'images/', 'fonts/'], color: COLORS.accent },
    { name: 'voice/', items: ['narration/', 'music/', 'sfx/'], color: COLORS.primary },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '25%', left: 120, right: 120,
        backgroundColor: '#0d1117', borderRadius: 16, padding: 30,
        border: `1px solid ${COLORS.primary}22`,
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: 14, color: COLORS.text, opacity: 0.4, marginBottom: 20 }}>
          vidora-project/
        </div>
        {folders.map((folder, fi) => {
          const folderOpacity = interpolate(frame, [10 + fi * 20, 25 + fi * 20], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          return (
            <div key={fi} style={{ opacity: folderOpacity, marginBottom: 16 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 18, color: folder.color, marginBottom: 8 }}>
                📁 {folder.name}
              </div>
              <div style={{ paddingLeft: 32 }}>
                {folder.items.map((item, ii) => {
                  const itemOpacity = interpolate(frame, [20 + fi * 20 + ii * 10, 35 + fi * 20 + ii * 10], [0, 1], {
                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                  });
                  return (
                    <div key={ii} style={{
                      opacity: itemOpacity, fontFamily: 'monospace', fontSize: 16,
                      color: COLORS.text, opacity: 0.5 * itemOpacity, marginBottom: 4,
                    }}>
                      📄 {item}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 80,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 24, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Файлы на диске: TSX-компоненты в code/a-roll/,<br />медиафайлы в assets/b-roll/,<br />озвучка в voice/.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const AIAndAutomation: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={216}>
        <Fragment1PromptToGPT />
      </Sequence>
      <Sequence from={216} durationInFrames={102}>
        <Fragment2CodePaste />
      </Sequence>
      <Sequence from={318} durationInFrames={162}>
        <Fragment3FolderStructure />
      </Sequence>
    </AbsoluteFill>
  );
};

export default AIAndAutomation;
