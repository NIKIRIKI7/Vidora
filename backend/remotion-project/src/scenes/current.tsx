import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence,
} from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 241,
  fps: 30,
  width: 2160,
  height: 3840,
};

// =============================================================================
// STYLE CONSTANTS
// =============================================================================
const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  background: '#0b1326',
  surface: '#171f33',
  accent: '#ffb4ab',
  text: '#dae2fd',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, sans-serif',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const Scene: React.FC = () => {
  const frame = useCurrentFrame();

  // --- CAMERA ANIMATIONS ---
  // Base scale 1.1 ensures the 1800px wide IDE fills nicely on a 2160px wide screen
  const camScale = interpolate(frame, 
    [0, 10, 42, 142, 170], 
    [1.1, 1.1, 2.5, 2.5, 4.2], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.easeInOut }
  );
  const camX = interpolate(frame, 
    [0, 10, 42, 142, 170], 
    [0, 0, 700, 700, 300], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.easeInOut }
  );
  const camY = interpolate(frame, 
    [0, 10, 42, 142, 170], 
    [0, 0, 350, 350, 250], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.easeInOut }
  );

  // --- TOOLTIP ANIMATIONS (F2) ---
  const tooltipOpacity = interpolate(frame, 
    [42, 50, 80, 86], 
    [0, 1, 1, 0], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const tooltipScale = interpolate(frame, 
    [42, 50], 
    [0.4, 1], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.overshoot }
  );

  // --- NEON HIGHLIGHT (F3) ---
  const neonWidth = interpolate(frame, 
    [86, 106], 
    [0, 750], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.easeOut }
  );
  const neonOpacity = interpolate(frame, 
    [86, 96, 140, 150], 
    [0, 1, 1, 0], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const keyLabelOpacity = interpolate(frame, 
    [95, 105, 140, 150], 
    [0, 1, 1, 0], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const keyLabelY = interpolate(frame, 
    [95, 105], 
    [20, -50], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.easeOut }
  );

  // --- VALUE HIGHLIGHT (F4) ---
  const valueBoxOpacity = interpolate(frame, 
    [145, 155], 
    [0, 1], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const valueBoxScale = interpolate(frame, 
    [145, 160], 
    [0.5, 1], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASINGS.overshoot }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      
      {/* CAMERA WRAPPER */}
      <div 
        style={{
          transform: `scale(${camScale}) translate(${camX}px, ${camY}px)`,
          transformOrigin: 'center center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        
        {/* IDE WINDOW */}
        <div
          style={{
            width: 1800,
            height: 1200,
            backgroundColor: COLORS.surface,
            borderRadius: 40,
            border: `2px solid rgba(255, 255, 255, 0.05)`,
            boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Mac OS Top Bar */}
          <div
            style={{
              height: 100,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 40px',
              gap: 20,
              flexShrink: 0,
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: '#FF5F56' }} />
            <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
            <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: '#27C93F' }} />
          </div>

          {/* Code Content */}
          <div
            style={{
              padding: 80,
              fontFamily: 'monospace',
              fontSize: 72,
              lineHeight: '108px',
              whiteSpace: 'pre',
              color: COLORS.text,
            }}
          >
            {/* Line 0 */}
            <div>{'['}</div>
            
            {/* Line 1 */}
            <div style={{ position: 'relative' }}>
              {'  {'}
              
              {/* "Словари" Tooltip */}
              <div
                style={{
                  position: 'absolute',
                  left: 180, 
                  top: -60,
                  opacity: tooltipOpacity,
                  transform: `scale(${tooltipScale}) rotate(-4deg)`,
                  backgroundColor: COLORS.accent,
                  color: COLORS.background,
                  padding: '16px 48px',
                  borderRadius: 40,
                  fontSize: 56,
                  fontWeight: 900,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  boxShadow: `0 30px 60px rgba(255, 180, 171, 0.3)`,
                  zIndex: 10,
                }}
              >
                Словари
              </div>
            </div>

            {/* Line 2 */}
            <div style={{ position: 'relative', height: 108 }}>
              
              {/* Neon Background Box */}
              <div
                style={{
                  position: 'absolute',
                  left: 150,
                  top: 0,
                  height: 108,
                  width: neonWidth,
                  backgroundColor: 'rgba(79, 219, 200, 0.15)',
                  border: `4px solid ${COLORS.secondary}`,
                  borderRadius: 16,
                  opacity: neonOpacity,
                  boxShadow: `0 0 40px rgba(79, 219, 200, 0.4)`,
                }}
              />

              {/* Floating Labels */}
              <div
                style={{
                  position: 'absolute',
                  left: 200,
                  top: keyLabelY,
                  opacity: keyLabelOpacity,
                  color: COLORS.secondary,
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  letterSpacing: 2,
                }}
              >
                КЛЮЧ
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 560,
                  top: keyLabelY,
                  opacity: keyLabelOpacity,
                  color: COLORS.primary,
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  letterSpacing: 2,
                }}
              >
                ЗНАЧЕНИЕ
              </div>

              {/* Actual Code Elements */}
              <span style={{ position: 'relative', zIndex: 2 }}>
                {'    '}
                <span style={{ color: COLORS.secondary }}>"Name"</span>
                <span style={{ color: COLORS.text }}>: </span>
                
                {/* F4 Value Highlight Layering */}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  {/* Base Text (fades out when overlay pops in) */}
                  <span style={{ color: COLORS.primary, opacity: interpolate(frame, [145, 146], [1, 0]) }}>
                    "Diana"
                  </span>
                  
                  {/* Popping Highlight Overlay */}
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: -12,
                      bottom: -12,
                      padding: '0 16px',
                      margin: '0 -16px',
                      color: COLORS.background,
                      backgroundColor: COLORS.primary,
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: valueBoxOpacity,
                      transform: `scale(${valueBoxScale})`,
                      boxShadow: `0 20px 60px ${COLORS.primary}88`,
                    }}
                  >
                    "Diana"
                  </span>
                </span>
                
                <span style={{ color: COLORS.text }}>,</span>
              </span>
            </div>

            {/* Line 3 */}
            <div>
              {'    '}
              <span style={{ color: COLORS.secondary }}>"Age"</span>
              <span style={{ color: COLORS.text }}>: </span>
              <span style={{ color: COLORS.accent }}>28</span>
            </div>
            
            {/* Line 4 */}
            <div>{'  },'}</div>
            
            {/* Line 5 */}
            <div>{'  {'}</div>
            
            {/* Line 6 */}
            <div>
              {'    '}
              <span style={{ color: COLORS.secondary }}>"Name"</span>
              <span style={{ color: COLORS.text }}>: </span>
              <span style={{ color: COLORS.primary }}>"Ethan"</span>
              <span style={{ color: COLORS.text }}>,</span>
            </div>
            
            {/* Line 7 */}
            <div>
              {'    '}
              <span style={{ color: COLORS.secondary }}>"Age"</span>
              <span style={{ color: COLORS.text }}>: </span>
              <span style={{ color: COLORS.accent }}>32</span>
            </div>
            
            {/* Line 8 */}
            <div>{'  }'}</div>
            
            {/* Line 9 */}
            <div>{']'}</div>
            
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene;